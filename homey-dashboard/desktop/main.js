'use strict';
// Homey Dashboard voor Windows: een eigen venster naar het dashboard op de NAS.
const { app, BrowserWindow, Menu, shell, ipcMain, net, dialog, Notification } = require('electron');
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

// ---------- automatische volledige back-up naar deze pc ----------
const backupCfg = () => ({ enabled: true, keys: true, days: 7, keep: 8, folder: path.join(app.getPath('documents'), 'Homey Dashboard back-ups'), last: null, lastError: null, ...(cfg.backup || {}) });
let backupBusy = false;
function notify(title, body) { try { if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show(); } catch (e) { /* */ } }
function runBackup(manual) {
  if (backupBusy) return Promise.resolve({ ok: false, error: 'Er wordt al een back-up gemaakt' });
  const b = backupCfg(); backupBusy = true;
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(b.folder, `homey-dashboard-volledig-${day}${b.keys ? '' : '-zonder-sleutels'}.zip`);
  return new Promise(resolve => {
    const done = r => {
      backupBusy = false;
      cfg.backup = { ...backupCfg(), ...(r.ok ? { last: new Date().toISOString(), lastError: null, lastFile: file } : { lastError: r.error }) }; writeCfg(cfg);
      if (manual || !r.ok) notify(r.ok ? 'Back-up gemaakt' : 'Back-up mislukt', r.ok ? file : r.error);
      resolve(r);
    };
    try {
      fs.mkdirSync(b.folder, { recursive: true });
      const req = net.request(`${dashUrl()}/api/fullbackup?keys=${b.keys ? 1 : 0}`);
      const t = setTimeout(() => { req.abort(); done({ ok: false, error: 'De NAS reageerde niet binnen 5 minuten' }); }, 5 * 60 * 1000);
      req.on('response', res => {
        if (res.statusCode !== 200) { clearTimeout(t); res.resume(); return done({ ok: false, error: `Het dashboard op de NAS gaf een fout (${res.statusCode})` }); }
        const tmp = file + '.deel'; const out = fs.createWriteStream(tmp);
        res.on('data', d => out.write(d));
        res.on('end', () => out.end(() => {
          clearTimeout(t);
          try {
            fs.renameSync(tmp, file);
            // alleen de nieuwste back-ups bewaren
            const old = fs.readdirSync(b.folder).filter(n => /^homey-dashboard-volledig-.*\.zip$/.test(n)).sort().reverse().slice(b.keep);
            for (const n of old) fs.unlinkSync(path.join(b.folder, n));
            done({ ok: true, file });
          } catch (e) { done({ ok: false, error: e.message }); }
        }));
        res.on('error', e => { clearTimeout(t); out.destroy(); done({ ok: false, error: e.message }); });
      });
      req.on('error', e => { clearTimeout(t); done({ ok: false, error: 'Geen verbinding met de NAS (' + e.message + ')' }); });
      req.end();
    } catch (e) { done({ ok: false, error: e.message }); }
  });
}
function backupDue() {
  const b = backupCfg();
  if (!b.enabled || backupBusy) return;
  if (!b.last || Date.now() - new Date(b.last).getTime() > b.days * 86400e3) runBackup(false);
}

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
    parent: win || undefined, modal: !!win, width: 540, height: 640, resizable: false, minimizable: false, maximizable: false,
    title: 'Instellingen', icon: ICON, backgroundColor: '#151a23', autoHideMenuBar: true,
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
ipcMain.handle('backup:get', () => backupCfg());
ipcMain.handle('backup:set', (e, v) => { cfg.backup = { ...backupCfg(), ...v }; writeCfg(cfg); return backupCfg(); });
ipcMain.handle('backup:run', () => runBackup(true));
ipcMain.handle('backup:open', () => { const f = backupCfg().folder; fs.mkdirSync(f, { recursive: true }); shell.openPath(f); });
ipcMain.handle('backup:choose', async () => {
  const r = await dialog.showOpenDialog(settingsWin || win, { title: 'Map voor back-ups kiezen', defaultPath: backupCfg().folder, properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return backupCfg();
  cfg.backup = { ...backupCfg(), folder: r.filePaths[0] }; writeCfg(cfg); return backupCfg();
});
ipcMain.handle('app:settings', () => openSettings());

function buildMenu() {
  const run = js => () => { if (win) win.webContents.executeJavaScript(js).catch(() => {}); };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Dashboard', submenu: [
      { label: 'Bewerken (achterkant)', accelerator: 'CmdOrCtrl+E', click: run('window.D && D.editor && (D.editing ? D.editor.close() : D.editor.open())') },
      { label: 'Herladen', accelerator: 'F5', click: loadDashboard },
      { type: 'separator' },
      { label: 'Instellingen (adres en back-up)…', accelerator: 'CmdOrCtrl+,', click: openSettings },
      { label: 'Nu een volledige back-up maken', click: () => runBackup(true) },
      { label: 'Back-upmap openen', click: () => { const f = backupCfg().folder; fs.mkdirSync(f, { recursive: true }); shell.openPath(f); } },
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
  app.whenReady().then(() => {
    cfg = readCfg(); buildMenu(); createWindow();
    // wekelijkse back-up: 1 minuut na het starten controleren, daarna elke 3 uur
    setTimeout(backupDue, 60 * 1000); setInterval(backupDue, 3 * 3600 * 1000);
  });
  app.on('window-all-closed', () => app.quit());
}
