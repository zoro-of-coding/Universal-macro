import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { Macro, AppSettings } from './types'

const userData = app ? app.getPath('userData') : join(process.cwd(), 'userData')
try { mkdirSync(userData, { recursive: true }) } catch {}

const MACRO_FILE = join(userData, 'macros.json')
const SETTINGS_FILE = join(userData, 'settings.json')

const DEFAULT_SETTINGS: AppSettings = {
  hotkeys: { record: 'F9', play: 'F10', stop: 'F11' },
  minimizeOnRecord: false,
  playbackSpeed: 1,
  runInBackground: true,
  minimizeToTray: true,
  launchAtStartup: false
}

export function loadMacros(): Macro[] {
  try {
    if (!existsSync(MACRO_FILE)) return []
    const raw = readFileSync(MACRO_FILE, 'utf-8')
    return JSON.parse(raw) as Macro[]
  } catch (e) {
    console.error('loadMacros failed', e)
    return []
  }
}

export function saveMacros(macros: Macro[]) {
  try {
    writeFileSync(MACRO_FILE, JSON.stringify(macros, null, 2), 'utf-8')
  } catch (e) {
    console.error('saveMacros failed', e)
  }
}

export function loadSettings(): AppSettings {
  try {
    if (!existsSync(SETTINGS_FILE)) return DEFAULT_SETTINGS
    const raw = readFileSync(SETTINGS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    // deep merge hotkeys
    return { ...DEFAULT_SETTINGS, ...parsed, hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(parsed.hotkeys || {}) } }
  } catch { return DEFAULT_SETTINGS }
}

export function saveSettings(s: AppSettings) {
  try { writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)) } catch {}
}
