'use strict';
// Koppeling met de Homey Pro via de lokale API (API-sleutel blijft op de server).
const { HomeyAPI } = require('homey-api');
const { EventEmitter } = require('events');

const CAP_KEYS = ['id', 'type', 'title', 'units', 'min', 'max', 'step', 'decimals', 'getable', 'setable', 'value', 'values', 'lastUpdated'];

function slimDevice(d) {
  const caps = {};
  for (const [id, c] of Object.entries(d.capabilitiesObj || {})) {
    const o = {};
    for (const k of CAP_KEYS) if (c[k] !== undefined) o[k] = c[k];
    caps[id] = o;
  }
  return {
    id: d.id, name: d.name, zone: d.zone, class: d.class, virtualClass: d.virtualClass || null,
    icon: d.iconObj ? d.iconObj.url : null, available: d.available !== false, unavailableMessage: d.unavailableMessage || null,
    driver: d.driverId || d.driverUri || null,
    images: Array.isArray(d.images) ? d.images.map(i => ({ id: i.id, title: i.title || null })) : [],
    capabilities: d.capabilities || Object.keys(caps), caps, ui: d.ui || null,
  };
}

class HomeyAdapter extends EventEmitter {
  constructor({ address, token }) {
    super();
    this.address = address.replace(/\/$/, '');
    this.token = token;
    this.api = null;
    this.status = { mode: 'homey', connected: false, error: null, since: null };
    this.cache = { devices: [], zones: [], flows: [], advancedFlows: [], folders: [], variables: [], moods: [], insights: [], apps: [], users: [], alarms: [] };
    this.instances = [];
  }

  async start() {
    try {
      this.api = await HomeyAPI.createLocalAPI({ address: this.address, token: this.token });
      this.status = { mode: 'homey', connected: true, error: null, since: new Date().toISOString(), homeyId: this.api.id };
      await this.refresh();
      await this.subscribe();
      this.startHeartbeat();
      this.emit('status', this.status);
    } catch (err) {
      this.status = { mode: 'homey', connected: false, error: String(err.message || err), since: null };
      this.emit('status', this.status);
      console.error('[homey] verbinden mislukt:', err.message || err);
      setTimeout(() => this.start(), 30000);
    }
  }

  // elke 20 s een klein verzoek aan Homey: is hij er nog, en hoe snel?
  startHeartbeat() {
    clearInterval(this.hb);
    const beat = async () => {
      const t = Date.now();
      try {
        await Promise.race([this.api.zones.getZones(), new Promise((_, rej) => setTimeout(() => rej(new Error('ETIMEDOUT')), 8000))]);
        const ms = Date.now() - t; const was = this.link && this.link.ok;
        this.link = { ok: true, ms, at: Date.now(), since: was ? this.link.since : Date.now(), error: null };
      } catch (e) {
        const was = this.link && !this.link.ok;
        this.link = { ok: false, ms: null, at: Date.now(), since: was ? this.link.since : Date.now(), error: String(e.message || e) };
      }
      this.emit('link', this.link);
    };
    beat(); this.hb = setInterval(beat, 20000);
  }

  async safe(fn, fallback) {
    try { return await fn(); } catch (err) { console.warn('[homey]', err.message || err); return fallback; }
  }

  async refresh() {
    const a = this.api;
    const [devices, zones, flows, advancedFlows, folders, variables, moods, logs, apps, users, alarms] = await Promise.all([
      this.safe(() => a.devices.getDevices(), {}),
      this.safe(() => a.zones.getZones(), {}),
      this.safe(() => a.flow.getFlows(), {}),
      this.safe(() => a.flow.getAdvancedFlows(), {}),
      this.safe(() => a.flow.getFlowFolders(), {}),
      this.safe(() => a.logic.getVariables(), {}),
      this.safe(() => a.moods.getMoods(), {}),
      this.safe(() => a.insights.getLogs(), {}),
      this.safe(() => a.apps.getApps(), {}),
      this.safe(() => a.users.getUsers(), {}),
      this.safe(() => a.alarms.getAlarms(), {}),
    ]);
    this.rawDevices = devices;
    this.cache = {
      devices: Object.values(devices).map(slimDevice),
      zones: Object.values(zones).map(z => ({ id: z.id, name: z.name, parent: z.parent, icon: z.icon })),
      flows: Object.values(flows).map(f => ({ id: f.id, name: f.name, enabled: f.enabled, folder: f.folder, triggerable: f.triggerable !== false, type: 'flow' })),
      advancedFlows: Object.values(advancedFlows).map(f => ({ id: f.id, name: f.name, enabled: f.enabled, folder: f.folder, triggerable: f.triggerable !== false, type: 'advancedflow' })),
      folders: Object.values(folders).map(f => ({ id: f.id, name: f.name, parent: f.parent })),
      variables: Object.values(variables).map(v => ({ id: v.id, name: v.name, type: v.type, value: v.value })),
      moods: Object.values(moods).map(m => ({ id: m.id, name: m.name, zone: m.zone })),
      insights: Object.values(logs).map(l => ({ id: l.id, uri: l.uri, ownerUri: l.ownerUri, ownerId: l.ownerId, ownerName: ownerLabel(l.ownerUri || l.uri, devices, apps), title: l.title, type: l.type, units: l.units, decimals: l.decimals })),
      apps: Object.values(apps).map(p => ({ id: p.id, name: p.name, version: p.version, state: p.state, enabled: p.enabled, ready: p.ready, crashed: p.crashed, origin: p.origin })),
      users: Object.values(users).map(u => ({ id: u.id, name: u.name, present: u.present, asleep: u.asleep, avatar: u.avatar || null, role: u.role })),
      alarms: Object.values(alarms).map(x => ({ id: x.id, name: x.name, time: x.time, enabled: x.enabled, repetition: x.repetition, nextOccurrence: x.nextOccurrence })),
    };
    this.emit('library', this.cache);
    return this.cache;
  }

  async subscribe() {
    for (const i of this.instances) { try { i.destroy(); } catch (e) { /* */ } }
    this.instances = [];
    for (const dev of Object.values(this.rawDevices || {})) {
      for (const capId of dev.capabilities || []) {
        try {
          const inst = dev.makeCapabilityInstance(capId, value => {
            const d = this.cache.devices.find(x => x.id === dev.id);
            if (d && d.caps[capId]) d.caps[capId].value = value;
            this.emit('update', { kind: 'cap', deviceId: dev.id, cap: capId, value });
          });
          this.instances.push(inst);
        } catch (e) { /* capability zonder realtime */ }
      }
    }
    const a = this.api;
    const relib = debounce(() => this.refresh().then(() => this.subscribe()).catch(() => {}), 3000);
    await this.safe(async () => {
      await a.devices.connect();
      a.devices.on('device.create', relib);
      a.devices.on('device.delete', relib);
    });
    await this.safe(async () => {
      await a.logic.connect();
      a.logic.on('variable.update', v => {
        const x = this.cache.variables.find(y => y.id === v.id);
        if (x) x.value = v.value;
        this.emit('update', { kind: 'var', id: v.id, value: v.value });
      });
    });
    await this.safe(async () => {
      await a.users.connect();
      a.users.on('user.update', u => {
        const x = this.cache.users.find(y => y.id === u.id);
        if (x) { x.present = u.present; x.asleep = u.asleep; }
        this.emit('update', { kind: 'user', id: u.id, present: u.present, asleep: u.asleep });
      });
    });
    // vangnet: elke 10 minuten alles opnieuw ophalen
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh().catch(() => {}), 10 * 60 * 1000);
  }

  library() { return this.cache; }

  async setCapability(deviceId, capabilityId, value) {
    return this.api.devices.setCapabilityValue({ deviceId, capabilityId, value });
  }
  async triggerFlow(id, type) {
    if (type === 'advancedflow') return this.api.flow.triggerAdvancedFlow({ id });
    return this.api.flow.triggerFlow({ id });
  }
  async setMood(id) { return this.api.moods.setMood({ id }); }
  async setVariable(id, value) {
    await this.api.logic.updateVariable({ id, variable: { value } });
    const x = this.cache.variables.find(y => y.id === id);
    if (x) x.value = value;
    this.emit('update', { kind: 'var', id, value });
  }
  async setAlarm(id, enabled) {
    await this.api.alarms.updateAlarm({ id, alarm: { enabled } });
    const x = this.cache.alarms.find(y => y.id === id);
    if (x) x.enabled = enabled;
  }
  async insightEntries(uri, id, resolution) {
    return this.api.insights.getLogEntries({ uri, id, resolution });
  }
  async notifications() {
    const n = await this.safe(() => this.api.notifications.getNotifications(), {});
    return Object.values(n).map(x => ({ id: x.id, excerpt: x.excerpt, dateCreated: x.dateCreated, ownerUri: x.ownerUri }))
      .sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated)).slice(0, 50);
  }
  // Ruwe aanroep op de lokale Homey-API (voor de brug naar app-widgets).
  async rawCall({ method, path, body }) {
    if (!this.api) throw new Error('Nog geen verbinding met Homey');
    return this.api.call({ method, path, body });
  }
  // Live-berichten van een app (homey.api.realtime in de app).
  async subscribeApp(appId, onEvent) {
    if (!this.api) throw new Error('Nog geen verbinding met Homey');
    return this.api.subscribe(`homey:app:${appId}`, { onEvent: (event, data) => onEvent(event, data) });
  }

  // ---------- flows maken en aanpassen (voor de assistent) ----------
  async flowCards(kind) {
    this._cards = this._cards || {};
    const c = this._cards[kind];
    if (c && Date.now() - c.at < 5 * 60 * 1000) return c.list;
    const fn = { trigger: 'getFlowCardTriggers', condition: 'getFlowCardConditions', action: 'getFlowCardActions' }[kind];
    const raw = await this.api.flow[fn]();
    const list = Object.values(raw).map(x => ({ id: x.id, ownerUri: x.ownerUri, title: x.title, titleFormatted: x.titleFormatted || null, hint: x.hint || null, args: x.args || [], droptoken: x.droptoken || null, duration: !!x.duration, deprecated: !!x.deprecated }));
    this._cards[kind] = { at: Date.now(), list };
    return list;
  }
  async flowAutocomplete(kind, id, name, query, args) {
    return this.api.flow.getFlowCardAutocomplete({ type: 'flowcard' + kind, id, name, query: query || '', args: args || {} });
  }
  // camerabeeld van een apparaat (bijv. Reolink-app) via de afbeeldingen van Homey
  async cameraImage(deviceId, imageId) {
    const d = (this.rawDevices || {})[deviceId];
    if (!d) throw new Error('Het camera-apparaat is niet gevonden in Homey');
    const imgs = d.images || [];
    const img = imgs.find(i => i.id === imageId) || imgs[0];
    const url = img && ((img.imageObj && img.imageObj.url) || img.url);
    if (!url) throw new Error('Dit apparaat geeft geen camerabeeld door aan Homey. Gebruik Surveillance Station of het IP-adres van de camera.');
    const full = /^https?:/.test(url) ? url : this.address + url;
    const r = await fetch(full + (full.includes('?') ? '&' : '?') + 't=' + Date.now(), { headers: { Authorization: 'Bearer ' + this.token } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\//.test(type)) throw new Error(`Homey gaf geen camerabeeld (${r.status})`);
    return { type, data: Buffer.from(await r.arrayBuffer()) };
  }
  async runAction(id, args) { return this.api.flow.runFlowCardAction({ id, args: args || {} }); }
  async getFlowRaw(id) {
    const f = await this.api.flow.getFlow({ id });
    return { id: f.id, name: f.name, folder: f.folder || null, enabled: f.enabled, trigger: f.trigger, conditions: f.conditions || [], actions: f.actions || [] };
  }
  async createFlow(flow) { const f = await this.api.flow.createFlow({ flow }); return f.id; }
  async updateFlow(id, flow) { await this.api.flow.updateFlow({ id, flow }); }
  async deleteFlow(id) { await this.api.flow.deleteFlow({ id }); }
  async getAdvancedFlowRaw(id) {
    const f = await this.api.flow.getAdvancedFlow({ id });
    return { id: f.id, name: f.name, folder: f.folder || null, enabled: f.enabled, cards: f.cards || {} };
  }
  async createAdvancedFlow(flow) { const f = await this.api.flow.createAdvancedFlow({ advancedflow: flow }); return f.id; }
  async deleteAdvancedFlow(id) { await this.api.flow.deleteAdvancedFlow({ id }); }
  async deleteDevice(id) { await this.api.devices.deleteDevice({ id }); setTimeout(() => this.refresh().catch(() => {}), 3000); }
  async flowFolder(name) {
    const all = Object.values(await this.api.flow.getFlowFolders());
    const f = all.find(x => x.name === name);
    if (f) return f.id;
    return (await this.api.flow.createFlowFolder({ flowfolder: { name } })).id;
  }
  // ---------- controle ----------
  async healthData() {
    const [flows, adv, apps] = await Promise.all([
      this.api.flow.getFlows(), this.api.flow.getAdvancedFlows(), this.safe(() => this.api.apps.getApps(), null),
    ]);
    const appList = apps ? Object.values(apps).map(p => ({ id: p.id, name: p.name, state: p.state, enabled: p.enabled, ready: p.ready, crashed: p.crashed })) : this.cache.apps;
    return {
      devices: this.cache.devices, apps: appList,
      flows: Object.values(flows).map(f => ({ id: f.id, name: f.name, enabled: f.enabled, broken: !!f.broken, trigger: f.trigger, conditions: f.conditions || [], actions: f.actions || [] })),
      advancedFlows: Object.values(adv).map(f => ({ id: f.id, name: f.name, enabled: f.enabled, broken: !!f.broken, cards: f.cards || {} })),
    };
  }
  async restartApp(id) {
    await this.api.apps.restartApp({ id });
    setTimeout(() => this.refresh().catch(() => {}), 15000);
  }

  deviceName(id) { const d = this.cache.devices.find(x => x.id === id); return d ? d.name : null; }
  appName(id) { const a = this.cache.apps.find(x => x.id === id); return a ? a.name : null; }

  async location() {
    return this.safe(() => this.api.geolocation.getOptionLocation(), null);
  }
}

// Naam van de eigenaar van een Insights-log (Log.ownerName van Homey is verouderd en spamt het logboek)
function ownerLabel(uri, devices, apps) {
  const [, type, id] = String(uri || '').split(':');
  if (type === 'device') return (devices[id] && devices[id].name) || '';
  if (type === 'app') return (apps[id] && apps[id].name) || id;
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
}

function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

module.exports = { HomeyAdapter };
