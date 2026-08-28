export type MacroEventType = 'keydown'|'keyup'|'mousedown'|'mouseup'|'mousemove'|'wheel'|'delay'
export interface MacroEvent {
  id: string
  type: MacroEventType
  keycode?: number
  key?: string
  button?: number
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  delay: number
  raw?: any
}
export interface Macro {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  events: MacroEvent[]
  repeatCount: number
  repeatInterval: number
  speed: number
  captureMouseMove: boolean
  captureKeyboard: boolean
  captureMouseClick: boolean
  shortcut?: string
  runInBackground?: boolean
}
