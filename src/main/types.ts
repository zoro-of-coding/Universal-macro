export type MacroEventType =
  | 'keydown'
  | 'keyup'
  | 'mousedown'
  | 'mouseup'
  | 'mousemove'
  | 'wheel'
  | 'delay'

export interface MacroEvent {
  id: string
  type: MacroEventType
  // keyboard
  keycode?: number
  key?: string
  // mouse
  button?: number // 1 left, 2 right, 3 middle
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  // timing: delay AFTER previous event (ms)
  delay: number
  // optional meta
  raw?: any
}

export interface Macro {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  events: MacroEvent[]
  // playback settings
  repeatCount: number // 0 = infinite
  repeatInterval: number // ms between repeats
  speed: number // 0.1 - 5.0 multiplier
  // capture settings
  captureMouseMove: boolean
  captureKeyboard: boolean
  captureMouseClick: boolean
  // per-macro global shortcut, e.g. "Ctrl+Shift+F9" or "F6"
  shortcut?: string
  // run playback in background (hide/minimize agnostic)
  runInBackground?: boolean
}

export interface PlaybackState {
  isPlaying: boolean
  isRecording: boolean
  currentMacroId: string | null
  currentRepeat: number
  totalRepeats: number
}

export interface AppSettings {
  hotkeys: {
    record: string
    play: string
    stop: string
  }
  minimizeOnRecord: boolean
  playbackSpeed: number
  // background / tray behaviour
  runInBackground: boolean
  minimizeToTray: boolean
  launchAtStartup: boolean
}
