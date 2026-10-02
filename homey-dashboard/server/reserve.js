'use strict';
// Reservemap: "reserve/1 Installatie" (het Windows-installatiebestand, zet je er zelf één keer in)
// en "reserve/2 Back-up" (volledige back-up van het dashboard + de gekoppelde map "spotify homey").
// Elke 24 uur wordt gekeken of er iets veranderd is; alleen dan komt er een nieuwe back-up (met én zonder sleutels).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fullEntries, zip } = require('./backup');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'reserve');
const INST = path.join(DIR, '1 Installatie');
const BK = path.join(DIR, '2 Back-up');
const EXTRA = process.env.EXTRA_DIR || '/extra';          // gekoppelde mappen (docker-compose.yml)
const KEEP = 7;
const DAY = 24 * 3600 * 1000;

// niet meetellen als "wijziging" (verandert vanzelf steeds), wel meenemen in de back-up
const NOCOUNT = [/^PROJECT-GEGEVENS\.txt$/, /^data\/backups\//, /^data\/update-/, /^data\/sessies\.json$/, /^data\/controle-status\.json$/, /^data\/reserve\.json$/, /(^|\/)knmi\.json$/, /\.log$/i];
// helemaal overslaan
const SKIPDIR = new Set(['#recycle', '@eaDir', '.git', 'reserve']);

function listExtra() {
  try { return fs.readdirSync(EXTRA, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch (e) { return []; }
}
function walkExtra(dir, base, out) {
  let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of list) {
    if (SKIPDIR.has(e.name) || e.name.endsWith('.tmp')) continue;
    const full = path.join(dir, e.name); const rel = base + '/' + e.name;
    if (e.isDirectory()) walkExtra(full, rel, out);
    else if (e.isFile()) { try { out.push({ name: rel, full }); } catch (err) { /* */ } }
  }
}
// spotify-apps.js en andere bestanden met sleutels uit de gekoppelde mappen weglaten in de versie zonder sleutels
const EXTRA_SECRET = /(^|\/)(spotify-apps\.js|env\.json|\.env|.*geheim.*\.json|.*secret.*)$/i;

class Reserve {
  constructor({ dataDir, broadcast }) {
    this.dataDir = dataDir; this.broadcast = broadcast || (() => {});
    this.stateFile = path.join(dataDir, 'reserve.json');
    this.busy = false;
    for (const d of [DIR, INST, BK]) fs.mkdirSync(d, { recursive: true });
    const lees = path.join(DIR, 'LEESMIJ.txt');
    if (!fs.existsSync(lees)) fs.writeFileSync(lees, `HOMEY DASHBOARD – RESERVE

1 Installatie
  Zet hier zelf het laatste werkende installatiebestand van het Windows-programma neer
  (bijvoorbeeld Homey-Dashboard-Setup-1.1.0.exe). Dit wordt niet automatisch gemaakt.

2 Back-up
  Elke 24 uur kijkt het dashboard of er iets veranderd is. Alleen dan komt er een nieuwe back-up.
  Per keer twee bestanden:
    ...-met-sleutels.zip     alles, ook Homey-sleutel, Spotify-sleutels en wachtwoorden. Bewaar veilig (NAS, laptop).
    ...-zonder-sleutels.zip  hetzelfde zonder sleutels en wachtwoorden (voor de tablet).
  De laatste ${KEEP} van elk blijven bewaard.

Terugzetten: zie PROJECT-GEGEVENS.txt in de zip en de handleiding, hoofdstuk Voorbereiding.
De map "spotify homey" staat in de zip onder extra/spotify-homey; zet die terug als gedeelde map /volume1/spotify homey.
`);
  }

  state() { try { return JSON.parse(fs.readFileSync(this.stateFile, 'utf8')); } catch (e) { return {}; } }
  saveState(s) { fs.writeFileSync(this.stateFile, JSON.stringify(s, null, 1)); }

  // vingerafdruk: bestandsnaam + grootte + wijzigtijd van alles wat telt
  fingerprint(entries) {
    const h = crypto.createHash('sha256');
    for (const e of entries.slice().sort((a, b) => a.name.localeCompare(b.name))) {
      if (NOCOUNT.some(re => re.test(e.name))) continue;
      let st = null; try { if (e.full) st = fs.statSync(e.full); } catch (err) { /* */ }
      h.update(e.name + '|' + (st ? st.size + ':' + Math.floor(st.mtimeMs) : (e.data ? crypto.createHash('md5').update(e.data).digest('hex') : '')) + '\n');
    }
    return h.digest('hex');
  }

  collect(keys) {
    const entries = fullEntries({ dataDir: this.dataDir, keys });
    const ex = [];
    for (const name of listExtra()) walkExtra(path.join(EXTRA, name), 'extra/' + name, ex);
    for (const e of ex) {
      if (!keys && EXTRA_SECRET.test(e.name)) continue;
      try { entries.push({ name: e.name, full: e.full, data: fs.readFileSync(e.full) }); } catch (err) { /* onleesbaar: overslaan */ }
    }
    return entries;
  }

  files() {
    const ls = d => { try { return fs.readdirSync(d).filter(n => !n.startsWith('.')).map(n => { const s = fs.statSync(path.join(d, n)); return { name: n, size: s.size, date: s.mtime }; }).sort((a, b) => b.date - a.date); } catch (e) { return []; } };
    return { installatie: ls(INST), backup: ls(BK) };
  }

  // nieuwste wijzigtijd in een map (voor "laatst bijgewerkt" van de Homey-app op de NAS)
  newest(dir, depth = 0, best = 0) {
    if (depth > 6) return best;
    let list; try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return best; }
    for (const e of list) {
      if (SKIPDIR.has(e.name) || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      try { if (e.isDirectory()) best = this.newest(full, depth + 1, best); else { const m = fs.statSync(full).mtimeMs; if (m > best) best = m; } } catch (err) { /* */ }
    }
    return best;
  }

  // controle in één oogopslag: wat is er mis met de reserve?
  issues(st) {
    const s = st || this.state(); const f = this.files(); const out = [];
    const exe = f.installatie.some(x => /\.exe$/i.test(x.name));
    const age = s.lastCheck ? Date.now() - new Date(s.lastCheck).getTime() : Infinity;
    if (s.lastError) out.push({ sev: 'error', problem: 'Back-up mislukt', detail: s.lastError });
    if (!s.lastBackup || !f.backup.some(x => /met-sleutels\.zip$/.test(x.name))) out.push({ sev: 'error', problem: 'Er is nog geen back-up', detail: 'Klik op Systeem → Reserve → Nu een back-up maken.' });
    else if (age > 48 * 3600 * 1000) out.push({ sev: 'warn', problem: 'Al meer dan 2 dagen geen controle', detail: 'Normaal gebeurt dat elke 24 uur. Draait het dashboard wel?' });
    if (!exe) out.push({ sev: 'warn', problem: 'Installatiebestand ontbreekt', detail: 'Zet het .exe-bestand in reserve/1 Installatie.' });
    if (!listExtra().length) out.push({ sev: 'warn', problem: 'Map "spotify homey" niet gekoppeld', detail: 'De regel voor /volume1/spotify homey ontbreekt in docker-compose.yml; die map gaat nu niet mee in de back-up.' });
    return out;
  }

  status() {
    const s = this.state(); const f = this.files(); const items = this.issues(s);
    const app = listExtra().includes('spotify-homey') ? this.newest(path.join(EXTRA, 'spotify-homey', 'homey-app')) : 0;
    return { ...s, busy: this.busy, extra: listExtra(), exe: f.installatie.filter(x => /\.exe$/i.test(x.name)).map(x => x.name), files: f, folder: 'docker/Homey Dashboard/reserve',
      appUpdated: app ? new Date(app).toISOString() : null,
      health: { level: items.some(x => x.sev === 'error') ? 'bad' : items.length ? 'warn' : 'ok', items } };
  }

  async check(force) {
    if (this.busy) return this.status();
    this.busy = true;
    const s = this.state(); s.lastCheck = new Date().toISOString(); s.lastError = null;
    try {
      const withKeys = this.collect(true);
      const fp = this.fingerprint(withKeys);
      const have = this.files().backup.some(x => /met-sleutels\.zip$/.test(x.name));
      const changed = !have || fp !== s.fingerprint;
      if (!force && !changed) { s.result = 'Niets veranderd sinds de vorige back-up'; }
      else {
        const p = Object.fromEntries(new Intl.DateTimeFormat('nl-NL', { timeZone: process.env.TZ || 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value])); const st = `${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}`; // 2026-10-02-1218, Nederlandse tijd
        const w = (variant, entries) => { const f = path.join(BK, `homey-dashboard-${st}-${variant}.zip`); const tmp = f + '.tmp'; fs.writeFileSync(tmp, zip(entries)); fs.renameSync(tmp, f); return f; };
        w('met-sleutels', withKeys);
        w('zonder-sleutels', this.collect(false));
        for (const v of ['met-sleutels', 'zonder-sleutels']) {
          const old = fs.readdirSync(BK).filter(n => n.endsWith(`-${v}.zip`)).sort().reverse().slice(KEEP);
          for (const n of old) fs.unlinkSync(path.join(BK, n));
        }
        s.fingerprint = fp; s.lastBackup = new Date().toISOString();
        s.result = changed ? 'Nieuwe back-up gemaakt: er was iets veranderd' : 'Nieuwe back-up gemaakt (op verzoek)';
        console.log('[reserve] ' + s.result);
      }
    } catch (e) { s.lastError = e.message || String(e); console.error('[reserve] mislukt:', s.lastError); }
    finally { this.busy = false; this.saveState(s); }
    return this.status();
  }

  // elke 24 uur; na een herstart meteen als de laatste controle langer dan 24 uur geleden is
  start() {
    const due = () => { const s = this.state(); if (!s.lastCheck || Date.now() - new Date(s.lastCheck).getTime() >= DAY) this.check(false); };
    setTimeout(due, 2 * 60 * 1000);
    setInterval(due, 60 * 60 * 1000);
  }
}

module.exports = { Reserve };
