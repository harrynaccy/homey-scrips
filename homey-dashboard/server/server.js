'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const { HomeyAdapter } = require('./homey');
const { DemoAdapter } = require('./demo');
const { defaultConfig } = require('./default-config');
const { AppBridge } = require('./appbridge');
const icons = require('./icons');
const { Assistant, friendlyError } = require('./assistant');
const { FlowService } = require('./flows');
const { Health } = require('./health');

const PORT = Number(process.env.PORT || 8095);
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
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
const health = new Health(homey);
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

// ---------- brug naar widgets van je eigen Homey-apps ----------
const AW_DIR = process.env.APPWIDGETS_DIR || path.join(__dirname, '..', 'appwidgets');
const bridge = new AppBridge(homey, AW_DIR);
bridge.on('event', e => broadcast('appevent', e));

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
    console.error(err); res.status(500).json({ error: String(err.message || err) });
  }
};

app.get('/api/status', wrap(() => homey.status));
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
const fail = (res, err) => { console.error('[flows]', err.message || err); res.status(400).json({ error: String(err.message || err) }); };
app.get('/api/flows/pin', wrap(() => ({ set: flows.pinSet() })));
app.post('/api/flows/pin', (req, res) => { try { flows.setPin(req.body.old, req.body.pin); res.json({ ok: true }); } catch (e) { fail(res, e); } });
// controle van apparaten en flows
app.get('/api/health', async (req, res) => {
  try { res.json(await health.run(req.query.force === '1')); }
  catch (e) { console.error('[controle]', e.message || e); res.status(500).json({ error: 'Controleren lukt niet: ' + (e.message || e) + '. Heeft de Homey-sleutel het recht om flows en apps te bekijken?' }); }
});
app.post('/api/health/restart-app/:id', async (req, res) => { try { res.json(await health.restartApp(req.params.id)); } catch (e) { fail(res, e); } });
app.post('/api/flows/needpin', wrap(req => ({ pin: flows.needsPin(req.body.acties) })));
app.post('/api/flows/apply', async (req, res) => { try { res.json(await flows.apply(req.body.acties, req.body.pin)); } catch (e) { fail(res, e); } });
app.post('/api/flows/undo/:id', async (req, res) => { try { res.json(await flows.undo(req.params.id)); } catch (e) { fail(res, e); } });
// De assistent werkt op de achtergrond: POST start een taak, de browser vraagt de voortgang op.
// Zo maakt een wegvallende verbinding niets uit (het antwoord blijft 30 minuten bewaard).
const jobs = new Map();
app.post('/api/assistant', wrap(req => {
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
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

app.get('/api/config', wrap(() => readConfig()));
app.put('/api/config', wrap(req => {
  const cfg = req.body;
  if (!cfg || !Array.isArray(cfg.tabs)) throw new Error('Ongeldige configuratie');
  if (cfg.tabs.length > 10) throw new Error('Maximaal 10 tabbladen');
  writeConfig(cfg);
  broadcast('config', { savedAt: cfg.savedAt, by: req.get('X-Client-Id') || null });
  return { ok: true, savedAt: cfg.savedAt };
}));

// achtergronden
app.get('/api/backgrounds', wrap(() => fs.readdirSync(BG_DIR).filter(n => /\.(jpe?g|png|webp)$/i.test(n)).sort().map(n => '/bg/' + n)));
app.post('/api/backgrounds', wrap(req => {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(req.body.dataUrl || '');
  if (!m) throw new Error('Geen geldige afbeelding');
  const base = String(req.body.name || 'achtergrond').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40) || 'achtergrond';
  const file = `${base}-${Date.now().toString(36)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(BG_DIR, file), Buffer.from(m[2], 'base64'));
  return { url: '/bg/' + file };
}));
app.delete('/api/backgrounds/:file', wrap(req => {
  const f = path.join(BG_DIR, path.basename(req.params.file));
  if (fs.existsSync(f)) fs.unlinkSync(f);
}));

// back-ups
app.get('/api/backups', wrap(() => fs.readdirSync(BK_DIR).filter(n => n.endsWith('.json')).sort().reverse()
  .map(n => ({ name: n, size: fs.statSync(path.join(BK_DIR, n)).size, date: fs.statSync(path.join(BK_DIR, n)).mtime }))));
app.post('/api/backups', wrap(() => {
  const name = `handmatig-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  fs.copyFileSync(CFG, path.join(BK_DIR, name)); return { name };
}));
app.get('/api/backups/:name', (req, res) => res.download(path.join(BK_DIR, path.basename(req.params.name))));
app.post('/api/restore/:name', wrap(req => {
  const f = path.join(BK_DIR, path.basename(req.params.name));
  const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
  writeConfig(cfg); broadcast('config', { savedAt: cfg.savedAt }); return cfg;
}));
app.delete('/api/backups/:name', wrap(req => fs.unlinkSync(path.join(BK_DIR, path.basename(req.params.name)))));
app.post('/api/reset', wrap(() => { const c = defaultConfig(); writeConfig(c); broadcast('config', { savedAt: c.savedAt }); return c; }));

app.listen(PORT, () => {
  console.log(`Homey Dashboard draait op poort ${PORT} (${homey.status.mode === 'demo' ? 'DEMO-modus' : 'Homey ' + process.env.HOMEY_ADDRESS})`);
  homey.start();
});
