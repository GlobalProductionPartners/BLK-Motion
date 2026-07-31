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
    load: () => ipcRenderer.invoke('show:load'),
    onMenuSave: (cb) => ipcRenderer.on('menu:save-show', () => cb()),
    onMenuOpen: (cb) => ipcRenderer.on('menu:open-show', () => cb())
  },
  platform: process.platform
});
