'use strict';
// Demo-modus: nepgegevens zodat het dashboard werkt zonder Homey-verbinding.
const { EventEmitter } = require('events');

const Z = { huis: 'z-huis', wk: 'z-woonkamer', kk: 'z-keuken', sk: 'z-slaapkamer', tuin: 'z-tuin', gar: 'z-garage' };

function cap(id, value, extra = {}) {
  const base = {
    onoff: { type: 'boolean', title: 'Aan/uit', setable: true },
    dim: { type: 'number', title: 'Dimmen', min: 0, max: 1, step: 0.01, setable: true },
    light_hue: { type: 'number', title: 'Tint', min: 0, max: 1, setable: true },
    light_saturation: { type: 'number', title: 'Verzadiging', min: 0, max: 1, setable: true },
    light_temperature: { type: 'number', title: 'Kleurtemperatuur', min: 0, max: 1, setable: true },
    target_temperature: { type: 'number', title: 'Doeltemperatuur', min: 5, max: 30, step: 0.5, units: '°C', setable: true },
    measure_temperature: { type: 'number', title: 'Temperatuur', units: '°C', decimals: 1 },
    measure_humidity: { type: 'number', title: 'Luchtvochtigheid', units: '%' },
    measure_power: { type: 'number', title: 'Vermogen', units: 'W' },
    meter_power: { type: 'number', title: 'Energie', units: 'kWh', decimals: 2 },
    alarm_motion: { type: 'boolean', title: 'Beweging' },
    alarm_contact: { type: 'boolean', title: 'Contact' },
    measure_battery: { type: 'number', title: 'Batterij', units: '%' },
    windowcoverings_set: { type: 'number', title: 'Positie', min: 0, max: 1, setable: true },
    locked: { type: 'boolean', title: 'Vergrendeld', setable: true },
    volume_set: { type: 'number', title: 'Volume', min: 0, max: 1, setable: true },
    measure_luminance: { type: 'number', title: 'Licht', units: 'lx' },
  }[id] || { type: 'string', title: id };
  return { id, value, getable: true, setable: false, ...base, ...extra };
}

function dev(id, name, zone, cls, caps) {
  const o = {}; for (const c of caps) o[c.id] = c;
  return { id, name, zone, class: cls, virtualClass: null, icon: null, available: true, capabilities: Object.keys(o), caps: o };
}

class DemoAdapter extends EventEmitter {
  constructor() {
    super();
    this.status = { mode: 'demo', connected: true, error: null, since: new Date().toISOString() };
    const devices = [
      dev('d1', 'Plafondlamp', Z.wk, 'light', [cap('onoff', true), cap('dim', 0.7)]),
      dev('d2', 'Hue sfeerlamp', Z.wk, 'light', [cap('onoff', true), cap('dim', 0.45), cap('light_hue', 0.08), cap('light_saturation', 0.8), cap('light_temperature', 0.3)]),
      dev('d3', 'Leeslamp', Z.wk, 'light', [cap('onoff', false), cap('dim', 1)]),
      dev('d4', 'Thermostaat', Z.wk, 'thermostat', [cap('target_temperature', 20.5), cap('measure_temperature', 20.1), cap('measure_humidity', 52)]),
      dev('d5', 'Denon AVR', Z.wk, 'amplifier', [cap('onoff', false), cap('volume_set', 0.35)]),
      dev('d6', 'Keukenspots', Z.kk, 'light', [cap('onoff', false), cap('dim', 0.8)]),
      dev('d7', 'Vaatwasser', Z.kk, 'socket', [cap('onoff', true), cap('measure_power', 1840), cap('meter_power', 312.4)]),
      dev('d8', 'Bewegingssensor keuken', Z.kk, 'sensor', [cap('alarm_motion', false), cap('measure_temperature', 21.3), cap('measure_luminance', 140), cap('measure_battery', 86)]),
      dev('d9', 'Nachtlamp', Z.sk, 'light', [cap('onoff', false), cap('dim', 0.3)]),
      dev('d10', 'Rolluik slaapkamer', Z.sk, 'windowcoverings', [cap('windowcoverings_set', 1)]),
      dev('d11', 'Tuinverlichting', Z.tuin, 'light', [cap('onoff', true)]),
      dev('d12', 'Voordeur', Z.huis, 'lock', [cap('locked', true), cap('measure_battery', 64)]),
      dev('d13', 'Achterdeur sensor', Z.huis, 'sensor', [cap('alarm_contact', false), cap('measure_battery', 91)]),
      dev('d14', 'P1-meter', Z.huis, 'sensor', [cap('measure_power', 612), cap('meter_power', 10432.5)]),
      dev('d15', 'Garagedeur', Z.gar, 'garagedoor', [cap('onoff', false)]),
      dev('d16', 'Raam woonkamer', Z.wk, 'sensor', [cap('alarm_contact', true), cap('measure_battery', 77)]),
      dev('d17', 'Raam keuken', Z.kk, 'sensor', [cap('alarm_contact', false), cap('measure_battery', 93)]),
      dev('d18', 'Raam slaapkamer', Z.sk, 'sensor', [cap('alarm_contact', true), cap('measure_battery', 58)]),
    ];
    this.cache = {
      devices,
      zones: [
        { id: Z.huis, name: 'Huis', parent: null, icon: 'home' },
        { id: Z.wk, name: 'Woonkamer', parent: Z.huis, icon: 'livingRoom' },
        { id: Z.kk, name: 'Keuken', parent: Z.huis, icon: 'kitchen' },
        { id: Z.sk, name: 'Slaapkamer', parent: Z.huis, icon: 'bedroom' },
        { id: Z.tuin, name: 'Tuin', parent: Z.huis, icon: 'garden' },
        { id: Z.gar, name: 'Garage', parent: Z.huis, icon: 'garage' },
      ],
      flows: [
        { id: 'f1', name: 'Spotify aan', enabled: true, triggerable: true, type: 'flow' },
        { id: 'f2', name: 'Alles uit', enabled: true, triggerable: true, type: 'flow' },
        { id: 'f3', name: 'Welkom thuis', enabled: true, triggerable: true, type: 'flow' },
      ],
      advancedFlows: [{ id: 'af1', name: 'Avondroutine', enabled: true, triggerable: true, type: 'advancedflow' }],
      folders: [],
      variables: [
        { id: 'v1', name: 'Vakantiemodus', type: 'boolean', value: false },
        { id: 'v2', name: 'Gewenste temperatuur', type: 'number', value: 20 },
        { id: 'v3', name: 'Status huis', type: 'string', value: 'Iedereen thuis' },
      ],
      moods: [
        { id: 'm1', name: 'Film kijken', zone: Z.wk },
        { id: 'm2', name: 'Gezellig', zone: Z.wk },
        { id: 'm3', name: 'Helder', zone: Z.kk },
      ],
      insights: [
        { id: 'measure_temperature', uri: 'homey:device:d4', ownerName: 'Thermostaat', title: 'Temperatuur', type: 'number', units: '°C', decimals: 1 },
        { id: 'measure_power', uri: 'homey:device:d14', ownerName: 'P1-meter', title: 'Vermogen', type: 'number', units: 'W' },
        { id: 'measure_humidity', uri: 'homey:device:d4', ownerName: 'Thermostaat', title: 'Luchtvochtigheid', type: 'number', units: '%' },
      ],
      apps: [
        { id: 'nl.ramon.spotifydashboard', name: 'Spotify Dashboard', version: '1.0.0', state: 'running', enabled: true, ready: true },
        { id: 'com.philips.hue.zigbee', name: 'Philips Hue', version: '6.2.1', state: 'running', enabled: true, ready: true },
        { id: 'com.reolink', name: 'Reolink', version: '2.4.0', state: 'running', enabled: true, ready: true },
        { id: 'nl.knmi', name: 'KNMI', version: '1.1.0', state: 'stopped', enabled: false, ready: false },
      ],
      users: [
        { id: 'u1', name: 'Ramon', present: true, asleep: false },
        { id: 'u2', name: 'Tamara', present: true, asleep: false },
        { id: 'u3', name: 'Mirthe', present: false, asleep: false },
      ],
      alarms: [
        { id: 'a1', name: 'Werkdag', time: '06:45', enabled: true, repetition: { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true } },
        { id: 'a2', name: 'Weekend', time: '09:00', enabled: false, repetition: { saturday: true, sunday: true } },
      ],
    };
    setInterval(() => this.tick(), 4000);
  }
  async start() { this.emit('status', this.status); }
  library() { return this.cache; }
  find(id) { return this.cache.devices.find(d => d.id === id); }
  tick() {
    const p1 = this.find('d14'); const v = Math.round(400 + Math.random() * 900);
    p1.caps.measure_power.value = v; this.emit('update', { kind: 'cap', deviceId: 'd14', cap: 'measure_power', value: v });
    const t = this.find('d4'); const tv = Math.round((20 + Math.random()) * 10) / 10;
    t.caps.measure_temperature.value = tv; this.emit('update', { kind: 'cap', deviceId: 'd4', cap: 'measure_temperature', value: tv });
    if (Math.random() < 0.25) { const m = this.find('d8'); m.caps.alarm_motion.value = !m.caps.alarm_motion.value; this.emit('update', { kind: 'cap', deviceId: 'd8', cap: 'alarm_motion', value: m.caps.alarm_motion.value }); }
  }
  async setCapability(deviceId, capId, value) {
    const d = this.find(deviceId); if (!d || !d.caps[capId]) throw new Error('Onbekend apparaat');
    d.caps[capId].value = value; this.emit('update', { kind: 'cap', deviceId, cap: capId, value });
    if (capId === 'dim' && d.caps.onoff) { const on = value > 0; d.caps.onoff.value = on; this.emit('update', { kind: 'cap', deviceId, cap: 'onoff', value: on }); }
  }
  async triggerFlow() { return true; }
  async setMood() { return true; }
  async setVariable(id, value) { const v = this.cache.variables.find(x => x.id === id); if (v) v.value = value; this.emit('update', { kind: 'var', id, value }); }
  async setAlarm(id, enabled) { const a = this.cache.alarms.find(x => x.id === id); if (a) a.enabled = enabled; }
  async insightEntries(uri, id, resolution) {
    const n = { lastHour: 60, last6Hours: 72, last24Hours: 96, last7Days: 84, last31Days: 93 }[resolution] || 96;
    const span = { lastHour: 3.6e6, last6Hours: 2.16e7, last24Hours: 8.64e7, last7Days: 6.048e8, last31Days: 2.678e9 }[resolution] || 8.64e7;
    const now = Date.now(); const values = [];
    for (let i = 0; i < n; i++) {
      const tt = now - span + (span / n) * i; const ph = i / n * Math.PI * 4;
      const v = id === 'measure_power' ? 500 + 400 * Math.sin(ph) + Math.random() * 300 : id === 'measure_humidity' ? 50 + 5 * Math.sin(ph) : 19.5 + 1.2 * Math.sin(ph) + Math.random() * 0.3;
      values.push({ t: new Date(tt).toISOString(), v: Math.round(v * 10) / 10 });
    }
    return { values };
  }
  async notifications() {
    const now = Date.now();
    return [
      { id: 'n1', excerpt: 'Beweging gedetecteerd in de **keuken**', dateCreated: new Date(now - 6e5).toISOString() },
      { id: 'n2', excerpt: 'Vaatwasser is klaar', dateCreated: new Date(now - 3.6e6).toISOString() },
      { id: 'n3', excerpt: 'Batterij **Voordeur** is 64%', dateCreated: new Date(now - 8.6e7).toISOString() },
    ];
  }
  async location() { return { latitude: 52.27, longitude: 6.89 }; }

  // ---- flows (nep-versie met dezelfde vorm als Homey Pro 2023) ----
  async flowCards(kind) {
    if (!this._cards) {
      const C = { trigger: [], condition: [], action: [] };
      const add = (k, uri, id, title, titleFormatted, args = []) => C[k].push({ id: `${uri}:${id}`, ownerUri: uri, title, titleFormatted, hint: null, args, droptoken: null, duration: false, deprecated: false });
      for (const d of this.cache.devices) {
        const u = 'homey:device:' + d.id;
        if (d.caps.onoff) { add('trigger', u, 'turned_on', 'Is aangezet', null); add('trigger', u, 'turned_off', 'Is uitgezet', null); add('condition', u, 'on', 'Is aan', null); add('action', u, 'on', 'Aanzetten', null); add('action', u, 'off', 'Uitzetten', null); add('action', u, 'toggle', 'Aan- of uitzetten', null); }
        if (d.caps.dim) add('action', u, 'dim', 'Dimmen', 'Dimmen naar [[dim]]', [{ name: 'dim', type: 'range', title: 'Helderheid', min: 0, max: 1, step: 0.01, label: '%', labelMultiplier: 100 }]);
        if (d.caps.alarm_contact) { add('trigger', u, 'alarm_contact_true', 'Het contact-alarm is aangegaan', null); add('trigger', u, 'alarm_contact_false', 'Het contact-alarm is uitgegaan', null); add('condition', u, 'alarm_contact', 'Het contact-alarm is aan', null); }
        if (d.caps.alarm_motion) { add('trigger', u, 'alarm_motion_true', 'Het bewegingsalarm is aangegaan', null); add('condition', u, 'alarm_motion', 'Het bewegingsalarm is aan', null); }
      }
      add('trigger', 'homey:manager:cron', 'time_exactly', 'Het is een bepaalde tijd', 'Het is [[time]]', [{ name: 'time', type: 'time', title: 'Tijd' }]);
      add('condition', 'homey:manager:cron', 'time_between', 'Tijd is tussen', 'De tijd is tussen [[time_start]] en [[time_end]]', [{ name: 'time_start', type: 'time' }, { name: 'time_end', type: 'time' }]);
      add('condition', 'homey:manager:sun', 'is_dark', 'Het is donker', null);
      add('action', 'homey:manager:notifications', 'create_notification', 'Maak een melding', 'Maak een melding met [[text]]', [{ name: 'text', type: 'text', title: 'Tekst' }]);
      add('action', 'homey:manager:mobile', 'push_text', 'Stuur een pushbericht', 'Stuur [[text]] naar [[user]]', [{ name: 'text', type: 'text' }, { name: 'user', type: 'autocomplete', title: 'Gebruiker' }]);
      this._cards = C;
    }
    return this._cards[kind];
  }
  async flowAutocomplete(kind, id, name, query) {
    if (name !== 'user') return [];
    return this.cache.users.filter(u => !query || u.name.toLowerCase().includes(query.toLowerCase())).map(u => ({ id: u.id, name: u.name, athomId: 'demo-' + u.id }));
  }
  _flows() { if (!this._fl) { this._fl = new Map(); this._folders = [{ id: 'fo1', name: 'Spotify' }]; } return this._fl; }
  async getFlowRaw(id) {
    const f = this._flows().get(id);
    if (f) return JSON.parse(JSON.stringify(f));
    const c = [...this.cache.flows].find(x => x.id === id);
    if (!c) throw new Error('Flow niet gevonden');
    return { id, name: c.name, folder: null, enabled: true, trigger: { id: 'homey:manager:flow:programmatic_trigger', args: {} }, conditions: [], actions: [{ id: 'homey:device:d1:on', group: 'then', args: {} }] };
  }
  async createFlow(flow) {
    const id = 'demo-' + Math.random().toString(36).slice(2, 10);
    this._flows().set(id, { id, ...JSON.parse(JSON.stringify(flow)) });
    this.cache.flows.push({ id, name: flow.name, enabled: flow.enabled !== false, folder: flow.folder || null, triggerable: flow.trigger.id.endsWith('programmatic_trigger'), type: 'flow' });
    this.emit('library', this.cache); return id;
  }
  async updateFlow(id, flow) {
    const cur = await this.getFlowRaw(id); const next = { ...cur, ...JSON.parse(JSON.stringify(flow)), id };
    this._flows().set(id, next);
    const c = this.cache.flows.find(x => x.id === id); if (c) { c.name = next.name; c.enabled = next.enabled; }
    this.emit('library', this.cache);
  }
  async deleteFlow(id) { this._flows().delete(id); this.cache.flows = this.cache.flows.filter(x => x.id !== id); this.emit('library', this.cache); }
  async flowFolder(name) { this._flows(); let f = this._folders.find(x => x.name === name); if (!f) { f = { id: 'fo' + (this._folders.length + 1), name }; this._folders.push(f); } return f.id; }
  deviceName(id) { const d = this.find(id); return d ? d.name : null; }
  appName(id) { return id; }

  // ---- Nep-versie van de Homey-app "Spotify Dashboard" (alleen voor de demo) ----
  demoApp() {
    if (this._app) return this._app;
    const svg = (h1, h2) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${h1},75%,55%)'/><stop offset='1' stop-color='hsl(${h2},70%,25%)'/></linearGradient></defs><rect width='300' height='300' fill='url(#g)'/><circle cx='150' cy='150' r='80' fill='none' stroke='rgba(255,255,255,.6)' stroke-width='10'/></svg>`);
    const art = svg(20, 250);
    const tracks = Array.from({ length: 18 }, (_, i) => ({ id: 't' + i, uri: 'spotify:track:t' + i, name: ['Lichtjaren', 'Glass Harbour', 'Kustlicht', 'Neon Weather', 'Late Bloom', 'Tijdzones'][i % 6] + (i > 5 ? ' ' + (i + 1) : ''), artist: ['De Nachtrijders', 'Northern Lanterns', 'Maren Veld'][i % 3] }));
    this._app = {
      view: {
        track: { id: 't2', uri: 'spotify:track:t2', name: 'Kustlicht', artist: 'Maren Veld', album: 'Zout & Zilver', artUrl: art, durationMs: 214000, artistId: 'a1', artistName: 'Maren Veld',
          albumInfo: { id: 'al1', uri: 'spotify:album:al1', name: 'Zout & Zilver', artUrl: art, release_date: '2025-05-02', release_date_precision: 'day', album_type: 'album', total_tracks: 11, artists: ['Maren Veld'] } },
        contextUri: 'spotify:playlist:demo', nextUp: 'Neon Weather · Velvet Arcade', isPlaying: true, progressMs: 61000, sampledAt: Date.now(), shuffle: false, volume: 0.35,
      },
      playlist: { uri: 'spotify:playlist:demo', name: 'Ramon', artUrl: art, tracks, loadedAt: Date.now() },
      artist: { id: 'a1', name: 'Maren Veld', photoUrl: svg(200, 280), genres: ['dutch indie', 'dream pop'], albums: [
        { id: 'al1', name: 'Zout & Zilver', artUrl: art, release_date: '2025-05-02', album_type: 'album', total_tracks: 11 },
        { id: 'al2', name: 'Tijdzones', artUrl: svg(150, 190), release_date: '2022-03-11', album_type: 'album', total_tracks: 9 },
        { id: 'al3', name: 'Eb', artUrl: svg(320, 10), release_date: '2020-09-25', album_type: 'single', total_tracks: 2 }] },
      pk: { releases: [{ rgid: 'r1', name: 'Lichtjaren', artist: 'De Nachtrijders', date: '2026-09-12', image: svg(200, 260), albumId: null }],
        recent: [{ t: Date.now() - 3.6e6, albumId: 'al1', album: 'Zout & Zilver', artist: 'Maren Veld', image: art, imageLarge: art }], followed: 12, todo: 0, error: '' },
    };
    return this._app;
  }
  async rawCall({ method, path, body }) {
    const m = /^\/api\/app\/([^/]+)\/widget\/([^/]+)(\/.*)$/.exec(path);
    if (!m) { const e = new Error('Not Found'); e.statusCode = 404; throw e; }
    const a = this.demoApp(); const p = m[3];
    if (p === '/state') { a.view.progressMs = (a.view.progressMs + 3000) % 214000; a.view.sampledAt = Date.now(); return { now: Date.now(), ...a.view, config: { playlists: [{ name: 'Ramon', uri: 'spotify:playlist:demo' }, { name: 'Tamara', uri: 'spotify:playlist:x2' }], volumeMax: 100, volumeStep: 5 }, status: { spotify: 'ok', spotifyMsg: '', homey: true, mode: 'actief (demo)' } }; }
    if (p === '/playlist') return a.playlist;
    if (p === '/artist') return { status: 'ok', artist: a.artist };
    if (p === '/platenkast') return a.pk;
    if (p === '/album') return { album: { id: 'al1', name: 'Zout & Zilver', artUrl: a.view.track.artUrl }, tracks: a.playlist.tracks.slice(0, 11) };
    if (p === '/command') { if (body && body.action === 'pause') a.view.isPlaying = false; if (body && body.action === 'play') a.view.isPlaying = true; return { ok: true }; }
    return {};
  }
  async subscribeApp() { throw new Error('demo: geen live-berichten'); }
}

module.exports = { DemoAdapter };
