'use strict';
const path = require('path');
const fs = require('fs');
// Eerst de bewaking van "Bijwerken": start een nieuwe versie niet goed, dan komt de oude terug.
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA, { recursive: true });
const { Updater } = require('./updater');
const updater = new Updater(DATA, () => require('./backup').fullBackup({ dataDir: DATA, keys: true }));
updater.guard();
const express = require('express');
// versie: verandert na Bijwerken; schermen herladen dan vanzelf
const VERSION = (updater.state().installedAt || '') + '|' + (updater.state().sha || 'lokaal');
const { HomeyAdapter } = require('./homey');
const { DemoAdapter } = require('./demo');
const { defaultConfig } = require('./default-config');
const { AppBridge } = require('./appbridge');
const icons = require('./icons');
const { Assistant, friendlyError } = require('./assistant');
const { FlowService } = require('./flows');
const { Health } = require('./health');
const { AutoCheck } = require('./autocheck');
const { Cameras } = require('./cameras');
const { nl } = require('./nl');
const { fullBackup } = require('./backup');

const PORT = Number(process.env.PORT || 8095);
const BG_DIR = path.join(DATA, 'backgrounds');
const BK_DIR = path.join(DATA, 'backups');
const CFG = path.join(DATA, 'config.json');
for (const d of [DATA, BG_DIR, BK_DIR]) fs.mkdirSync(d, { recursive: true });

const isSet = v => v && !/XX|plak-hier/i.test(v);
const homey = (isSet(process.env.HOMEY_ADDRESS) && isSet(process.env.HOMEY_TOKEN))
  ? new HomeyAdapter({ address: process.env.HOMEY_ADDRESS, token: process.env.HOMEY_TOKEN })
  : new DemoAdapter();

// Claude-assistent (alleen actief met ANTHROPIC_API_KEY; ASSISTANT_FAKE = testbestand zonder echte API)
const flows = new FlowService(homey, DATA);
const { Auth } = require('./auth');
const auth = new Auth({ dataDir: DATA, flows, readConfig: () => readConfig() });
const guard = auth.guard;
const health = new Health(homey, DATA);
const cameras = new Cameras({ homey, dataDir: DATA });
health.cameras = cameras;
let autocheck = null; // na readConfig
const assistant = new Assistant({ icons, flows, client: process.env.ASSISTANT_FAKE ? require(path.resolve(process.env.ASSISTANT_FAKE)) : null });

// ---------- configuratie ----------
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch (e) { return null; }
}
function writeConfig(cfg) {
  cfg.savedAt = new Date().toISOString();
  const tmp = CFG + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CFG);
  autoBackup();
}
if (!readConfig()) writeConfig(defaultConfig());
autocheck = new AutoCheck({ health, homey, dataDir: DATA, readConfig });

// back-up van de indeling vlak vóór een grote actie (terugzetten, importeren, alles terugzetten); laatste 10 bewaard
function preBackup(reason) {
  try {
    if (!fs.existsSync(CFG)) return;
    const st = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.copyFileSync(CFG, path.join(BK_DIR, `voor-${reason}-${st}.json`));
    const list = fs.readdirSync(BK_DIR).filter(n => n.startsWith('voor-')).sort((x, y) => x.slice(-24).localeCompare(y.slice(-24)));
    while (list.length > 10) fs.unlinkSync(path.join(BK_DIR, list.shift()));
  } catch (e) { console.error('[back-up] vooraf mislukt:', e.message); }
}
function autoBackup() {
  const day = new Date().toISOString().slice(0, 10);
  const f = path.join(BK_DIR, `auto-${day}.json`);
  if (!fs.existsSync(f) && fs.existsSync(CFG)) fs.copyFileSync(CFG, f);
  const autos = fs.readdirSync(BK_DIR).filter(n => n.startsWith('auto-')).sort();
  while (autos.length > 14) fs.unlinkSync(path.join(BK_DIR, autos.shift()));
}
setInterval(autoBackup, 60 * 60 * 1000);

// ---------- live updates (Server-Sent Events) ----------
const clients = new Set();
function broadcast(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
homey.on('update', u => broadcast('update', u));
homey.on('library', () => broadcast('library', { at: Date.now() }));
homey.on('status', s => broadcast('status', s));
homey.on('link', l => broadcast('link', l));
// Controle direct bijwerken als er in Homey een flow, app of apparaat verandert (gebundeld, hooguit eens per 10 s)
let hTimer = null, hLast = 0;
const healthPush = () => {
  clearTimeout(hTimer);
  hTimer = setTimeout(async () => {
    if (Date.now() - hLast < 10000) return healthPush();
    hLast = Date.now();
    try { broadcast('health', await health.run(true)); } catch (e) { /* volgende keer */ }
  }, 3000);
};
homey.on('changed', healthPush);

// ---------- brug naar widgets van je eigen Homey-apps ----------
const AW_DIR = process.env.APPWIDGETS_DIR || path.join(__dirname, '..', 'appwidgets');
const bridge = new AppBridge(homey, AW_DIR);
bridge.on('event', e => broadcast('appevent', e));
const { Extra } = require('./extra');
const extra = new Extra({ homey, dataDir: DATA, broadcast });
const { Reserve } = require('./reserve');
const reserve = new Reserve({ dataDir: DATA, broadcast }); reserve.start();
health.reserve = reserve;
const { Fully } = require('./fully');
const fully = new Fully(extra);
health.fully = fully;
const { AppScan } = require('./appscan');
const appscan = new AppScan(homey, AW_DIR);

// ---------- app ----------
const app = express();
app.use(express.json({ limit: '25mb' }));
// gekleurde pictogrammen: lang bewaren in de browser (ze veranderen niet)
app.use('/iconsets', express.static(path.join(__dirname, '..', 'public', 'iconsets'), { maxAge: '30d', immutable: true }));
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/bg', express.static(BG_DIR, { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const wrap = fn => async (req, res) => {
  try { res.json((await fn(req, res)) ?? { ok: true }); } catch (err) {
    console.error(err); res.status(500).json({ error: nl(err) });
  }
};

app.get('/api/status', wrap(() => homey.status));
app.get('/api/ping', wrap(() => ({ t: Date.now(), homey: homey.link || null })));
app.get('/api/library', wrap(() => homey.library() || {}));
app.post('/api/library/refresh', wrap(async () => { if (homey.refresh) await homey.refresh(); return homey.library(); }));
app.get('/api/location', wrap(() => homey.location()));
app.get('/api/notifications', wrap(() => homey.notifications()));
app.get('/api/insights', wrap(req => homey.insightEntries(req.query.uri, req.query.id, req.query.resolution || 'last24Hours')));

// pictogrammen (Material Design Icons)
app.get('/api/icons', wrap(req => icons.search(req.query.q, req.query.cat, Number(req.query.offset) || 0, Math.min(400, Number(req.query.limit) || 200), req.query.set || 'mdi')));
app.get('/api/icons/pair/:set/:name', wrap(req => icons.pair(req.params.set, req.params.name) || {}));
app.get('/api/icons/:set/:name', wrap(req => icons.get(req.params.name, req.params.set) || {}));
app.get('/api/icons/:name', wrap(req => icons.get(req.params.name) || {}));

app.post('/api/device/:id/:cap', wrap(req => homey.setCapability(req.params.id, req.params.cap, req.body.value)));
app.post('/api/flow/:type/:id', wrap(req => homey.triggerFlow(req.params.id, req.params.type)));
app.post('/api/mood/:id', wrap(req => homey.setMood(req.params.id)));
app.post('/api/variable/:id', wrap(req => homey.setVariable(req.params.id, req.body.value)));
app.post('/api/alarm/:id', wrap(req => homey.setAlarm(req.params.id, !!req.body.enabled)));

app.get('/api/assistant', wrap(() => ({ ...assistant.status(), flows: flows.supported(), pinSet: flows.pinSet() })));
// flows in Homey (alleen via een voorstel van de assistent; aanpassen van bestaande flows vraagt de pincode)
const fail = (res, err) => { console.error('[fout]', err.message || err); res.status(400).json({ error: nl(err) }); };
app.get('/api/flows/pin', wrap(() => ({ set: flows.pinSet() })));
app.post('/api/pin/check', (req, res) => { try { const b = req.body || {}; flows.checkPin(b.pin); res.json({ ok: true, token: auth.issue(!!b.trust, b.name) }); } catch (e) { fail(res, e); } });
app.get('/api/auth/state', wrap(req => auth.state(req)));
app.post('/api/auth/logout', wrap(req => { auth.drop(auth.tokenOf(req)); return { ok: true }; }));
app.post('/api/auth/revoke', guard, wrap(() => { auth.revokeAll(); return { ok: true }; }));
app.post('/api/flows/pin', (req, res) => { try { flows.setPin(req.body.old, req.body.pin); res.json({ ok: true }); } catch (e) { fail(res, e); } });
// controle van apparaten en flows
app.get('/api/health', async (req, res) => {
  try { res.json(await health.run(req.query.force === '1')); }
  catch (e) { console.error('[controle]', e.message || e); res.status(500).json({ error: 'Controleren lukt niet. ' + nl(e) }); }
});
app.post('/api/health/ignore', async (req, res) => { try { const b = req.body || {}; if (!b.key) throw new Error('Geen melding opgegeven'); health.ignore(String(b.key), b); const r = await health.run(true); broadcast('health', r); res.json(r); } catch (e) { fail(res, e); } });
app.post('/api/health/unignore', async (req, res) => { try { const b = req.body || {}; health.unignore(String(b.key || '')); const r = await health.run(true); broadcast('health', r); res.json(r); } catch (e) { fail(res, e); } });
app.get('/api/health/usage/:id', async (req, res) => { try { res.json(await health.usage(req.params.id, readConfig())); } catch (e) { fail(res, e); } });
app.post('/api/health/delete-device/:id', async (req, res) => { try { res.json(await health.deleteDevice(req.params.id, flows, req.body.pin)); } catch (e) { fail(res, e); } });
// camera's (wachtwoorden blijven op de NAS)
app.get('/api/cameras', wrap(() => cameras.list()));
app.post('/api/cameras', guard, (req, res) => { try { res.json(cameras.saveCam(req.body || {})); } catch (e) { fail(res, e); } });
app.delete('/api/cameras/:id', guard, (req, res) => { try { res.json(cameras.removeCam(req.params.id)); } catch (e) { fail(res, e); } });
app.post('/api/cameras/ss', guard, async (req, res) => { try { res.json(await cameras.saveSS(req.body || {})); } catch (e) { fail(res, e); } });
app.get('/api/cameras/ss', async (req, res) => { try { res.json(await cameras.ssCameras()); } catch (e) { fail(res, e); } });
app.get('/api/camera/:id/snapshot', async (req, res) => {
  try { const s = await cameras.snapshot(req.params.id); res.set({ 'Content-Type': s.type, 'Cache-Control': 'no-store' }); res.end(s.data); }
  catch (e) { res.status(502).json({ error: nl(e) }); }
});
app.get('/api/camera/:id/video', async (req, res) => { try { await cameras.reolinkVideo(req.params.id, req.query.q, req, res); } catch (e) { if (!res.headersSent) res.status(502).json({ error: nl(e) }); } });
app.get('/api/camera/:id/ptz', async (req, res) => { try { res.json(await cameras.ptzInfo(req.params.id)); } catch (e) { fail(res, e); } });
app.post('/api/camera/:id/ptz', async (req, res) => { try { res.json(await cameras.ptz(req.params.id, req.body || {})); } catch (e) { fail(res, e); } });
app.post('/api/camera/:id/track', async (req, res) => { try { res.json(await cameras.track(req.params.id, !!(req.body || {}).on)); } catch (e) { fail(res, e); } });
app.get('/api/camera/:id/live', async (req, res) => { try { await cameras.live(req.params.id, req, res); } catch (e) { if (!res.headersSent) res.status(502).json({ error: nl(e) }); } });

// automatische controle met melding
app.get('/api/autocheck', wrap(() => ({ settings: autocheck.settings(), last: autocheck.last })));
app.post('/api/autocheck/run', async (req, res) => { try { res.json(await autocheck.tick(true)); } catch (e) { fail(res, e); } });
app.post('/api/autocheck/test', guard, async (req, res) => { try { await autocheck.notify('Testmelding van Homey Dashboard: meldingen van de Controle komen goed aan.'); res.json({ ok: true }); } catch (e) { fail(res, e); } });
app.get('/api/autocheck/users', async (req, res) => { try { res.json(await autocheck.users()); } catch (e) { fail(res, e); } });
app.post('/api/health/restart-app/:id', guard, async (req, res) => { try { res.json(await health.restartApp(req.params.id)); } catch (e) { fail(res, e); } });
app.post('/api/flows/needpin', wrap(req => ({ pin: flows.needsPin(req.body.acties) })));
app.post('/api/flows/apply', guard, async (req, res) => { try { res.json(await flows.apply(req.body.acties, req.body.pin)); } catch (e) { fail(res, e); } });
app.post('/api/flows/undo/:id', guard, async (req, res) => { try { res.json(await flows.undo(req.params.id)); } catch (e) { fail(res, e); } });
// De assistent werkt op de achtergrond: POST start een taak, de browser vraagt de voortgang op.
// Zo maakt een wegvallende verbinding niets uit (het antwoord blijft 30 minuten bewaard).
const jobs = new Map();
app.post('/api/assistant', guard, wrap(req => {
  const b = req.body || {};
  const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const job = { status: 'busy', progress: 'Claude denkt na…', started: Date.now() };
  jobs.set(id, job);
  for (const [k, j] of jobs) if (Date.now() - j.started > 30 * 60 * 1000) jobs.delete(k);
  const q = String(((b.history || []).slice(-1)[0] || {}).text || '').slice(0, 80).replace(/\s+/g, ' ');
  console.log(`[assistent] ${id} gestart (${b.model || 'standaard'}): "${q}"`);
  assistant.ask({ history: b.history, cfg: readConfig() || { tabs: [] }, lib: homey.library() || {}, currentTabId: b.tabId, model: b.model, onProgress: t => { job.progress = t; } })
    .then(r => { job.status = 'done'; job.result = r; console.log(`[assistent] ${id} klaar in ${Math.round((Date.now() - job.started) / 1000)} s, ≈ $${((r.usage && r.usage.usd) || 0).toFixed(3)}${r.plan ? ', met voorstel' : ''}`); })
    .catch(err => { job.status = 'error'; job.error = friendlyError(err); console.error(`[assistent] ${id} fout:`, err.message || err); });
  return { job: id };
}));
app.get('/api/assistant/job/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Deze vraag is niet meer bekend (is het dashboard op de NAS opnieuw gestart?). Probeer het opnieuw.' });
  res.json({ status: j.status, progress: j.progress, seconds: Math.round((Date.now() - j.started) / 1000), result: j.result, error: j.error });
});

// ---------- reservemap (installatiebestand + back-ups elke 24 uur) ----------
app.get('/api/reserve', wrap(() => reserve.status()));
app.post('/api/reserve/run', guard, wrap(() => reserve.check(true)));

// ---------- tablet (Fully Kiosk) ----------
app.get('/api/tablet', wrap(() => fully.info()));
app.post('/api/tablet/conf', guard, wrap(req => { const b = req.body || {}; fully.setConf({ host: b.host, pass: b.pass }); return fully.info(); }));
app.get('/api/tablet/status', wrap(() => fully.status()));
app.get('/api/tablet/check', wrap(() => fully.check()));
app.post('/api/tablet/apply', guard, wrap(() => fully.apply()));
app.post('/api/tablet/do', guard, wrap(req => fully.action(String((req.body || {}).cmd || ''))));
app.get('/api/tablet/screenshot', guard, async (req, res) => { try { const s = await fully.screenshot(); res.set('Content-Type', s.type).set('Cache-Control', 'no-store').send(s.buf); } catch (e) { res.status(502).json({ error: e.message }); } });

// ---------- extra tegels: gegevens van buiten en van NAS/Homey ----------
const xr = fn => async (req, res) => { try { res.json(await fn(req)); } catch (e) { res.status(502).json({ error: String(e.message || e) }); } };
app.get('/api/x/rain', xr(r => extra.rain(r.query.lat, r.query.lon)));
app.get('/api/x/weather', xr(r => extra.weather(r.query.lat, r.query.lon)));
app.get('/api/x/air', xr(r => extra.air(r.query.lat, r.query.lon)));
app.get('/api/x/price', xr(() => extra.price()));
app.post('/api/x/waste', xr(r => extra.waste(r.body || {})));
app.post('/api/x/ical', xr(r => extra.ical((r.body || {}).urls)));
app.get('/api/x/ov/search', xr(r => extra.ovSearch(r.query.q)));
app.get('/api/x/ov/departures', xr(r => extra.ovDepartures(r.query.code)));
app.post('/api/x/travel', xr(r => extra.travel(r.body || {})));
app.get('/api/x/nas', xr(() => extra.nas()));
app.post('/api/x/nas/setup', guard, xr(r => { extra.setNas(r.body || {}); return extra.hasSecrets(); }));
app.post('/api/x/key', guard, xr(r => { const b = r.body || {}; if (!['tomtom', 'ns'].includes(b.name)) throw new Error('Onbekende sleutel'); extra.setKey(b.name, b.value); return extra.hasSecrets(); }));
app.get('/api/x/secrets', xr(() => extra.hasSecrets()));
app.get('/api/x/homey', xr(() => extra.homeyInfo()));
app.get('/api/x/notes/:id', xr(r => extra.notes(String(r.params.id))));
app.post('/api/x/notes/:id', xr(r => extra.setNotes(String(r.params.id), (r.body || {}).list)));
// P2000 Twente (bron alarmeringen.nl; de NAS haalt op en bewaart 24 uur)
const { P2000 } = require('./p2000');
const p2000 = new P2000({ dataDir: DATA, fetchText: async u => {
  const r = await fetch(u, { headers: { 'User-Agent': 'HomeyDashboard/1.0 (eigen dashboard; NAS)' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${new URL(u).hostname} gaf ${r.status}`);
  return r.text();
} });
app.get('/api/x/p2000', xr(() => p2000.list()));
// NS- en busreisinformatie (NS-sleutel staat alleen op de NAS)
const { Reis } = require('./ov2');
const reis = new Reis({ secrets: () => extra.secrets(), dataDir: DATA });
app.get('/api/x/ns/stations', xr(r => reis.nsStations(r.query.q)));
app.get('/api/x/ns/departures', xr(r => reis.nsDepartures(r.query.station)));
app.get('/api/x/ns/disruptions', xr(r => reis.nsDisruptions(r.query.station)));
app.get('/api/x/ns/test', xr(r => reis.nsTest(r.query.station)));
app.get('/api/x/ns/reserve', xr(() => reis.reserveInfo()));
app.get('/api/x/bus', xr(r => reis.bus({ code: r.query.code, lines: r.query.lines, dest: r.query.dest })));
app.post('/api/appwidgets/scan', guard, async (req, res) => { try { res.json(await appscan.scan()); } catch (e) { fail(res, e); } });
app.post('/api/appwidgets/install', guard, async (req, res) => { try { const b = req.body || {}; res.json(await appscan.install(String(b.appId || ''), String(b.widgetId || ''))); } catch (e) { fail(res, e); } });
app.get('/api/appwidgets', wrap(() => ({ widgets: bridge.list(), status: bridge.status(), demo: homey.status.mode === 'demo' })));
app.post('/api/aw/call', async (req, res) => {
  const { app: appId, widget, method, path: p, body } = req.body || {};
  try { const result = await bridge.call(appId, widget, method, p, body); res.json({ result: result === undefined ? null : result }); }
  catch (err) { res.status(502).json({ error: String(err.message || err) }); }
});
// Widgetbestanden, met het vervangende Homey-object erin
app.use('/aw/:app/:widget', (req, res, next) => {
  const dir = path.join(AW_DIR, path.basename(req.params.app), path.basename(req.params.widget));
  const rel = decodeURIComponent(req.path === '/' ? '/index.html' : req.path);
  const file = path.join(dir, rel);
  if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return next();
  if (!file.endsWith('.html')) return res.sendFile(file);
  let html = fs.readFileSync(file, 'utf8');
  const w = bridge.list().find(x => x.appId === req.params.app && x.widgetId === req.params.widget);
  const inject = `<script>window.__AW_DEFAULTS=${JSON.stringify((w && w.defaults) || {}).replace(/</g, '\\u003c')};</script><script src="/js/aw-shim.js"></script>`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + inject) : inject + html;
  res.type('html').send(html);
});

app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: status\ndata: ${JSON.stringify(homey.status)}\n\n`);
  if (homey.link) res.write(`event: link\ndata: ${JSON.stringify(homey.link)}\n\n`);
  res.write(`event: hello\ndata: ${JSON.stringify({ version: VERSION })}\n\n`);
  clients.add(res);
  // hartslag: laat de browser weten dat de NAS er nog is (verbindingsbalk onderaan)
  const ping = setInterval(() => res.write(`event: hb\ndata: ${Date.now()}\n\n`), 10000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

app.get('/api/config', wrap(() => readConfig()));
app.get('/api/config/stamp', wrap(() => ({ savedAt: (readConfig() || {}).savedAt || null })));
// Opslaan alleen als het apparaat van de nieuwste versie uitging; anders 409 (zo overschrijft een tablet met een oude versie nooit wat op de laptop is gewijzigd)
app.put('/api/config', guard, (req, res, next) => {
  const cfg = req.body; const cur = readConfig();
  if (cfg && cfg.savedAt && cur && cur.savedAt && cfg.savedAt !== cur.savedAt) return res.status(409).json({ error: 'Intussen op een ander apparaat gewijzigd', conflict: true, savedAt: cur.savedAt });
  next();
}, wrap(req => {
  const cfg = req.body;
  if (!cfg || !Array.isArray(cfg.tabs)) throw new Error('Ongeldige configuratie');
  if (req.query.voor === 'importeren') preBackup('importeren');
  if (cfg.tabs.filter(t => !t.sub).length > 10) throw new Error('Maximaal 10 tabbladen');
  if (cfg.tabs.filter(t => t.sub).length > 20) throw new Error("Maximaal 20 subpagina's");
  writeConfig(cfg);
  broadcast('config', { savedAt: cfg.savedAt, by: req.get('X-Client-Id') || null });
  return { ok: true, savedAt: cfg.savedAt };
}));

// achtergronden
app.get('/api/backgrounds', wrap(() => fs.readdirSync(BG_DIR).filter(n => /\.(jpe?g|png|webp)$/i.test(n)).sort().map(n => '/bg/' + n)));
app.post('/api/backgrounds', guard, wrap(req => {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(req.body.dataUrl || '');
  if (!m) throw new Error('Geen geldige afbeelding');
  const base = String(req.body.name || 'achtergrond').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'achtergrond';
  const file = `${base}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(BG_DIR, file), Buffer.from(m[2], 'base64'));
  return { url: '/bg/' + file };
}));
app.delete('/api/backgrounds/:file', guard, wrap(req => {
  const f = path.join(BG_DIR, path.basename(req.params.file));
  if (fs.existsSync(f)) fs.unlinkSync(f);
}));

// back-ups
// volledige back-up (map + data + docker-compose.yml + projectgegevens) voor een nieuwe NAS
app.get('/api/fullbackup', guard, (req, res) => {
  try {
    const keys = req.query.keys !== '0';
    const buf = fullBackup({ dataDir: DATA, keys });
    const day = new Date().toISOString().slice(0, 10);
    console.log(`[back-up] volledige back-up ${keys ? 'met' : 'zonder'} sleutels, ${(buf.length / 1048576).toFixed(1)} MB`);
    res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="homey-dashboard-volledig-${day}${keys ? '' : '-zonder-sleutels'}.zip"`, 'Content-Length': buf.length });
    res.end(buf);
  } catch (e) { console.error('[back-up]', e); res.status(500).json({ error: 'Back-up maken lukt niet. ' + nl(e) }); }
});
// bijwerken met één knop
app.get('/api/update/check', async (req, res) => { try { res.json(await updater.check(req.query.force === '1')); } catch (e) { res.json({ error: 'Kan niet kijken of er een nieuwe versie is. ' + nl(e) }); } });
app.get('/api/update/status', wrap(() => updater.status));
app.post('/api/update/run', guard, (req, res) => { try { res.json(updater.start()); } catch (e) { fail(res, e); } });
app.post('/api/update/rollback', guard, (req, res) => { try { res.json(updater.requestRollback()); } catch (e) { fail(res, e); } });
app.get('/api/backups', wrap(() => fs.readdirSync(BK_DIR).filter(n => n.endsWith('.json')).sort().reverse()
  .map(n => ({ name: n, size: fs.statSync(path.join(BK_DIR, n)).size, date: fs.statSync(path.join(BK_DIR, n)).mtime }))));
app.post('/api/backups', guard, wrap(() => {
  const name = `handmatig-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  fs.copyFileSync(CFG, path.join(BK_DIR, name)); return { name };
}));
app.get('/api/backups/:name', guard, (req, res) => res.download(path.join(BK_DIR, path.basename(req.params.name))));
app.post('/api/restore/:name', guard, wrap(req => {
  const f = path.join(BK_DIR, path.basename(req.params.name));
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  preBackup('terugzetten');
  writeConfig(cfg); broadcast('config', { savedAt: cfg.savedAt }); return cfg;
}));
app.delete('/api/backups/:name', guard, wrap(req => fs.unlinkSync(path.join(BK_DIR, path.basename(req.params.name)))));
app.post('/api/reset', guard, wrap(() => { preBackup('alles-terugzetten'); const c = defaultConfig(); writeConfig(c); broadcast('config', { savedAt: c.savedAt }); return c; }));

app.listen(PORT, () => {
  console.log(`Homey Dashboard draait op poort ${PORT} (${homey.status.mode === 'demo' ? 'DEMO-modus' : 'Homey ' + process.env.HOMEY_ADDRESS})`);
  homey.start();
});
