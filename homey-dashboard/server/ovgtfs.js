'use strict';
// Reservebron voor de NS-tegel: de open OV-data van OVapi (GTFS-NL + live-updates), zonder sleutel.
// Wordt alleen gebruikt als NS zelf geen vertrektijden geeft.
//  - Dienstregeling: gtfs-nl.zip (~240 MB). Wordt pas opgehaald zodra NS een keer faalt, daarna elke nacht
//    opnieuw. Alleen de treinen van de gekozen stations worden bewaard (data/gtfs/station-<code>.json).
//  - Live: trainUpdates.pb (GTFS-realtime), hooguit eens per 2 minuten en alleen zolang de reserve nodig is.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');

const BASE = (process.env.OVGTFS_BASE || 'http://gtfs.ovapi.nl/nl').replace(/\/$/, '');
const UA = { 'User-Agent': 'HomeyDashboard/1.0 (eigen dashboard; NAS)' };
const DAY = 864e5;

// ---------- zip lezen vanaf schijf (ook grote bestanden, stroomsgewijs uitpakken) ----------
function zipIndex(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size; const tail = Math.min(size, 70000);
    const buf = Buffer.alloc(tail); fs.readSync(fd, buf, 0, tail, size - tail);
    let e = tail - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
    if (e < 0) throw new Error('Geen geldige zip (dienstregeling)');
    let count = buf.readUInt16LE(e + 10), cdSize = buf.readUInt32LE(e + 12), cdOff = buf.readUInt32LE(e + 16);
    if (cdOff === 0xffffffff || count === 0xffff) { // zip64
      const l = e - 20; if (l >= 0 && buf.readUInt32LE(l) === 0x07064b50) {
        const z64 = Number(buf.readBigUInt64LE(l + 8)); const zb = Buffer.alloc(56); fs.readSync(fd, zb, 0, 56, z64);
        count = Number(zb.readBigUInt64LE(32)); cdSize = Number(zb.readBigUInt64LE(40)); cdOff = Number(zb.readBigUInt64LE(48));
      }
    }
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const out = {}; let p = 0;
    for (let i = 0; i < count && p < cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10); let csize = cd.readUInt32LE(p + 20); let usize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28), xlen = cd.readUInt16LE(p + 30), clen = cd.readUInt16LE(p + 32); let lho = cd.readUInt32LE(p + 42);
      const name = cd.slice(p + 46, p + 46 + nlen).toString('utf8');
      let x = p + 46 + nlen; const xe = x + xlen;
      while (x + 4 <= xe) { const id = cd.readUInt16LE(x), sz = cd.readUInt16LE(x + 2); if (id === 1) { let q = x + 4; if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; } if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; } if (lho === 0xffffffff) { lho = Number(cd.readBigUInt64LE(q)); } } x += 4 + sz; }
      out[name.split('/').pop()] = { method, csize, lho };
      p = xe + clen;
    }
    out._fd = null; out._file = file; return out;
  } finally { fs.closeSync(fd); }
}
function entryStream(idx, name) {
  const en = idx[name]; if (!en) return null;
  const fd = fs.openSync(idx._file, 'r'); const h = Buffer.alloc(30); fs.readSync(fd, h, 0, 30, en.lho); fs.closeSync(fd);
  const start = en.lho + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  const raw = fs.createReadStream(idx._file, { start, end: start + en.csize - 1, highWaterMark: 1 << 20 });
  return en.method === 0 ? raw : raw.pipe(zlib.createInflateRaw());
}
// regel voor regel (met kopregel); onLine(fields, header) of snelle voorselectie via pre(line)
function eachLine(stream, onLine, pre) {
  return new Promise((resolve, reject) => {
    let rest = '', header = null;
    const parse = line => {
      if (line.endsWith('\r')) line = line.slice(0, -1); if (!line) return;
      if (!header) { header = csv(line.replace(/^﻿/, '')); return; }
      if (pre && !pre(line)) return;
      onLine(csv(line), header);
    };
    stream.setEncoding('utf8');
    stream.on('data', chunk => { const s = rest + chunk; const parts = s.split('\n'); rest = parts.pop(); for (const l of parts) parse(l); });
    stream.on('end', () => { if (rest) parse(rest); resolve(); });
    stream.on('error', reject);
  });
}
function csv(line) {
  if (line.indexOf('"') < 0) return line.split(',');
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
const col = (h, n) => h.indexOf(n);

// ---------- protobuf (GTFS-realtime) zonder extra onderdelen ----------
function pbRead(buf, s = 0, e = buf.length) {
  const out = []; let p = s;
  const varint = () => { let r = 0, mul = 1, b, n = 0; const st = p; do { b = buf[p++]; r += (b & 0x7f) * mul; mul *= 128; n++; } while (b & 0x80 && p < e); if (n >= 10) { // negatief getal (int32/int64)
      let big = 0n; for (let i = 0; i < n; i++) big |= BigInt(buf[st + i] & 0x7f) << BigInt(7 * i); return Number(BigInt.asIntN(64, big)); }
    return r; };
  while (p < e) {
    const key = varint(); const f = Math.floor(key / 8), t = key & 7;
    if (t === 0) out.push({ f, t, v: varint() });
    else if (t === 2) { const len = varint(); out.push({ f, t, s: p, e: p + len }); p += len; }
    else if (t === 1) { out.push({ f, t, v: buf.readDoubleLE(p) }); p += 8; }
    else if (t === 5) { out.push({ f, t, v: buf.readUInt32LE(p) }); p += 4; }
    else break;
  }
  return out;
}
const pbStr = (buf, x) => buf.toString('utf8', x.s, x.e);
const pbOne = (fields, f) => fields.find(x => x.f === f);
// strings uit een extensie (OVapi zet daar o.a. treinnummer en spoor)
const extStrings = (buf, fields) => fields.filter(x => x.f >= 1000 && x.t === 2).flatMap(x => pbRead(buf, x.s, x.e).filter(y => y.t === 2).map(y => ({ f: y.f, v: pbStr(buf, y) })));
function decodeTripUpdates(buf, wanted) {
  const res = new Map();
  for (const ent of pbRead(buf).filter(x => x.f === 2 && x.t === 2)) {
    const tu = pbOne(pbRead(buf, ent.s, ent.e), 3); if (!tu) continue;
    const tuf = pbRead(buf, tu.s, tu.e); const td = pbOne(tuf, 1); if (!td) continue;
    const tdf = pbRead(buf, td.s, td.e);
    const tripId = pbOne(tdf, 1) ? pbStr(buf, pbOne(tdf, 1)) : '';
    const ext = extStrings(buf, tdf).map(x => x.v);
    const keys = [tripId, ...ext].filter(Boolean);
    const hit = keys.find(k => wanted.has(k)); if (!hit) continue;
    const rel = pbOne(tdf, 4) ? pbOne(tdf, 4).v : 0;
    const stus = tuf.filter(x => x.f === 2 && x.t === 2).map(x => {
      const sf = pbRead(buf, x.s, x.e); const ev = n => { const o = pbOne(sf, n); if (!o) return null; const ef = pbRead(buf, o.s, o.e); return { delay: pbOne(ef, 1) ? pbOne(ef, 1).v : null, time: pbOne(ef, 2) ? pbOne(ef, 2).v : null }; };
      const tracks = extStrings(buf, sf).map(y => y.v).filter(v => /^\d{1,2}[a-z]?$/i.test(v));
      return { seq: pbOne(sf, 1) ? pbOne(sf, 1).v : null, stopId: pbOne(sf, 4) ? pbStr(buf, pbOne(sf, 4)) : '', arr: ev(2), dep: ev(3), skipped: (pbOne(sf, 5) || {}).v === 1, track: tracks.length ? tracks[tracks.length - 1] : '' };
    });
    res.set(hit, { cancelled: rel === 3, stus, delay: pbOne(tuf, 5) ? pbOne(tuf, 5).v : null });
  }
  return res;
}

const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const secs = t => { const m = /^(\d+):(\d\d):(\d\d)$/.exec(String(t || '').trim()); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
const dayStart = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); // middernacht lokale tijd (TZ van de container)

class OvGtfs {
  constructor({ dataDir }) {
    this.dir = path.join(dataDir, 'gtfs'); fs.mkdirSync(this.dir, { recursive: true });
    this.zip = path.join(this.dir, 'gtfs-nl.zip');
    this.metaFile = path.join(this.dir, 'meta.json');
    this.meta = {}; try { this.meta = JSON.parse(fs.readFileSync(this.metaFile, 'utf8')); } catch (e) { this.meta = { stations: {} }; }
    this.meta.stations = this.meta.stations || {};
    this.busy = null; this.status = 'niet nodig'; this.rt = null; this.rtAt = 0; this.rtErr = null;
    // elke nacht (rond 4 uur) bijwerken, maar alleen als de reservebron al eens nodig was
    setInterval(() => { const h = new Date().getHours(); if (h === 4 && Object.keys(this.meta.stations).length && Date.now() - (this.meta.builtAt || 0) > 20 * 3600e3) this.prepare(Object.keys(this.meta.stations).map(c => ({ code: c, name: this.meta.stations[c].name }))).catch(() => {}); }, 30 * 60e3);
  }
  saveMeta() { try { fs.writeFileSync(this.metaFile, JSON.stringify(this.meta, null, 1)); } catch (e) { /* */ } }
  stationFile(code) { return path.join(this.dir, `station-${code}.json`); }
  info() { return { status: this.status, builtAt: this.meta.builtAt || null, zipDate: this.meta.zipDate || null, stations: this.meta.stations, realtimeAt: this.rtAt || null, realtimeError: this.rtErr }; }

  async download() {
    this.status = 'dienstregeling ophalen (± 240 MB)…';
    const head = await fetch(BASE + '/gtfs-nl.zip', { method: 'HEAD', headers: UA, signal: AbortSignal.timeout(20000) }).catch(() => null);
    const lm = head && head.ok ? head.headers.get('last-modified') : null;
    if (lm && lm === this.meta.zipDate && fs.existsSync(this.zip)) return false; // niets nieuws
    const r = await fetch(BASE + '/gtfs-nl.zip', { headers: UA, signal: AbortSignal.timeout(30 * 60e3) });
    if (!r.ok || !r.body) throw new Error(`gtfs.ovapi.nl gaf ${r.status}`);
    const tmp = this.zip + '.tmp';
    await new Promise((res, rej) => { const w = fs.createWriteStream(tmp); Readable.fromWeb(r.body).pipe(w).on('finish', res).on('error', rej); });
    fs.renameSync(tmp, this.zip); this.meta.zipDate = lm || r.headers.get('last-modified') || new Date().toISOString(); this.saveMeta();
    return true;
  }

  // treinen van de stations uit de dienstregeling halen (gisteren t/m overmorgen)
  async build(stations) {
    this.status = 'dienstregeling doorzoeken…';
    const idx = zipIndex(this.zip);
    // 1. perrons van de stations (spoortreinen: route_type 2 controleren we bij de ritten)
    const want = new Map(); // stop_id -> { code, track }
    await eachLine(entryStream(idx, 'stops.txt'), (f, h) => {
      const id = f[col(h, 'stop_id')], name = (f[col(h, 'stop_name')] || '').trim().toLowerCase(), zone = (f[col(h, 'zone_id')] || '').toLowerCase();
      const plat = f[col(h, 'platform_code')] || '';
      for (const s of stations) if (zone === 'iff:' + s.code.toLowerCase() || (name === s.name.toLowerCase())) want.set(id, { code: s.code, track: plat });
    });
    // 2. vertrekken bij die perrons
    const rows = []; const tripIds = new Set(); let iTrip, iStop, iDep, iSeq, iPick;
    await eachLine(entryStream(idx, 'stop_times.txt'), (f, h) => {
      if (iTrip == null) { iTrip = col(h, 'trip_id'); iStop = col(h, 'stop_id'); iDep = col(h, 'departure_time'); iSeq = col(h, 'stop_sequence'); iPick = col(h, 'pickup_type'); }
      const st = want.get(f[iStop]); if (!st) return;
      if (iPick >= 0 && f[iPick] === '1') return; // niet instappen = geen vertrek
      rows.push({ trip: f[iTrip], stopId: f[iStop], code: st.code, track: st.track, dep: secs(f[iDep]), seq: +f[iSeq] }); tripIds.add(f[iTrip]);
    }, line => { for (const id of want.keys()) if (line.includes(id)) return true; return false; });
    // 3. ritten, lijnen en rijdagen
    const trips = new Map(); const services = new Set(); const routesWanted = new Set();
    await eachLine(entryStream(idx, 'trips.txt'), (f, h) => {
      const id = f[col(h, 'trip_id')]; if (!tripIds.has(id)) return;
      const t = { route: f[col(h, 'route_id')], service: f[col(h, 'service_id')], dest: f[col(h, 'trip_headsign')] || '', num: f[col(h, 'trip_short_name')] || '', rt: col(h, 'realtime_trip_id') >= 0 ? f[col(h, 'realtime_trip_id')] : '' };
      trips.set(id, t); services.add(t.service); routesWanted.add(t.route);
    });
    const routes = new Map();
    await eachLine(entryStream(idx, 'routes.txt'), (f, h) => {
      const id = f[col(h, 'route_id')]; if (!routesWanted.has(id)) return;
      routes.set(id, { type: +f[col(h, 'route_type')], name: f[col(h, 'route_long_name')] || f[col(h, 'route_short_name')] || '', agency: f[col(h, 'agency_id')] || '' });
    });
    const today = new Date(); const days = [-1, 0, 1, 2].map(n => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)));
    const runs = new Map(); // service -> Set(dates)
    if (idx['calendar_dates.txt']) await eachLine(entryStream(idx, 'calendar_dates.txt'), (f, h) => {
      const s = f[col(h, 'service_id')], d = f[col(h, 'date')]; if (!services.has(s) || !days.includes(d)) return;
      if (!runs.has(s)) runs.set(s, new Set()); if (f[col(h, 'exception_type')] === '1') runs.get(s).add(d); else runs.get(s).delete(d);
    });
    // 4. per station opslaan
    const per = {};
    for (const r of rows) {
      const t = trips.get(r.trip); if (!t) continue; const ro = routes.get(t.route) || {};
      if (ro.type != null && ro.type !== 2 && !(ro.type >= 100 && ro.type < 200)) continue; // alleen treinen
      for (const d of runs.get(t.service) || []) {
        const at = dayStart(d).getTime() + r.dep * 1000;
        (per[r.code] = per[r.code] || []).push({ trip: r.trip, rt: t.rt, num: t.num, date: d, at, dest: t.dest, kind: ro.name, agency: ro.agency, track: r.track, stopId: r.stopId, seq: r.seq });
      }
    }
    for (const s of stations) {
      const list = (per[s.code] || []).sort((a, b) => a.at - b.at);
      fs.writeFileSync(this.stationFile(s.code), JSON.stringify({ builtAt: Date.now(), list }));
      this.meta.stations[s.code] = { name: s.name, count: list.length };
    }
    this.meta.builtAt = Date.now(); this.saveMeta();
    this.status = 'klaar';
  }

  prepare(stations) {
    if (this.busy) return this.busy;
    if (this.failAt && Date.now() - this.failAt < 15 * 60e3) return Promise.reject(new Error(this.lastErr)); // na een fout 15 min wachten
    this.busy = (async () => {
      try { await this.download(); await this.build(stations); this.failAt = 0; this.lastErr = null; }
      catch (e) { this.failAt = Date.now(); this.lastErr = String(e.message || e); this.status = 'fout: ' + (e.message || e); console.error('[ovgtfs]', e.message || e); throw e; }
      finally { this.busy = null; }
    })();
    return this.busy;
  }

  async realtime(wanted) {
    if (this.rt && Date.now() - this.rtAt < 120e3) return this.rt;
    try {
      const r = await fetch(BASE + '/trainUpdates.pb', { headers: UA, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`gtfs.ovapi.nl gaf ${r.status}`);
      this.rt = decodeTripUpdates(Buffer.from(await r.arrayBuffer()), wanted); this.rtAt = Date.now(); this.rtErr = null;
    } catch (e) { this.rtErr = String(e.message || e); if (!this.rt) this.rt = new Map(); }
    return this.rt;
  }

  // vertrektijden in hetzelfde formaat als de NS-tegel verwacht
  async departures(code, name) {
    const f = this.stationFile(code);
    const fresh = this.meta.stations[code] && Date.now() - (this.meta.builtAt || 0) < 30 * 3600e3 && fs.existsSync(f);
    if (!fresh) {
      this.prepare([...Object.entries(this.meta.stations).map(([c, v]) => ({ code: c, name: v.name })).filter(s => s.code !== code), { code, name }]).catch(() => {});
      if (!fs.existsSync(f)) throw Object.assign(new Error(this.busy ? 'Reservebron wordt voorbereid (de eerste keer duurt dit een paar minuten)…' : `Reservebron nog niet beschikbaar (${this.lastErr || 'onbekend'}); nieuwe poging over een kwartier.`), { preparing: true });
    }
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const now = Date.now();
    const soon = data.list.filter(x => x.at > now - 30 * 60e3 && x.at < now + 3 * 3600e3);
    const wanted = new Set(soon.flatMap(x => [x.trip, x.rt].filter(Boolean)));
    const rt = await this.realtime(wanted);
    const deps = soon.map(x => {
      const u = rt.get(x.trip) || (x.rt && rt.get(x.rt));
      let delay = 0, track = x.track, cancelled = false;
      if (u) {
        cancelled = u.cancelled;
        const s = u.stus.find(y => y.stopId === x.stopId) || u.stus.find(y => y.seq === x.seq) || null;
        const ev = s && (s.dep || s.arr);
        if (ev) delay = ev.time ? Math.round((ev.time * 1000 - x.at) / 6e4) : ev.delay != null ? Math.round(ev.delay / 60) : 0;
        else if (u.delay != null) delay = Math.round(u.delay / 60);
        if (s && s.skipped) cancelled = true;
        if (s && s.track) track = s.track;
      }
      return { planned: new Date(x.at).toISOString(), actual: new Date(x.at + Math.max(0, delay) * 6e4).toISOString(), delay: Math.max(0, delay), dest: x.dest, via: [], track, trackChanged: !!(track && x.track && track !== x.track), kind: x.kind, short: '', operator: String(x.agency || '').replace(/^IFF:/i, ''), cancelled, note: '', live: !!u };
    }).filter(d => new Date(d.actual).getTime() > now - 60e3).slice(0, 25);
    return { at: now, station: code, departures: deps, source: 'ovdata', liveAt: this.rtAt || null };
  }
}

module.exports = { OvGtfs, decodeTripUpdates, zipIndex, csv };
