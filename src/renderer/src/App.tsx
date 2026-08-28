import { useEffect, useMemo, useState, useRef } from 'react'
import type { Macro, MacroEvent } from './types'

const api = () => (window as any).api

function uid(){ return Math.random().toString(36).slice(2,9) }

// Helper to build accelerator from KeyboardEvent
function eventToAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  let key = e.key
  // Normalize
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else {
    // map special
    const map: Record<string,string> = {
      'ArrowUp':'Up','ArrowDown':'Down','ArrowLeft':'Left','ArrowRight':'Right',
      'Escape':'Escape','Enter':'Enter','Tab':'Tab','Backspace':'Backspace','Delete':'Delete','Insert':'Insert',
      'Home':'Home','End':'End','PageUp':'PageUp','PageDown':'PageDown'
    }
    if (map[key]) key = map[key]
    else if (/^F\d+$/i.test(key)) key = key.toUpperCase()
    else if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta' || key === 'OS') return null
  }
  if (!mods.length && !/^F\d+$/.test(key) && key.length !== 1) {
    // require modifier unless it's F-key
    // allow single letter without modifier? we allow but warn
  }
  // avoid bare single letter without modifier? allow but we still create
  if (mods.length) return [...mods, key].join('+')
  return key
}

function ShortcutInput({ value, onSave, disabled }: { value?: string, onSave: (s: string|undefined)=>void, disabled?: boolean }){
  const [recording, setRecording] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(()=> setDraft(value||''), [value])

  useEffect(()=>{
    if(!recording) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const acc = eventToAccelerator(e)
      if(!acc) return
      setDraft(acc)
    }
    window.addEventListener('keydown', onKey as any, true)
    return ()=> window.removeEventListener('keydown', onKey as any, true)
  }, [recording])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      <div style={{display:'flex',gap:6}}>
        <input
          ref={ref}
          value={draft}
          placeholder="e.g. Ctrl+Shift+F9"
          onChange={e=> setDraft(e.target.value)}
          onFocus={()=> setRecording(true)}
          onBlur={()=> setRecording(false)}
          onKeyDown={e=> {
            // capture inside input
            if(recording){
              e.preventDefault()
              const acc = eventToAccelerator(e as any)
              if(acc) setDraft(acc)
            }
          }}
          style={{flex:1, background: recording ? '#1a1f2e' : 'var(--panel2)', border:`1px solid ${recording ? 'var(--accent)' : 'var(--border)'}`, color:'var(--text)', padding:'7px 9px', borderRadius:8, outline:'none', fontSize:12}}
          disabled={disabled}
        />
        <button className="btn small" disabled={disabled} onClick={async()=>{
          setError('')
          const toSave = draft.trim() || undefined
          try{
            const res = await api().setShortcut((window as any)._selectedId, toSave)
            if(res?.ok === false) setError(res.error || 'Failed')
            else { onSave(toSave); setRecording(false) }
          }catch(err:any){ setError(err.message || String(err)) }
        }}>{recording ? 'Save' : 'Set'}</button>
        <button className="btn small ghost" disabled={disabled || !value} onClick={async()=>{
          setError('')
          try{ await api().setShortcut((window as any)._selectedId, undefined); onSave(undefined); setDraft('') }catch(err:any){ setError(err.message)}
        }}>Clear</button>
      </div>
      {recording && <span className="muted" style={{fontSize:11}}>Press keys now (e.g. Ctrl+Shift+Q or F6). Click Set to confirm.</span>}
      {error && <span style={{color:'#ff7675',fontSize:11}}>{error}</span>}
      {value && <span className="muted" style={{fontSize:11}}>Active: <span className="kbd">{value}</span> — works globally even when app is in background/tray.</span>}
    </div>
  )
}

export default function App(){
  const [macros, setMacros] = useState<Macro[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [playProgress, setPlayProgress] = useState<{idx:number,repeat:number} | null>(null)
  const [caps, setCaps] = useState<any>(null)
  const [settings, setSettings] = useState<any>({ runInBackground:true, minimizeToTray:true, launchAtStartup:false, hotkeys:{record:'F9',play:'F10',stop:'F11'}})
  const [speed, setSpeed] = useState(1)
  const [repeatCount, setRepeatCount] = useState(1)
  const [repeatInterval, setRepeatInterval] = useState(500)
  const [captureMouseMove, setCaptureMouseMove] = useState(false)
  const [captureKeyboard, setCaptureKeyboard] = useState(true)
  const [captureMouseClick, setCaptureMouseClick] = useState(true)
  const [filterType, setFilterType] = useState<string>('all')

  const selected = useMemo(()=> macros.find(m=>m.id===selectedId) || null, [macros, selectedId])
  // expose for ShortcutInput hack
  useEffect(()=>{ (window as any)._selectedId = selectedId }, [selectedId])

  // load
  useEffect(()=>{
    (async()=>{
      const list = await api().listMacros()
      setMacros(list)
      if(list[0]) setSelectedId(list[0].id)
      setCaps(await api().capabilities())
      const s = await api().settingsGet()
      setSettings(s)
    })()
    const off1 = api().onRecorderEvent((ev: MacroEvent)=>{
      setMacros(prev=> prev.map(m=> m.id===selectedId ? {...m, events:[...m.events, ev]} : m))
    })
    const off2 = api().onRecorderState((r:boolean)=> setRecording(r))
    const off3 = api().onPlayerProgress((d:any)=> setPlayProgress(d))
    const off4 = api().onPlayerState((d:any)=> { setPlaying(d.playing); if(!d.playing) setPlayProgress(null) })
    const off5 = api().onSettingsChanged((s:any)=> setSettings(s))
    return ()=>{ off1?.(); off2?.(); off3?.(); off4?.(); off5?.() }
  }, [selectedId])

  // when selecting, sync controls
  useEffect(()=>{
    if(selected){
      setSpeed(selected.speed)
      setRepeatCount(selected.repeatCount)
      setRepeatInterval(selected.repeatInterval)
      setCaptureMouseMove(selected.captureMouseMove)
      setCaptureKeyboard(selected.captureKeyboard)
      setCaptureMouseClick(selected.captureMouseClick)
    }
  }, [selectedId])

  const filtered = macros.filter(m=> !search || m.name.toLowerCase().includes(search.toLowerCase()))
  const filteredEvents = useMemo(()=>{
    if(!selected) return []
    if(filterType==='all') return selected.events
    return selected.events.filter(e=> e.type===filterType)
  }, [selected, filterType])

  async function createMacro(){
    const m = await api().createMacro({ name: `Macro ${macros.length+1}` })
    setMacros(prev=> [...prev, m])
    setSelectedId(m.id)
  }
  async function duplicate(id:string){
    const m = await api().duplicateMacro(id)
    setMacros(prev=> [...prev, m])
  }
  async function del(id:string){
    if(!confirm('Delete this macro?')) return
    await api().deleteMacro(id)
    setMacros(prev=> prev.filter(m=>m.id!==id))
    if(selectedId===id) setSelectedId(macros.find(m=>m.id!==id)?.id || null)
  }
  async function saveSelected(patch: Partial<Macro>){
    if(!selected) return
    const updated = { ...selected, ...patch, updatedAt: Date.now() }
    await api().saveMacro(updated)
    setMacros(prev=> prev.map(m=> m.id===updated.id? updated: m))
  }

  async function toggleRecord(){
    if(recording){
      await api().recorderStop()
      if(selected){
        const cur = macros.find(m=>m.id===selectedId)
        if(cur) await saveSelected({ events: cur.events })
      }
    } else {
      let id = selectedId
      if(!id){
        const m = await api().createMacro({ name: `Recording ${new Date().toLocaleTimeString()}` })
        setMacros(prev=> [...prev, m]); id=m.id; setSelectedId(m.id)
        await new Promise(r=> setTimeout(r, 50))
      }
      await api().recorderStart({ captureMouseMove, captureKeyboard, captureMouseClick })
    }
  }

  async function play(){
    if(!selected) return
    await saveSelected({ speed, repeatCount, repeatInterval, captureMouseMove, captureKeyboard, captureMouseClick })
    const payload = { ...selected, speed, repeatCount, repeatInterval, events: selected.events }
    await api().playerPlay(selected.id, { macro: payload, speed, repeatOverride: repeatCount })
  }
  async function stop(){ await api().playerStop(); if(recording) await api().recorderStop() }

  function updateEventDelay(idx:number, delay:number){
    if(!selected) return
    const realIdx = selected.events.indexOf(filteredEvents[idx])
    const actual = realIdx>=0? realIdx: idx
    const evs = [...selected.events]
    evs[actual] = { ...evs[actual], delay: Math.max(0, delay) }
    saveSelected({ events: evs })
  }
  function deleteEvent(idx:number){
    if(!selected) return
    const realIdx = selected.events.indexOf(filteredEvents[idx])
    const actual = realIdx>=0? realIdx: idx
    const evs = selected.events.filter((_,i)=> i!==actual)
    saveSelected({ events: evs })
  }
  function addDelayEvent(){
    if(!selected) return
    const ev: MacroEvent = { id: uid(), type:'delay', delay: 500 }
    saveSelected({ events: [...selected.events, ev] })
  }
  function clearEvents(){ if(!selected) return; if(!confirm('Clear all events?')) return; saveSelected({ events: [] }) }

  const totalDuration = useMemo(()=> selected ? selected.events.reduce((a,b)=>a+b.delay,0) : 0, [selected])
  const [dragIdx, setDragIdx] = useState<number|null>(null)

  async function toggleSetting(key:string, val:boolean){
    const next = { ...settings, [key]: val }
    setSettings(next)
    await api().settingsSet(next)
  }

  return (
    <>
      <div className="titlebar">
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <div style={{width:14,height:14,borderRadius:4,background:'linear-gradient(135deg,#6c5ce7,#00cec9)'}}/>
          <strong style={{fontSize:13}}>Universal Macro</strong>
          <span className="badge">v1.0 • {caps?.platform || ''}</span>
          {settings.runInBackground && <span className="badge" style={{background:'#153a2a',color:'#7bf0c0',borderColor:'#1d5a3a'}}>● Background</span>}
          {!caps?.recorderAvailable && <span className="badge" style={{background:'#3a1f1f',color:'#ff9f9f'}}>Hook fallback</span>}
        </div>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <button className="btn small ghost" style={{fontSize:11}} onClick={()=> api().windowHide()} title="Hide to tray (runs in background)">Hide to tray</button>
          <div className="win">
            <button onClick={()=> api().windowMinimize()}>─</button>
            <button onClick={()=> api().windowMaximize()}>□</button>
            <button onClick={()=> api().windowClose()}>×</button>
          </div>
        </div>
      </div>

      <div className="app">
        <div className="sidebar">
          <div className="sidebar-head">
            <h1>Macros</h1>
            <span className="badge">{macros.length}</span>
            <div style={{flex:1}}/>
            <button className="btn small primary" onClick={createMacro}>+ New</button>
          </div>
          <div style={{padding:'10px 12px',display:'flex',gap:8,borderBottom:'1px solid var(--border)'}}>
            <input className="search" placeholder="Search macros…" value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn small" onClick={()=> api().importMacros().then((list:Macro[])=>{ if(list.length) setMacros(prev=> [...prev, ...list])})}>Import</button>
          </div>
          <div className="macro-list">
            {filtered.length===0 && <div className="empty">No macros yet.<br/>Click <b>+ New</b> or <b>Record</b> to start.</div>}
            {filtered.map(m=>(
              <div key={m.id} className={`macro-item ${m.id===selectedId?'active':''}`} onClick={()=> setSelectedId(m.id)}>
                <div className="top">
                  <span className="name">{m.name}</span>
                  <span className="badge">{m.events.length} steps</span>
                </div>
                {m.shortcut && <div><span className="kbd" style={{background:'#2a2f45',color:'#a5b4ff'}}>⌨ {m.shortcut}</span> {m.runInBackground && <span className="badge" style={{background:'#123a2a',color:'#7bf0c0',fontSize:10}}>background</span>}</div>}
                <div className="meta">
                  <span>⏱ {(m.events.reduce((a,b)=>a+b.delay,0)/1000).toFixed(1)}s</span>
                  <span>×{m.repeatCount===0?'∞':m.repeatCount}</span>
                  <span>{m.speed}×</span>
                  <span>{new Date(m.updatedAt).toLocaleDateString()}</span>
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <button className="btn small" onClick={(e)=>{e.stopPropagation(); api().playById(m.id)}} title={m.shortcut ? `Shortcut: ${m.shortcut}` : 'Play'}>▶</button>
                  <button className="btn small" onClick={(e)=>{e.stopPropagation(); duplicate(m.id)}}>Duplicate</button>
                  <button className="btn small" onClick={(e)=>{e.stopPropagation(); api().exportMacro(m.id)}}>Export</button>
                  <button className="btn small danger" onClick={(e)=>{e.stopPropagation(); del(m.id)}}>Delete</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{padding:12,borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:8}}>
            <div className="muted" style={{fontSize:12, display:'flex', flexDirection:'column', gap:6}}>
              <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                <span>Run in background</span>
                <span className={`switch ${settings.runInBackground?'on':''}`} onClick={()=> toggleSetting('runInBackground', !settings.runInBackground)} />
              </label>
              <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                <span>Minimize to tray on close</span>
                <span className={`switch ${settings.minimizeToTray?'on':''}`} onClick={()=> toggleSetting('minimizeToTray', !settings.minimizeToTray)} />
              </label>
              <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                <span>Launch at startup</span>
                <span className={`switch ${settings.launchAtStartup?'on':''}`} onClick={()=> toggleSetting('launchAtStartup', !settings.launchAtStartup)} />
              </label>
              <span className="muted" style={{fontSize:11}}>When ON, closing hides to tray, global shortcuts keep working. Use tray icon → Show / Quit.</span>
            </div>
            <div className="muted">Hotkeys: <span className="kbd">F9</span> Rec • <span className="kbd">F10</span> Play • <span className="kbd">F11</span> Stop <span className="muted">+ per-macro shortcuts</span></div>
          </div>
        </div>

        <div className="main">
          <div className="toolbar">
            <div className="group">
              <button className={`btn ${recording?'danger': 'primary'}`} onClick={toggleRecord} disabled={playing}>
                {recording ? <><span className="record-dot"/> Stop Recording</> : '● Record'}
              </button>
              <button className="btn primary" onClick={play} disabled={!selected || selected.events.length===0 || recording || playing}>▶ Play</button>
              <button className="btn" onClick={stop} disabled={!playing && !recording}>■ Stop</button>
              {playing && <span className="badge" style={{background:'#0f2e26',color:'#00e6b0',borderColor:'#1a5a44'}}>Playing {playProgress?`#${playProgress.repeat}`:''} • step {playProgress? playProgress.idx+1:0}/{selected?.events.length||0}</span>}
              {recording && <span className="badge" style={{background:'#3a1f1f',color:'#ff9f9f'}}>REC {selected?.events.length||0} events</span>}
            </div>

            <div className="group">
              <label className="muted">Speed</label>
              <select value={speed} onChange={e=>{ const v=parseFloat(e.target.value); setSpeed(v); if(selected) saveSelected({speed:v}) }}>
                <option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option><option value={3}>3×</option><option value={5}>5×</option>
              </select>
              <label className="muted">Repeat</label>
              <input type="number" min={0} max={999} value={repeatCount} onChange={e=>{ const v=parseInt(e.target.value)||0; setRepeatCount(v); if(selected) saveSelected({repeatCount:v})}} style={{width:70}}/>
              <span className="muted" title="0 = infinite">0=∞</span>
              <label className="muted">Interval ms</label>
              <input type="number" min={0} step={100} value={repeatInterval} onChange={e=>{ const v=parseInt(e.target.value)||0; setRepeatInterval(v); if(selected) saveSelected({repeatInterval:v})}} style={{width:90}}/>
            </div>

            <div className="group">
              <label className="muted" style={{display:'flex',gap:6,alignItems:'center'}}><input type="checkbox" checked={captureKeyboard} onChange={e=>{setCaptureKeyboard(e.target.checked); if(selected) saveSelected({captureKeyboard:e.target.checked})}}/> Keys</label>
              <label className="muted" style={{display:'flex',gap:6,alignItems:'center'}}><input type="checkbox" checked={captureMouseClick} onChange={e=>{setCaptureMouseClick(e.target.checked); if(selected) saveSelected({captureMouseClick:e.target.checked})}}/> Clicks</label>
              <label className="muted" style={{display:'flex',gap:6,alignItems:'center'}}><input type="checkbox" checked={captureMouseMove} onChange={e=>{setCaptureMouseMove(e.target.checked); if(selected) saveSelected({captureMouseMove:e.target.checked})}}/> Move</label>
            </div>
          </div>

          {!selected ? (
            <div className="empty" style={{flex:1,display:'grid',placeItems:'center'}}>
              <div>
                <h2 style={{margin:'0 0 8px'}}>No macro selected</h2>
                <p className="muted">Create a new macro and hit <b>Record</b> to capture keyboard & mouse.<br/>Assign a <b>shortcut</b> to play it anytime, even in background.</p>
                <button className="btn primary" onClick={createMacro}>Create Macro</button>
              </div>
            </div>
          ) : (
            <div className="content">
              <div className="editor">
                <div className="timeline-header">
                  <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                    <input value={selected.name} onChange={e=> saveSelected({name:e.target.value})} style={{background:'var(--panel2)',border:'1px solid var(--border)',color:'var(--text)',padding:'7px 10px',borderRadius:8,minWidth:220}}/>
                    <span className="badge">{selected.events.length} steps • {(totalDuration/1000).toFixed(2)}s</span>
                    <select value={filterType} onChange={e=> setFilterType(e.target.value)} style={{background:'var(--panel2)',border:'1px solid var(--border)',color:'var(--text)',padding:'6px 8px',borderRadius:8}}>
                      <option value="all">All events</option><option value="keydown">KeyDown</option><option value="keyup">KeyUp</option><option value="mousedown">MouseDown</option><option value="mouseup">MouseUp</option><option value="mousemove">Move</option><option value="wheel">Wheel</option>
                    </select>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn small" onClick={addDelayEvent}>+ Delay</button>
                    <button className="btn small" onClick={clearEvents}>Clear</button>
                  </div>
                </div>
                <div className="timeline">
                  {filteredEvents.length===0 && <div className="empty">No events yet. Press <b>Record</b> and perform your actions — they appear here live.<br/><span className="muted">Tip: edit the <b>Delay (ms)</b> column to fine-tune timing.</span></div>}
                  {filteredEvents.map((ev, idx)=>{
                    const isPlaying = playing && playProgress?.idx===selected.events.indexOf(ev)
                    return (
                      <div key={ev.id} className={`event-row ${isPlaying?'playing':''}`} draggable onDragStart={()=> setDragIdx(idx)} onDragOver={e=> e.preventDefault()} onDrop={()=>{
                        if(dragIdx===null||dragIdx===idx) return
                        const realFrom = selected.events.indexOf(filteredEvents[dragIdx])
                        const realTo = selected.events.indexOf(filteredEvents[idx])
                        const arr=[...selected.events]; const [moved]=arr.splice(realFrom,1); arr.splice(realTo,0,moved)
                        saveSelected({events:arr}); setDragIdx(null)
                      }}>
                        <span className="idx">#{String(idx+1).padStart(3,'0')}</span>
                        <span className={`tag ${ev.type}`}>{ev.type}</span>
                        <span className="muted" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {ev.type.includes('key') ? `keycode ${ev.keycode} ${ev.key||''}` : ''}
                          {ev.type.includes('mouse') ? `btn ${ev.button??1} @ ${ev.x},${ev.y}` : ''}
                          {ev.type==='mousemove' ? `@ ${ev.x},${ev.y}` : ''}
                          {ev.type==='wheel' ? `Δ ${ev.deltaY}` : ''}
                          {ev.type==='delay' ? '— pause —' : ''}
                        </span>
                        <input className="delay-input" type="number" min={0} step={10} value={ev.delay} onChange={e=> updateEventDelay(idx, parseInt(e.target.value)||0)} title="Delay after previous event (ms)"/>
                        <span className="muted" style={{fontVariantNumeric:'tabular-nums'}}>{(ev.delay/1000).toFixed(3)}s</span>
                        <button className="icon-btn" onClick={()=> deleteEvent(idx)} title="Delete">×</button>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="right-panel">
                <div className="panel-card" style={{borderColor: selected.shortcut ? 'var(--accent)' : undefined}}>
                  <h3>⚡ Shortcut & Background</h3>
                  <div className="muted" style={{fontSize:11}}>Assign a global hotkey to play this macro anytime — even when app is hidden to tray.</div>
                  <ShortcutInput value={selected.shortcut} onSave={(s)=>{
                    setMacros(prev=> prev.map(m=> m.id===selected.id ? {...m, shortcut:s}: m))
                  }} />
                  <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',marginTop:6}}>
                    <span style={{fontSize:12}}>Run in background <span className="muted">(no focus needed)</span></span>
                    <span className={`switch ${selected.runInBackground?'on':''}`} onClick={()=> saveSelected({runInBackground: !selected.runInBackground})} />
                  </label>
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn small primary" onClick={()=> selected.shortcut && api().playById(selected.id)} disabled={!selected.shortcut}>▶ Test shortcut</button>
                    <span className="muted" style={{fontSize:11, alignSelf:'center'}}>{selected.runInBackground ? 'Will play even if window hidden' : 'Plays normally'}</span>
                  </div>
                </div>
                <div className="panel-card">
                  <h3>Playback</h3>
                  <div className="row"><label>Speed multiplier</label><span className="badge">{speed}×</span></div>
                  <input className="range" type="range" min={0.25} max={5} step={0.25} value={speed} onChange={e=>{ const v=parseFloat(e.target.value); setSpeed(v); saveSelected({speed:v})}}/>
                  <div className="row"><label>Repeat count <span className="muted">(0 = infinite)</span></label><input type="number" min={0} value={repeatCount} onChange={e=>{ const v=parseInt(e.target.value)||0; setRepeatCount(v); saveSelected({repeatCount:v})}} style={{width:80,background:'var(--panel)',border:'1px solid var(--border)',color:'var(--text)',padding:'6px 8px',borderRadius:8}}/></div>
                  <div className="row"><label>Interval between repeats (ms)</label><input type="number" min={0} step={100} value={repeatInterval} onChange={e=>{ const v=parseInt(e.target.value)||0; setRepeatInterval(v); saveSelected({repeatInterval:v})}} style={{width:90,background:'var(--panel)',border:'1px solid var(--border)',color:'var(--text)',padding:'6px 8px',borderRadius:8}}/></div>
                  <div className="muted">Total duration: {(totalDuration/1000).toFixed(2)}s • Estimated with repeats: {repeatCount===0 ? '∞' : ((totalDuration*repeatCount + repeatInterval*(repeatCount-1))/1000).toFixed(2)+'s'}</div>
                  <button className="btn primary" onClick={play} disabled={!selected.events.length || playing}>▶ Play now</button>
                  <button className="btn" onClick={stop} disabled={!playing}>■ Stop</button>
                </div>
                <div className="panel-card">
                  <h3>Background mode</h3>
                  <div className="muted" style={{fontSize:12, display:'flex', flexDirection:'column', gap:8}}>
                    <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                      <span>Run in background (tray)</span>
                      <span className={`switch ${settings.runInBackground?'on':''}`} onClick={()=> toggleSetting('runInBackground', !settings.runInBackground)} />
                    </label>
                    <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                      <span>Minimize to tray on close</span>
                      <span className={`switch ${settings.minimizeToTray?'on':''}`} onClick={()=> toggleSetting('minimizeToTray', !settings.minimizeToTray)} />
                    </label>
                    <label style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between'}}>
                      <span>Launch at startup</span>
                      <span className={`switch ${settings.launchAtStartup?'on':''}`} onClick={()=> toggleSetting('launchAtStartup', !settings.launchAtStartup)} />
                    </label>
                    <div style={{display:'flex',gap:6}}>
                      <button className="btn small" onClick={()=> api().windowHide()}>Hide to tray</button>
                      <button className="btn small ghost" onClick={()=> api().windowShow()}>Show</button>
                    </div>
                    <span style={{fontSize:11}}>All <b>per-macro shortcuts</b> remain global while in tray. Right-click tray → run any macro or Quit.</span>
                  </div>
                </div>
                <div className="panel-card">
                  <h3>Capabilities</h3>
                  <div className="muted" style={{fontSize:12,display:'flex',flexDirection:'column',gap:4}}>
                    <div>Recorder (uiohook-napi): {caps?.recorderAvailable ? '✅ Available' : '⚠️ Fallback'}</div>
                    <div>Player (nut.js): {caps?.playerAvailable ? '✅ Available' : '⚠️ Dry-run'}</div>
                    <div>Platform: {caps?.platform}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
