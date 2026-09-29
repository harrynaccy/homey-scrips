'use strict';
// Camera's: beeld ophalen via Synology Surveillance Station, via Homey of rechtstreeks van een
// Reolink-camera. Wachtwoorden staan alleen op de NAS (data/cameras.json), nooit in de browser.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const DEFAULT_SS = process.env.SURVEILLANCE_URL || 'http://192.168.178.79:5000';
const nlErr = (msg, code) => { const e = new Error(msg); e.nl = true; if (code != null) e.code = code; return e; };
const withTimeout = (ms, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('ETIMEDOUT')), ms))]);
// foutcodes bij het inloggen (auth.cgi) en bij de camera-functies (entry.cgi) betekenen iets anders
const AUTH_ERR = { 400: 'verkeerde gebruikersnaam of wachtwoord', 401: 'gebruiker is uitgeschakeld', 402: 'geen rechten', 403: 'deze gebruiker heeft tweestapsverificatie; maak een aparte gebruiker zonder', 404: 'tweestapsverificatie mislukt', 407: 'te veel pogingen, IP tijdelijk geblokkeerd' };
const SS_ERR = { 100: 'onbekende fout', 101: 'ongeldige vraag', 102: 'Surveillance Station is niet gevonden', 103: 'deze functie bestaat niet in jouw versie', 104: 'deze versie wordt niet ondersteund', 105: 'geen toegang (rechten van de gebruiker)', 117: 'geen rechten voor deze camera', 400: 'het ophalen lukte niet', 401: 'ongeldige gegevens', 402: 'de camera staat uit of is niet verbonden', 403: 'onbekende camera', 407: 'te veel pogingen, IP tijdelijk geblokkeerd' };

const reolinkHost = c => String(c.ip).replace(/^https?:\/\//, '').replace(/\/+$/, '');
// gebruiker en wachtwoord in het adres, zonder ze om te zetten (zoals een browser dat doet)
const raw = v => String(v || '').replace(/[&#%+ ?]/g, ch => encodeURIComponent(ch));
const reolinkConn = e => (/EPROTO|SSL|certificate/i.test(e.code || e.message) ? 'geen beveiligde verbinding mogelijk' : /ECONNREFUSED/.test(e.code || e.message) ? 'staat uit' : /ETIMEDOUT/.test(e.message) ? 'geen antwoord' : /EHOSTUNREACH|ENETUNREACH/.test(e.code || '') ? 'camera niet gevonden op dit adres' : e.code || e.message);
const reolinkWhy = d => (/login|password|-6$|-7$/.test(`${d.detail} ${d.rsp}`) ? 'inloggen mislukt: gebruiker of wachtwoord klopt niet'
  : /ability|-9$|-26$/.test(`${d.detail} ${d.rsp}`) ? 'deze gebruiker mag geen momentopnamen maken (geef hem in de Reolink-app de rol Gebruiker of Beheerder)'
    : /max session|-5$/.test(`${d.detail} ${d.rsp}`) ? 'te veel verbindingen met de camera, probeer het zo opnieuw' : `antwoord van de camera: ${d.detail || 'onbekend'}${d.rsp != null ? ' (' + d.rsp + ')' : ''}`);

class Cameras {
  constructor({ homey, dataDir }) {
    this.homey = homey; this.file = path.join(dataDir, 'cameras.json');
    this.sid = null; this.cache = new Map();
  }
  load() { try { return { ss: { url: DEFAULT_SS, user: '', pass: '' }, cams: [], ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch (e) { return { ss: { url: DEFAULT_SS, user: '', pass: '' }, cams: [] }; } }
  saveAll(d) { fs.writeFileSync(this.file, JSON.stringify(d, null, 1)); }
  // voor de browser: zonder wachtwoorden
  list() {
    const d = this.load();
    return { ss: { url: d.ss.url, user: d.ss.user, hasPass: !!d.ss.pass }, cams: d.cams.map(({ pass, ...c }) => ({ ...c, hasPass: !!pass })) };
  }
  get(id) { const c = this.load().cams.find(x => x.id === id); if (!c) throw new Error('Deze camera bestaat niet (meer)'); return c; }

  saveCam(cam) {
    const d = this.load(); const i = d.cams.findIndex(x => x.id === cam.id);
    const old = i >= 0 ? d.cams[i] : {};
    const c = { id: cam.id || 'c' + Date.now().toString(36), name: String(cam.name || 'Camera').slice(0, 40), source: ['ss', 'homey', 'reolink'].includes(cam.source) ? cam.source : 'ss',
      ssId: cam.ssId != null ? String(cam.ssId) : old.ssId, deviceId: cam.deviceId || old.deviceId, imageId: cam.imageId || old.imageId,
      ip: cam.ip != null ? String(cam.ip).trim() : old.ip, user: cam.user != null ? String(cam.user) : old.user, pass: cam.pass ? String(cam.pass) : old.pass, channel: Number(cam.channel || old.channel || 0) };
    if (i >= 0) d.cams[i] = c; else d.cams.push(c);
    this.saveAll(d); this.cache.delete(c.id);
    return { id: c.id };
  }
  removeCam(id) { const d = this.load(); d.cams = d.cams.filter(x => x.id !== id); this.saveAll(d); return { ok: true }; }

  // ---------- Surveillance Station ----------
  async saveSS({ url, user, pass }) {
    const d = this.load();
    d.ss = { url: String(url || DEFAULT_SS).trim().replace(/\/+$/, ''), user: String(user || '').trim(), pass: pass ? String(pass) : d.ss.pass };
    this.saveAll(d); this.sid = null;
    return this.ssCameras();
  }
  async ssCall(params, raw) {
    const { ss } = this.load();
    if (!ss.user || !ss.pass) throw new Error('Vul eerst de gebruiker voor Surveillance Station in (Systeem → Camera\'s)');
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.sid) {
        const q = new URLSearchParams({ api: 'SYNO.API.Auth', method: 'login', version: '6', account: ss.user, passwd: ss.pass, session: 'SurveillanceStation', format: 'sid' });
        const j = await withTimeout(8000, fetch(`${ss.url}/webapi/auth.cgi?${q}`).then(r => r.json()));
        if (!j.success) throw nlErr('Inloggen bij Surveillance Station lukt niet: ' + (AUTH_ERR[j.error && j.error.code] || 'fout ' + (j.error && j.error.code)));
        this.sid = j.data.sid;
      }
      const r = await withTimeout(10000, fetch(`${ss.url}/webapi/entry.cgi?${new URLSearchParams({ ...params, _sid: this.sid })}`));
      const type = r.headers.get('content-type') || '';
      if (raw && !/json/.test(type)) return r;
      const j = await r.json().catch(() => ({ success: false, error: { code: 100 } }));
      if (j.success) return j;
      const code = j.error && j.error.code;
      if ([105, 106, 107, 119].includes(code) && attempt === 0) { this.sid = null; continue; }
      throw nlErr('Surveillance Station: ' + (SS_ERR[code] || 'fout') + ` (code ${code})`, code);
    }
    throw new Error('Surveillance Station: geen toegang');
  }
  // Niet elke versie van Surveillance Station kent dezelfde vraag: probeer ze op volgorde en onthoud wat werkt.
  async apiInfo() {
    if (this.info) return this.info;
    try {
      const { ss } = this.load();
      const q = new URLSearchParams({ api: 'SYNO.API.Info', method: 'query', version: '1', query: 'SYNO.SurveillanceStation.Camera,SYNO.SurveillanceStation.VideoStreaming' });
      const j = await withTimeout(8000, fetch(`${ss.url}/webapi/query.cgi?${q}`).then(r => r.json()));
      this.info = (j && j.data) || {};
    } catch (e) { this.info = {}; }
    return this.info;
  }
  async ssSnapshot(ssId) {
    const info = (await this.apiInfo())['SYNO.SurveillanceStation.Camera'] || {};
    const max = String(info.maxVersion || 9);
    const base = { api: 'SYNO.SurveillanceStation.Camera', method: 'GetSnapshot' };
    const ways = [
      { version: max, id: ssId }, { version: max, id: ssId, profileType: '0' }, { version: max, cameraId: ssId },
      { version: '9', id: ssId }, { version: '8', id: ssId }, { version: '8', cameraId: ssId }, { version: '7', cameraId: ssId },
      { version: '4', cameraId: ssId }, { version: '1', cameraId: ssId },
    ].filter((w, i, a) => a.findIndex(x => JSON.stringify(x) === JSON.stringify(w)) === i);
    const order = this.snapWay != null ? [this.snapWay, ...ways.filter(w => JSON.stringify(w) !== JSON.stringify(this.snapWay))] : ways;
    const tried = []; let last = null;
    for (const w of order) {
      const label = `v${w.version} ${w.id ? 'id' : 'cameraId'}${w.profileType ? '+profiel' : ''}`;
      try {
        const r = await this.ssCall({ ...base, ...w }, true);
        if (r && r.headers && /^image\//.test(r.headers.get('content-type') || '')) { this.snapWay = w; return r; }
        tried.push(label + ': geen afbeelding');
      } catch (e) { last = e; tried.push(`${label}: ${e.code != null ? 'code ' + e.code : e.message}`); if (e.code === 105 || e.code === 117) break; }
    }
    const rights = last && [105, 117].includes(last.code);
    throw nlErr(`Surveillance Station geeft geen beeld${rights ? ' (geen rechten)' : ''}. Geprobeerd: ${tried.join('; ')}.` +
      (rights ? ' Geef de gebruiker in Surveillance Station het profiel Toeschouwer.' : ' Stuur deze melding door; tot die tijd kun je bij "Camera toevoegen" de bron Rechtstreeks (Reolink) of Homey gebruiken.'), last && last.code);
  }
  async ssCameras() {
    const j = await this.ssCall({ api: 'SYNO.SurveillanceStation.Camera', method: 'List', version: '9' });
    return (j.data.cameras || []).map(c => ({ id: String(c.id), name: c.newName || c.name || 'Camera ' + c.id, ok: c.status === 1 || c.status === undefined }));
  }

  // ---------- beeld ----------
  async snapshot(id) {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < 250) return hit;
    if (hit && hit.pending) return hit.pending;
    const pending = this.fetchSnapshot(this.get(id)).then(v => { const e = { ...v, at: Date.now() }; this.cache.set(id, e); return e; })
      .catch(e => { this.cache.delete(id); throw e; });
    this.cache.set(id, { ...(hit || {}), at: 0, pending });
    return pending;
  }
  async fetchSnapshot(c) {
    let r;
    if (c.source === 'ss') {
      if (!c.ssId) throw nlErr('Kies eerst welke camera uit Surveillance Station');
      r = await this.ssSnapshot(c.ssId);
    } else if (c.source === 'homey') {
      if (!c.deviceId) throw new Error('Kies eerst het camera-apparaat uit Homey');
      return withTimeout(10000, this.homey.cameraImage(c.deviceId, c.imageId));
    } else {
      if (!c.ip) throw new Error('Vul het IP-adres van de camera in');
      return this.reolinkSnap(c);
    }
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) throw nlErr('De camera gaf geen beeld' + (r.ok ? '' : ` (${r.status})`) + '. Klopt het IP-adres, de gebruiker en het wachtwoord?');
    return { type, data: Buffer.from(await r.arrayBuffer()) };
  }
  // Reolink: inloggen zoals de Reolink-app (JSON met gebruiker en wachtwoord -> tijdelijke code),
  // daarna het beeld ophalen met die code. Werkt met elk wachtwoord (ook met @ ! # & enz.).
  // Eerst HTTP, daarna HTTPS (nieuwere camera's hebben HTTP soms uit); het eigen certificaat van de
  // camera wordt geaccepteerd, het verkeer blijft in je thuisnetwerk.
  reolinkReq(proto, host, path, body) {
    return new Promise((resolve, reject) => {
      const mod = require(proto);
      const data = body ? Buffer.from(JSON.stringify(body)) : null;
      const req = mod.request(`${proto}://${host}${path}`, { method: data ? 'POST' : 'GET', rejectUnauthorized: false, timeout: 8000,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, res => {
        const chunks = []; res.on('data', d => chunks.push(d));
        res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] || '', data: Buffer.concat(chunks) }));
      });
      req.on('timeout', () => req.destroy(new Error('ETIMEDOUT')));
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
  reolinkError(r) {
    try { const j = JSON.parse(r.data.toString('utf8')); const x = Array.isArray(j) ? j[0] : j; const e = x.error || {}; return { code: x.code, detail: String(e.detail || ''), rsp: e.rspCode }; }
    catch (e) { return { detail: `status ${r.status}` }; }
  }
  // tijdelijke code van de Reolink ophalen (of hergebruiken zolang hij geldig is)
  async reolinkToken(c, proto, host, fresh) {
    this.tokens = this.tokens || new Map();
    const key = `${c.id}|${proto}`;
    let t = this.tokens.get(key);
    if (fresh || !t || Date.now() > t.until) {
      this.tokens.delete(key);
      const lr = await this.reolinkReq(proto, host, '/cgi-bin/api.cgi?cmd=Login', [{ cmd: 'Login', param: { User: { Version: '0', userName: c.user || 'admin', password: c.pass || '' } } }]);
      let tok = null; try { const j = JSON.parse(lr.data.toString('utf8')); tok = (Array.isArray(j) ? j[0] : j).value.Token; } catch (e) { /* */ }
      if (!tok) return { err: reolinkWhy(this.reolinkError(lr)) };
      t = { name: tok.name, until: Date.now() + Math.max(60, (tok.leaseTime || 3600) - 60) * 1000 };
      this.tokens.set(key, t);
    }
    return t;
  }
  // eerst de manier (http/https) die de vorige keer werkte
  reolinkProtos(c) { const ok = this.okProto && this.okProto.get(c.id); return ok === 'https' ? ['https', 'http'] : ['http', 'https']; }
  async reolinkSnap(c) {
    const host = reolinkHost(c);
    this.okProto = this.okProto || new Map();
    const snapPath = extra => `/cgi-bin/api.cgi?cmd=Snap&channel=${Number(c.channel || 0)}&rs=${Math.random().toString(36).slice(2)}&${extra}`;
    const tried = [];
    for (const proto of this.reolinkProtos(c)) {
      try {
        // 1. met tijdelijke code (hergebruikt zolang hij geldig is)
        for (let attempt = 0; attempt < 2; attempt++) {
          const t = await this.reolinkToken(c, proto, host);
          if (t.err) { tried.push(`${proto.toUpperCase()}: ${t.err}`); break; }
          const r = await this.reolinkReq(proto, host, snapPath(`token=${encodeURIComponent(t.name)}`));
          if (r.status === 200 && /^image\//.test(r.type)) { this.okProto.set(c.id, proto); return { type: r.type, data: r.data }; }
          this.tokens.delete(`${c.id}|${proto}`);
          const d = this.reolinkError(r);
          if (attempt === 1 || !/login|-6$/.test(`${d.detail} ${d.rsp}`)) { tried.push(`${proto.toUpperCase()}: ${reolinkWhy(d)}`); break; }
        }
        // 2. reserve: gebruiker en wachtwoord in het adres, zonder ze om te zetten (zoals een browser dat doet)
        const r2 = await this.reolinkReq(proto, host, snapPath(`user=${raw(c.user || 'admin')}&password=${raw(c.pass)}`));
        if (r2.status === 200 && /^image\//.test(r2.type)) { this.okProto.set(c.id, proto); return { type: r2.type, data: r2.data }; }
      } catch (e) { tried.push(`${proto.toUpperCase()}: ${reolinkConn(e)}`); }
      if (tried.some(t => /inloggen mislukt|mag geen/.test(t))) break; // zelfde gegevens werken via HTTPS ook niet
    }
    throw nlErr(`De camera gaf geen beeld. ${[...new Set(tried)].join('; ')}.`);
  }
  // Een FLV-videostroom openen. Geeft { ok, up, first } als er echt video komt, anders { ok:false, why }.
  flvOpen(proto, host, p) {
    return new Promise((resolve, reject) => {
      const mod = require(proto); let done = false;
      const req = mod.get(`${proto}://${host}${p}`, { rejectUnauthorized: false, timeout: 7000 }, up => {
        let buf = Buffer.alloc(0);
        const onData = d => {
          buf = Buffer.concat([buf, d]);
          if (buf.length < 3 || done) return;
          done = true; up.off('data', onData);
          if (buf.slice(0, 3).toString('latin1') === 'FLV') { up.pause(); resolve({ ok: true, req, up, first: buf }); return; }
          req.destroy(); resolve({ ok: false, why: up.statusCode !== 200 ? `status ${up.statusCode}` : 'de camera stuurt geen video terug' });
        };
        up.on('data', onData);
        up.on('end', () => { if (!done) { done = true; resolve({ ok: false, why: up.statusCode === 200 ? 'de camera stuurt geen video terug' : `status ${up.statusCode}` }); } });
        up.on('error', e => { if (!done) { done = true; reject(e); } });
      });
      req.on('timeout', () => req.destroy(new Error('ETIMEDOUT')));
      req.on('error', e => { if (!done) { done = true; reject(e); } });
    });
  }
  // echte video van de Reolink doorgeven (sub = lichte stroom voor de tegel, main = scherp voor groot beeld).
  // De browser ziet alleen /api/camera/<id>/video; gebruiker en wachtwoord blijven op de NAS.
  async reolinkVideo(id, q, req, res) {
    const c = this.get(id);
    if (c.source !== 'reolink') throw nlErr('Video kan alleen bij een camera met bron Rechtstreeks (Reolink)');
    if (!c.ip) throw nlErr('Vul het IP-adres van de camera in');
    const host = reolinkHost(c);
    const base = `/flv?port=1935&app=bcs&stream=channel${Number(c.channel || 0)}_${q === 'main' ? 'main' : 'sub'}.bcs`;
    this.flvWay = this.flvWay || new Map();
    const tried = [];
    for (const proto of this.reolinkProtos(c)) {
      try {
        const t = await this.reolinkToken(c, proto, host);
        const ways = [];
        if (!t.err) ways.push(['token', () => `${base}&token=${encodeURIComponent(t.name)}`]);
        ways.push(['wachtwoord', () => `${base}&user=${raw(c.user || 'admin')}&password=${raw(c.pass)}`]);
        if (this.flvWay.get(c.id) === 'wachtwoord') ways.reverse();
        for (const [way, mk] of ways) {
          if (req.destroyed) return;
          const o = await this.flvOpen(proto, host, mk());
          if (!o.ok) { tried.push(`${proto.toUpperCase()} (${way}): ${o.why}`); continue; }
          this.flvWay.set(c.id, way);
          res.writeHead(200, { 'Content-Type': 'video/x-flv', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
          res.write(o.first);
          o.up.pipe(res);
          // stroom blijft hangen (geen data meer)? dan afbreken, de browser maakt zelf opnieuw verbinding
          o.req.setTimeout(15000, () => o.req.destroy());
          const end = () => { o.req.destroy(); if (!res.writableEnded) res.end(); };
          o.up.on('end', end); o.up.on('error', end); o.req.on('error', end);
          res.on('close', () => o.req.destroy());
          return;
        }
        if (t.err && /inloggen mislukt|mag geen/.test(t.err)) { tried.push(`${proto.toUpperCase()}: ${t.err}`); break; }
      } catch (e) { tried.push(`${proto.toUpperCase()}: ${reolinkConn(e)}`); }
    }
    throw nlErr(`Geen video van de camera. ${[...new Set(tried)].join('; ')}.`);
  }
  // ---------- draaien, kantelen, zoomen (Reolink) ----------
  // Eén opdracht naar de camera sturen, met tijdelijke code (bij verlopen code één keer opnieuw inloggen).
  async reolinkCmd(c, cmd, param, action) {
    const host = reolinkHost(c); const tried = [];
    for (const proto of this.reolinkProtos(c)) {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const t = await this.reolinkToken(c, proto, host, attempt > 0);
          if (t.err) throw nlErr(`De camera wil niet: ${t.err}.`);
          const body = [{ cmd, ...(action != null ? { action } : {}), param }];
          const r = await this.reolinkReq(proto, host, `/cgi-bin/api.cgi?cmd=${cmd}&token=${encodeURIComponent(t.name)}`, body);
          let j = null; try { j = JSON.parse(r.data.toString('utf8')); j = Array.isArray(j) ? j[0] : j; } catch (e) { /* */ }
          if (j && j.code === 0) { this.okProto = this.okProto || new Map(); this.okProto.set(c.id, proto); return j.value || {}; }
          const d = this.reolinkError(r);
          if (attempt === 0 && /login|-6$/.test(`${d.detail} ${d.rsp}`)) continue;
          const e = nlErr(/ability|-26$|-9$|not support/i.test(`${d.detail} ${d.rsp}`)
            ? (cmd === 'PtzCtrl' ? 'De camera laat deze gebruiker niet draaien. Geef de gebruiker in de Reolink-app het type Beheerder.' : 'Dit kan deze camera niet, of deze gebruiker mag het niet (type Beheerder nodig).')
            : `De camera weigert: ${reolinkWhy(d)}.`); e.rsp = d.rsp; throw e;
        }
      } catch (e) { if (e.nl) throw e; tried.push(`${proto.toUpperCase()}: ${reolinkConn(e)}`); }
    }
    throw nlErr(`De camera is niet bereikbaar. ${tried.join('; ')}.`);
  }
  // wat kan deze camera? (draaien, zoomen, vaste standen, zelf volgen)
  async ptzInfo(id) {
    const c = this.get(id);
    if (c.source !== 'reolink') return { pan: false };
    const ch = Number(c.channel || 0);
    const out = { pan: false, zoom: false, presets: [], track: null };
    const ab = await this.reolinkCmd(c, 'GetAbility', { User: { userName: c.user || 'admin' } }).catch(e => { if (/inloggen mislukt|niet bereikbaar/.test(e.message)) throw e; return null; });
    const chn = ab && ab.Ability && ab.Ability.abilityChn && ab.Ability.abilityChn[ch];
    const permit = k => !!(chn && chn[k] && chn[k].permit);
    out.pan = chn ? permit('ptzCtrl') || permit('ptzDirection') || (chn.ptzType && chn.ptzType.ver > 0) : true;
    out.canMove = chn ? permit('ptzCtrl') : true;   // 0 = mag niet bedienen (gewone gebruiker)
    if (!out.pan) return out;
    const [pre, zf, ai] = await Promise.all([
      this.reolinkCmd(c, 'GetPtzPreset', { channel: ch }, 0).catch(() => null),
      this.reolinkCmd(c, 'GetZoomFocus', { channel: ch }, 0).catch(() => null),
      this.reolinkCmd(c, 'GetAiCfg', { channel: ch }, 0).catch(() => null),
    ]);
    out.presets = ((pre && pre.PtzPreset) || []).filter(p => p.enable).map(p => ({ id: p.id, name: p.name || `Stand ${p.id}` }));
    out.zoom = !!(zf && zf.ZoomFocus && zf.ZoomFocus.zoom) || !!(chn && chn.ptzType && chn.ptzType.ver === 2);
    if (ai) { const k = 'bSmartTrack' in ai ? 'bSmartTrack' : 'aiTrack' in ai ? 'aiTrack' : null; if (k) { out.track = !!ai[k]; this.trackKey = this.trackKey || new Map(); this.trackKey.set(c.id, k); } }
    return out;
  }
  // bewegen zolang de knop is ingedrukt: de browser herhaalt de opdracht; komt er niets meer
  // (knop los, verbinding weg), dan stopt de camera vanzelf
  async ptz(id, { op, speed, preset }) {
    const c = this.get(id); const ch = Number(c.channel || 0);
    this.ptzTimers = this.ptzTimers || new Map(); clearTimeout(this.ptzTimers.get(id));
    if (preset != null) return this.reolinkCmd(c, 'PtzCtrl', { channel: ch, op: 'ToPos', id: Number(preset), speed: 32 }).then(() => ({ ok: true }));
    const OPS = ['Left', 'Right', 'Up', 'Down', 'ZoomInc', 'ZoomDec', 'Stop'];
    if (!OPS.includes(op)) throw nlErr('Onbekende opdracht');
    const sp = Math.max(1, Math.min(64, Math.round(Number(speed) || 32)));
    await this.reolinkCmd(c, 'PtzCtrl', { channel: ch, op, speed: sp });
    if (op !== 'Stop') this.ptzTimers.set(id, setTimeout(() => this.reolinkCmd(c, 'PtzCtrl', { channel: ch, op: 'Stop' }).catch(() => {}), 1500));
    return { ok: true };
  }
  async track(id, on) {
    const c = this.get(id); const k = (this.trackKey && this.trackKey.get(id)) || 'bSmartTrack';
    await this.reolinkCmd(c, 'SetAiCfg', { channel: Number(c.channel || 0), [k]: on ? 1 : 0 });
    return { ok: true, track: !!on };
  }
  // vloeiend beeld (proef): MJPEG-stroom van Surveillance Station doorgeven
  async live(id, req, res) {
    const c = this.get(id);
    if (c.source !== 'ss') throw new Error('Vloeiend beeld kan alleen via Surveillance Station');
    const r = await this.ssCall({ api: 'SYNO.SurveillanceStation.VideoStreaming', method: 'Stream', version: '1', cameraId: c.ssId, format: 'mjpeg' }, true);
    const type = r.headers.get('content-type') || '';
    if (!/multipart|image/.test(type)) throw new Error('Surveillance Station geeft hier geen vloeiend beeld; de tegel gebruikt losse beelden');
    res.set({ 'Content-Type': type, 'Cache-Control': 'no-store' });
    const s = Readable.fromWeb(r.body); s.pipe(res);
    req.on('close', () => s.destroy());
  }
}

module.exports = { Cameras };
