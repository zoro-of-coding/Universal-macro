import type { MacroEvent, Macro } from './types'

let nut: any = null
let nutAvailable = false
try {
  const { mouse, keyboard, Button, Key, screen } = require('@nut-tree-fork/nut-js')
  nut = { mouse, keyboard, Button, Key, screen }
  // Configure nut.js
  mouse.config.autoDelayMs = 0
  keyboard.config.autoDelayMs = 0
  nutAvailable = true
  console.log('[player] nut.js loaded')
} catch (e) {
  console.warn('[player] nut.js not available', e)
}

// Map generic keycode -> nut Key mapping (best effort)
function keycodeToNutKey(keycode: number): any {
  if (!nut) return null
  const K = nut.Key
  // uiohook VC_* mapping roughly matches virtual key codes
  const map: Record<number, any> = {
    30: K.A, 48: K.B, 46: K.C, 32: K.D, 18: K.E, 33: K.F, 34: K.G, 35: K.H, 23: K.I, 36: K.J, 37: K.K, 38: K.L, 50: K.M, 49: K.N, 24: K.O, 25: K.P, 16: K.Q, 19: K.R, 31: K.S, 20: K.T, 22: K.U, 47: K.V, 17: K.W, 45: K.X, 21: K.Y, 44: K.Z,
    2: K.Num1, 3: K.Num2, 4: K.Num3, 5: K.Num4, 6: K.Num5, 7: K.Num6, 8: K.Num7, 9: K.Num8, 10: K.Num9, 11: K.Num0,
    28: K.Enter, 57: K.Space, 14: K.Backspace, 15: K.Tab, 1: K.Escape,
    42: K.LeftShift, 54: K.RightShift, 29: K.LeftControl, 3613: K.RightControl, 56: K.LeftAlt, 3640: K.RightAlt,
    75: K.Left, 77: K.Right, 72: K.Up, 80: K.Down,
    71: K.Home, 79: K.End, 73: K.PageUp, 81: K.PageDown, 82: K.Insert, 83: K.Delete,
  }
  return map[keycode] ?? null
}

export class MacroPlayer {
  private isPlaying = false
  private shouldStop = false
  private currentRepeat = 0
  private onProgress?: (evIdx: number, repeat: number) => void
  private onState?: (playing: boolean, repeat: number) => void

  setCallbacks(onProgress: (idx:number, repeat:number)=>void, onState:(playing:boolean,repeat:number)=>void){
    this.onProgress = onProgress
    this.onState = onState
  }

  getIsPlaying(){ return this.isPlaying }

  async play(macro: Macro, opts?: { speed?: number; repeatOverride?: number }) {
    if (this.isPlaying) return { success: false, error: 'Already playing' }
    const speed = opts?.speed ?? macro.speed ?? 1
    const totalRepeats = opts?.repeatOverride ?? macro.repeatCount ?? 1
    const infinite = totalRepeats === 0
    const repeatInterval = macro.repeatInterval ?? 0

    this.isPlaying = true
    this.shouldStop = false
    this.currentRepeat = 0
    this.onState?.(true, 0)

    const doDelay = (ms: number) => new Promise<void>(res => setTimeout(res, Math.max(0, ms / speed)))

    try {
      let repeats = 0
      while (!this.shouldStop && (infinite || repeats < totalRepeats)) {
        repeats++
        this.currentRepeat = repeats
        this.onState?.(true, repeats)

        for (let i = 0; i < macro.events.length; i++) {
          if (this.shouldStop) break
          const ev = macro.events[i]
          // delay before event (stored as delay from previous)
          if (ev.delay > 0) await doDelay(ev.delay)
          if (this.shouldStop) break
          await this.executeEvent(ev)
          this.onProgress?.(i, repeats)
        }

        if (!infinite && repeats >= totalRepeats) break
        if (this.shouldStop) break
        if (repeatInterval > 0) await doDelay(repeatInterval)
      }
      return { success: true, repeats }
    } catch (e: any) {
      console.error('[player] error', e)
      return { success: false, error: e?.message ?? String(e) }
    } finally {
      this.isPlaying = false
      this.shouldStop = false
      this.onState?.(false, this.currentRepeat)
    }
  }

  stop() {
    if (!this.isPlaying) return
    this.shouldStop = true
    console.log('[player] stop requested')
  }

  private async executeEvent(ev: MacroEvent) {
    if (!nutAvailable || !nut) {
      // dry run: just wait/logging
      console.log('[player:dry]', ev.type, ev)
      return
    }
    try {
      switch (ev.type) {
        case 'keydown': {
          if (ev.keycode) {
            const k = keycodeToNutKey(ev.keycode)
            if (k !== null && k !== undefined) await nut.keyboard.pressKey(k)
            else console.warn('unknown keycode', ev.keycode)
          }
          break
        }
        case 'keyup': {
          if (ev.keycode) {
            const k = keycodeToNutKey(ev.keycode)
            if (k !== null) await nut.keyboard.releaseKey(k)
          }
          break
        }
        case 'mousedown': {
          if (ev.x !== undefined && ev.y !== undefined) await nut.mouse.setPosition({ x: ev.x, y: ev.y })
          const btn = ev.button === 2 ? nut.Button.RIGHT : ev.button === 3 ? nut.Button.MIDDLE : nut.Button.LEFT
          await nut.mouse.pressButton(btn)
          break
        }
        case 'mouseup': {
          if (ev.x !== undefined && ev.y !== undefined) await nut.mouse.setPosition({ x: ev.x, y: ev.y })
          const btn = ev.button === 2 ? nut.Button.RIGHT : ev.button === 3 ? nut.Button.MIDDLE : nut.Button.LEFT
          await nut.mouse.releaseButton(btn)
          // for click emulation, if press+release same pos, nut will handle
          break
        }
        case 'mousemove': {
          if (ev.x !== undefined && ev.y !== undefined) await nut.mouse.setPosition({ x: ev.x, y: ev.y })
          break
        }
        case 'wheel': {
          // nut scroll?
          if (ev.deltaY) await nut.mouse.scrollDown(Math.abs(Math.round(ev.deltaY / 120)) || 1)
          // not perfect
          break
        }
        case 'delay': {
          // already handled
          break
        }
      }
    } catch (e) {
      console.warn('[player] execute failed', ev, e)
    }
  }

  isAvailable() { return nutAvailable }
}

export const player = new MacroPlayer()
