const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit surface exposed to the renderer — no direct Node/IPC
// access, matching Electron's recommended contextIsolation + preload pattern.
contextBridge.exposeInMainWorld('blk', {
  artnet: {
    sendDmx: (universe, data) => ipcRenderer.invoke('artnet:send-dmx', { universe, data }),
    poll: () => ipcRenderer.invoke('artnet:poll'),
    onPollReply: (cb) => ipcRenderer.on('artnet:poll-reply', (_e, info) => cb(info))
  },
  sacn: {
    sendDmx: (universe, data, sourceName) => ipcRenderer.invoke('sacn:send-dmx', { universe, data, sourceName })
  },
  osc: {
    send: (host, port, address, args) => ipcRenderer.invoke('osc:send', { host, port, address, args }),
    onMessage: (cb) => ipcRenderer.on('osc:message', (_e, msg) => cb(msg))
  },
  usbdmx: {
    list: () => ipcRenderer.invoke('usbdmx:list'),
    sendDmx: (data) => ipcRenderer.invoke('usbdmx:send-dmx', { data }),
    onStatus: (cb) => ipcRenderer.on('usbdmx:status', (_e, s) => cb(s))
  },
  settings: {
    applyNetwork: (cfg) => ipcRenderer.invoke('settings:apply-network', cfg),
    interfaces: () => ipcRenderer.invoke('net:interfaces'),
    onNetStatus: (cb) => ipcRenderer.on('net:status', (_e, s) => cb(s))
  },
  show: {
    save: (defaultName, json) => ipcRenderer.invoke('show:save', { defaultName, json }),
    saveTo: (filePath, json) => ipcRenderer.invoke('show:save-to', { filePath, json }),
    load: () => ipcRenderer.invoke('show:load'),
    autosave: (json) => ipcRenderer.invoke('show:autosave', { json }),
    onMenuRecover: (cb) => ipcRenderer.on('menu:recover-autosave', (_e, payload) => cb(payload)),
    onMenuSave: (cb) => ipcRenderer.on('menu:save-show', () => cb()),
    onMenuUndo: (cb) => ipcRenderer.on('menu:undo', () => cb()),
    onMenuRedo: (cb) => ipcRenderer.on('menu:redo', () => cb()),
    onMenuSaveAs: (cb) => ipcRenderer.on('menu:save-show-as', () => cb()),
    onMenuOpen: (cb) => ipcRenderer.on('menu:open-show', () => cb())
  },
  mvr: {
    open: () => ipcRenderer.invoke('mvr:open'),
    onMenuImport: (cb) => ipcRenderer.on('menu:import-mvr', () => cb())
  },
  desk: {
    config: (cfg) => ipcRenderer.invoke('desk:config', cfg),
    onDmx: (cb) => ipcRenderer.on('desk:dmx', (_e, pkt) => cb(pkt))
  },
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    activate: (serverUrl, key) => ipcRenderer.invoke('license:activate', { serverUrl, key }),
    deactivate: (serverUrl) => ipcRenderer.invoke('license:deactivate', { serverUrl })
  },
  platform: process.platform
});
