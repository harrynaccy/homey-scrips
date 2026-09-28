'use strict';
// Homey Dashboard voor Windows: een eigen venster naar het dashboard op de NAS.
const { app, BrowserWindow, Menu, shell, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_URL = 'http://192.168.178.79:8095';
const ICON = path.join(__dirname, 'build', 'icon.png');
const CFG_FILE = () => path.join(app.getPath('userData'), 'instellingen.json');

function readCfg() { try { return JSON.parse(fs.readFileSync(CFG_FILE(), 'utf8')); } catch (e) { return {}; } }
function writeCfg(c) { try { fs.mkdirSync(path.dirname(CFG_FILE()), { recursive: true }); fs.writeFileSync(CFG_FILE(), JSON.stringify(c, null, 2)); } catch (e) { /* */ } }
let cfg = {};
const dashUrl = () => (cfg.url || DEFAULT_URL).replace(/\/+$/, '');

let win = null, settingsWin = null;

function loadDashboard() {
  if (!win) return;
  win.loadURL(dashUrl()).catch(() => { /* afgehandeld in did-fail-load */ });
}
function showOffline(err) {
  const q = new URLSearchParams({ url: dashUrl(), err: String(err || '') }).toString();
  win.loadFile(path.join(__dirname, 'pages', 'offline.html'), { search: q });
}

function createWindow() {
  const b = cfg.bounds || { width: 1280, height: 820 };
  win = new BrowserWindow({
    ...b, minWidth: 640, minHeight: 420, title: 'Homey Dashboard', icon: ICON, backgroundColor: '#07080c',
    autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
  });
  if (cfg.maximized) win.maximize();
  if (cfg.fullscreen) win.setFullScreen(true);
  win.once('ready-to-show', () => win.show());

  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3 && !url.startsWith('file:')) showOffline(desc);
  });
  // links naar andere sites openen in je gewone browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(dashUrl())) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  const saveState = () => {
    if (!win) return;
    cfg.maximized = win.isMaximized(); cfg.fullscreen = win.isFullScreen();
    if (!cfg.maximized && !cfg.fullscreen) cfg.bounds = win.getBounds();
    writeCfg(cfg);
  };
  win.on('close', saveState);
  win.on('closed', () => { win = null; });
  loadDashboard();
}

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    parent: win || undefined, modal: !!win, width: 520, height: 360, resizable: false, minimizable: false, maximizable: false,
    title: 'Adres van het dashboard', icon: ICON, backgroundColor: '#151a23', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'pages', 'instellingen.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// adres testen: vraagt /api/status op bij het dashboard
function testUrl(url) {
  return new Promise(resolve => {
    try {
      const req = net.request((url || '').replace(/\/+$/, '') + '/api/status');
      const t = setTimeout(() => { req.abort(); resolve({ ok: false, error: 'Geen antwoord binnen 5 seconden' }); }, 5000);
      req.on('response', res => { let body = ''; res.on('data', d => { body += d; }); res.on('end', () => { clearTimeout(t); try { const j = JSON.parse(body); resolve({ ok: res.statusCode === 200, mode: j.mode, connected: j.connected }); } catch (e) { resolve({ ok: false, error: 'Dit is geen Homey Dashboard' }); } }); });
      req.on('error', e => { clearTimeout(t); resolve({ ok: false, error: e.message }); });
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

ipcMain.handle('cfg:get', () => ({ url: dashUrl(), defaultUrl: DEFAULT_URL }));
ipcMain.handle('cfg:test', (e, url) => testUrl(url));
ipcMain.handle('cfg:save', (e, url) => { cfg.url = String(url || '').trim() || DEFAULT_URL; writeCfg(cfg); if (settingsWin) settingsWin.close(); loadDashboard(); return true; });
ipcMain.handle('app:retry', () => loadDashboard());
ipcMain.handle('app:settings', () => openSettings());

function buildMenu() {
  const run = js => () => { if (win) win.webContents.executeJavaScript(js).catch(() => {}); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Dashboard', submenu: [
      { label: 'Bewerken (achterkant)', accelerator: 'CmdOrCtrl+E', click: run('window.D && D.editor && (D.editing ? D.editor.close() : D.editor.open())') },
      { label: 'Herladen', accelerator: 'F5', click: loadDashboard },
      { type: 'separator' },
      { label: 'Adres wijzigen…', accelerator: 'CmdOrCtrl+,', click: openSettings },
      { label: 'Openen in browser', click: () => shell.openExternal(dashUrl()) },
      { type: 'separator' },
      { label: 'Afsluiten', accelerator: 'Alt+F4', role: 'quit' },
    ] },
    { label: 'Beeld', submenu: [
      { label: 'Volledig scherm', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
      { label: 'Groter', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
      { label: 'Kleiner', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: 'Normale grootte', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Ontwikkelaarshulpmiddelen', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' },
    ] },
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.setAppUserModelId('nl.ramon.homeydashboard');
  app.whenReady().then(() => { cfg = readCfg(); buildMenu(); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}
