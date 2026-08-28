# Universal Macro

Lightweight, cross-platform desktop automation app built with Electron + Vite + React + TypeScript.

> Record → Edit delays → Replay with repeat & speed control. Universal macro to automate any task.

![Universal Macro](./resources/icon.png)

## Features

- **Global recording** – captures keyboard, mouse clicks, wheel and optional mouse movement via `uiohook-napi`
- **Pixel-perfect playback** – replays with ` @nut-tree-fork/nut-js` (nut.js fork) at configurable speed
- **Timeline editor** – edit per-event delay (ms), drag to reorder, filter by type, insert pauses, delete steps
- **Repeat engine** – `×1 … ×999` or `∞`, interval between repeats, speed multiplier 0.25×–5×
- **Capture filters** – toggle Keys / Clicks / Move independently
- **Macro manager** – create, duplicate, delete, rename, search, import/export JSON
- **Hotkeys** – `F9` Record, `F10` Play, `F11` Stop (global)
- **Lightweight** – Vite-bundled, offline, JSON file storage (`%APPDATA%/universal-macro` on Windows)
- **Resilient** – if native modules fail to build, app runs in fallback/dry-run mode so editing & storage still work

## Tech Stack

Electron 32 • electron-vite 2 • Vite 5 • React 18 • TypeScript 5 • `uiohook-napi` • `@nut-tree-fork/nut-js`

## Quick Start

```bash
npm install          # --ignore-scripts is fine if native build fails
npm run dev          # electron-vite dev (hot reload)
npm run build        # production build → out/
npm run make:win    # electron-builder NSIS installer (Windows)
```

> **Native modules**: `uiohook-napi` requires C++ build tools on Windows (Visual Studio Build Tools). If it fails, the app still launches and shows `Hook fallback mode` – you can edit/play in dry-run and install deps later via `npm rebuild` or `electron-builder install-app-deps`.

### Scripts

| script | description |
|---|---|
| `dev` | Vite dev + Electron |
| `build` | Build main/preload/renderer |
| `preview` | Preview built app |
| `typecheck` | `tsc --noEmit` |
| `package` / `make` / `make:win` | electron-builder |

## Project Structure

```
src/
  main/       # Electron main: recorder.ts, player.ts, storage.ts, index.ts (IPC)
  preload/    # contextBridge API
  renderer/   # React UI: App.tsx, styles.css, types.ts
out/          # built output (electron-vite)
resources/    # icons
```

## How it Works

1. **Recorder** hooks global input, measures `delay` between events (ms since last), throttles mousemove.
2. **Editor** shows timeline; delay column is editable live → persisted as `MacroEvent.delay`.
3. **Player** loops `events` × `repeatCount` (0=∞), honoring `delay / speed` and `repeatInterval`, mapping `keycode → nut Key` and mouse → `nut.mouse`.

## Storage

```
<AppData>/Universal Macro/macros.json
<AppData>/Universal Macro/settings.json
```
All macros are plain JSON – easy to version, share, or edit manually.

## Roadmap

- Per-macro hotkeys & tray integration
- Conditional loops / image search (nut.js screen.find)
- Scheduling & CLI
- Modifier-key grouping (press+type+release)

## License

MIT
