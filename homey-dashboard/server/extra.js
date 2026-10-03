'use strict';
// Gegevens van buiten (weer, regen, stroomprijs, afval, agenda, OV, reistijd) en van de NAS/Homey
// voor de extra tegels. Alles wordt hier op de NAS opgehaald en kort bewaard (cache), zodat de
// tablet zelf geen andere sites hoeft te benaderen en wachtwoorden/sleutels op de NAS blijven.
const fs = require('fs');
const path = require('path');

const UA = { 'User-Agent': 'HomeyDashboard/1.0 (eigen dashboard; NAS)' };
const cache = new Map();
async function cached(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ms) return c.v;
  try { const v = await fn(); cache.set(key, { at: Date.now(), v }); return v; }
  catch (e) { if (c) return { ...c.v, stale: true }; throw e; }
}
async function get(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} gaf ${r.status}`);
  return opt.text ? r.text() : r.json();
}
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const ymd = d => d.toISOString().slice(0, 10);

class Extra {
  constructor({ homey, dataDir, broadcast }) {
    this.homey = homey; this.broadcast = broadcast;
    this.secFile = path.join(dataDir, 'extra-geheim.json');   // wachtwoorden en sleutels: blijven op de NAS
    this.notesFile = path.join(dataDir, 'notities.json');
  }
  secrets() { try { return JSON.parse(fs.readFileSync(this.secFile, 'utf8')); } catch (e) { return {}; } }
  saveSecrets(o) { fs.writeFileSync(this.secFile, JSON.stringify(o, null, 1)); }

  // ---------- Buienradar: regen komende 2 uur ----------
  rain(lat, lon) {
    lat = num(lat, 52.22).toFixed(2); lon = num(lon, 6.89).toFixed(2);
    return cached(`rain:${lat},${lon}`, 4 * 60e3, async () => {
      const txt = await get(`https://gpsgadget.buienradar.nl/data/raintext?lat=${lat}&lon=${lon}`, { text: true });
      const points = txt.trim().split(/\r?\n/).map(l => { const [v, t] = l.split('|'); const n = Number(v); return { t: (t || '').trim(), mm: n > 0 ? Math.round(Math.pow(10, (n - 109) / 32) * 100) / 100 : 0 }; }).filter(p => p.t);
      return { at: Date.now(), points };
    });
  }

  // ---------- Open-Meteo: weer en luchtkwaliteit/pollen ----------
  weather(lat, lon) {
    lat = num(lat, 52.22).toFixed(2); lon = num(lon, 6.89).toFixed(2);
    return cached(`wx:${lat},${lon}`, 15 * 60e3, async () => {
      const j = await get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset&timezone=Europe%2FAmsterdam&forecast_days=7`);
      return { at: Date.now(), current: j.current, daily: j.daily };
    });
  }
  air(lat, lon) {
    lat = num(lat, 52.22).toFixed(2); lon = num(lon, 6.89).toFixed(2);
    return cached(`air:${lat},${lon}`, 30 * 60e3, async () => {
      const j = await get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen&timezone=Europe%2FAmsterdam`);
      return { at: Date.now(), current: j.current };
    });
  }

  // ---------- EnergyZero: dynamische stroomprijs per uur (incl. btw) ----------
  price() {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const d1 = new Date(d0.getTime() + 2 * 864e5 - 1);
    return cached(`price:${ymd(d0)}`, 30 * 60e3, async () => {
      const j = await get(`https://api.energyzero.nl/v1/energyprices?fromDate=${d0.toISOString()}&tillDate=${d1.toISOString()}&interval=4&usageType=1&inclBtw=true`);
      return { at: Date.now(), prices: (j.Prices || []).map(p => ({ t: p.readingDate, p: p.price })), average: j.average };
    });
  }

  // ---------- Afvalkalender (Ximmio, standaard Twente Milieu) ----------
  async waste({ postcode, nr, letter, company }) {
    postcode = String(postcode || '').replace(/\s/g, '').toUpperCase(); nr = String(nr || '').trim();
    if (!/^\d{4}[A-Z]{2}$/.test(postcode) || !/^\d+$/.test(nr)) throw new Error('Vul postcode en huisnummer in bij Tegel');
    const code = company || '8d97bb56-5afd-4cbc-a651-b4f7314264b4'; // Twente Milieu
    const base = 'https://twentemilieuapi.ximmio.com/api/';
    return cached(`waste:${code}:${postcode}:${nr}:${letter || ''}`, 12 * 3600e3, async () => {
      const post = (p, body) => get(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const a = await post('FetchAdress', { companyCode: code, postCode: postcode, houseNumber: nr, houseLetter: letter || '' });
      const id = a && a.dataList && a.dataList[0] && a.dataList[0].UniqueId;
      if (!id) throw new Error('Adres niet gevonden bij de afvalinzamelaar');
      const now = new Date(); const end = new Date(now.getTime() + 60 * 864e5);
      const c = await post('GetCalendar', { companyCode: code, uniqueAddressID: id, startDate: ymd(now), endDate: ymd(end) });
      const NL = { GREY: 'Restafval', GREEN: 'GFT', PAPER: 'Papier', PACKAGES: 'PMD', TREE: 'Kerstboom', TEXTILE: 'Textiel' };
      const items = [];
      for (const x of (c && c.dataList) || []) for (const d of x.pickupDates || []) items.push({ date: String(d).slice(0, 10), type: x._pickupTypeText, name: NL[x._pickupTypeText] || x._pickupTypeText });
      items.sort((p, q) => p.date.localeCompare(q.date));
      return { at: Date.now(), items };
    });
  }

  // ---------- Agenda: iCal-adres (Google "geheim adres in iCal-indeling", iCloud openbare agenda) ----------
  async ical(urls) {
    const list = [].concat(urls || []).map(u => String(u).trim().replace(/^webcal:/i, 'https:')).filter(u => /^https?:\/\//i.test(u)).slice(0, 5);
    if (!list.length) throw new Error('Vul bij Tegel het iCal-adres van je agenda in');
    const all = [];
    for (const u of list) {
      const evs = await cached('ical:' + u, 15 * 60e3, async () => ({ at: Date.now(), ev: parseIcal(await get(u, { text: true })) }));
      all.push(...evs.ev);
    }
    const from = Date.now() - 6 * 3600e3, to = Date.now() + 60 * 864e5;
    return { at: Date.now(), events: all.filter(e => e.end >= from && e.start <= to).sort((a, b) => a.start - b.start).slice(0, 50) };
  }

  // ---------- OV: haltes en vertrektijden (OVapi, bus/tram/metro; geen NS-treinen) ----------
  async ovSearch(q) {
    q = String(q || '').toLowerCase().trim(); if (q.length < 3) return [];
    const all = await cached('ov:areas', 24 * 3600e3, async () => ({ at: Date.now(), a: await get('http://v0.ovapi.nl/stopareacode/') }));
    const out = [];
    for (const [code, s] of Object.entries(all.a || {})) {
      const name = `${s.TimingPointTown || ''}, ${s.TimingPointName || ''}`;
      if (name.toLowerCase().includes(q)) out.push({ code, name });
      if (out.length >= 30) break;
    }
    return out;
  }
  ovDepartures(code) {
    code = String(code || ''); if (!/^[\w:-]+$/.test(code)) throw new Error('Kies een halte bij Tegel');
    return cached('ov:' + code, 30e3, async () => {
      const j = await get('http://v0.ovapi.nl/stopareacode/' + encodeURIComponent(code));
      const out = [];
      for (const area of Object.values(j || {})) for (const tpc of Object.values(area || {})) for (const p of Object.values((tpc && tpc.Passes) || {})) {
        out.push({ line: p.LinePublicNumber, dest: p.DestinationName50, type: p.TransportType, planned: p.TargetDepartureTime, expected: p.ExpectedDepartureTime, status: p.TripStopStatus });
      }
      out.sort((a, b) => String(a.expected).localeCompare(String(b.expected)));
      return { at: Date.now(), departures: out.filter(x => new Date(x.expected).getTime() > Date.now() - 60e3).slice(0, 20) };
    });
  }

  // ---------- Reistijd: OpenStreetMap (zonder files) of TomTom (met files, eigen gratis sleutel) ----------
  async geocode(q) {
    return cached('geo:' + q, 30 * 864e5, async () => {
      const j = await get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nl,be,de&q=${encodeURIComponent(q)}`);
      if (!j[0]) throw new Error('Adres niet gevonden: ' + q);
      return { lat: Number(j[0].lat), lon: Number(j[0].lon), name: j[0].display_name };
    });
  }
  async travel({ from, to, tileId }) {
    if (!to) throw new Error('Vul bij Tegel het adres van je werk in');
    const a = typeof from === 'object' ? from : await this.geocode(from); const b = await this.geocode(to);
    const key = (this.secrets().tomtom || '').trim();
    return cached(`travel:${a.lat},${a.lon}:${b.lat},${b.lon}:${key ? 1 : 0}`, 5 * 60e3, async () => {
      if (key) {
        const j = await get(`https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?traffic=true&key=${encodeURIComponent(key)}`);
        const s = j.routes[0].summary;
        return { at: Date.now(), sec: s.travelTimeInSeconds, delay: s.trafficDelayInSeconds, km: s.lengthInMeters / 1000, traffic: true };
      }
      const j = await get(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
      const r = j.routes && j.routes[0]; if (!r) throw new Error('Geen route gevonden');
      return { at: Date.now(), sec: r.duration, delay: null, km: r.distance / 1000, traffic: false };
    });
  }

  // ---------- NAS (Synology DSM) ----------
  async nas() {
    const s = this.secrets().nas || {};
    if (!s.url || !s.user) throw new Error('Stel bij Tegel het NAS-account in');
    return cached('nas', 60e3, async () => {
      const base = s.url.replace(/\/$/, '') + '/webapi/';
      const login = await get(`${base}auth.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(s.user)}&passwd=${encodeURIComponent(s.pass || '')}&session=HomeyDashboard&format=sid`);
      if (!login.success) throw new Error('Inloggen op de NAS lukt niet (controleer gebruiker en wachtwoord; tweestapsverificatie moet uit)');
      const sid = login.data.sid; const q = (api, ver, method) => get(`${base}entry.cgi?api=${api}&version=${ver}&method=${method}&_sid=${sid}`).catch(() => null);
      const [info, util, stor] = await Promise.all([q('SYNO.Core.System', 1, 'info'), q('SYNO.Core.System.Utilization', 1, 'get'), q('SYNO.Storage.CGI.Storage', 1, 'load_info')]);
      get(`${base}auth.cgi?api=SYNO.API.Auth&version=6&method=logout&session=HomeyDashboard&_sid=${sid}`).catch(() => {});
      const I = (info && info.data) || {}, U = (util && util.data) || {}, S = (stor && stor.data) || {};
      return {
        at: Date.now(), model: I.model, temp: I.sys_temp, uptime: I.up_time, version: I.firmware_ver,
        cpu: U.cpu ? (U.cpu.user_load || 0) + (U.cpu.system_load || 0) : null, mem: U.memory ? U.memory.real_usage : null,
        volumes: (S.volumes || []).map(v => ({ name: v.display_name || v.id, used: Number(v.size && v.size.used), total: Number(v.size && v.size.total), status: v.status })),
        disks: (S.disks || []).map(d => ({ name: d.longName || d.name, temp: d.temp, status: d.status })),
      };
    });
  }
  setNas({ url, user, pass }) { const o = this.secrets(); o.nas = { url: String(url || ''), user: String(user || ''), pass: pass === undefined ? (o.nas || {}).pass : String(pass) }; this.saveSecrets(o); cache.delete('nas'); }
  setKey(name, value) { const o = this.secrets(); o[name] = String(value || ''); this.saveSecrets(o); }
  hasSecrets() { const o = this.secrets(); return { nas: !!(o.nas && o.nas.user), nasUser: (o.nas && o.nas.user) || '', nasUrl: (o.nas && o.nas.url) || '', tomtom: !!o.tomtom, ns: !!o.ns }; }

  // ---------- Homey-status ----------
  async homeyInfo() {
    const api = this.homey.api;
    if (!api) { const l = this.homey.library ? this.homey.library() : {}; return { at: Date.now(), demo: true, apps: (l.apps || []).length, devices: (l.devices || []).length }; }
    return cached('homeyinfo', 60e3, async () => {
      const safe = p => p.catch(() => null);
      const [info, mem, sto] = await Promise.all([safe(api.system.getInfo()), safe(api.system.getMemoryInfo ? api.system.getMemoryInfo() : Promise.resolve(null)), safe(api.system.getStorageInfo ? api.system.getStorageInfo() : Promise.resolve(null))]);
      const l = this.homey.library();
      return { at: Date.now(), version: info && (info.homeyVersion || info.homey_version), model: info && (info.homeyModelName || info.homeyModelId), uptime: info && info.uptime,
        memUsed: mem && (mem.total - (mem.free || 0)), memTotal: mem && mem.total, stoUsed: sto && (sto.total - (sto.free || 0)), stoTotal: sto && sto.total,
        apps: (l.apps || []).length, devices: (l.devices || []).length, flows: (l.flows || []).length + (l.advancedFlows || []).length, link: this.homey.link || null };
    });
  }

  // ---------- notities en boodschappen (gedeeld tussen alle schermen) ----------
  notes(id) { try { return (JSON.parse(fs.readFileSync(this.notesFile, 'utf8'))[id]) || []; } catch (e) { return []; } }
  setNotes(id, list) {
    let all = {}; try { all = JSON.parse(fs.readFileSync(this.notesFile, 'utf8')); } catch (e) { /* nieuw */ }
    all[id] = (Array.isArray(list) ? list : []).slice(0, 200).map(x => ({ id: String(x.id || Math.random().toString(36).slice(2, 9)), text: String(x.text || '').slice(0, 200), done: !!x.done }));
    fs.writeFileSync(this.notesFile, JSON.stringify(all, null, 1));
    this.broadcast('notes', { id, list: all[id] });
    return all[id];
  }
}

// ---------- eenvoudige iCal-lezer ----------
// VEVENT met DTSTART/DTEND/SUMMARY/LOCATION; herhalen dagelijks/wekelijks/maandelijks/jaarlijks,
// ook op meerdere weekdagen (BYDAY=MO,WE,FR) en "2e dinsdag van de maand" (BYDAY=2TU).
// Afgezegde keren (EXDATE), verplaatste keren (RECURRENCE-ID) en geannuleerde afspraken worden overgeslagen.
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseIcal(txt, now = Date.now()) {
  const lines = String(txt).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const dt = v => {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(v || ''); if (!m) return null;
    if (!m[4]) return { t: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), allDay: true };
    return { t: m[7] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(), allDay: false };
  };
  const unesc = s => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');

  // 1. alle afspraken inlezen
  const raw = []; let ev = null;
  for (const l of lines) {
    if (l === 'BEGIN:VEVENT') { ev = { ex: [] }; continue; }
    if (l === 'END:VEVENT') { if (ev && ev.start) raw.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = l.indexOf(':'); if (i < 0) continue;
    const key = l.slice(0, i).split(';')[0].toUpperCase(); const val = l.slice(i + 1);
    if (key === 'DTSTART') ev.start = dt(val); else if (key === 'DTEND') ev.end = dt(val);
    else if (key === 'SUMMARY') ev.summary = val; else if (key === 'LOCATION') ev.location = val; else if (key === 'RRULE') ev.rrule = val;
    else if (key === 'UID') ev.uid = val; else if (key === 'STATUS') ev.status = val.toUpperCase();
    else if (key === 'RECURRENCE-ID') ev.recur = dt(val);
    else if (key === 'EXDATE') for (const v of val.split(',')) { const d = dt(v.trim()); if (d) ev.ex.push(d.t); }
  }
  // 2. keren die apart zijn aangepast of verplaatst: die komen niet uit de reeks maar uit hun eigen VEVENT
  const moved = new Map();
  for (const e of raw) if (e.uid && e.recur) { if (!moved.has(e.uid)) moved.set(e.uid, new Set()); moved.get(e.uid).add(e.recur.t); }

  // 3. uitschrijven
  const out = []; const horizon = now + 90 * 864e5;
  for (const e of raw) {
    if (e.status === 'CANCELLED') continue;
    const s = e.start, en = e.end || { t: s.t + (s.allDay ? 864e5 : 3600e3) };
    const base = { title: unesc(e.summary) || '(geen titel)', where: unesc(e.location), allDay: s.allDay };
    const dur = en.t - s.t;
    const freq = (/FREQ=(\w+)/.exec(e.rrule || '') || [])[1];
    if (e.recur || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) { out.push({ ...base, start: s.t, end: en.t }); continue; }
    const rr = e.rrule;
    const until = (/UNTIL=(\w+)/.exec(rr) || [])[1]; const lim = until ? ((dt(until) || {}).t ?? Infinity) : Infinity;
    const count = Number((/COUNT=(\d+)/.exec(rr) || [])[1]) || Infinity;
    const iv = Number((/INTERVAL=(\d+)/.exec(rr) || [])[1]) || 1;
    const byday = ((/BYDAY=([^;]+)/.exec(rr) || [])[1] || '').split(',').map(x => /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim())).filter(Boolean).map(m => ({ n: m[1] ? Number(m[1]) : 0, wd: WD[m[2]] }));
    const skip = new Set([...e.ex, ...((e.uid && moved.get(e.uid)) || [])]);
    const d0 = new Date(s.t);
    // alle kandidaten binnen één periode (dag, week, maand of jaar), op volgorde
    const period = p => {
      const d = new Date(d0);
      if (freq === 'DAILY') { d.setDate(d0.getDate() + p * iv); return [d]; }
      if (freq === 'WEEKLY') {
        d.setDate(d0.getDate() + 7 * p * iv);
        if (!byday.length) return [d];
        const mon = new Date(d); mon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // maandag van die week
        return byday.map(b => { const x = new Date(mon); x.setDate(mon.getDate() + ((b.wd + 6) % 7)); return x; }).sort((a, b) => a - b);
      }
      if (freq === 'MONTHLY') {
        d.setDate(1); d.setMonth(d0.getMonth() + p * iv);
        if (!byday.length) { const x = new Date(d); x.setDate(d0.getDate()); return x.getMonth() === d.getMonth() ? [x] : []; }
        const res = [];
        for (const b of byday) {
          const days = []; const x = new Date(d);
          while (x.getMonth() === d.getMonth()) { if (x.getDay() === b.wd) days.push(new Date(x)); x.setDate(x.getDate() + 1); }
          if (!b.n) res.push(...days); else { const pick = b.n > 0 ? days[b.n - 1] : days[days.length + b.n]; if (pick) res.push(pick); }
        }
        return res.sort((a, b) => a - b);
      }
      d.setFullYear(d0.getFullYear() + p * iv); return [d];
    };
    let n = 0;
    for (let p = 0; p < 20000 && n < count; p++) {
      const list = period(p);
      if (list.length && list[0].getTime() > Math.min(lim, horizon)) break;
      for (const d of list) {
        const t = d.getTime();
        if (t < s.t) continue;                 // vóór de eerste keer telt niet mee
        if (t > lim || n >= count) break;
        n++;
        if (skip.has(t)) continue;
        if (t + dur >= now - 864e5 && t <= horizon) out.push({ ...base, start: t, end: t + dur });
      }
    }
  }
  return out;
}

module.exports = { Extra, parseIcal };
