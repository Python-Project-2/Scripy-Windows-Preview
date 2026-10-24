<div align="center">

# Scripy Preview

<img src="icon/icon.png" width="120" alt="Scripy Preview Icon" />

**Mirror and control your Android phone screen directly from Visual Studio Code, via USB cable or wireless (Wi-Fi).**

[![Visual Studio Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue.svg)](https://code.visualstudio.com/)
[![Scrcpy](https://img.shields.io/badge/Powered%20by-scrcpy-green.svg)](https://github.com/Genymobile/scrcpy)
[![Developer](https://img.shields.io/badge/Developer-dwi%20bakti%20n%20dev-orange.svg)]()

</div>

---

## 📖 About the Extension

**Scripy Preview** is a VS Code extension that wraps [scrcpy](https://github.com/Genymobile/scrcpy) and ships the required binaries inside the package, so you can start using it right away without manually installing any additional tools. The extension turns VS Code into a powerful Android mirroring and control station, complete with theming, custom device frames, built-in developer shortcuts, and a one-click wireless workflow.

---

## 🖼️ Preview Gallery

<p align="center">
  <img src="screenshots/panel-overview.png" width="80%" alt="Scripy Preview main panel" />
</p>
<p align="center"><em>The main Scripy Preview panel inside VS Code — device selector, Run / Stop buttons, dock window options, theme selector, and live device frame preview.</em></p>

<p align="center">
  <img src="screenshots/theme-selector.png" width="80%" alt="Theme selector dropdown" />
</p>
<p align="center"><em>Built-in theme selector with Auto, iPhone, Android, and Custom categories — including iPhone 16 Pro Max, Pixel 9 Pro, Galaxy S24 Ultra, and more.</em></p>

<p align="center">
  <img src="screenshots/customize-panel.png" width="80%" alt="Customize panel" />
</p>
<p align="center"><em>Customize panel — set device name, screen dimensions, bezel, corner radius, body color, accent color, cutout style, and panel style.</em></p>

<p align="center">
  <img src="screenshots/tools-options-log.png" width="80%" alt="Tools, Options, and Log sections" />
</p>
<p align="center"><em>Tools section (navigation, screenshot, APK install, file transfer), Options section (audio, recording, max FPS / bitrate), and a real-time log panel.</em></p>

<p align="center">
  <img src="screenshots/dev-tools-shortcuts.png" width="80%" alt="Dev tools and keyboard shortcuts" />
</p>
<p align="center"><em>Dev Tools selector for Flutter, Node/RN, Java/Kotlin, Python, .NET/C#, Go, and Rust — plus the full set of keyboard shortcuts.</em></p>

<p align="center">
  <img src="screenshots/project-structure.png" width="80%" alt="Project folder structure" />
</p>
<p align="center"><em>Project folder structure showing the <code>model/</code> directory with platform-specific <code>scrcpy</code> and <code>adb</code> binaries for Windows, macOS, and Linux.</em></p>

---

## ✨ Key Features

- **Ready to Use**: `scrcpy` and `adb` binaries are bundled inside the extension (`model/`), so there is nothing to install manually.
- **Automatic OS Detection**: Windows (`model/win/`), macOS (`model/mac/`), and Linux (`model/linux/`) are all detected automatically at runtime.
- **Splash Icon**: Displays a custom splash icon when the panel is opened, before `scrcpy` is launched.
- **Hassle-Free Wireless**:
  - Connect once via USB, and the extension automatically enables Wi-Fi mode and saves the device.
  - On subsequent sessions, saved devices reconnect automatically — no cable needed.
  - Android 11+ pairing (*Wireless debugging*) via the **Pair** button.
  - Manual connection by IP address using the **Add IP** button.
- **Dock Window**: The `scrcpy` window can be docked to the left, right, or float freely (*Free*).
- **Device Themes & Frames**: A rich built-in theme selector lets you wrap the mirrored screen in realistic frames for iPhone (16 Pro Max, 16 Pro, 16/15, 14/13 Notch, SE), Android (Pixel 9 Pro, Pixel 8, Galaxy S24 Ultra / S24 / A54, Xiaomi 14, OnePlus 12, Generic 16:9), or a fully **Custom** frame.
- **Custom Device Frames**: Define your own device — name, screen width/height, bezel %, corner radius %, body color, accent color, cutout style (notch, punch-hole, none), and panel style.
- **Built-in Tools**: Navigation buttons (Back, Home, Recents, Power, Volume Up/Down), Screenshot, Install APK, Send file, Open folder, and Restart ADB.
- **Dev Tools Integration**: Quickly toggle developer profiles for **Flutter, Node/React Native, Java/Kotlin, Python, .NET/C#, Go, and Rust** — useful for launching the matching dev workflow from the same panel.
- **Keyboard Shortcuts**: Run/Stop, open panel, screenshot, install APK, Home/Back/Recents, theme switcher, and tool picker — all bound to convenient `Ctrl+Alt+` combinations.
- **Comprehensive Options**: Audio forwarding, stay awake, turn phone screen off, show touches, view only, borderless window, always on top, max size, max FPS, bitrate, and recording to `.mkv`.
- **Multi-Device Support**: Easily switch between devices using an auto-updated dropdown.
- **Persistent Settings**: All preferences, themes, custom frames, and selections are remembered for the next session.

---

## 📱 Android Phone Preparation

1. Enable **Developer options** (tap *Build number* 7 times in **Settings > About phone**).
2. Enable **USB debugging**.
3. For wireless pairing mode (Android 11+), also enable **Wireless debugging**.

---

## 🚀 How to Use

### 1. Via USB (Only Once)
1. Plug your phone into the computer and grant *USB debugging* permission on the phone screen.
2. Open the **Scripy Preview** panel or click the **Device** button in the bottom-right status bar.
3. Click **Run scrcpy**.

> If the **Auto Wi-Fi when USB connected** option is enabled (default), the device will be automatically switched to Wi-Fi and saved. After that, the USB cable can be unplugged.

### 2. Wireless Mode (Wi-Fi)

| Scenario | How to Use |
| :--- | :--- |
| **Device previously connected** | Simply click **Run scrcpy**. Reconnection is automatic. |
| **Never connected before (Android 11+)** | Click **Pair**, enter the pairing `IP:PORT` and the 6-digit code from the *Wireless debugging* menu. |
| **You already know the phone's IP address** | Click **Add IP**, then enter the IP address (default port `5555`). |
| **Switching from USB to Wi-Fi** | Plug in the USB cable, then click the **USB → Wi-Fi** button. |

*Requirement:* The phone and computer must be on the same Wi-Fi network.

> *Note:* Wi-Fi mode enabled via USB (`adb tcpip`) will be lost when the phone is restarted. Simply plug in the USB cable once more, or use the **Pair** feature.

---

## 🎛️ Panel Overview

| Section | Function |
| :--- | :--- |
| **Device** | Select device, refresh, *USB → Wi-Fi*, *Pair*, *Add IP*, and *Forget*. |
| **Run / Stop** | Start or stop the `scrcpy` process. Status indicator shows `Ready.` / `Running.` / etc. |
| **Dock Window** | Set window position — *Left*, *Free*, or *Right*. |
| **Theme** | Choose a device frame: Auto, iPhone, Android, or Custom. |
| **Customize** | Configure custom device name, screen width/height, bezel %, corner radius %, body color, accent color, cutout style, and panel style. |
| **Dev Tools** | Toggle language/framework profiles: Flutter, Node/RN, Java/Kotlin, Python, .NET/C#, Go, Rust. |
| **Tools** | Navigation buttons, *Screenshot*, *Install APK*, *Send file*, *Open folder*, and *Restart ADB*. |
| **Options** | Advanced `scrcpy` options (audio, recording, max size, FPS, bitrate, etc.) and wireless configuration. |
| **Log** | Real-time output from `scrcpy` and `adb`. |

---

## 🎨 Themes & Custom Frames

The **Theme** dropdown groups available frames into four categories:

| Category | Available Frames |
| :--- | :--- |
| **Auto** | Auto (match phone) |
| **iPhone** | iPhone 16 Pro Max, iPhone 16 Pro, iPhone 16 / 15, iPhone 14 / 13 (Notch), iPhone SE (Home button) |
| **Android** | Google Pixel 9 Pro, Pixel 8, Samsung Galaxy S24 Ultra / S24 / A54, Xiaomi 14, OnePlus 12, Android Generic (16:9) |
| **Custom** | Fully user-defined frame via the **Customize** panel |

### Customize Panel Options

| Setting | Description |
| :--- | :--- |
| **Name** | Display name of the custom device (e.g. `iPhone 16 Pro`). |
| **Screen width** | Frame internal screen width in pixels (e.g. `1320`). |
| **Screen height** | Frame internal screen height in pixels (e.g. `2868`). |
| **Bezel (%)** | Frame border thickness as a percentage of the screen (e.g. `3`). |
| **Corner radius (%)** | Rounded corner radius as a percentage (e.g. `13`). |
| **Body color** | Solid color of the device body. |
| **Use accent color** | When enabled, accent color is applied to highlights instead of body color. |
| **Accent color** | Secondary highlight color. |
| **Cutout** | Screen cutout style: *Notch*, *Punch-hole*, or *None*. |
| **Panel style** | Visual style of the surrounding panel (e.g. `VS Code`). |
| **Live phone screen inside frame** | Renders the live mirrored screen directly inside the device frame in the panel. |
| **Save Custom / Delete** | Save the current frame as a new theme, or delete an existing custom one. |

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
| :--- | :--- |
| Run script | `Ctrl + Alt + M` |
| Stop script | `Ctrl + Alt + X` |
| Open panel | `Ctrl + Alt + O` |
| Screenshot | `Ctrl + Alt + P` |
| Install APK | `Ctrl + Alt + I` |
| Home | `Ctrl + Alt + H` |
| Back | `Ctrl + Alt + B` |
| Recents | `Ctrl + Alt + R` |
| Switch theme | `Ctrl + Alt + T` |
| Tool picker | `Ctrl + Alt + L` |

---

## 🧰 Dev Tools Profiles

The **Dev Tools** section lets you bind the panel to a specific technology stack so the tools panel adapts to your active workflow. All supported profiles can be enabled simultaneously:

- 🟢 **Flutter**
- 🟢 **Node / React Native**
- 🟢 **Java / Kotlin**
- 🟢 **Python**
- 🟢 **.NET / C#**
- 🟢 **Go**
- 🟢 **Rust**

---

## ⚙️ Extension Options

| Option | Description |
| :--- | :--- |
| **Auto reconnect Wi-Fi devices** | Automatically reconnects previously saved wireless devices. |
| **Auto Wi-Fi when USB connected** | Automatically switches a USB connection to Wi-Fi. |
| **Always on top** | Keeps the `scrcpy` window above all other windows. |
| **Forward audio** | Forwards phone audio to the computer (requires Android 11+). |
| **Stay awake** | Prevents the phone screen from sleeping while connected. |
| **Turn phone screen off** | Turns off the physical phone screen while mirroring continues. |
| **Show touches** | Displays touch points on the screen. |
| **View only** | Mirrors the screen without touch control. |
| **Borderless window** | Removes the window frame of `scrcpy`. |
| **Record to ~/Scripy (.mkv)** | Records the screen to the `~/Scripy` directory in `.mkv` format. |
| **Max size / Max FPS / Bitrate** | Limits resolution, frame rate, and video quality (defaults: `auto` / `auto` / `8M`). |

*Changes to dock position and options will be applied on the next Run session.*

---

## 🎚️ VS Code Settings (`settings.json`)

| Setting | Default | Description |
| :--- | :--- | :--- |
| `scripyPreview.dock` | `right` | Window position: `left`, `right`, or `none` |
| `scripyPreview.alwaysOnTop` | `true` | Window stays on top |
| `scripyPreview.screenScale` | `0` | Override screen scale. `0` means automatic |

---

## ⌨️ Commands

| Command | Command ID |
| :--- | :--- |
| **Run scrcpy** | `scripy-windows-preview.run` |
| **Stop scrcpy** | `scripy-windows-preview.stop` |

---

## 📁 Output File Location

Screenshots and video recordings are automatically saved to the **`Scripy`** folder in your home directory (`~/Scripy`). You can quickly open it using the **Open folder** button.

---

## 🗂️ Project Folder Structure

```text
.
├── dist/               # Compiled script output
├── icon/               # Splash and extension icons
├── model/
│   ├── win/            # scrcpy.exe, adb.exe, DLLs (avcodec-61, avformat-61, SDL2, libusb-1.0, ...), scrcpy-server
│   ├── mac/            # scrcpy, adb, scrcpy-server, scrcpy.1
│   └── linux/          # scrcpy, adb, scrcpy-server, scrcpy.1
├── node_modules/       # NPM dependencies
├── src/extension.ts    # Main extension code
└── package.json
```

> **Important:** Make sure `.vscodeignore` does **not** exclude the `model/**` and `icon/**` folders, so the binaries are packaged into the `.vsix` file.

---

## 🛠️ Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile to the `dist/` directory:
   ```bash
   npm run compile
   ```

3. Press **F5** in VS Code to open an *Extension Development Host* window.

### Building the Install Package (.vsix)

```bash
npx vsce package
code --install-extension scripy-windows-preview-<version>.vsix
```

---

## 🔍 Troubleshooting

| Issue | Solution |
| :--- | :--- |
| `No Android device detected` | Check the USB cable, enable *USB debugging*, or use the **Pair** / **Add IP** feature. |
| `unauthorized` | Unlock the phone screen and approve the *USB debugging* dialog. |
| `offline` | Unplug and replug the USB cable, or disable and re-enable *USB debugging*. |
| Wi-Fi connection failed | Ensure the phone and computer are on the same Wi-Fi network and that the firewall is not blocking `adb`. |
| Wireless connection lost after phone restart | Plug in the USB cable once more, or re-pair the device. |
| `scrcpy not found` | Make sure the `model/` folder is packaged (check your `.vscodeignore` configuration). |
| Buttons not responding / ADB frozen | Click the **Restart ADB** button on the panel. |
| Dock position misaligned on HiDPI displays | Manually adjust the `scripyPreview.screenScale` setting in VS Code. |
| No audio | The audio feature requires Android 11+. Make sure *Forward audio* is enabled. |
| macOS / Linux: *permission denied* | The extension grants execution permissions automatically. If it still fails, run `chmod +x` on the files inside the `model/<os>/` folder. |

---

## 👥 Credits & Developer

- **Developer:** **dwi bakti n dev**
- Built on top of [scrcpy](https://github.com/Genymobile/scrcpy) by **Genymobile** (Apache 2.0 license) and **Android Debug Bridge (adb)**.
