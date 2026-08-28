import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // macros
  listMacros: () => ipcRenderer.invoke('macros:list'),
  saveMacro: (m:any) => ipcRenderer.invoke('macros:save', m),
  createMacro: (p:any) => ipcRenderer.invoke('macros:create', p),
  deleteMacro: (id:string) => ipcRenderer.invoke('macros:delete', id),
  duplicateMacro: (id:string) => ipcRenderer.invoke('macros:duplicate', id),
  exportMacro: (id:string) => ipcRenderer.invoke('macros:export', id),
  importMacros: () => ipcRenderer.invoke('macros:import'),
  setShortcut: (id:string, shortcut:string | undefined) => ipcRenderer.invoke('macros:setShortcut', id, shortcut),
  playById: (id:string) => ipcRenderer.invoke('macros:playById', id),

  // recorder
  recorderStart: (opts:any) => ipcRenderer.invoke('recorder:start', opts),
  recorderStop: () => ipcRenderer.invoke('recorder:stop'),
  recorderStatus: () => ipcRenderer.invoke('recorder:status'),
  recorderInject: (ev:any) => ipcRenderer.invoke('recorder:inject', ev),

  // player
  playerPlay: (id:string, opts?:any) => ipcRenderer.invoke('player:play', id, opts),
  playerStop: () => ipcRenderer.invoke('player:stop'),
  playerStatus: () => ipcRenderer.invoke('player:status'),

  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (s:any) => ipcRenderer.invoke('settings:set', s),
  appVersion: () => ipcRenderer.invoke('app:version'),
  capabilities: () => ipcRenderer.invoke('app:capabilities'),
  registerHotkeys: () => ipcRenderer.invoke('settings:registerHotkeys'),
  windowHide: () => ipcRenderer.invoke('window:hide'),
  windowShow: () => ipcRenderer.invoke('window:show'),
  appQuit: () => ipcRenderer.invoke('app:quit'),

  // events
  onRecorderEvent: (cb:(e:any)=>void) => {
    const h = (_:any, data:any)=>cb(data)
    ipcRenderer.on('recorder:event', h)
    return ()=>ipcRenderer.removeListener('recorder:event', h)
  },
  onRecorderState: (cb:(r:boolean)=>void) => {
    const h = (_:any, r:boolean)=>cb(r)
    ipcRenderer.on('recorder:state', h)
    return ()=>ipcRenderer.removeListener('recorder:state', h)
  },
  onPlayerProgress: (cb:(d:any)=>void) => {
    const h = (_:any, d:any)=>cb(d)
    ipcRenderer.on('player:progress', h)
    return ()=>ipcRenderer.removeListener('player:progress', h)
  },
  onPlayerState: (cb:(d:any)=>void) => {
    const h = (_:any, d:any)=>cb(d)
    ipcRenderer.on('player:state', h)
    return ()=>ipcRenderer.removeListener('player:state', h)
  },
  onSettingsChanged: (cb:(s:any)=>void) => {
    const h = (_:any, s:any)=>cb(s)
    ipcRenderer.on('settings:changed', h)
    return ()=>ipcRenderer.removeListener('settings:changed', h)
  },

  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
}

contextBridge.exposeInMainWorld('api', api)
declare global { interface Window { api: typeof api } }
