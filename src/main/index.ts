import { app, BrowserWindow, ipcMain, globalShortcut, dialog, shell, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, readFileSync } from 'fs'
import { recorder } from './recorder'
import { player } from './player'
import { loadMacros, saveMacros, loadSettings, saveSettings } from './storage'
import type { Macro } from './types'
import { randomUUID } from 'crypto'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let macros: Macro[] = []
let settings = loadSettings()
let isQuitting = false

function getIconPath() {
  const png = join(__dirname, '../../resources/icon.png')
  const tryPaths = [
    join(app.getAppPath(), 'resources/icon.png'),
    join(process.resourcesPath || '', 'resources/icon.png'),
    join(__dirname, '../renderer/assets'),
    png
  ]
  for (const p of tryPaths) if (existsSync(p)) return p
  return png
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 600,
    title: 'Universal Macro',
    backgroundColor: '#0f1115',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    show: false,
    icon: getIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL)
  } else if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] as string)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (e) => {
    if (!isQuitting && (settings.runInBackground || settings.minimizeToTray)) {
      e.preventDefault()
      mainWindow?.hide()
      // optionally show tray balloon on first hide
      if (tray && settings.minimizeToTray) {
        // tray.displayBalloon({ title: 'Universal Macro', content: 'App running in background. Use tray to restore.' })
      }
      return
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  // open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
}

function createTray() {
  try {
    const iconPath = getIconPath()
    let img = nativeImage.createFromPath(iconPath)
    if (img.isEmpty()) {
      // fallback: 16x16 generated
      img = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR42mNkYGD4z0AFZCCKgDEwEsYBaNgFIyAAAZwQAQpU3OIAAAAASUVORK5CYII=')
    }
    tray = new Tray(img)
    tray.setToolTip('Universal Macro - running in background')
    updateTrayMenu()
    tray.on('double-click', () => {
      if (mainWindow?.isVisible()) mainWindow.hide()
      else { mainWindow?.show(); mainWindow?.focus() }
    })
  } catch (e) { console.warn('tray failed', e) }
}

function updateTrayMenu() {
  if (!tray) return
  const macroItems = macros.slice(0, 10).map(m => ({
    label: `${m.name} ${m.shortcut ? `(${m.shortcut})` : ''} - ${m.events.length} steps`,
    click: () => playMacroById(m.id)
  }))
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Universal Macro', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    ...(macroItems.length ? [{ label: 'Run macro', submenu: macroItems } as any] : []),
    { label: player.getIsPlaying() ? '■ Stop playback' : '▶ Play last macro', click: () => {
      if (player.getIsPlaying()) player.stop()
      else if (macros[0]) playMacroById(macros[0].id)
    }},
    { type: 'separator' },
    { label: `Background mode: ${settings.runInBackground ? 'ON' : 'OFF'}`, click: async () => {
      settings.runInBackground = !settings.runInBackground
      saveSettings(settings)
      updateTrayMenu()
      mainWindow?.webContents.send('settings:changed', settings)
    }},
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
  ]))
}

app.whenReady().then(() => {
  macros = loadMacros()
  // migrate: ensure fields exist
  macros = macros.map(m => ({ shortcut: undefined, runInBackground: false, ...m }))
  console.log(`[main] loaded ${macros.length} macros`)

  createWindow()
  createTray()
  registerHotkeys()

  // apply launch at startup
  if (settings.launchAtStartup) {
    try { app.setLoginItemSettings({ openAtLogin: true }) } catch {}
  }

  // recorder callbacks -> push to renderer
  recorder.setCallbacks(
    (ev) => mainWindow?.webContents.send('recorder:event', ev),
    (recording) => mainWindow?.webContents.send('recorder:state', recording)
  )
  player.setCallbacks(
    (idx, repeat) => mainWindow?.webContents.send('player:progress', { idx, repeat }),
    (playing, repeat) => {
      mainWindow?.webContents.send('player:state', { playing, repeat })
      updateTrayMenu()
    }
  )

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else mainWindow?.show() })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (settings.runInBackground || settings.minimizeToTray) {
      // keep running in tray
    } else app.quit()
  }
})

app.on('before-quit', () => { isQuitting = true })
app.on('will-quit', () => globalShortcut.unregisterAll())

function playMacroById(id: string) {
  const m = macros.find(x => x.id === id)
  if (!m) return { success: false, error: 'not found' }
  if (player.getIsPlaying()) player.stop()
  // If runInBackground is true for this macro, we ensure window doesn't steal focus
  // Playback itself is always background-capable (global shortcuts + nut.js)
  if (m.runInBackground && mainWindow?.isVisible()) {
    // optionally minimize? leave visible per user choice; playback works anyway
  }
  return player.play(m)
}

function registerHotkeys() {
  globalShortcut.unregisterAll()
  const errors: string[] = []
  try {
    // global app hotkeys
    try { globalShortcut.register(settings.hotkeys.record, () => {
      if (recorder.getIsRecording()) handleStopRecording()
      else handleStartRecording({ captureMouseMove: false, captureKeyboard: true, captureMouseClick: true })
    }) } catch (e:any){ errors.push(`record ${settings.hotkeys.record}: ${e.message}`)}
    try { globalShortcut.register(settings.hotkeys.play, () => {
      const m = macros[0]
      if (m && !player.getIsPlaying()) playMacroById(m.id)
    }) } catch (e:any){ errors.push(`play ${settings.hotkeys.play}: ${e.message}`)}
    try { globalShortcut.register(settings.hotkeys.stop, () => {
      if (player.getIsPlaying()) player.stop()
      if (recorder.getIsRecording()) handleStopRecording()
    }) } catch (e:any){ errors.push(`stop ${settings.hotkeys.stop}: ${e.message}`)}

    // per-macro shortcuts
    for (const m of macros) {
      if (!m.shortcut) continue
      const accel = normalizeAccelerator(m.shortcut)
      if (!accel) { errors.push(`${m.name}: invalid shortcut ${m.shortcut}`); continue }
      try {
        const ok = globalShortcut.register(accel, () => {
          console.log(`[hotkey] ${m.name} -> ${accel}`)
          if (player.getIsPlaying()) {
            // if same macro is playing, stop; otherwise queue?
            // stop current and play requested
            player.stop()
            setTimeout(() => playMacroById(m.id), 120)
          } else {
            playMacroById(m.id)
          }
        })
        if (!ok) errors.push(`${m.name}: failed to register ${accel} (already in use)`)
        else console.log(`[hotkey] registered ${m.name} => ${accel}`)
      } catch (e:any){ errors.push(`${m.name}: ${e.message}`)}
    }
  } catch (e) { console.warn('hotkey register failed', e) }
  if (errors.length) console.warn('[hotkeys] errors', errors)
  return errors
}

function normalizeAccelerator(s: string): string | null {
  if (!s || typeof s !== 'string') return null
  // allow user to send like "Ctrl+Shift+Q" or "CommandOrControl+Shift+F9"
  let t = s.trim()
  if (!t) return null
  // map common aliases
  t = t.replace(/\bCmd\b/gi, 'Command')
       .replace(/\bCtrl\b/gi, 'Control')
       .replace(/\bControlOrCommand\b/gi, 'CommandOrControl')
       .replace(/\bCmdOrCtrl\b/gi, 'CommandOrControl')
  // Ensure modifiers capitalized correctly for Electron
  // Electron expects e.g. "CommandOrControl+Shift+F9"
  // We'll keep as is, just ensure no double spaces
  return t
}

// ---- IPC ----
function handleStartRecording(opts: any) {
  recorder.start(opts ?? { captureMouseMove: false, captureKeyboard: true, captureMouseClick: true })
  return { ok: true, recording: true }
}
function handleStopRecording() {
  const events = recorder.stop()
  return { ok: true, events }
}

ipcMain.handle('macros:list', () => macros)
ipcMain.handle('macros:save', (_e, macro: Macro) => {
  const idx = macros.findIndex(m => m.id === macro.id)
  macro.updatedAt = Date.now()
  // validate shortcut uniqueness
  if (macro.shortcut) {
    const dup = macros.find(m => m.id !== macro.id && m.shortcut && normalizeAccelerator(m.shortcut) === normalizeAccelerator(macro.shortcut!))
    if (dup) throw new Error(`Shortcut ${macro.shortcut} already used by "${dup.name}"`)
  }
  if (idx >= 0) macros[idx] = macro
  else macros.push(macro)
  saveMacros(macros)
  registerHotkeys()
  updateTrayMenu()
  return macro
})
ipcMain.handle('macros:create', (_e, partial: Partial<Macro>) => {
  const now = Date.now()
  const m: Macro = {
    id: randomUUID(),
    name: partial.name || `Macro ${macros.length + 1}`,
    createdAt: now,
    updatedAt: now,
    events: partial.events || [],
    repeatCount: partial.repeatCount ?? 1,
    repeatInterval: partial.repeatInterval ?? 500,
    speed: partial.speed ?? 1,
    captureMouseMove: partial.captureMouseMove ?? false,
    captureKeyboard: partial.captureKeyboard ?? true,
    captureMouseClick: partial.captureMouseClick ?? true,
    shortcut: partial.shortcut,
    runInBackground: partial.runInBackground ?? false
  }
  if (m.shortcut) {
    const dup = macros.find(x => x.shortcut && normalizeAccelerator(x.shortcut) === normalizeAccelerator(m.shortcut!))
    if (dup) throw new Error(`Shortcut ${m.shortcut} already used by "${dup.name}"`)
  }
  macros.push(m)
  saveMacros(macros)
  registerHotkeys()
  updateTrayMenu()
  return m
})
ipcMain.handle('macros:delete', (_e, id: string) => {
  macros = macros.filter(m => m.id !== id)
  saveMacros(macros)
  registerHotkeys()
  updateTrayMenu()
  return { ok: true }
})
ipcMain.handle('macros:duplicate', (_e, id: string) => {
  const src = macros.find(m => m.id === id)
  if (!src) throw new Error('not found')
  const copy: Macro = { ...src, id: randomUUID(), name: src.name + ' copy', createdAt: Date.now(), updatedAt: Date.now(), events: [...src.events.map(e => ({ ...e, id: randomUUID() }))], shortcut: undefined }
  macros.push(copy)
  saveMacros(macros)
  registerHotkeys()
  updateTrayMenu()
  return copy
})
ipcMain.handle('macros:export', async (_e, id: string) => {
  const m = macros.find(x => x.id === id)
  if (!m) throw new Error('not found')
  const { filePath, canceled } = await dialog.showSaveDialog({ defaultPath: `${m.name}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (canceled || !filePath) return { canceled: true }
  writeFileSync(filePath, JSON.stringify(m, null, 2))
  return { canceled: false, filePath }
})
ipcMain.handle('macros:import', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile', 'multiSelections'] })
  if (canceled || !filePaths.length) return []
  const imported: Macro[] = []
  for (const fp of filePaths) {
    try {
      const raw = readFileSync(fp, 'utf-8')
      const data = JSON.parse(raw)
      const arr = Array.isArray(data) ? data : [data]
      for (const m of arr) {
        const nm: Macro = { ...m, id: randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), events: (m.events || []).map((e:any)=>({...e, id: randomUUID()})), shortcut: undefined }
        // avoid shortcut collision on import
        if (nm.shortcut) {
          const dup = macros.find(x => x.shortcut && normalizeAccelerator(x.shortcut) === normalizeAccelerator(nm.shortcut!))
          if (dup) nm.shortcut = undefined
        }
        macros.push(nm)
        imported.push(nm)
      }
    } catch (e) { console.warn('import failed', fp, e) }
  }
  saveMacros(macros)
  registerHotkeys()
  updateTrayMenu()
  return imported
})
ipcMain.handle('macros:setShortcut', (_e, id: string, shortcut: string | undefined) => {
  const m = macros.find(x => x.id === id)
  if (!m) throw new Error('macro not found')
  if (shortcut) {
    const norm = normalizeAccelerator(shortcut)
    if (!norm) throw new Error('invalid shortcut')
    // check duplicate
    const dup = macros.find(x => x.id !== id && x.shortcut && normalizeAccelerator(x.shortcut!) === norm)
    if (dup) throw new Error(`Shortcut already used by "${dup.name}"`)
    // try register to validate
    const testOk = globalShortcut.isRegistered(norm) ? false : true
    // we will register for real via registerHotkeys; optimistic
    m.shortcut = norm
  } else {
    m.shortcut = undefined
  }
  m.updatedAt = Date.now()
  saveMacros(macros)
  const errs = registerHotkeys()
  updateTrayMenu()
  if (errs.length) {
    // if registration failed for this macro, revert?
    // check if errs contain this macro
    const failed = errs.some(e => e.includes(m.name))
    if (failed && shortcut) {
      // keep but notify
      return { ok: false, error: errs.find(e=>e.includes(m.name)), macro: m }
    }
  }
  return { ok: true, macro: m }
})
ipcMain.handle('macros:playById', (_e, id: string) => playMacroById(id))

ipcMain.handle('recorder:start', (_e, opts) => handleStartRecording(opts))
ipcMain.handle('recorder:stop', () => handleStopRecording())
ipcMain.handle('recorder:status', () => ({ recording: recorder.getIsRecording(), available: recorder.isAvailable() }))
ipcMain.handle('recorder:inject', (_e, ev) => { recorder.injectEvent(ev); return { ok: true } })

ipcMain.handle('player:play', async (_e, macroId: string, opts?: any) => {
  const m = macros.find(x => x.id === macroId)
  if (!m) throw new Error('macro not found')
  const target = opts?.macro ? { ...m, ...opts.macro } : m
  if (opts?.macro) {
    Object.assign(m, opts.macro)
    saveMacros(macros)
    registerHotkeys()
    updateTrayMenu()
  }
  return player.play(target as Macro, opts)
})
ipcMain.handle('player:stop', () => { player.stop(); return { ok: true } })
ipcMain.handle('player:status', () => ({ playing: player.getIsPlaying(), available: player.isAvailable() }))

ipcMain.handle('settings:get', () => settings)
ipcMain.handle('settings:set', (_e, s) => {
  settings = { ...settings, ...s }
  saveSettings(settings)
  // apply login item
  try { app.setLoginItemSettings({ openAtLogin: !!settings.launchAtStartup }) } catch {}
  registerHotkeys()
  updateTrayMenu()
  return settings
})
ipcMain.handle('settings:registerHotkeys', () => ({ errors: registerHotkeys() }))

ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:capabilities', () => ({ recorderAvailable: recorder.isAvailable(), playerAvailable: player.isAvailable(), platform: process.platform }))

// window controls for custom titlebar
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.unmaximize(); else mainWindow?.maximize() })
ipcMain.on('window:close', () => {
  if (settings.runInBackground || settings.minimizeToTray) mainWindow?.hide()
  else { isQuitting = true; mainWindow?.close() }
})
ipcMain.handle('window:hide', () => { mainWindow?.hide(); return { ok:true } })
ipcMain.handle('window:show', () => { mainWindow?.show(); mainWindow?.focus(); return { ok:true } })
ipcMain.handle('app:quit', () => { isQuitting = true; app.quit() })
