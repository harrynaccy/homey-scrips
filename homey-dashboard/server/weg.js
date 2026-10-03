'use strict';
// Wegen voor de tegels "Wegwerkzaamheden Enschede" en "Files A- en N-wegen".
// - NDW open data (opendata.ndw.nu, geen sleutel): DATEX II-bestanden met wegwerkzaamheden, afsluitingen en incidenten,
//   ook van gemeenten (via Melvin). De bestanden zijn groot; ze worden in stukjes gelezen en alleen een korte samenvatting
//   per melding blijft in het geheugen. Ophalen elke 15 min, alleen zolang een scherm een van de tegels toont.
// - ANWB (filelijst met lengte en vertraging): hetzelfde adres dat de ANWB-website gebruikt; niet officieel, kan veranderen.
//   Lukt ANWB niet, dan maakt de filetegel een lijst uit NDW (incidenten en afsluitingen, zonder filelengte).
// - P2000: meldingen uit Enschede waarin een afsluiting staat (uit de P2000-module, die dan ook blijft ophalen).
const zlib = require('zlib');
const { Readable } = require('stream');

const UA = { 'User-Agent': 'HomeyDashboard/1.0 (eigen dashboard; NAS)' };
const NDW_FILES = process.env.NDW_FILES ? process.env.NDW_FILES.split(',') : [
  'https://opendata.ndw.nu/planningsfeed_wegwerkzaamheden_en_evenementen.xml.gz',
  'https://opendata.ndw.nu/wegwerkzaamheden.xml.gz',
  'https://opendata.ndw.nu/tijdelijke_verkeersmaatregelen_afsluitingen.xml.gz',
  'https://opendata.ndw.nu/incidents.xml.gz',
];
// openbare sleutel van de ANWB-website zelf (staat in hun eigen webpagina; geen persoonlijke sleutel)
const ANWB_KEY = process.env.ANWB_KEY || 'QYUEE3fEcFD7SGMJ6E7QBCMzdQGqRkAi';
const ANWB_JAMS = process.env.ANWB_JAMS_URL || `https://api.anwb.nl/routing/v1/incidents/incidents-desktop?apikey=${ANWB_KEY}`;
const NDW_EVERY = 15 * 60e3;
const IDLE = 60 * 60e3;
const ENSCHEDE = { lat: 52.2215, lon: 6.8937 };

// ---------- hulpjes ----------
const dec = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();
// tags met of zonder voorvoegsel (DATEX II v2 heeft er geen, v3 wel: sit:, loc:, com:)
const T = n => `<(?:[\\w-]+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${n}>`;
const first = (xml, n) => { const m = new RegExp(T(n)).exec(xml); return m ? dec(m[1]) : ''; };
const all = (xml, n) => [...String(xml).matchAll(new RegExp(T(n), 'g'))].map(m => dec(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
const km = (a, b) => { const R = 6371, r = Math.PI / 180; const dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);

// ---------- provincie bepalen (vereenvoudigde grenzen, lon/lat; bij een grens kan het een enkele keer mis gaan) ----------
const PROV = {
  overijssel: [[5.79, 52.58], [5.93, 52.66], [5.84, 52.80], [6.00, 52.83], [6.13, 52.85], [6.16, 52.78], [6.12, 52.72], [6.16, 52.67], [6.27, 52.66], [6.45, 52.67], [6.72, 52.64], [6.80, 52.62],
    [6.78, 52.55], [6.97, 52.46], [7.07, 52.39], [7.03, 52.30], [7.00, 52.22], [6.86, 52.12], [6.70, 52.11], [6.60, 52.16], [6.40, 52.20], [6.20, 52.21],
    [6.14, 52.24], [6.13, 52.30], [6.08, 52.40], [6.02, 52.49], [5.92, 52.51], [5.82, 52.54]],
  friesland: [[5.33, 52.87], [5.70, 52.82], [5.86, 52.80], [6.10, 52.85], [6.30, 52.90], [6.43, 52.98], [6.38, 53.10], [6.28, 53.20], [6.22, 53.42],
    [6.35, 53.52], [4.95, 53.52], [4.95, 53.22], [5.17, 53.05], [5.33, 53.00]],
};
const inPoly = (lon, lat, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
  if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; } return c; };
const provinceOf = p => (!p || !Number.isFinite(p.lat) ? 'rest' : inPoly(p.lon, p.lat, PROV.overijssel) ? 'overijssel' : inPoly(p.lon, p.lat, PROV.friesland) ? 'friesland' : 'rest');

// ---------- NDW: één <situation> samenvatten ----------
const CLOSE_MGMT = /roadClosed|carriagewayClosures|closedPermanentlyForTheWinter|roadClosure|afgesloten/i;
const CLOSE_TXT = /afgesloten|afsluiting|gesloten voor (alle )?verkeer|dicht voor (alle |het )?verkeer|weg dicht/i;
function situation(xml) {
  const id = (/\bid="([^"]+)"/.exec(xml) || [])[1] || '';
  const recs = [...xml.matchAll(/<(?:[\w-]+:)?situationRecord\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?situationRecord>/g)];
  if (!recs.length) return null;
  const types = recs.map(r => ((/type="(?:[\w-]+:)?([\w]+)"/.exec(r[1]) || [])[1] || ''));
  const body = recs.map(r => r[2]).join('\n');
  const mgmt = all(body, 'roadOrCarriagewayOrLaneManagementType').concat(all(body, 'roadMaintenanceType'), all(body, 'accidentType'));
  const lat = all(body, 'latitude').map(Number), lon = all(body, 'longitude').map(Number);
  const pts = []; for (let i = 0; i < Math.min(lat.length, lon.length); i++) if (Number.isFinite(lat[i]) && Number.isFinite(lon[i])) pts.push({ lat: lat[i], lon: lon[i] });
  const step = Math.max(1, Math.floor(pts.length / 6)); const keep = pts.filter((p, i) => i % step === 0).slice(0, 8);
  const start = Date.parse(first(body, 'overallStartTime')) || null, end = Date.parse(first(body, 'overallEndTime')) || null;
  const status = first(body, 'validityStatus');
  const road = all(body, 'roadNumber').find(Boolean) || '';
  const street = all(body, 'roadName').find(Boolean) || '';
  const texts = [...new Set(all(body, 'value').filter(v => v && v.length > 2 && !/^\d+$/.test(v) && v !== street && v !== road))].slice(0, 6);
  const isIncident = types.some(t => /Accident|VehicleObstruction|AbnormalTraffic|Obstruction|EnvironmentalObstruction|PoorEnvironment|NonWeatherRelatedRoadConditions/.test(t));
  const isEvent = types.some(t => /PublicEvent/.test(t));
  const closed = mgmt.some(m => CLOSE_MGMT.test(m)) || texts.some(t => CLOSE_TXT.test(t));
  return {
    id, kind: isIncident ? 'incident' : isEvent ? 'evenement' : 'werk', closed, status, start, end, road, street,
    what: mgmt.filter(m => !/other/i.test(m)).slice(0, 3), texts, pts: keep,
    diversion: types.some(t => /Rerouting/.test(t)) || texts.some(t => /omleiding/i.test(t)),
  };
}
// groot bestand in stukjes lezen (gz of gewoon), per <situation> een samenvatting
async function readNdw(url, onSit, fetchFn = fetch) {
  const r = await fetchFn(url, { headers: UA, signal: AbortSignal.timeout(10 * 60e3) });
  if (!r.ok) throw new Error(`${new URL(url).hostname}${new URL(url).pathname} gaf ${r.status}`);
  let src = Readable.fromWeb(r.body);
  // gz herkennen aan de eerste twee bytes
  const it = src[Symbol.asyncIterator](); const head = await it.next(); if (head.done) return 0;
  const rest = Readable.from((async function* () { yield head.value; for (;;) { const n = await it.next(); if (n.done) return; yield n.value; } })());
  const gz = head.value[0] === 0x1f && head.value[1] === 0x8b;
  src = gz ? rest.pipe(zlib.createGunzip()) : rest;
  src.setEncoding('utf8');
  let buf = ''; let n = 0;
  const OPEN = /<(?:[\w-]+:)?situation\b(?![\w-])/g, CLOSE = /<\/(?:[\w-]+:)?situation>/g;
  for await (const chunk of src) {
    buf += chunk;
    for (;;) {
      OPEN.lastIndex = 0; const o = OPEN.exec(buf); if (!o) { buf = buf.slice(-200); break; }
      CLOSE.lastIndex = o.index; const c = CLOSE.exec(buf); if (!c) { buf = buf.slice(o.index); break; }
      const s = situation(buf.slice(o.index, c.index + c[0].length)); if (s) { onSit(s); n++; }
      buf = buf.slice(c.index + c[0].length);
    }
    if (buf.length > 20e6) buf = buf.slice(-1e6); // nooit vastlopen op een kapot bestand
  }
  return n;
}

// ---------- ANWB-filelijst ----------
function anwbParse(j) {
  const out = []; const seen = new Set();
  const loc = x => { const l = x.fromLoc || x.loc || x.location || x.toLoc; return l && Number.isFinite(Number(l.lat)) ? { lat: Number(l.lat), lon: Number(l.lon != null ? l.lon : l.lng) } : null; };
  const add = (x, road, cat) => {
    const id = String(x.id || x.msgNr || `${road}|${x.from}|${x.to}|${x.start}`); if (seen.has(id)) return; seen.add(id);
    const it = String(x.incidentType || x.type || '').toLowerCase(); const label = String(x.label || x.reason || '');
    const closed = /closed|afgesloten|dicht/.test(it) || /afgesloten|is dicht/i.test(label);
    if (cat !== 'jams' && !closed) return; // wegwerkzaamheden zonder afsluiting en flitsers niet
    const p = loc(x);
    out.push({ id, road: String(x.road || road || ''), from: String(x.from || x.afrom || ''), to: String(x.to || x.ato || ''),
      km: x.distance != null ? Math.round(Number(x.distance) / 100) / 10 : null, delay: x.delay != null ? Math.round(Number(x.delay) / 60) : null,
      reason: String(x.reason || (Array.isArray(x.events) ? x.events.map(e => e.text).filter(Boolean).join(', ') : '') || ''),
      type: closed ? 'afsluiting' : 'file', start: x.start || null, end: x.stop || x.end || null, pt: p, prov: provinceOf(p) });
  };
  if (Array.isArray(j && j.roads)) {
    for (const r of j.roads) for (const s of r.segments || []) for (const cat of ['jams', 'roadworks']) for (const x of s[cat] || []) add(x, r.road, cat);
  } else { // onbekende vorm: alles met een weg en van/naar meenemen
    const walk = (v, cat) => { if (Array.isArray(v)) v.forEach(x => walk(x, cat)); else if (v && typeof v === 'object') { if (v.road && (v.from || v.afrom)) add(v, v.road, cat); for (const [k, w] of Object.entries(v)) if (w && typeof w === 'object') walk(w, /jam|file/i.test(k) ? 'jams' : /work|closure/i.test(k) ? 'roadworks' : cat); } };
    walk(j, 'jams');
  }
  return out;
}

// ---------- meldingen leesbaar maken: straat, wat er dicht is, van waar tot waar ----------
// Melvin-titel: "Harsseveldhoek Enschede Kabels / Leidingen (618570)" = straat + plaats + soort werk + nummer
const PLACES = 'Enschede|Glanerbrug|Lonneker|Boekelo|Usselo|Hengelo|Oldenzaal|Losser|Overdinkel|De Lutte|Haaksbergen|Borne|Delden|Weerselo|Deurningen|Rossum|Oldenzaal|Gronau|Twekkelo|Driene|Beckum|Hertme|Zenderen|Lattrop|Denekamp|Ootmarsum|Almelo|Goor|Markelo|Rijssen|Holten|Nijverdal|Wierden|Tubbergen|Vriezenveen|Rijssen|Diepenheim|Neede|Eibergen|Buurse|Lemselo|Tilligte|Saasveld|Volthe';
const TITLE_RE = new RegExp(`^(.+?)\\s+(?:${PLACES})\\b(?:\\s+(.+?))?\\s*(?:\\(\\d+\\))?$`, 'i');
function streetFromTitle(texts) {
  for (const t of texts) {
    if (!/\(\d{3,}\)\s*$/.test(t) && !/^\S+(\s+\S+){0,4}\s+(Enschede|Glanerbrug|Lonneker|Boekelo)\b/i.test(t)) continue;
    const m = TITLE_RE.exec(t.trim()); if (m && m[1].length <= 60 && !/[.:]/.test(m[1])) return { street: m[1].trim(), work: (m[2] || '').replace(/\s*\(\d+\)\s*$/, '').trim(), title: t };
  }
  return null;
}
function measureOf(texts, what) {
  const all = texts.join(' \n ').toLowerCase();
  if (/dicht in (beide|twee) richtingen|volledig (afgesloten|dicht)|weg(?:vak)? (?:is )?afgesloten|gesloten voor (alle |het )?verkeer|dicht voor (alle |het )?verkeer/.test(all)) return ['afgesloten', 'red'];
  if (/dicht in (een|één|1) richting|eenrichtingsverkeer|afgesloten in (een|één|1) richting/.test(all)) return ['dicht in één richting', 'orange'];
  if (/rijstrook/.test(all)) return ['rijstrook dicht', 'orange'];
  if (/om en om|verkeersregelaar|wegversmalling|versmald/.test(all)) return ['versmald', 'orange'];
  if (/fietspad/.test(all)) return ['fietspad dicht', 'orange'];
  if (/trottoir|voetpad|stoep/.test(all)) return ['stoep dicht', 'orange'];
  if (what.some(w => /roadClosed|carriagewayClosures/i.test(w)) || /afgesloten|afsluiting|weg dicht/.test(all)) return ['afgesloten', 'red'];
  if (what.some(w => /laneClosures/i.test(w))) return ['rijstrook dicht', 'orange'];
  return ['hinder', 'orange'];
}
const NOT_PLACE = /^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d|week|januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)/i;
const tidy = x => x.replace(/^(de|het)\s+/i, '').replace(/^kruising\s+(met\s+)?/i, '').replace(/\s+/g, ' ').trim();
function trajectOf(texts) {
  for (const t of texts) {
    let m = /kruising\s+(.+?)\s+(?:t\/m|tot(?: en met)?|-)\s+(?:de\s+)?kruising\s+(.+?)(?=[.,;]|\s+(?:van|vanaf|i\.v\.m\.?|ivm)\s|$)/i.exec(t);
    if (m) return `tussen ${tidy(m[1])} en ${tidy(m[2])}`;
    m = /\btussen\s+(.+?)\s+en\s+(.+?)(?=[.,;]|\s+(?:van|vanaf|i\.v\.m\.?|ivm|in verband)\s|$)/i.exec(t);
    if (m && !NOT_PLACE.test(m[1])) return `tussen ${tidy(m[1])} en ${tidy(m[2])}`;
    m = /\bvanaf\s+(.+?)\s+(?:tot(?: en met)?|t\/m)\s+(.+?)(?=[.,;]|\s+(?:van|i\.v\.m\.?|ivm)\s|$)/i.exec(t);
    if (m && !NOT_PLACE.test(m[1]) && !NOT_PLACE.test(m[2])) return `tussen ${tidy(m[1])} en ${tidy(m[2])}`;
    m = /\b(?:thv|t\.h\.v\.?|ter hoogte van)\s+(.+?)(?=[.,;]|\s+(?:van|vanaf|i\.v\.m\.?|ivm)\s|$)/i.exec(t);
    if (m) return `ter hoogte van ${m[1].trim()}`;
  }
  return '';
}
// straat bij coördinaten (PDOK Locatieserver, gratis, geen sleutel); per plek onthouden
const PDOK = (process.env.PDOK_BASE || 'https://api.pdok.nl/bzk/locatieserver/search/v3_1').replace(/\/$/, '');
const geoCache = new Map();
async function streetAt(p, fetchFn) {
  const k = p.lat.toFixed(4) + ',' + p.lon.toFixed(4);
  if (geoCache.has(k)) return geoCache.get(k);
  let v = '';
  try {
    const r = await fetchFn(`${PDOK}/reverse?lat=${p.lat}&lon=${p.lon}&type=weg&rows=1`, { headers: UA, signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json(); const d = j && j.response && j.response.docs && j.response.docs[0]; v = d ? String(d.straatnaam || (d.weergavenaam || '').split(',')[0] || '') : ''; }
    else return '';
  } catch (e) { return ''; }
  if (geoCache.size > 3000) geoCache.clear();
  geoCache.set(k, v); return v;
}

class Weg {
  constructor({ p2000, fetchFn } = {}) {
    this.p2000 = p2000; this.fetch = fetchFn || fetch;
    this.sits = new Map(); this.ndwAt = 0; this.ndwFiles = {}; this.busy = null; this.lastAsk = 0; this.timer = null;
    this.anwb = null;
  }
  // ---------- NDW ophalen (alle bestanden; mislukt er één, dan blijven de vorige gegevens van dat bestand staan) ----------
  async pollNdw() {
    if (this.busy) return this.busy;
    this.busy = (async () => {
      for (const u of NDW_FILES) {
        const got = new Map();
        try {
          const n = await readNdw(u, s => { s.src = u; got.set(s.id || s.src + got.size, s); }, this.fetch);
          for (const [k, s] of this.sits) if (s.src === u) this.sits.delete(k);
          for (const [k, s] of got) this.sits.set(k, s);
          this.ndwFiles[u] = { ok: Date.now(), count: n, error: null };
        } catch (e) { this.ndwFiles[u] = { ...(this.ndwFiles[u] || {}), error: String(e.message || e), at: Date.now() }; }
      }
      if (Object.values(this.ndwFiles).some(f => f.ok)) this.ndwAt = Date.now();
    })().finally(() => { this.busy = null; });
    return this.busy;
  }
  async ask() {
    this.lastAsk = Date.now();
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (Date.now() - this.lastAsk > IDLE) { clearInterval(this.timer); this.timer = null; return; }
        this.pollNdw().catch(() => {});
      }, NDW_EVERY);
      this.pollNdw().catch(() => {});
    }
    // eerste keer: even wachten (max 25 s), daarna gewoon tonen wat er is
    if (!this.ndwAt && this.busy) await Promise.race([this.busy, new Promise(r => setTimeout(r, 25e3))]);
  }
  ndwError() { const f = Object.values(this.ndwFiles); return f.length && !f.some(x => x.ok) ? 'NDW nu niet bereikbaar' : null; }
  status() { return { at: Date.now(), ndwAt: this.ndwAt, files: this.ndwFiles, meldingen: this.sits.size, anwb: this.anwb && { ok: this.anwb.ok, error: this.anwb.error, at: this.anwb.at } }; }

  // ---------- tegel Wegwerkzaamheden ----------
  async roadworks(q = {}) {
    const radius = Math.min(50, Math.max(1, num(q.radius, 6))); const days = Math.min(60, Math.max(0, num(q.days, 7)));
    const center = { lat: num(q.lat, ENSCHEDE.lat), lon: num(q.lon, ENSCHEDE.lon) };
    await this.ask();
    const now = Date.now(), until = now + days * 864e5;
    const items = [];
    for (const s of this.sits.values()) {
      if (!s.pts.length || /suspended/i.test(s.status)) continue;
      const d = Math.min(...s.pts.map(p => km(center, p))); if (d > radius) continue;
      if (s.end && s.end < now) continue;
      const active = /active/i.test(s.status) || (s.start ? s.start <= now : true);
      if (!active && (!s.start || s.start > until)) continue;
      const t = streetFromTitle(s.texts); const [measure, sev] = measureOf(s.texts, s.what);
      items.push({ id: s.id, kind: s.kind, closed: sev === 'red', active, start: s.start, end: s.end, road: s.road, street: s.street || (t && t.street) || '', work: (t && t.work) || '',
        measure, sev, traject: trajectOf(s.texts), texts: s.texts, what: s.what, diversion: s.diversion, km: Math.round(d * 10) / 10, pts: s.pts.length ? [s.pts[0], s.pts[s.pts.length - 1]] : [] });
    }
    // dubbele meldingen (zelfde weg, zelfde periode, zelfde tekst) uit verschillende bestanden samenvoegen
    const seen = new Set(); const list = items.filter(x => { const k = [x.road, x.street, x.start, x.end, x.texts[0]].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
    // geen straat in de melding: opzoeken bij de coördinaten (begin en eind; verschillend = "A → B")
    await Promise.all(list.slice(0, 80).filter(x => !x.street && !x.road && x.pts.length).map(async x => {
      const a = await streetAt(x.pts[0], this.fetch); const b = x.pts[1] ? await streetAt(x.pts[1], this.fetch) : '';
      x.street = a && b && a !== b ? `${a} → ${b}` : a || b || '';
    }));
    list.sort((a, b) => (b.active - a.active) || (b.closed - a.closed) || ((a.active ? a.end || 9e15 : a.start || 0) - (b.active ? b.end || 9e15 : b.start || 0)));
    // P2000-meldingen met een afsluiting (en eventueel ongevallen) uit de gekozen plaatsen
    let p2000 = [], p2000Error = null;
    if (this.p2000 && q.p2000 !== '0') {
      try {
        const r = await this.p2000.list(); p2000Error = r.error || null;
        const hours = Math.min(24, Math.max(1, num(q.hours, 3))); const from = now - hours * 3600e3;
        const places = String(q.places || 'Enschede').toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
        const re = q.accidents === '1' ? /af ?sluit|afgesloten|afzet|weg ?dicht|ongeval|aanrijding|wegvervoer|\bvrk\b/i : /af ?sluit|afgesloten|afzet|weg ?dicht/i;
        p2000 = (r.items || []).filter(x => x.t >= from && re.test(x.title + ' ' + x.desc)
          && (!places.length || places.some(p => String(x.place || '').toLowerCase().includes(p) || (x.title + ' ' + x.desc).toLowerCase().includes(p))))
          .map(x => ({ t: x.t, title: x.title, desc: x.desc, place: x.place, kind: x.kind, closed: /af ?sluit|afgesloten|afzet|weg ?dicht/i.test(x.title + ' ' + x.desc) }));
      } catch (e) { p2000Error = String(e.message || e); }
    }
    return { at: now, ndwAt: this.ndwAt, error: this.ndwAt ? null : this.ndwError(), loading: !this.ndwAt && !this.ndwError(), items: list.slice(0, 80).map(({ pts, ...x }) => x), p2000, p2000Error, source: 'NDW' };
  }

  // ---------- tegel Files: eerst ANWB, lukt dat niet dan NDW ----------
  async jams() {
    const now = Date.now();
    if (!this.anwb || now - this.anwb.at > 2 * 60e3) {
      try {
        const r = await this.fetch(ANWB_JAMS, { headers: { ...UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`ANWB gaf ${r.status}`);
        const list = anwbParse(await r.json());
        this.anwb = { at: now, ok: now, list, error: null };
      } catch (e) { this.anwb = { ...(this.anwb || {}), at: now, error: String(e.message || e) }; }
    }
    if (this.anwb.ok && now - this.anwb.ok < 15 * 60e3) return { at: now, source: 'ANWB', items: this.anwb.list, stale: !!this.anwb.error };
    // reserve: NDW (actuele incidenten en afsluitingen op A- en N-wegen)
    await this.ask();
    const items = [];
    for (const s of this.sits.values()) {
      if (!/^[AN]\d+/i.test(s.road) || /suspended|planned/i.test(s.status)) continue;
      if (s.start && s.start > now) continue; if (s.end && s.end < now) continue;
      if (!(s.closed || s.kind === 'incident')) continue;
      const p = s.pts[0] || null;
      items.push({ id: s.id, road: s.road.toUpperCase(), from: s.street || '', to: '', km: null, delay: null, reason: s.texts[0] || s.what.join(', '), type: s.closed ? 'afsluiting' : 'file', start: s.start, end: s.end, pt: p, prov: provinceOf(p) });
    }
    return { at: now, source: 'NDW', anwbError: this.anwb.error, items, error: items.length || this.ndwAt ? null : this.ndwError() || 'ANWB en NDW nu niet bereikbaar', loading: !this.ndwAt && !this.ndwError() };
  }
}

module.exports = { Weg, situation, anwbParse, provinceOf, readNdw, streetFromTitle, measureOf, trajectOf };
