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
  private captureMouseMove = false
  private captureKeyboard = true
  private captureMouseClick = true
  private onEventCb?: (e: MacroEvent) => void
  private onStateCb?: (recording: boolean) => void

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

  private handleRaw(type: string, raw: any) {
    if (!this.isRecording) return
    // filter by capture settings
    if (type === 'mousemove' && !this.captureMouseMove) return
    if ((type === 'keydown' || type === 'keyup') && !this.captureKeyboard) return
    if ((type === 'mousedown' || type === 'mouseup' || type === 'wheel') && !this.captureMouseClick) return

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

    const ev: MacroEvent = {
      id: randomUUID(),
      type: type as any,
      delay,
      keycode: raw.keycode,
      key: raw.keycode ? String(raw.keycode) : undefined,
      button: raw.button,
      x: raw.x,
      y: raw.y,
      deltaX: raw.rotation ?? raw.amount ?? raw.deltaX,
      deltaY: raw.rotation ?? raw.amount ?? raw.deltaY,
      raw
    }

    // Normalize button
    if (ev.button === undefined && raw.button !== undefined) ev.button = raw.button

    // Try to get key name if available
    if (raw.keycode && !ev.key) ev.key = `VC_${raw.keycode}`

    this.events.push(ev)
    this.onEventCb?.(ev)
  }
}

export const recorder = new MacroRecorder()
