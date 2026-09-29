'use strict';
// Camera's: beeld ophalen via Synology Surveillance Station, via Homey of rechtstreeks van een
// Reolink-camera. Wachtwoorden staan alleen op de NAS (data/cameras.json), nooit in de browser.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const DEFAULT_SS = process.env.SURVEILLANCE_URL || 'http://192.168.178.79:5000';
const withTimeout = (ms, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('ETIMEDOUT')), ms))]);
const SS_ERR = { 100: 'onbekende fout', 102: 'Surveillance Station is niet gevonden', 105: 'geen toegang', 400: 'verkeerde gebruikersnaam of wachtwoord', 401: 'gebruiker is uitgeschakeld', 402: 'geen rechten', 403: 'deze gebruiker heeft tweestapsverificatie; maak een aparte gebruiker zonder', 407: 'te veel pogingen, IP tijdelijk geblokkeerd', 117: 'geen rechten voor deze camera' };

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
        if (!j.success) throw new Error('Inloggen bij Surveillance Station lukt niet: ' + (SS_ERR[j.error && j.error.code] || 'fout ' + (j.error && j.error.code)));
        this.sid = j.data.sid;
      }
      const r = await withTimeout(10000, fetch(`${ss.url}/webapi/entry.cgi?${new URLSearchParams({ ...params, _sid: this.sid })}`));
      const type = r.headers.get('content-type') || '';
      if (raw && !/json/.test(type)) return r;
      const j = await r.json().catch(() => ({ success: false, error: { code: 100 } }));
      if (j.success) return j;
      const code = j.error && j.error.code;
      if ([105, 106, 107, 119].includes(code) && attempt === 0) { this.sid = null; continue; }
      throw new Error('Surveillance Station: ' + (SS_ERR[code] || 'fout ' + code));
    }
    throw new Error('Surveillance Station: geen toegang');
  }
  async ssCameras() {
    const j = await this.ssCall({ api: 'SYNO.SurveillanceStation.Camera', method: 'List', version: '9' });
    return (j.data.cameras || []).map(c => ({ id: String(c.id), name: c.newName || c.name || 'Camera ' + c.id, ok: c.status === 1 || c.status === undefined }));
  }

  // ---------- beeld ----------
  async snapshot(id) {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < 700) return hit;
    if (hit && hit.pending) return hit.pending;
    const pending = this.fetchSnapshot(this.get(id)).then(v => { const e = { ...v, at: Date.now() }; this.cache.set(id, e); return e; })
      .catch(e => { this.cache.delete(id); throw e; });
    this.cache.set(id, { ...(hit || {}), at: 0, pending });
    return pending;
  }
  async fetchSnapshot(c) {
    let r;
    if (c.source === 'ss') {
      if (!c.ssId) throw new Error('Kies eerst welke camera uit Surveillance Station');
      r = await this.ssCall({ api: 'SYNO.SurveillanceStation.Camera', method: 'GetSnapshot', version: '9', id: c.ssId, profileType: '1' }, true);
    } else if (c.source === 'homey') {
      if (!c.deviceId) throw new Error('Kies eerst het camera-apparaat uit Homey');
      return withTimeout(10000, this.homey.cameraImage(c.deviceId, c.imageId));
    } else {
      if (!c.ip) throw new Error('Vul het IP-adres van de camera in');
      const q = new URLSearchParams({ cmd: 'Snap', channel: String(c.channel || 0), rs: Math.random().toString(36).slice(2), user: c.user || 'admin', password: c.pass || '' });
      r = await withTimeout(10000, fetch(`http://${c.ip}/cgi-bin/api.cgi?${q}`));
    }
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) throw new Error('De camera gaf geen beeld' + (r.ok ? '' : ` (${r.status})`) + '. Klopt het IP-adres, de gebruiker en het wachtwoord?');
    return { type, data: Buffer.from(await r.arrayBuffer()) };
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
