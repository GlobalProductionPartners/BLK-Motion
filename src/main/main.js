const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ArtNet = require('../protocols/artnet');
const SACN = require('../protocols/sacn');
const OSC = require('../protocols/osc');
const UsbDmx = require('../protocols/usbdmx');
const SacnIn = require('../protocols/sacn-in');
const license = require('./license');
const { readMvr } = require('./mvr');

let mainWindow = null;
let artnet = null;
let sacn = null;
let osc = null;
let usbdmx = null;
let sacnIn = null;
let deskCfg = { proto: 'off', universes: [] }; // console-input config, from renderer

/*
 * LICENCE GATE — the main process is the authority, not the UI.
 *
 * Every socket lives here, so this is the only place a block can actually
 * hold: an overlay in the renderer would still leave Art-Net streaming
 * behind it. Until the app is licensed no protocol is even constructed, and
 * every send/scan IPC refuses. Demo mode is the same lockdown with the UI
 * unlocked — it can never transmit or receive a single packet.
 */
let ioAllowed = false;   // true only when properly licensed
let demoMode = false;    // user chose to explore with all I/O dead
let netCfg = null;       // last network config, applied once I/O is permitted

function licenceEnforced() {
  // Enforced everywhere, including `npm start` — the gate is the product's
  // real behaviour and should not be something you only meet after packaging.
  // `npm run start:dev` (BLK_LICENSE_DEV=1) bypasses it while working on the
  // app itself; it has no effect in a packaged build.
  if (!app.isPackaged && process.env.BLK_LICENSE_DEV === '1') return false;
  return true;
}

function startProtocols() {
  startArtnet(netCfg ? { bindPort: netCfg.artnetPort, broadcast: netCfg.artnetBroadcast } : {});
  if (!sacn) {
    sacn = new SACN();
    sacn.onError = (err) => reportNetError('sACN', err);
  }
  startOsc(netCfg && netCfg.oscPort);
  if (netCfg) applyNetworkConfig(netCfg);
}

function stopProtocols() {
  if (artnet) { artnet.close(); artnet = null; }
  if (sacn) { sacn.close(); sacn = null; }
  if (osc) { osc.close(); osc = null; }
  if (usbdmx) { usbdmx.close(); usbdmx = null; }
  if (sacnIn) { sacnIn.close(); sacnIn = null; }
}

function evaluateLicence() {
  const st = license.status();
  const allowed = st.licensed || !licenceEnforced();
  if (allowed && !ioAllowed) { ioAllowed = true; demoMode = false; startProtocols(); }
  else if (!allowed && ioAllowed) { ioAllowed = false; stopProtocols(); }
  return st;
}
const BLOCKED = () => ({ ok: false, blocked: true, demo: demoMode });

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
          label: 'Import MVR…',
          click: () => mainWindow && mainWindow.webContents.send('menu:import-mvr')
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

function forwardDeskDmx(pkt) {
  if (mainWindow) mainWindow.webContents.send('desk:dmx', { universe: pkt.universe, data: Buffer.from(pkt.data) });
}

function startArtnet(opts = {}) {
  if (artnet) artnet.close();
  artnet = new ArtNet(opts);
  artnet.on('error', (err) => reportNetError('Art-Net', err));
  artnet.on('poll-reply', (info) => {
    if (mainWindow) mainWindow.webContents.send('artnet:poll-reply', info);
  });
  artnet.on('dmx-in', forwardDeskDmx);
  // a Settings-page socket rebind must keep listening for the console
  if (deskCfg.proto === 'artnet') artnet.setInputUniverses(deskCfg.universes);
}

function applyDeskConfig(cfg) {
  deskCfg = {
    proto: ['artnet', 'sacn'].includes(cfg && cfg.proto) ? cfg.proto : 'off',
    universes: (Array.isArray(cfg && cfg.universes) ? cfg.universes : []).slice(0, 16).map((u) => Math.max(0, Math.min(63999, u | 0)))
  };
  if (artnet) artnet.setInputUniverses(deskCfg.proto === 'artnet' ? deskCfg.universes : []);
  if (deskCfg.proto === 'sacn') {
    if (!sacnIn) {
      sacnIn = new SacnIn();
      sacnIn.on('error', (err) => reportNetError('sACN input', err));
      sacnIn.on('dmx', forwardDeskDmx);
    }
    sacnIn.ownCid = sacn ? sacn.cid : null;
    sacnIn.setUniverses(deskCfg.universes);
  } else if (sacnIn) {
    sacnIn.close();
    sacnIn = null;
  }
  return { ok: true, proto: deskCfg.proto, universes: deskCfg.universes };
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

  // nothing opens a socket until the licence says so
  evaluateLicence();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (artnet) artnet.close();
  if (sacn) sacn.close();
  if (osc) osc.close();
  if (usbdmx) usbdmx.close();
  if (sacnIn) sacnIn.close();
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- IPC: networking ---------- */

ipcMain.handle('artnet:send-dmx', (_event, { universe, data }) => {
  if (!ioAllowed) return BLOCKED();
  if (artnet) artnet.sendDmx(universe, Buffer.from(data));
  return { ok: true };
});

ipcMain.handle('artnet:poll', () => {
  if (!ioAllowed) return BLOCKED();
  if (artnet) artnet.poll();
  return { ok: true };
});

ipcMain.handle('sacn:send-dmx', (_event, { universe, data, sourceName }) => {
  if (!ioAllowed || !sacn) return BLOCKED();
  sacn.sendDmx(universe, Buffer.from(data), sourceName || 'BLK Motion');
  return { ok: true };
});

ipcMain.handle('osc:send', (_event, { host, port, address, args }) => {
  if (!ioAllowed) return BLOCKED();
  if (osc) osc.send(host, port, address, args || []);
  return { ok: true };
});

/* ---------- IPC: settings (from the renderer's Settings page) ---------- */

ipcMain.handle('settings:apply-network', (_event, cfg = {}) => {
  netCfg = cfg;                       // remembered for when a licence arrives
  if (!ioAllowed) return BLOCKED();
  return applyNetworkConfig(cfg);
});

function applyNetworkConfig(cfg = {}) {
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
}

ipcMain.handle('usbdmx:list', async () => {
  if (!ioAllowed) return []; // no device enumeration in demo either
  try { return await UsbDmx.listPorts(); }
  catch (_err) { return []; } // serialport module unavailable
});

ipcMain.handle('usbdmx:send-dmx', (_event, { data }) => {
  if (!ioAllowed) return BLOCKED();
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

/* ---------- IPC: MVR import ---------- */

ipcMain.handle('mvr:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import MVR',
    filters: [{ name: 'My Virtual Rig', extensions: ['mvr'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  try {
    const xml = readMvr(result.filePaths[0]);
    return { ok: true, filePath: result.filePaths[0], xml };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

/* ---------- IPC: console (desk) input ---------- */

ipcMain.handle('desk:config', (_event, cfg) => {
  if (!ioAllowed) return BLOCKED(); // console input is receiving — also blocked
  return applyDeskConfig(cfg);
});

/* ---------- IPC: licensing (hardware-locked, offline after activation) ---------- */

function licenceMode() {
  const st = license.status();
  st.enforced = licenceEnforced();
  st.demo = demoMode;
  st.ioAllowed = ioAllowed;
  st.blocked = st.enforced && !st.licensed && !demoMode;
  return st;
}
ipcMain.handle('license:status', () => licenceMode());
ipcMain.handle('license:activate', async (_event, { serverUrl, key }) => {
  const res = await license.activate(serverUrl, key);
  if (res.ok) { evaluateLicence(); res.status = licenceMode(); } // sockets open now
  return res;
});
ipcMain.handle('license:deactivate', async (_event, { serverUrl }) => {
  const res = await license.deactivate(serverUrl);
  if (res.ok) { evaluateLicence(); res.status = licenceMode(); } // and close again
  return res;
});
ipcMain.handle('license:enter-demo', () => {
  demoMode = true;
  ioAllowed = false;
  stopProtocols();   // demo transmits and receives nothing, ever
  return licenceMode();
});

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

ipcMain.handle('show:autosave', async (_event, { json }) => {
  try {
    // async: shows with embedded bitmaps run to several MB — never block
    // the main process (and with it every IPC) on disk
    await fs.promises.writeFile(autosavePath(), json, 'utf8');
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
