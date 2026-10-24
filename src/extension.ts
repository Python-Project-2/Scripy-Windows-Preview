import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, execFile, ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VIEW_ID = 'scripy-windows-preview.main';
const RUN_COMMAND = 'scripy-windows-preview.run';
const STOP_COMMAND = 'scripy-windows-preview.stop';
const CONFIG_SECTION = 'scripyPreview';

const SAVED_KEY = 'scripy.savedDevices';
const OPTIONS_KEY = 'scripy.options';
const SELECTED_KEY = 'scripy.selectedDevice';

/** Lama splash icon saat view pertama kali dibuka (ms). */
const SPLASH_START_MS = 1800;
/** Lama splash icon sebelum scrcpy dijalankan (ms). */
const SPLASH_RUN_MS = 1400;
/** Batas ukuran log agar tidak membengkak. */
const MAX_LOG_LENGTH = 20000;
/** Interval auto-refresh daftar device (ms). */
const POLL_MS = 5000;
/** Port TCP/IP default adb. */
const DEFAULT_ADB_PORT = 5555;

type Dock = 'left' | 'right' | 'none';
type PlatformFolder = 'win' | 'mac' | 'linux';

interface ScreenInfo {
	w: number;
	h: number;
	left: number;
	top: number;
	dpr: number;
}

interface WebviewMessage {
	type: string;
	key?: string;
	value?: string | number | boolean;
	screen?: ScreenInfo;
}

interface PlatformInfo {
	folder: PlatformFolder;
	label: string;
	scrcpy: string;
	adb: string;
}

interface Tools {
	scrcpy: string;
	adb: string;
	cwd?: string;
	env: NodeJS.ProcessEnv;
	bundled: boolean;
	dir: string;
}

interface AdbResult {
	ok: boolean;
	out: string;
	err: string;
}

interface DeviceEntry {
	id: string;
	label: string;
	state: string;
	wireless: boolean;
	saved: boolean;
}

interface SavedDevice {
	addr: string;
	name: string;
}

interface Options {
	autoWireless: boolean;
	autoWifi: boolean;
	audio: boolean;
	stayAwake: boolean;
	turnScreenOff: boolean;
	showTouches: boolean;
	noControl: boolean;
	borderless: boolean;
	record: boolean;
	maxSize: number;
	maxFps: number;
	bitrate: string;
}

const DEFAULT_OPTIONS: Options = {
	autoWireless: true,
	autoWifi: true,
	audio: true,
	stayAwake: true,
	turnScreenOff: false,
	showTouches: false,
	noControl: false,
	borderless: false,
	record: false,
	maxSize: 0,
	maxFps: 0,
	bitrate: '',
};

const KEYCODES: Record<string, string> = {
	home: 'KEYCODE_HOME',
	back: 'KEYCODE_BACK',
	recents: 'KEYCODE_APP_SWITCH',
	power: 'KEYCODE_POWER',
	volup: 'KEYCODE_VOLUME_UP',
	voldown: 'KEYCODE_VOLUME_DOWN',
};

const ADDR_RE = /^\d{1,3}(\.\d{1,3}){3}(:\d{1,5})?$/;
const WIRELESS_ID_RE = /^\d{1,3}(\.\d{1,3}){3}:\d+$|_adb-tls-connect\._tcp/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const clamp = (n: number, min: number, max: number) =>
	Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Deteksi OS otomatis -> folder model/win | model/mac | model/linux. */
function detectPlatform(): PlatformInfo | undefined {
	switch (process.platform) {
		case 'win32':
			return { folder: 'win', label: 'Windows', scrcpy: 'scrcpy.exe', adb: 'adb.exe' };
		case 'darwin':
			return { folder: 'mac', label: 'macOS', scrcpy: 'scrcpy', adb: 'adb' };
		case 'linux':
			return { folder: 'linux', label: 'Linux', scrcpy: 'scrcpy', adb: 'adb' };
		default:
			return undefined;
	}
}

/** Pada mac/linux, file hasil ekstrak VSIX bisa kehilangan izin eksekusi. */
function ensureExecutable(file: string) {
	if (process.platform === 'win32' || !fs.existsSync(file)) {
		return;
	}
	try {
		fs.chmodSync(file, 0o755);
	} catch {
		/* abaikan */
	}
}

function mimeOf(file: string): string {
	switch (path.extname(file).toLowerCase()) {
		case '.svg':
			return 'image/svg+xml';
		case '.jpg':
		case '.jpeg':
			return 'image/jpeg';
		case '.webp':
			return 'image/webp';
		default:
			return 'image/png';
	}
}

function outputDir(): string {
	const dir = path.join(os.homedir(), 'Scripy');
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
class ScrcpyViewProvider implements vscode.WebviewViewProvider {
	private view?: vscode.WebviewView;
	private proc?: ChildProcess;
	private starting = false;
	private refreshing = false;
	private autoTried = false;
	private poll?: NodeJS.Timeout;
	private logs = '';
	private screen?: ScreenInfo;
	private devices: DeviceEntry[] = [];
	private toolsCache?: Tools;
	private readonly platform = detectPlatform();

	private options: Options;
	private saved: SavedDevice[];
	private selected?: string;

	constructor(
		private readonly extensionPath: string,
		private readonly store: vscode.Memento
	) {
		this.options = { ...DEFAULT_OPTIONS, ...(store.get<Partial<Options>>(OPTIONS_KEY) ?? {}) };
		this.saved = store.get<SavedDevice[]>(SAVED_KEY, []);
		this.selected = store.get<string>(SELECTED_KEY);
	}

	// -- Webview ------------------------------------------------------------
	resolveWebviewView(view: vscode.WebviewView) {
		this.view = view;
		view.webview.options = { enableScripts: true };
		view.webview.html = this.getHtml();

		view.webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
			if (msg.screen) {
				this.screen = msg.screen;
			}
			try {
				await this.handleMessage(msg);
			} catch (err) {
				this.append(`Error: ${(err as Error).message}\n`);
			}
		});

		view.onDidChangeVisibility(() => {
			if (view.visible) {
				void this.refreshDevices();
			}
		});

		this.poll = setInterval(() => {
			if (this.view?.visible && !this.starting) {
				void this.refreshDevices();
			}
		}, POLL_MS);

		// Menutup/menyembunyikan panel TIDAK menghentikan scrcpy.
		view.onDidDispose(() => {
			this.view = undefined;
			if (this.poll) {
				clearInterval(this.poll);
				this.poll = undefined;
			}
		});
	}

	private async handleMessage(msg: WebviewMessage) {
		switch (msg.type) {
			case 'run':
				await this.run();
				break;
			case 'stop':
				this.stop();
				break;
			case 'dock':
				if (msg.value === 'left' || msg.value === 'right' || msg.value === 'none') {
					await vscode.workspace
						.getConfiguration(CONFIG_SECTION)
						.update('dock', msg.value, vscode.ConfigurationTarget.Global);
				}
				break;
			case 'alwaysOnTop':
				await vscode.workspace
					.getConfiguration(CONFIG_SECTION)
					.update('alwaysOnTop', !!msg.value, vscode.ConfigurationTarget.Global);
				break;
			case 'ready':
				this.postState();
				await this.refreshDevices();
				void this.autoReconnectOnce();
				break;
			case 'refresh':
				await this.refreshDevices();
				break;
			case 'select':
				this.selected = typeof msg.value === 'string' ? msg.value : undefined;
				await this.store.update(SELECTED_KEY, this.selected);
				this.postDevices();
				break;
			case 'option':
				await this.setOption(msg.key, msg.value);
				break;
			case 'wifi':
				await this.wifiFromUsb();
				break;
			case 'pair':
				await this.pairDevice();
				break;
			case 'addIp':
				await this.addIp();
				break;
			case 'forget':
				await this.forget();
				break;
			case 'screenshot':
				await this.screenshot();
				break;
			case 'installApk':
				await this.installApk();
				break;
			case 'pushFile':
				await this.pushFiles();
				break;
			case 'key':
				await this.sendKey(msg.value);
				break;
			case 'openFolder':
				await vscode.env.openExternal(vscode.Uri.file(outputDir()));
				break;
			case 'restartAdb':
				await this.restartAdb();
				break;
		}
	}

	// -- Tools --------------------------------------------------------------
	private tools(): Tools | undefined {
		if (this.toolsCache) {
			return this.toolsCache;
		}
		if (!this.platform) {
			return undefined;
		}
		const dir = path.join(this.extensionPath, 'model', this.platform.folder);
		const bundledScrcpy = path.join(dir, this.platform.scrcpy);
		const bundledAdb = path.join(dir, this.platform.adb);
		const server = path.join(dir, 'scrcpy-server');

		const bundled = fs.existsSync(bundledScrcpy);
		const hasAdb = fs.existsSync(bundledAdb);

		ensureExecutable(bundledScrcpy);
		ensureExecutable(bundledAdb);
		ensureExecutable(server);

		const env: NodeJS.ProcessEnv = { ...process.env };
		if (hasAdb) {
			env.ADB = bundledAdb;
		}
		if (fs.existsSync(server)) {
			env.SCRCPY_SERVER_PATH = server;
		}

		this.toolsCache = {
			scrcpy: bundled ? bundledScrcpy : 'scrcpy',
			adb: hasAdb ? bundledAdb : 'adb',
			cwd: bundled || hasAdb ? dir : undefined,
			env,
			bundled,
			dir,
		};
		return this.toolsCache;
	}

	private adb(args: string[], timeout = 10000): Promise<AdbResult> {
		const t = this.tools();
		if (!t) {
			return Promise.resolve({ ok: false, out: '', err: 'Unsupported platform' });
		}
		return new Promise((resolve) => {
			execFile(
				t.adb,
				args,
				{ env: t.env, cwd: t.cwd, timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
				(err, stdout, stderr) =>
					resolve({
						ok: !err,
						out: String(stdout ?? '').trim(),
						err: (String(stderr ?? '') || (err ? err.message : '')).trim(),
					})
			);
		});
	}

	private adbBuffer(args: string[], timeout = 15000): Promise<Buffer | undefined> {
		const t = this.tools();
		if (!t) {
			return Promise.resolve(undefined);
		}
		return new Promise((resolve) => {
			execFile(
				t.adb,
				args,
				{ env: t.env, cwd: t.cwd, timeout, windowsHide: true, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
				(err, stdout) => resolve(err ? undefined : (stdout as Buffer))
			);
		});
	}

	// -- Devices ------------------------------------------------------------
	private async queryDevices(): Promise<DeviceEntry[]> {
		const r = await this.adb(['devices', '-l'], 8000);
		const entries: DeviceEntry[] = [];

		if (r.ok) {
			for (const line of r.out.split(/\r?\n/).slice(1)) {
				const parts = line.trim().split(/\s+/);
				const id = parts[0];
				const state = parts[1];
				if (!id || !state || id.startsWith('*')) {
					continue;
				}
				const model = /model:(\S+)/.exec(line)?.[1]?.replace(/_/g, ' ');
				const wireless = WIRELESS_ID_RE.test(id);
				const savedName = this.saved.find((s) => s.addr === id)?.name;
				entries.push({
					id,
					label: model || savedName || id,
					state,
					wireless,
					saved: this.saved.some((s) => s.addr === id),
				});
			}
		}

		// Device tersimpan yang sedang tidak terhubung tetap ditampilkan.
		for (const s of this.saved) {
			if (!entries.some((e) => e.id === s.addr)) {
				entries.push({ id: s.addr, label: s.name || s.addr, state: 'saved', wireless: true, saved: true });
			}
		}
		return entries;
	}

	private async refreshDevices() {
		if (this.refreshing) {
			return;
		}
		this.refreshing = true;
		try {
			this.devices = await this.queryDevices();
			const ids = this.devices.map((d) => d.id);
			if (!this.selected || !ids.includes(this.selected)) {
				const firstReady = this.devices.find((d) => d.state === 'device');
				this.selected = (firstReady ?? this.devices[0])?.id;
			}
			this.postDevices();
		} finally {
			this.refreshing = false;
		}
	}

	private postDevices() {
		this.post({ type: 'devices', devices: this.devices, selected: this.selected });
	}

	/** Saat panel pertama kali dibuka: sambungkan ulang device nirkabel tersimpan di latar belakang. */
	private async autoReconnectOnce() {
		if (this.autoTried || !this.options.autoWireless) {
			return;
		}
		this.autoTried = true;
		if (this.devices.some((d) => d.state === 'device')) {
			return;
		}
		if (this.saved.length === 0) {
			// Tetap coba mDNS untuk device yang sudah pernah dipairing.
			await this.connectMdns();
		} else {
			await this.reconnectSaved();
		}
		await this.refreshDevices();
	}

	private async connectAddr(addr: string): Promise<boolean> {
		const r = await this.adb(['connect', addr], 5000);
		const text = `${r.out} ${r.err}`;
		return /(connected to|already connected to)/i.test(text) && !/cannot|failed|refused|unable/i.test(text);
	}

	private async connectMdns(): Promise<number> {
		const m = await this.adb(['mdns', 'services'], 5000);
		if (!m.ok) {
			return 0;
		}
		const addrs = new Set<string>();
		for (const line of m.out.split(/\r?\n/)) {
			if (line.includes('_adb-tls-connect')) {
				const a = /(\d{1,3}(?:\.\d{1,3}){3}:\d+)/.exec(line)?.[1];
				if (a) {
					addrs.add(a);
				}
			}
		}
		const results = await Promise.all([...addrs].map((a) => this.connectAddr(a)));
		return results.filter(Boolean).length;
	}

	/** Reconnect semua device nirkabel yang pernah terhubung (IP tersimpan + mDNS). */
	private async reconnectSaved(): Promise<boolean> {
		this.append('Looking for previously connected wireless devices...\n');
		const candidates = new Set<string>();
		for (const s of this.saved) {
			candidates.add(s.addr);
			const ip = s.addr.split(':')[0];
			candidates.add(`${ip}:${DEFAULT_ADB_PORT}`);
		}
		const results = await Promise.all([...candidates].map((a) => this.connectAddr(a)));
		const viaMdns = await this.connectMdns();
		const total = results.filter(Boolean).length + viaMdns;
		this.append(total > 0 ? `Reconnected ${total} wireless device(s).\n` : 'No saved wireless device reachable.\n');
		return total > 0;
	}

	private async deviceName(serial: string): Promise<string> {
		const r = await this.adb(['-s', serial, 'shell', 'getprop', 'ro.product.model'], 5000);
		return r.ok && r.out ? r.out.split(/\r?\n/)[0].trim() : serial;
	}

	private async deviceIp(serial: string): Promise<string | undefined> {
		const a = await this.adb(['-s', serial, 'shell', 'ip', '-f', 'inet', 'addr', 'show', 'wlan0'], 5000);
		const ip1 = /inet (\d{1,3}(?:\.\d{1,3}){3})/.exec(a.out)?.[1];
		if (ip1) {
			return ip1;
		}
		const b = await this.adb(['-s', serial, 'shell', 'ip', 'route'], 5000);
		const line = b.out.split(/\r?\n/).find((l) => l.includes('wlan')) ?? b.out.split(/\r?\n/)[0] ?? '';
		return /src (\d{1,3}(?:\.\d{1,3}){3})/.exec(line)?.[1];
	}

	private async remember(addr: string, name: string) {
		const idx = this.saved.findIndex((s) => s.addr === addr);
		if (idx >= 0) {
			this.saved[idx].name = name;
		} else {
			this.saved.push({ addr, name });
		}
		await this.store.update(SAVED_KEY, this.saved);
	}

	/** USB -> Wi-Fi: aktifkan adb TCP/IP, sambungkan, simpan device. */
	private async usbToWifi(serial: string): Promise<string | undefined> {
		const ip = await this.deviceIp(serial);
		if (!ip) {
			this.append('Could not read the phone Wi-Fi IP. Is it connected to Wi-Fi?\n');
			return undefined;
		}
		const name = await this.deviceName(serial);
		const addr = `${ip}:${DEFAULT_ADB_PORT}`;

		this.append(`Enabling wireless mode for ${name} (${addr})...\n`);
		await this.adb(['-s', serial, 'tcpip', String(DEFAULT_ADB_PORT)], 8000);
		await sleep(1500);

		if (await this.connectAddr(addr)) {
			await this.remember(addr, name);
			this.append(`Wireless connected: ${addr}\n`);
			return addr;
		}
		this.append('Wireless connection failed. Make sure phone and PC are on the same Wi-Fi network.\n');
		return undefined;
	}

	private usbReady(): DeviceEntry[] {
		return this.devices.filter((d) => d.state === 'device' && !d.wireless);
	}

	private async wifiFromUsb() {
		await this.refreshDevices();
		const usb = this.usbReady();
		if (usb.length === 0) {
			vscode.window.showWarningMessage('Scripy Preview: connect the phone with USB once to set up Wi-Fi mode.');
			return;
		}
		const target = usb.find((d) => d.id === this.selected) ?? usb[0];
		const addr = await this.usbToWifi(target.id);
		if (addr) {
			this.selected = addr;
			await this.store.update(SELECTED_KEY, addr);
			vscode.window.showInformationMessage(`Scripy Preview: Wi-Fi ready (${addr}). You can unplug the USB cable.`);
		} else {
			vscode.window.showWarningMessage('Scripy Preview: could not switch to Wi-Fi. See log for details.');
		}
		await this.refreshDevices();
	}

	/** Pairing Android 11+ (Wireless debugging). */
	private async pairDevice() {
		const pairAddr = await vscode.window.showInputBox({
			title: 'Pair device (Android 11+)',
			prompt: 'Developer options > Wireless debugging > Pair device with pairing code. Enter the IP:PORT shown there.',
			placeHolder: '192.168.1.10:37123',
			validateInput: (v) => (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(v) ? undefined : 'Format: IP:PORT'),
		});
		if (!pairAddr) {
			return;
		}
		const code = await vscode.window.showInputBox({
			title: 'Pairing code',
			prompt: 'Enter the 6-digit pairing code',
			validateInput: (v) => (/^\d{6}$/.test(v) ? undefined : 'Must be 6 digits'),
		});
		if (!code) {
			return;
		}

		this.append(`Pairing with ${pairAddr}...\n`);
		const r = await this.adb(['pair', pairAddr, code], 20000);
		this.append(`${r.out || r.err}\n`);
		if (!/successfully paired/i.test(`${r.out} ${r.err}`)) {
			vscode.window.showErrorMessage('Scripy Preview: pairing failed. Check the IP:PORT and code.');
			return;
		}

		await sleep(1500);
		let connected = (await this.connectMdns()) > 0;
		if (!connected) {
			const ip = pairAddr.split(':')[0];
			const addr = await vscode.window.showInputBox({
				title: 'Connect device',
				prompt: 'Enter the IP:PORT shown on the main "Wireless debugging" screen (different from the pairing port).',
				value: `${ip}:`,
				validateInput: (v) => (/^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(v) ? undefined : 'Format: IP:PORT'),
			});
			if (addr && (await this.connectAddr(addr))) {
				await this.remember(addr, await this.deviceName(addr));
				this.selected = addr;
				connected = true;
			}
		}
		await this.refreshDevices();
		const ready = this.devices.find((d) => d.state === 'device' && d.wireless);
		if (connected && ready) {
			this.selected = ready.id;
			await this.store.update(SELECTED_KEY, ready.id);
			if (WIRELESS_ID_RE.test(ready.id) && /^\d/.test(ready.id)) {
				await this.remember(ready.id, ready.label);
			}
			this.postDevices();
			vscode.window.showInformationMessage('Scripy Preview: wireless device paired and connected.');
		}
	}

	private async addIp() {
		const input = await vscode.window.showInputBox({
			title: 'Connect by IP',
			prompt: `Phone IP address (port defaults to ${DEFAULT_ADB_PORT})`,
			placeHolder: '192.168.1.10',
			validateInput: (v) => (ADDR_RE.test(v) ? undefined : 'Format: IP or IP:PORT'),
		});
		if (!input) {
			return;
		}
		const addr = input.includes(':') ? input : `${input}:${DEFAULT_ADB_PORT}`;
		this.append(`Connecting to ${addr}...\n`);
		if (await this.connectAddr(addr)) {
			await this.remember(addr, await this.deviceName(addr));
			this.selected = addr;
			await this.store.update(SELECTED_KEY, addr);
			this.append(`Connected: ${addr}\n`);
		} else {
			this.append('Connection failed. Is wireless debugging / tcpip enabled on the phone?\n');
			vscode.window.showErrorMessage('Scripy Preview: could not connect. Check IP, Wi-Fi network and wireless debugging.');
		}
		await this.refreshDevices();
	}

	private async forget() {
		const id = this.selected;
		const entry = this.devices.find((d) => d.id === id);
		if (!id || !entry) {
			return;
		}
		if (entry.wireless) {
			await this.adb(['disconnect', id], 5000);
		}
		this.saved = this.saved.filter((s) => s.addr !== id);
		await this.store.update(SAVED_KEY, this.saved);
		this.selected = undefined;
		this.append(`Removed ${entry.label} (${id}).\n`);
		await this.refreshDevices();
	}

	// -- Tools (screenshot, install, push, keys) ----------------------------
	private async currentSerial(): Promise<string | undefined> {
		await this.refreshDevices();
		const ready = this.devices.filter((d) => d.state === 'device');
		const pick = ready.find((d) => d.id === this.selected) ?? (ready.length === 1 ? ready[0] : undefined);
		if (pick) {
			return pick.id;
		}
		if (ready.length === 0) {
			vscode.window.showWarningMessage('Scripy Preview: no ready device. Connect via USB or Wi-Fi first.');
			return undefined;
		}
		const chosen = await vscode.window.showQuickPick(
			ready.map((d) => ({ label: d.label, description: `${d.id} · ${d.wireless ? 'Wi-Fi' : 'USB'}`, id: d.id })),
			{ placeHolder: 'Select device' }
		);
		return chosen?.id;
	}

	private async screenshot() {
		const serial = await this.currentSerial();
		if (!serial) {
			return;
		}
		const png = await this.adbBuffer(['-s', serial, 'exec-out', 'screencap', '-p']);
		if (!png || png.length < 8) {
			vscode.window.showErrorMessage('Scripy Preview: screenshot failed.');
			return;
		}
		const file = path.join(outputDir(), `screenshot-${stamp()}.png`);
		fs.writeFileSync(file, png);
		this.append(`Screenshot saved: ${file}\n`);
		const act = await vscode.window.showInformationMessage('Screenshot saved.', 'Open');
		if (act === 'Open') {
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
		}
	}

	private async installApk() {
		const serial = await this.currentSerial();
		if (!serial) {
			return;
		}
		const picked = await vscode.window.showOpenDialog({
			canSelectMany: true,
			filters: { 'Android package': ['apk'] },
			openLabel: 'Install',
		});
		if (!picked?.length) {
			return;
		}
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Installing APK...' },
			async () => {
				for (const uri of picked) {
					this.append(`Installing ${path.basename(uri.fsPath)}...\n`);
					const r = await this.adb(['-s', serial, 'install', '-r', uri.fsPath], 180000);
					this.append(`${r.out || r.err}\n`);
				}
			}
		);
	}

	private async pushFiles() {
		const serial = await this.currentSerial();
		if (!serial) {
			return;
		}
		const picked = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Send to phone' });
		if (!picked?.length) {
			return;
		}
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Sending files to /sdcard/Download...' },
			async () => {
				for (const uri of picked) {
					this.append(`Pushing ${path.basename(uri.fsPath)}...\n`);
					const r = await this.adb(['-s', serial, 'push', uri.fsPath, '/sdcard/Download/'], 300000);
					this.append(`${r.out || r.err}\n`);
				}
			}
		);
	}

	private async sendKey(name: unknown) {
		const code = typeof name === 'string' ? KEYCODES[name] : undefined;
		if (!code) {
			return;
		}
		const serial = await this.currentSerial();
		if (serial) {
			await this.adb(['-s', serial, 'shell', 'input', 'keyevent', code], 5000);
		}
	}

	private async restartAdb() {
		this.append('Restarting adb server...\n');
		await this.adb(['kill-server'], 8000);
		const r = await this.adb(['start-server'], 15000);
		this.append(`${r.out || r.err || 'adb server restarted.'}\n`);
		await this.refreshDevices();
	}

	// -- Options ------------------------------------------------------------
	private async setOption(key: string | undefined, value: unknown) {
		const o = this.options;
		switch (key) {
			case 'autoWireless':
			case 'autoWifi':
			case 'audio':
			case 'stayAwake':
			case 'turnScreenOff':
			case 'showTouches':
			case 'noControl':
			case 'borderless':
			case 'record':
				o[key] = !!value;
				break;
			case 'maxSize':
				o.maxSize = value === '' ? 0 : clamp(Number(value), 0, 8192);
				break;
			case 'maxFps':
				o.maxFps = value === '' ? 0 : clamp(Number(value), 0, 240);
				break;
			case 'bitrate': {
				const v = String(value ?? '').trim();
				o.bitrate = /^\d+(\.\d+)?[KkMm]?$/.test(v) ? v : '';
				break;
			}
			default:
				return;
		}
		await this.store.update(OPTIONS_KEY, o);
		this.postState();
	}

	// -- Lifecycle scrcpy ---------------------------------------------------
	async run() {
		if (this.proc || this.starting) {
			this.append('scrcpy is already running.\n');
			return;
		}
		this.starting = true;
		this.postState();
		try {
			await this.launch();
		} finally {
			this.starting = false;
			this.postState();
		}
	}

	private async launch() {
		const tools = this.tools();
		if (!tools || !this.platform) {
			const msg = `Unsupported platform: ${process.platform}`;
			this.append(`${msg}\n`);
			vscode.window.showErrorMessage(`Scripy Preview: ${msg}`);
			return;
		}

		// Tunggu info layar dari webview (maks 2 detik).
		for (let i = 0; i < 20 && !this.screen; i++) {
			await sleep(100);
		}

		// Splash icon dulu, baru scrcpy dijalankan.
		this.post({ type: 'splash', ms: SPLASH_RUN_MS });
		await sleep(SPLASH_RUN_MS);

		this.logs = '';
		this.post({ type: 'clear' });
		this.append(`Detected OS: ${this.platform.label} (model/${this.platform.folder}/)\n`);
		if (!tools.bundled) {
			this.append('Bundled scrcpy not found. Falling back to system "scrcpy" in PATH.\n');
		}

		// 1) Cari device (USB / Wi-Fi yang sudah terhubung).
		let list = await this.queryDevices();
		let ready = list.filter((d) => d.state === 'device');

		// 2) Tidak ada? Reconnect nirkabel otomatis.
		if (ready.length === 0 && this.options.autoWireless) {
			await this.reconnectSaved();
			list = await this.queryDevices();
			ready = list.filter((d) => d.state === 'device');
		}

		if (ready.length === 0) {
			if (list.some((d) => d.state === 'unauthorized')) {
				this.append('Device found but UNAUTHORIZED. Unlock the phone and accept the USB debugging prompt.\n');
			} else if (list.some((d) => d.state === 'offline')) {
				this.append('Device is OFFLINE. Reconnect the cable / re-enable debugging.\n');
			} else {
				this.append('No Android device detected.\nConnect via USB once (then Wi-Fi is remembered), or use Pair / Add IP.\n');
			}
			this.devices = list;
			this.postDevices();
			vscode.window.showWarningMessage('Scripy Preview: no ready Android device detected.');
			return;
		}

		// 3) Pilih device.
		let target = ready.find((d) => d.id === this.selected) ?? (ready.length === 1 ? ready[0] : undefined);
		if (!target) {
			const chosen = await vscode.window.showQuickPick(
				ready.map((d) => ({ label: d.label, description: `${d.id} · ${d.wireless ? 'Wi-Fi' : 'USB'}`, id: d.id })),
				{ placeHolder: 'Select a device to mirror' }
			);
			if (!chosen) {
				this.append('No device selected.\n');
				return;
			}
			target = ready.find((d) => d.id === chosen.id);
		}
		if (!target) {
			return;
		}
		let serial = target.id;
		this.append(`Device: ${target.label} (${serial}, ${target.wireless ? 'Wi-Fi' : 'USB'})\n`);

		// 4) USB terdeteksi -> otomatis siapkan Wi-Fi & simpan, lalu jalan nirkabel.
		if (!target.wireless && this.options.autoWifi) {
			const ip = await this.deviceIp(serial);
			const already = ip ? ready.find((d) => d.id.startsWith(`${ip}:`)) : undefined;
			if (already) {
				serial = already.id;
				this.append(`Using existing wireless connection: ${serial}\n`);
			} else {
				const addr = await this.usbToWifi(serial);
				if (addr) {
					serial = addr;
					this.append('You can unplug the USB cable now.\n');
				} else {
					this.append('Continuing over USB.\n');
				}
			}
		}

		this.selected = serial;
		await this.store.update(SELECTED_KEY, serial);

		const args = this.buildArgs(serial);
		this.append(`> ${path.basename(tools.scrcpy)} ${args.join(' ')}\n`);

		const child = spawn(tools.scrcpy, args, { cwd: tools.bundled ? tools.dir : undefined, env: tools.env, windowsHide: true });
		this.proc = child;
		this.postState();

		child.stdout?.on('data', (d: Buffer) => this.append(d.toString()));
		child.stderr?.on('data', (d: Buffer) => this.append(d.toString()));

		child.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'ENOENT') {
				this.append('Failed to start: scrcpy executable not found.\n');
				vscode.window.showErrorMessage(
					'scrcpy not found. Make sure the "model" folder is included in the package (check .vscodeignore).'
				);
			} else {
				this.append(`Failed to start: ${err.message}\n`);
			}
			if (this.proc === child) {
				this.proc = undefined;
			}
			this.postState();
		});

		child.on('close', (code: number | null) => {
			this.append(`\nscrcpy stopped (code: ${code ?? 'terminated'})\n`);
			if (this.proc === child) {
				this.proc = undefined;
			}
			this.postState();
			void this.refreshDevices();
		});

		void this.refreshDevices();
	}

	stop() {
		if (this.proc) {
			this.proc.kill();
		}
	}

	// -- State --------------------------------------------------------------
	postState() {
		const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
		this.post({
			type: 'state',
			running: !!this.proc,
			busy: this.starting,
			logs: this.logs,
			dock: cfg.get<Dock>('dock', 'right'),
			alwaysOnTop: cfg.get<boolean>('alwaysOnTop', true),
			options: this.options,
		});
	}

	private buildArgs(serial: string): string[] {
		const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
		const o = this.options;
		const args: string[] = [`--serial=${serial}`, '--window-title=Scripy Preview'];

		if (cfg.get<boolean>('alwaysOnTop', true)) {
			args.push('--always-on-top');
		}
		if (!o.audio) {
			args.push('--no-audio');
		}
		if (o.stayAwake) {
			args.push('--stay-awake');
		}
		if (o.turnScreenOff) {
			args.push('--turn-screen-off');
		}
		if (o.showTouches) {
			args.push('--show-touches');
		}
		if (o.noControl) {
			args.push('--no-control');
		}
		if (o.borderless) {
			args.push('--window-borderless');
		}
		if (o.maxSize > 0) {
			args.push(`--max-size=${o.maxSize}`);
		}
		if (o.maxFps > 0) {
			args.push(`--max-fps=${o.maxFps}`);
		}
		if (o.bitrate) {
			args.push(`--video-bit-rate=${o.bitrate}`);
		}
		if (o.record) {
			// MKV tetap valid walau proses dihentikan paksa.
			const file = path.join(outputDir(), `recording-${stamp()}.mkv`);
			args.push(`--record=${file}`);
			this.append(`Recording to: ${file}\n`);
		}

		const dock = cfg.get<Dock>('dock', 'right');
		if (dock === 'none') {
			return args;
		}

		const s = this.screen;
		if (!s) {
			this.append('Screen size unknown, starting without docking.\n');
			return args;
		}

		// Windows memakai piksel fisik (dikali DPI); macOS/Linux memakai koordinat logis.
		const override = cfg.get<number>('screenScale', 0);
		const autoScale = process.platform === 'win32' ? s.dpr || 1 : 1;
		const scale = override > 0 ? override : autoScale;

		const availW = Math.round(s.w * scale);
		const availH = Math.round(s.h * scale);
		const left = Math.round(s.left * scale);
		const top = Math.round(s.top * scale);

		const titleBar = Math.round(40 * scale);
		const height = Math.max(400, availH - titleBar);
		const width = Math.round((height * 9) / 19.5);
		const x = dock === 'left' ? left : left + availW - width;

		args.push(
			`--window-x=${x}`,
			`--window-y=${top}`,
			`--window-width=${width}`,
			`--window-height=${height}`
		);
		return args;
	}

	private append(text: string) {
		this.logs += text;
		if (this.logs.length > MAX_LOG_LENGTH) {
			this.logs = this.logs.slice(-MAX_LOG_LENGTH);
		}
		this.post({ type: 'log', text });
	}

	private post(message: unknown) {
		this.view?.webview.postMessage(message);
	}

	// -- Icon ---------------------------------------------------------------
	private loadIconDataUri(): string {
		const candidates: string[] = [];
		const iconDir = path.join(this.extensionPath, 'icon');

		candidates.push(path.join(iconDir, 'icon.png'));
		try {
			for (const f of fs.readdirSync(iconDir)) {
				if (/\.(png|jpe?g|svg|webp)$/i.test(f)) {
					candidates.push(path.join(iconDir, f));
				}
			}
		} catch {
		}
		if (this.platform) {
			candidates.push(path.join(this.extensionPath, 'model', this.platform.folder, 'icon.png'));
		}

		for (const file of candidates) {
			try {
				if (fs.existsSync(file)) {
					const b64 = fs.readFileSync(file).toString('base64');
					return `data:${mimeOf(file)};base64,${b64}`;
				}
			} catch {
				/* coba kandidat berikutnya */
			}
		}
		return '';
	}

	// -- HTML ---------------------------------------------------------------
	private getHtml(): string {
		const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
		const icon = this.loadIconDataUri();
		const osLabel = this.platform ? this.platform.label : process.platform;

		return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; gap: 10px; padding: 10px; overflow: auto;
    font-family: var(--vscode-font-family); color: var(--vscode-foreground);
  }
  .controls { display: flex; flex-direction: column; gap: 8px; }
  h2 { margin: 0; font-size: 13px; font-weight: 600; }
  p { margin: 0; font-size: 12px; opacity: .85; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .7; }
  .badge {
    align-self: flex-start; font-size: 11px; padding: 1px 6px; border-radius: 8px;
    background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
  }
  .row { display: flex; gap: 4px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  button {
    padding: 6px 8px; border: 1px solid transparent; cursor: pointer; font: inherit; font-size: 12px;
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  button:disabled { opacity: .5; cursor: default; }
  button.stop { background: var(--vscode-errorForeground); color: #fff; }
  button.sec, .dock button {
    color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground);
  }
  button.sec:hover:not(:disabled), .dock button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .dock button[aria-pressed="true"] {
    color: var(--vscode-button-foreground); background: var(--vscode-button-background);
  }
  select, input[type="text"], input[type="number"] {
    width: 100%; padding: 4px 6px; font: inherit; font-size: 12px;
    color: var(--vscode-input-foreground); background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
  }
  select { flex: 1 1 auto; min-width: 0; }
  .row button { flex: 0 0 auto; }
  details { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; }
  summary { cursor: pointer; font-size: 12px; font-weight: 600; padding: 2px 0; }
  .opts { display: flex; flex-direction: column; gap: 6px; padding: 6px 0 4px; }
  .opts label { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .opts .field { display: grid; grid-template-columns: 1fr 90px; gap: 6px; align-items: center; font-size: 12px; }
  #status { font-size: 12px; opacity: .85; }
  pre {
    flex: 1 1 auto; min-height: 120px; margin: 0; padding: 6px; overflow: auto;
    white-space: pre-wrap; word-break: break-all;
    font-family: var(--vscode-editor-font-family); font-size: 12px;
    background: var(--vscode-terminal-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-panel-border);
  }

  /* Splash */
  #splash {
    position: fixed; inset: 0; z-index: 10;
    display: flex; align-items: center; justify-content: center;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    opacity: 1; visibility: visible;
    transition: opacity .5s ease, visibility 0s linear 0s;
  }
  #splash.hide { opacity: 0; visibility: hidden; transition: opacity .5s ease, visibility 0s linear .5s; pointer-events: none; }
  #splash img {
    width: min(55%, 160px); height: auto;
    animation: pop .7s ease both, pulse 1.6s ease-in-out .7s infinite;
  }
  @keyframes pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }

  @media (max-width: 230px) {
    .grid2, .grid3 { grid-template-columns: 1fr; }
    p { display: none; }
  }
  @media (min-width: 560px) {
    body { flex-direction: row; overflow: hidden; }
    .controls { flex: 0 0 260px; overflow-y: auto; padding-right: 4px; }
    pre { min-height: 0; }
  }
</style>
</head>
<body>
  <div id="splash">${icon ? `<img src="${icon}" alt="Scripy Preview">` : '<h2>Scripy Preview</h2>'}</div>

  <div class="controls">
    <h2>Scripy Preview</h2>
    <p>Android screen preview inside VS Code.</p>
    <span class="badge">${osLabel}</span>

    <div class="label">Device</div>
    <div class="row">
      <select id="device" aria-label="Device"></select>
      <button class="sec" data-act="refresh" title="Refresh devices">&#8635;</button>
    </div>
    <div class="grid2">
      <button class="sec" data-act="wifi" title="Switch the USB device to Wi-Fi and remember it">USB &rarr; Wi-Fi</button>
      <button class="sec" data-act="pair" title="Pair via Wireless debugging (Android 11+)">Pair</button>
      <button class="sec" data-act="addIp" title="Connect to a phone by IP address">Add IP</button>
      <button class="sec" data-act="forget" title="Forget / disconnect selected device">Forget</button>
    </div>

    <div class="grid2">
      <button id="run">&#9654; Run scrcpy</button>
      <button id="stop" class="stop" disabled>&#9632; Stop</button>
    </div>
    <div id="status">Ready.</div>

    <div class="label">Dock window</div>
    <div class="grid3 dock" role="group" aria-label="Dock window">
      <button data-dock="left" aria-pressed="false">Left</button>
      <button data-dock="none" aria-pressed="false">Free</button>
      <button data-dock="right" aria-pressed="false">Right</button>
    </div>

    <details open>
      <summary>Tools</summary>
      <div class="opts">
        <div class="grid3">
          <button class="sec" data-key="back" title="Back">&#9664; Back</button>
          <button class="sec" data-key="home" title="Home">&#9679; Home</button>
          <button class="sec" data-key="recents" title="Recent apps">&#9632; Recents</button>
          <button class="sec" data-key="power" title="Power">Power</button>
          <button class="sec" data-key="volup" title="Volume up">Vol +</button>
          <button class="sec" data-key="voldown" title="Volume down">Vol &minus;</button>
        </div>
        <div class="grid2">
          <button class="sec" data-act="screenshot">Screenshot</button>
          <button class="sec" data-act="installApk">Install APK</button>
          <button class="sec" data-act="pushFile">Send file</button>
          <button class="sec" data-act="openFolder">Open folder</button>
        </div>
        <button class="sec" data-act="restartAdb">Restart ADB</button>
      </div>
    </details>

    <details>
      <summary>Options</summary>
      <div class="opts">
        <label><input type="checkbox" data-opt="autoWireless"> Auto reconnect Wi-Fi devices</label>
        <label><input type="checkbox" data-opt="autoWifi"> Auto Wi-Fi when USB connected</label>
        <label><input type="checkbox" id="aot"> Always on top</label>
        <label><input type="checkbox" data-opt="audio"> Forward audio (Android 11+)</label>
        <label><input type="checkbox" data-opt="stayAwake"> Stay awake</label>
        <label><input type="checkbox" data-opt="turnScreenOff"> Turn phone screen off</label>
        <label><input type="checkbox" data-opt="showTouches"> Show touches</label>
        <label><input type="checkbox" data-opt="noControl"> View only (no control)</label>
        <label><input type="checkbox" data-opt="borderless"> Borderless window</label>
        <label><input type="checkbox" data-opt="record"> Record to ~/Scripy (.mkv)</label>
        <div class="field">Max size (px)<input type="number" min="0" max="8192" placeholder="auto" data-opt="maxSize"></div>
        <div class="field">Max FPS<input type="number" min="0" max="240" placeholder="auto" data-opt="maxFps"></div>
        <div class="field">Bitrate<input type="text" placeholder="8M" data-opt="bitrate"></div>
      </div>
    </details>
  </div>
  <pre id="log" aria-live="polite"></pre>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const $ = (id) => document.getElementById(id);
    const runBtn = $('run');
    const stopBtn = $('stop');
    const statusEl = $('status');
    const logEl = $('log');
    const splashEl = $('splash');
    const deviceEl = $('device');
    const dockBtns = document.querySelectorAll('[data-dock]');
    let splashTimer;

    function screenInfo() {
      const s = window.screen;
      return {
        w: s.availWidth,
        h: s.availHeight,
        left: s.availLeft || 0,
        top: s.availTop || 0,
        dpr: window.devicePixelRatio || 1
      };
    }
    function showSplash(ms) {
      clearTimeout(splashTimer);
      splashEl.classList.remove('hide');
      splashTimer = setTimeout(() => splashEl.classList.add('hide'), ms);
    }
    function setState(m) {
      runBtn.disabled = m.running || m.busy;
      stopBtn.disabled = !m.running;
      statusEl.textContent = m.busy
        ? 'Starting scrcpy...'
        : m.running
          ? 'scrcpy is running. Dock/option changes apply on the next run.'
          : 'Ready.';
    }
    function setDock(dock) {
      dockBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dock === dock)));
    }
    function applyOptions(o) {
      document.querySelectorAll('[data-opt]').forEach((el) => {
        const v = o[el.dataset.opt];
        if (el.type === 'checkbox') { el.checked = !!v; }
        else if (document.activeElement !== el) { el.value = (v === 0 || v === undefined) ? '' : v; }
      });
    }
    function renderDevices(devs, selected) {
      deviceEl.textContent = '';
      if (!devs.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'No device - plug USB once or use Pair / Add IP';
        deviceEl.appendChild(o);
        return;
      }
      devs.forEach((d) => {
        const o = document.createElement('option');
        o.value = d.id;
        const tag = d.wireless ? '[Wi-Fi] ' : '[USB] ';
        const st = d.state === 'device' ? '' : (d.state === 'saved' ? ' (saved)' : ' (' + d.state + ')');
        o.textContent = tag + d.label + st;
        o.selected = d.id === selected;
        deviceEl.appendChild(o);
      });
    }
    function scrollDown() { logEl.scrollTop = logEl.scrollHeight; }

    runBtn.addEventListener('click', () => vscode.postMessage({ type: 'run', screen: screenInfo() }));
    stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
    deviceEl.addEventListener('change', () => vscode.postMessage({ type: 'select', value: deviceEl.value }));
    $('aot').addEventListener('change', (e) => vscode.postMessage({ type: 'alwaysOnTop', value: e.target.checked }));
    dockBtns.forEach((b) => b.addEventListener('click', () => {
      setDock(b.dataset.dock);
      vscode.postMessage({ type: 'dock', value: b.dataset.dock });
    }));
    document.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => vscode.postMessage({ type: b.dataset.act })));
    document.querySelectorAll('[data-key]').forEach((b) =>
      b.addEventListener('click', () => vscode.postMessage({ type: 'key', value: b.dataset.key })));
    document.querySelectorAll('[data-opt]').forEach((el) =>
      el.addEventListener('change', () => {
        const v = el.type === 'checkbox' ? el.checked : el.value;
        vscode.postMessage({ type: 'option', key: el.dataset.opt, value: v });
      }));

    window.addEventListener('message', (e) => {
      const m = e.data;
      if (m.type === 'log') { logEl.textContent += m.text; scrollDown(); }
      else if (m.type === 'clear') { logEl.textContent = ''; }
      else if (m.type === 'splash') { showSplash(m.ms); }
      else if (m.type === 'devices') { renderDevices(m.devices, m.selected); }
      else if (m.type === 'state') {
        setState(m);
        setDock(m.dock);
        $('aot').checked = !!m.alwaysOnTop;
        applyOptions(m.options);
        logEl.textContent = m.logs;
        scrollDown();
      }
    });

    // Splash icon saat pertama dibuka, lalu hilang dan UI muncul.
    showSplash(${SPLASH_START_MS});
    vscode.postMessage({ type: 'ready', screen: screenInfo() });
  </script>
</body>
</html>`;
	}
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext) {
	const provider = new ScrcpyViewProvider(context.extensionPath, context.globalState);

	const viewReg = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);

	const runCmd = vscode.commands.registerCommand(RUN_COMMAND, async () => {
		await vscode.commands.executeCommand(`${VIEW_ID}.focus`);
		await provider.run();
	});

	const stopCmd = vscode.commands.registerCommand(STOP_COMMAND, () => provider.stop());

	const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration(CONFIG_SECTION)) {
			provider.postState();
		}
	});

	const button = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	button.text = '$(device-mobile) Device';
	button.tooltip = 'Run scrcpy';
	button.command = RUN_COMMAND;
	button.show();

	context.subscriptions.push(viewReg, runCmd, stopCmd, configWatcher, button, {
		dispose: () => provider.stop(),
	});
}

export function deactivate() {
	/* resource dibersihkan lewat context.subscriptions */
}