'use strict';
// Bijwerken met één knop: nieuwste versie van GitHub ophalen, eerst een volledige back-up,
// oude bestanden bewaren, nieuwe neerzetten en het dashboard herstarten (Docker start hem opnieuw).
// Start de nieuwe versie niet goed op, dan worden de oude bestanden vanzelf teruggezet.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const REPO = process.env.UPDATE_REPO || 'harrynaccy/homey-scrips';
const BRANCH = process.env.UPDATE_BRANCH || 'claude/youthful-wright-lt4h11';
const SUB = 'homey-dashboard/';
const PROTECT = [/^docker-compose\.ya?ml$/, /^data\//, /^node_modules\//, /^desktop\//, /^\.env$/, /^reserve\//];
const MUST = ['package.json', 'server/server.js', 'public/index.html', 'public/js/core.js'];

// ---------- zip lezen (alleen wat GitHub aanlevert: opslaan of deflate) ----------
function readZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Het gedownloade bestand is geen geldige zip');
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Beschadigde zip');
    const method = buf.readUInt16LE(p + 10); const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28); const xlen = buf.readUInt16LE(p + 30); const clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42); const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.slice(start, start + csize);
    out.push({ name, data: method === 0 ? raw : zlib.inflateRawSync(raw) });
  }
  return out;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1));

class Updater {
  constructor(dataDir, makeBackup) {
    this.data = dataDir; this.makeBackup = makeBackup;
    this.stateFile = path.join(dataDir, 'update.json');
    this.pendingFile = path.join(dataDir, 'update-pending.json');
    this.rbDir = path.join(dataDir, 'update-terug');
    this.status = { busy: false, step: '', error: null };
    this.cache = null;
  }
  state() { return readJson(this.stateFile, {}); }

  async latest(force) {
    if (!force && this.cache && Date.now() - this.cache.at < 10 * 60 * 1000) return this.cache.v;
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(BRANCH)}`, { headers: { 'User-Agent': 'homey-dashboard', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(r.status === 403 ? 'GitHub laat even geen vragen meer toe. Probeer het over een uur opnieuw.' : `Kan de nieuwste versie niet opvragen bij GitHub (${r.status})`);
    const j = await r.json();
    const v = { sha: j.sha, date: j.commit && j.commit.committer && j.commit.committer.date, message: String((j.commit && j.commit.message) || '').split('\n')[0] };
    this.cache = { at: Date.now(), v };
    return v;
  }
  async check(force) {
    const cur = this.state(); const latest = await this.latest(force);
    const rb = this.rollbacks();
    return { current: cur.sha ? cur : null, latest, upToDate: cur.sha === latest.sha, canRollback: rb.length > 0, rollbackFrom: rb[0] || null, branch: BRANCH };
  }
  rollbacks() { try { return fs.readdirSync(this.rbDir).filter(n => fs.existsSync(path.join(this.rbDir, n, 'lijst.json'))).sort().reverse(); } catch (e) { return []; } }

  // ---------- bijwerken ----------
  start() {
    if (this.status.busy) throw new Error('Er wordt al bijgewerkt');
    this.status = { busy: true, step: 'Voorbereiden…', error: null };
    this.run().catch(e => { console.error('[bijwerken] mislukt:', e.message || e); this.status = { busy: false, step: '', error: String(e.message || e) }; });
    return { started: true };
  }
  async run() {
    const step = s => { this.status.step = s; console.log('[bijwerken] ' + s); };
    const latest = await this.latest(true);
    step('Volledige back-up maken…');
    const bkDir = path.join(this.data, 'backups'); fs.mkdirSync(bkDir, { recursive: true });
    fs.writeFileSync(path.join(bkDir, `voor-update-${stamp()}.zip`), this.makeBackup());
    const olds = fs.readdirSync(bkDir).filter(n => n.startsWith('voor-update-')).sort().reverse().slice(3);
    for (const n of olds) fs.unlinkSync(path.join(bkDir, n));

    step('Nieuwe versie downloaden…');
    const r = await fetch(`https://codeload.github.com/${REPO}/zip/refs/heads/${encodeURIComponent(BRANCH).replace(/%2F/g, '/')}`, { headers: { 'User-Agent': 'homey-dashboard' } });
    if (!r.ok) throw new Error(`Downloaden lukt niet (${r.status}). Heeft de NAS internet?`);
    const zip = Buffer.from(await r.arrayBuffer());

    step('Controleren…');
    const entries = readZip(zip);
    const top = (entries[0] && entries[0].name.split('/')[0] + '/') || '';
    const files = entries.filter(x => x.name.startsWith(top + SUB)).map(x => ({ rel: x.name.slice((top + SUB).length), data: x.data }))
      .filter(x => x.rel && !PROTECT.some(re => re.test(x.rel)));
    for (const m of MUST) if (!files.some(f => f.rel === m)) throw new Error('De nieuwe versie is niet compleet (' + m + ' ontbreekt). Er is niets veranderd.');
    // alle JavaScript eerst proef-lezen: bij een fout wordt er niets vervangen
    const tmp = path.join(this.data, 'update-proef'); fs.rmSync(tmp, { recursive: true, force: true });
    for (const f of files.filter(x => /\.js$/.test(x.rel) && /^(server|public\/js)\//.test(x.rel))) {
      const t = path.join(tmp, f.rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, f.data);
      const c = spawnSync(process.execPath, ['--check', t], { encoding: 'utf8' });
      if (c.status !== 0) { fs.rmSync(tmp, { recursive: true, force: true }); throw new Error(`De nieuwe versie bevat een fout in ${f.rel}. Er is niets veranderd.`); }
    }
    fs.rmSync(tmp, { recursive: true, force: true });

    step('Oude bestanden bewaren…');
    const ts = stamp(); const rb = path.join(this.rbDir, ts); const changed = []; const added = [];
    for (const f of files) {
      const dest = path.join(ROOT, f.rel);
      if (fs.existsSync(dest)) {
        const old = fs.readFileSync(dest); if (old.equals(f.data)) continue;
        const b = path.join(rb, 'bestanden', f.rel); fs.mkdirSync(path.dirname(b), { recursive: true }); fs.writeFileSync(b, old); changed.push(f.rel);
      } else added.push(f.rel);
    }
    fs.mkdirSync(rb, { recursive: true });
    writeJson(path.join(rb, 'lijst.json'), { changed, added, from: this.state(), to: latest, at: new Date().toISOString() });
    for (const n of this.rollbacks().slice(3)) fs.rmSync(path.join(this.rbDir, n), { recursive: true, force: true });

    step(`Installeren (${changed.length + added.length} bestanden)…`);
    for (const f of files) {
      if (!changed.includes(f.rel) && !added.includes(f.rel)) continue;
      const dest = path.join(ROOT, f.rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
      const t = dest + '.nieuw'; fs.writeFileSync(t, f.data); fs.renameSync(t, dest);
    }
    writeJson(this.stateFile, { ...latest, installedAt: new Date().toISOString() });
    writeJson(this.pendingFile, { ts, attempts: 0, at: Date.now() });
    step('Herstarten…');
    this.status.restarting = true;
    setTimeout(() => process.exit(0), 1500);
  }

  // ---------- terugzetten ----------
  rollback(ts, reason) {
    ts = ts || this.rollbacks()[0];
    const rb = path.join(this.rbDir, ts || ''); const list = readJson(path.join(rb, 'lijst.json'), null);
    if (!ts || !list) throw new Error('Er is geen vorige versie om terug te zetten');
    console.log(`[bijwerken] vorige versie terugzetten (${reason || 'op verzoek'})`);
    for (const rel of list.changed) { const src = path.join(rb, 'bestanden', rel); if (fs.existsSync(src)) fs.copyFileSync(src, path.join(ROOT, rel)); }
    for (const rel of list.added) fs.rmSync(path.join(ROOT, rel), { force: true });
    writeJson(this.stateFile, { ...(list.from || {}), rolledBackAt: new Date().toISOString(), reason: reason || 'op verzoek' });
    fs.rmSync(rb, { recursive: true, force: true });
    fs.rmSync(this.pendingFile, { force: true });
  }
  requestRollback() {
    this.rollback(null, 'op verzoek');
    this.status = { busy: true, step: 'Herstarten…', error: null, restarting: true };
    setTimeout(() => process.exit(0), 1500);
    return { ok: true };
  }

  // Bij het opstarten: start de nieuwe versie niet goed, dan de oude terug.
  guard() {
    const p = readJson(this.pendingFile, null);
    if (!p) return;
    p.attempts = (p.attempts || 0) + 1; writeJson(this.pendingFile, p);
    if (p.attempts > 3) { try { this.rollback(p.ts, 'nieuwe versie startte niet op'); } catch (e) { fs.rmSync(this.pendingFile, { force: true }); } process.exit(1); }
    const fail = err => { console.error('[bijwerken] nieuwe versie loopt vast:', err && (err.stack || err)); try { this.rollback(p.ts, 'nieuwe versie liep vast bij het starten'); } catch (e) { /* */ } process.exit(1); };
    process.on('uncaughtException', fail);
    setTimeout(() => { process.removeListener('uncaughtException', fail); fs.rmSync(this.pendingFile, { force: true }); console.log('[bijwerken] nieuwe versie draait goed'); }, 60 * 1000);
  }
}

module.exports = { Updater, readZip };
