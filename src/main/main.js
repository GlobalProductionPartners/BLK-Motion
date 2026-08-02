const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ArtNet = require('../protocols/artnet');
const SACN = require('../protocols/sacn');
const OSC = require('../protocols/osc');
const UsbDmx = require('../protocols/usbdmx');
const license = require('./license');

let mainWindow = null;
let artnet = null;
let sacn = null;
let osc = null;
let usbdmx = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'BLK Motion',
    backgroundColor: '#0b0b0c',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Pop-out panels: the renderer opens child windows and adopts panel DOM
  // into them (same process). Allow them with app-consistent chrome.
  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      backgroundColor: '#0b0b0c',
      width: 560,
      height: 440,
      minWidth: 320,
      minHeight: 240,
      autoHideMenuBar: true,
      title: 'BLK Motion'
    }
  }));

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildAppMenu() {
  // A lean, cross-platform native menu. The app's own File/Edit/View/Window/Help
  // row is drawn inside the window (matching the real-software reference this
  // UI was built from) — this native menu exists so OS-level shortcuts
  // (Cmd/Ctrl+Q, copy/paste, minimize, zoom) behave correctly on both platforms,
  // not to duplicate the in-window row.
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Show…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow && mainWindow.webContents.send('menu:open-show')
        },
        {
          label: 'Save Show',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow && mainWindow.webContents.send('menu:save-show')
        },
        {
          label: 'Save Show As…',
          accelerator: 'Shift+CmdOrCtrl+S',
          click: () => mainWindow && mainWindow.webContents.send('menu:save-show-as')
        },
        { type: 'separator' },
        {
          label: 'Recover Autosave',
          click: () => {
            if (!mainWindow) return;
            try {
              const st = fs.statSync(autosavePath());
              const json = fs.readFileSync(autosavePath(), 'utf8');
              mainWindow.webContents.send('menu:recover-autosave', {
                json,
                savedAt: st.mtime.toLocaleString()
              });
            } catch (_err) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                message: 'No autosave found',
                detail: 'Autosaves are written every minute while a show has unsaved changes.'
              });
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow && mainWindow.webContents.send('menu:undo')
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          click: () => mainWindow && mainWindow.webContents.send('menu:redo')
        },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' }, { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'BLK Motion Documentation',
          click: () => {}
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Protocol lifecycles are restartable so the Settings page can rebind
// sockets (port / broadcast target / OSC listen port) without an app restart.
// Socket errors (EADDRINUSE etc.) must be handled here: an unhandled
// 'error' on an EventEmitter throws, which surfaces as a crash dialog.
function reportNetError(proto, err) {
  const message = (err && err.message) || String(err);
  console.error(`[${proto}]`, message);
  if (mainWindow) mainWindow.webContents.send('net:status', { proto, state: 'error', message });
}

function startArtnet(opts = {}) {
  if (artnet) artnet.close();
  artnet = new ArtNet(opts);
  artnet.on('error', (err) => reportNetError('Art-Net', err));
  artnet.on('poll-reply', (info) => {
    if (mainWindow) mainWindow.webContents.send('artnet:poll-reply', info);
  });
}

function startOsc(listenPort) {
  if (osc) osc.close();
  osc = new OSC(listenPort ? { listenPort } : {});
  osc.on('error', (err) => reportNetError('OSC', err));
  osc.on('message', (msg) => {
    if (mainWindow) mainWindow.webContents.send('osc:message', msg);
  });
  osc.start();
}

function startUsbDmx(devicePath, mode) {
  if (usbdmx) usbdmx.close();
  usbdmx = new UsbDmx({ path: devicePath, mode });
  usbdmx.on('status', (s) => {
    if (mainWindow) mainWindow.webContents.send('usbdmx:status', s);
  });
  usbdmx.open();
}

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();

  startArtnet();
  sacn = new SACN();
  sacn.onError = (err) => reportNetError('sACN', err);
  startOsc();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (artnet) artnet.close();
  if (sacn) sacn.close();
  if (osc) osc.close();
  if (usbdmx) usbdmx.close();
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- IPC: networking ---------- */

ipcMain.handle('artnet:send-dmx', (_event, { universe, data }) => {
  if (artnet) artnet.sendDmx(universe, Buffer.from(data));
  return { ok: true };
});

ipcMain.handle('artnet:poll', () => {
  if (artnet) artnet.poll();
  return { ok: true };
});

ipcMain.handle('sacn:send-dmx', (_event, { universe, data, sourceName }) => {
  sacn.sendDmx(universe, Buffer.from(data), sourceName || 'BLK Motion');
  return { ok: true };
});

ipcMain.handle('osc:send', (_event, { host, port, address, args }) => {
  if (osc) osc.send(host, port, address, args || []);
  return { ok: true };
});

/* ---------- IPC: settings (from the renderer's Settings page) ---------- */

ipcMain.handle('settings:apply-network', (_event, cfg = {}) => {
  try {
    const artnetPort = Math.min(65535, Math.max(1024, +cfg.artnetPort || 6454));
    const artnetBroadcast = typeof cfg.artnetBroadcast === 'string' && cfg.artnetBroadcast.trim()
      ? cfg.artnetBroadcast.trim() : '255.255.255.255';
    // Rebind only when the socket config actually changed — recreating the
    // Art-Net socket mid-show for a no-op would drop discovery state.
    if (!artnet || artnet.port !== artnetPort || artnet.broadcast !== artnetBroadcast) {
      startArtnet({ bindPort: artnetPort, broadcast: artnetBroadcast });
    }
    if (sacn && typeof cfg.sacnPriority === 'number') {
      sacn.priority = Math.min(200, Math.max(1, Math.round(cfg.sacnPriority)));
    }
    if (cfg.oscEnabled === false) {
      if (osc) { osc.close(); osc = null; }
    } else {
      const oscPort = Math.min(65535, Math.max(1024, +cfg.oscPort || 8000));
      if (!osc || osc.listenPort !== oscPort) startOsc(oscPort);
    }
    if (!cfg.usbEnabled || !cfg.usbDevice) {
      if (usbdmx) { usbdmx.close(); usbdmx = null; }
    } else {
      const usbMode = cfg.usbMode === 'open' ? 'open' : 'pro';
      if (!usbdmx || usbdmx.path !== cfg.usbDevice || usbdmx.mode !== usbMode) {
        startUsbDmx(cfg.usbDevice, usbMode);
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('usbdmx:list', async () => {
  try { return await UsbDmx.listPorts(); }
  catch (_err) { return []; } // serialport module unavailable
});

ipcMain.handle('usbdmx:send-dmx', (_event, { data }) => {
  if (usbdmx) usbdmx.sendDmx(Buffer.from(data));
  return { ok: true };
});

ipcMain.handle('net:interfaces', () => {
  const out = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach((name) => {
    (ifs[name] || []).forEach((a) => {
      if (a.family === 'IPv4' && !a.internal) {
        out.push({ name, address: a.address, netmask: a.netmask, mac: a.mac });
      }
    });
  });
  return out;
});

/* ---------- IPC: licensing (hardware-locked, offline after activation) ---------- */

ipcMain.handle('license:status', () => license.status());
ipcMain.handle('license:activate', (_event, { serverUrl, key }) => license.activate(serverUrl, key));
ipcMain.handle('license:deactivate', (_event, { serverUrl }) => license.deactivate(serverUrl));

/* ---------- IPC: show file save/load ---------- */

ipcMain.handle('show:save', async (_event, { defaultName, json }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Show',
    defaultPath: defaultName || 'untitled.blkshow',
    filters: [{ name: 'BLK Motion Show', extensions: ['blkshow', 'json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  fs.writeFileSync(result.filePath, json, 'utf8');
  return { ok: true, filePath: result.filePath };
});

// Silent save to a known path — used by plain Save once a file is open
ipcMain.handle('show:save-to', (_event, { filePath, json }) => {
  try {
    fs.writeFileSync(filePath, json, 'utf8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// Crash-safety net: the renderer streams the whole show here once a minute
// while dirty. Kept OUTSIDE the user's documents — recovery is explicit.
function autosavePath() {
  return path.join(app.getPath('userData'), 'autosave.blkshow');
}

ipcMain.handle('show:autosave', (_event, { json }) => {
  try {
    fs.writeFileSync(autosavePath(), json, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle('show:load', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Show',
    filters: [{ name: 'BLK Motion Show', extensions: ['blkshow', 'json'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  const json = fs.readFileSync(result.filePaths[0], 'utf8');
  return { ok: true, filePath: result.filePaths[0], json };
});
