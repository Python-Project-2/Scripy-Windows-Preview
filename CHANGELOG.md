# Change Log

Semua perubahan penting pada extension **Scripy Windows Preview** dicatat di file ini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Unreleased]

### Rencana

- Tombol untuk menghentikan scrcpy.
- Opsi streaming ringan (contoh: `--max-size`, `--max-fps`).
- Manajemen perangkat ADB sederhana (daftar perangkat, connect nirkabel).

## [0.0.1] - 2026-10-03

### Added

- Rilis awal.
- Tombol status bar `dwidevelopes` untuk menjalankan `scrcpy.exe` dengan satu klik.
- Panel sidebar "Scripy Preview" di Activity Bar dengan tombol jalankan.
- Command `scripy-windows-preview.run` (`Run scrcpy (dwidevelopes)`) di Command Palette.
- Terminal dipakai ulang agar tidak menumpuk saat tombol ditekan berulang kali.
- `scrcpy.exe` dan DLL pendukung disertakan di folder `model/`.