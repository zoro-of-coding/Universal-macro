import type { MacroEvent } from './types'
import { randomUUID } from 'crypto'

let uiohook: any = null
let hookAvailable = false

try {
  // uiohook-napi export is { uIOhook } or default
  const mod = require('uiohook-napi')
  uiohook = mod.uIOhook ?? mod.default?.uIOhook ?? mod
  hookAvailable = !!uiohook
  console.log('[recorder] uiohook loaded:', hookAvailable)
} catch (e) {
  console.warn('[recorder] uiohook-napi not available, fallback mode', e)
}

export class MacroRecorder {
  private events: MacroEvent[] = []
  private isRecording = false
  private lastTime = 0
  private recordStartTime = 0
  private captureMouseMove = false
  private captureKeyboard = true
  private captureMouseClick = true
  private onEventCb?: (e: MacroEvent) => void
  private onStateCb?: (recording: boolean) => void
  // hotkeys that trigger record/stop - never record their own press (F9/F10/F11)
  private hotkeyKeycodes = new Set([67, 68, 87, 88, 59, 60, 61, 62, 63, 64, 65, 66]) // F1-F12
  private recordHotkeyCodes = new Set([67]) // F9 specifically, extend if needed
  private overlayRect: { x:number, y:number, w:number, h:number } | null = null

  constructor() {
    if (uiohook) {
      uiohook.on('keydown', (e: any) => this.handleRaw('keydown', e))
      uiohook.on('keyup', (e: any) => this.handleRaw('keyup', e))
      uiohook.on('mousedown', (e: any) => this.handleRaw('mousedown', e))
      uiohook.on('mouseup', (e: any) => this.handleRaw('mouseup', e))
      uiohook.on('mousemove', (e: any) => this.handleRaw('mousemove', e))
      uiohook.on('wheel', (e: any) => this.handleRaw('wheel', e))
    }
  }

  setCallbacks(onEvent: (e: MacroEvent) => void, onState: (r: boolean) => void) {
    this.onEventCb = onEvent
    this.onStateCb = onState
  }

  isAvailable() { return hookAvailable }

  start(opts: { captureMouseMove: boolean; captureKeyboard: boolean; captureMouseClick: boolean }) {
    if (this.isRecording) return
    this.captureMouseMove = opts.captureMouseMove
    this.captureKeyboard = opts.captureKeyboard
    this.captureMouseClick = opts.captureMouseClick
    this.events = []
    this.lastTime = Date.now()
    this.recordStartTime = Date.now()
    this.isRecording = true
    if (uiohook && !hookAvailable) {
      // try reload
    }
    if (uiohook) {
      try { uiohook.start() } catch (e) { console.error('hook start failed', e) }
    }
    this.onStateCb?.(true)
    console.log('[recorder] started', opts)
  }

  stop(): MacroEvent[] {
    if (!this.isRecording) return this.events
    this.isRecording = false
    if (uiohook) {
      try { uiohook.stop() } catch {}
    }
    // Remove trailing hotkey press that triggered STOP (F9 down/up) if it's the last event
    // and also leading hotkey release that triggered START (F9 up at 0ms)
    if (this.events.length) {
      const first = this.events[0]
      if (first && first.type.includes('key') && first.keycode && this.recordHotkeyCodes.has(first.keycode) && first.delay < 300) {
        // F9 up right after start - drop it
        this.events.shift()
        console.log('[recorder] filtered leading F9')
      }
      let last = this.events[this.events.length - 1]
      if (last && last.type.includes('key') && last.keycode && this.hotkeyKeycodes.has(last.keycode)) {
        const isStopHotkey = this.recordHotkeyCodes.has(last.keycode) || this.hotkeyKeycodes.has(last.keycode)
        if (isStopHotkey) {
          this.events.pop()
          console.log('[recorder] filtered trailing hotkey', last.key)
          last = this.events[this.events.length - 1]
        }
      }
      // Also filter trailing Stop-overlay click (mouse at overlay rect)
      if (last && (last.type === 'mousedown' || last.type === 'mouseup') && this.overlayRect && last.x !== undefined && last.y !== undefined) {
        const r = this.overlayRect
        if (last.x >= r.x && last.x <= r.x + r.w && last.y >= r.y && last.y <= r.y + r.h) {
          this.events.pop()
          console.log('[recorder] filtered trailing overlay click')
        }
      }
    }
    this.onStateCb?.(false)
    console.log('[recorder] stopped, events:', this.events.length)
    return [...this.events]
  }

  getEvents() { return [...this.events] }
  getIsRecording() { return this.isRecording }

  // For manual / fallback injection from renderer (testing without hook)
  injectEvent(ev: Omit<MacroEvent, 'id'|'delay'> & { delay?: number }) {
    if (!this.isRecording) return
    const now = Date.now()
    const delay = ev.delay ?? Math.max(0, now - this.lastTime)
    this.lastTime = now
    const full: MacroEvent = { id: randomUUID(), delay, ...ev } as MacroEvent
    this.events.push(full)
    this.onEventCb?.(full)
  }

  // Allow main to update hotkey codes dynamically
  setHotkeyKeycodes(codes: number[]) {
    this.recordHotkeyCodes = new Set(codes)
    this.hotkeyKeycodes = new Set([...codes, 68, 87]) // also F10/F11
  }
  setHotkeyAccelerators(accelerators: string[]) {
    const codes: number[] = []
    for (const acc of accelerators) {
      const c = this.acceleratorToKeycode(acc)
      if (c) codes.push(c)
    }
    if (codes.length) this.setHotkeyKeycodes(codes)
  }
  setOverlayRect(rect: { x:number, y:number, w:number, h:number } | null) {
    this.overlayRect = rect
  }

  private acceleratorToKeycode(acc: string): number | null {
    if (!acc) return null
    const last = acc.split('+').pop()?.trim().toUpperCase()
    if (!last) return null
    const fMap: Record<string, number> = {
      'F1':59,'F2':60,'F3':61,'F4':62,'F5':63,'F6':64,'F7':65,'F8':66,'F9':67,'F10':68,'F11':87,'F12':88,
      'ESCAPE':1,'SPACE':57,'ENTER':28,'TAB':15,'BACKSPACE':14,'DELETE':83,'INSERT':82
    }
    if (fMap[last]) return fMap[last]
    if (/^[A-Z]$/.test(last)) return 30 + (last.charCodeAt(0) - 65) // approximate A=30 etc not exact but covers letter keys
    if (/^[0-9]$/.test(last)) return last==='0' ? 11 : 2 + parseInt(last)-1
    return null
  }

  private handleRaw(type: string, raw: any) {
    if (!this.isRecording) return
    // filter by capture settings
    if (type === 'mousemove' && !this.captureMouseMove) return
    if ((type === 'keydown' || type === 'keyup') && !this.captureKeyboard) return
    if ((type === 'mousedown' || type === 'mouseup' || type === 'wheel') && !this.captureMouseClick) return

    // Never record the hotkey that started recording (F9 up right after start) or other control F-keys shortly after start
    if ((type === 'keydown' || type === 'keyup') && raw.keycode && this.hotkeyKeycodes.has(raw.keycode)) {
      if (Date.now() - this.recordStartTime < 600) {
        return
      }
    }
    // Ignore mouse clicks from the Record button itself for a short window after start
    if ((type === 'mousedown' || type === 'mouseup' || type === 'mousemove') && Date.now() - this.recordStartTime < 350) {
      return
    }
    // Ignore clicks on the floating Stop overlay (top-right 190x48)
    if ((type === 'mousedown' || type === 'mouseup') && this.overlayRect && raw.x !== undefined && raw.y !== undefined) {
      const r = this.overlayRect
      if (raw.x >= r.x && raw.x <= r.x + r.w && raw.y >= r.y && raw.y <= r.y + r.h) {
        return
      }
    }

    // throttle mousemove heavily (at most 20Hz and distance > 5px)
    if (type === 'mousemove') {
      const last = this.events[this.events.length - 1]
      if (last && last.type === 'mousemove' && Date.now() - this.lastTime < 50) return
      if (last && last.type === 'mousemove' && last.x !== undefined && raw.x !== undefined && last.y !== undefined && raw.y !== undefined) {
        const dx = Math.abs(last.x - raw.x), dy = Math.abs((last.y as number) - raw.y)
        if (dx < 5 && dy < 5) return
      }
    }

    const now = Date.now()
    const delay = Math.max(0, now - this.lastTime)
    this.lastTime = now

    const keyName = raw.keycode ? vkToKey(raw.keycode) : undefined
    const ev: MacroEvent = {
      id: randomUUID(),
      type: type as any,
      delay,
      keycode: raw.keycode,
      key: keyName || (raw.keycode ? `VC_${raw.keycode}` : undefined),
      button: raw.button,
      x: raw.x,
      y: raw.y,
      deltaX: raw.rotation ?? raw.amount ?? raw.deltaX,
      deltaY: raw.rotation ?? raw.amount ?? raw.deltaY,
      raw
    }

    // Normalize button
    if (ev.button === undefined && raw.button !== undefined) ev.button = raw.button

    // Ensure key name is human-readable
    if (raw.keycode && (!ev.key || /^VC_/.test(ev.key))) {
      ev.key = vkToKey(raw.keycode) || `VC_${raw.keycode}`
    }

    this.events.push(ev)
    this.onEventCb?.(ev)
  }
}

function vkToKey(code: number): string | undefined {
  const map: Record<number,string> = {
    1:'Escape',2:'1',3:'2',4:'3',5:'4',6:'5',7:'6',8:'7',9:'8',10:'9',11:'0',
    12:'Minus',13:'Equal',14:'Backspace',15:'Tab',16:'Q',17:'W',18:'E',19:'R',20:'T',21:'Y',22:'U',23:'I',24:'O',25:'P',
    26:'BracketLeft',27:'BracketRight',28:'Enter',29:'ControlLeft',30:'A',31:'S',32:'D',33:'F',34:'G',35:'H',36:'J',37:'K',38:'L',
    39:'Semicolon',40:'Quote',41:'Backquote',42:'ShiftLeft',43:'Backslash',44:'Z',45:'X',46:'C',47:'V',48:'B',49:'N',50:'M',
    51:'Comma',52:'Period',53:'Slash',54:'ShiftRight',55:'NumpadMultiply',56:'AltLeft',57:'Space',58:'CapsLock',
    59:'F1',60:'F2',61:'F3',62:'F4',63:'F5',64:'F6',65:'F7',66:'F8',67:'F9',68:'F10',69:'NumLock',70:'ScrollLock',
    71:'Home',72:'ArrowUp',73:'PageUp',74:'NumpadSubtract',75:'ArrowLeft',76:'Numpad5',77:'ArrowRight',78:'NumpadAdd',
    79:'End',80:'ArrowDown',81:'PageDown',82:'Insert',83:'Delete',87:'F11',88:'F12',
    3613:'ControlRight',3640:'AltRight',3657:'ContextMenu',3639:'MetaLeft',3641:'MetaRight'
  }
  if (map[code]) return map[code]
  if (code >= 59 && code <= 68) return `F${code-58}`
  return undefined
}

export const recorder = new MacroRecorder()
