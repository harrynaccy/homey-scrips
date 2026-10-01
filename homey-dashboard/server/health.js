'use strict';
// Controle van apparaten, apps en flows. Kost niets (geen Claude); repareren = app herstarten
// of (voor flows) een voorstel van de assistent.
const fs = require('fs');
const path = require('path');
const BATTERY_LOW = 20;           // procent
const STALE_HOURS = 24;           // sensor heeft zo lang niets gemeld

const appIdOf = driver => { const p = String(driver || '').split(':'); return p[0] === 'homey' && p[1] === 'app' ? p[2] : null; };
const ts = v => (v ? new Date(v).getTime() : 0);
const ago = ms => { const h = Math.round(ms / 3.6e6); return h < 48 ? `${h} uur` : `${Math.round(h / 24)} dagen`; };
const isRunning = a => a && !a.crashed && (!a.state || a.state === 'running' || a.state === 'starting');

function checkDevices({ devices = [], apps = [] }, now = Date.now()) {
  const out = []; const appById = new Map(apps.map(a => [a.id, a]));
  const restart = a => (a ? { type: 'restartApp', appId: a.id, label: `App ${a.name} herstarten` } : null);
  for (const a of apps) {
    if (a.enabled === false) continue;
    if (!isRunning(a)) {
      const n = devices.filter(d => appIdOf(d.driver) === a.id).length;
      out.push({ sev: 'error', kind: 'app', id: a.id, title: `App ${a.name}`, problem: a.crashed || a.state === 'crashed' ? 'Is vastgelopen' : 'Is gestopt', detail: n ? (n === 1 ? '1 apparaat gebruikt deze app' : `${n} apparaten gebruiken deze app`) : '', fix: restart(a) });
    }
  }
  for (const d of devices) {
    const app = appById.get(appIdOf(d.driver));
    if (d.available === false) {
      const radio = /zigbee|zwave|z-wave/i.test(d.driver || '') ? 'Zigbee/Z-Wave: haal de stroom of batterij er even af, zet het dichter bij Homey of koppel opnieuw.' : '';
      out.push({ sev: 'error', kind: 'device', id: d.id, canDelete: true, title: d.name, problem: 'Niet bereikbaar', detail: [d.unavailableMessage && String(d.unavailableMessage).replace(/([^.!?])$/, '$1.'), app && !isRunning(app) ? `De app ${app.name} werkt niet; herstarten helpt meestal.` : radio].filter(Boolean).join(' '), fix: restart(app) });
      continue;
    }
    const c = d.caps || {};
    const bat = c.measure_battery && typeof c.measure_battery.value === 'number' ? c.measure_battery.value : null;
    if ((bat !== null && bat < BATTERY_LOW) || (c.alarm_battery && c.alarm_battery.value === true)) {
      out.push({ sev: 'warn', kind: 'device', id: d.id, title: d.name, problem: bat !== null ? `Batterij bijna leeg (${Math.round(bat)}%)` : 'Batterij bijna leeg', detail: 'Vervang de batterij.', fix: null });
    }
    // "niets gemeld" alleen bij apparaten op batterij: een schakelaar of virtueel apparaat dat niets
    // verandert, meldt ook niets en dat is normaal. Virtuele apparaten en camera's slaan we over.
    const sensor = Object.keys(c).some(k => /^(measure_|alarm_)/.test(k));
    const onBattery = d.battery || bat !== null || !!c.alarm_battery;
    const virtual = /virtu|devicecapab/i.test(`${appIdOf(d.driver) || ''} ${(app && app.name) || ''} ${d.driver || ''}`);
    const camera = d.class === 'camera' || /onvif|camera/i.test(`${appIdOf(d.driver) || ''} ${(app && app.name) || ''}`);
    const last = Math.max(0, ...Object.values(c).map(x => ts(x.lastUpdated)));
    if (sensor && onBattery && !virtual && !camera && last && now - last > STALE_HOURS * 3.6e6) {
      out.push({ sev: 'warn', kind: 'device', id: d.id, title: d.name, problem: `Al ${ago(now - last)} niets gemeld`, detail: 'Misschien is de batterij leeg of is het apparaat buiten bereik.', fix: app ? { ...restart(app), optional: true } : null });
    }
  }
  return out;
}

// alle verwijzingen naar apparaten en apps in een flow (kaarten en droptokens)
function refsOf(cards) {
  const out = [];
  for (const c of cards) {
    if (!c) continue;
    for (const v of [c.id, c.droptoken]) {
      const m = /^homey:(device|app):([^:|]+)/.exec(String(v || ''));
      if (m) out.push({ type: m[1], id: m[2], card: String(c.id || '') });
    }
  }
  return out;
}

function checkFlows({ flows = [], advancedFlows = [], devices = [], apps = [] }) {
  const out = []; const dev = new Map(devices.map(d => [d.id, d])); const app = new Map(apps.map(a => [a.id, a]));
  const all = [...flows.map(f => ({ ...f, adv: false, cards: [f.trigger, ...(f.conditions || []), ...(f.actions || [])] })),
    ...advancedFlows.map(f => ({ ...f, adv: true, cards: Object.values(f.cards || {}) }))];
  for (const f of all) {
    const probs = []; let sev = 'warn';
    if (f.broken) { probs.push('Homey meldt dat deze flow kapot is'); sev = 'error'; }
    const seen = new Set();
    for (const r of refsOf(f.cards)) {
      const k = r.type + r.id; if (seen.has(k)) continue; seen.add(k);
      if (r.type === 'device') {
        const d = dev.get(r.id);
        if (!d) { probs.push(`Gebruikt een apparaat dat niet meer bestaat (kaart ${r.card.split(':').pop()})`); sev = 'error'; }
        else if (d.available === false) probs.push(`Apparaat ${d.name} is niet bereikbaar`);
      } else {
        const a = app.get(r.id);
        if (!a) { probs.push(`Gebruikt de app ${r.id}, die niet (meer) geïnstalleerd is`); sev = 'error'; }
        else if (a.enabled !== false && !isRunning(a)) probs.push(`De app ${a.name} werkt niet`);
      }
    }
    if (!f.adv && !(f.actions || []).length) probs.push('Heeft geen DAN-kaart, dus doet niets');
    if (!probs.length) continue;
    const fix = f.adv
      ? { type: 'advice', label: 'Zelf aanpassen', text: 'Dit is een geavanceerde flow. Open hem in de Homey-app en vervang of verwijder de kaartjes met een rood uitroepteken.' }
      : { type: 'assistant', label: 'Laat Claude repareren', prompt: `Repareer de flow "${f.name}" (id ${f.id}). Problemen: ${probs.join('; ')}. Lees de flow, zoek het juiste vervangende apparaat of kaartje en stel een aangepaste versie voor. Weet je niet zeker welk apparaat bedoeld is, vraag het mij dan eerst.` };
    out.push({ sev, kind: 'flow', id: f.id, adv: f.adv, canDelete: true, title: f.name + (f.adv ? ' (geavanceerd)' : ''), problem: probs[0], detail: probs.slice(1).join(' · '), enabled: f.enabled !== false, fix });
  }
  // flows die uitstaan: alleen ter info
  const off = all.filter(f => f.enabled === false && !out.some(o => o.id === f.id)).length;
  return { issues: out, disabled: off, total: all.length };
}

// Een melding herkennen, ook als een getal verandert ("4 dagen" → "5 dagen", "15%" → "12%").
const keyOf = x => `${x.kind}|${x.id}|${String(x.problem || '').replace(/\d+/g, '#')}`;

class Health {
  constructor(homey, dataDir) {
    this.homey = homey; this.last = null;
    this.ignFile = dataDir ? path.join(dataDir, 'controle-negeren.json') : null;
  }
  // ---------- negeren: geldt zolang hetzelfde probleem blijft ----------
  ignored() { try { return JSON.parse(fs.readFileSync(this.ignFile, 'utf8')) || {}; } catch (e) { return {}; } }
  saveIgnored(o) { if (this.ignFile) fs.writeFileSync(this.ignFile, JSON.stringify(o, null, 1)); }
  ignore(key, info) { const o = this.ignored(); o[key] = { title: String((info && info.title) || ''), problem: String((info && info.problem) || ''), at: Date.now() }; this.saveIgnored(o); this.last = null; }
  unignore(key) { const o = this.ignored(); delete o[key]; this.saveIgnored(o); this.last = null; }

  async run(force) {
    if (!force && this.last && Date.now() - this.last.at < 60 * 1000) return this.last;
    const data = await this.homey.healthData();
    this.apps = data.apps; this.data = data;
    const devices = checkDevices(data);
    if (this.cameras) {
      const cams = this.cameras.load().cams;
      await Promise.all(cams.map(c => this.cameras.snapshot(c.id).catch(e => {
        devices.push({ sev: 'error', kind: 'camera', id: c.id, title: `Camera ${c.name}`, problem: 'Geeft geen beeld', detail: String(e.message || e), fix: null });
      })));
    }
    const flows = checkFlows(data);
    const sevOrder = { error: 0, warn: 1 };
    const sort = l => l.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev] || a.title.localeCompare(b.title));
    // genegeerde meldingen apart; is het probleem weg, dan vervalt het negeren (komt het later terug, dan weer melden)
    const ign = this.ignored(); const all = [...devices, ...flows.issues]; const seen = new Set();
    for (const x of all) { x.key = keyOf(x); seen.add(x.key); }
    let cleaned = false; for (const k of Object.keys(ign)) if (!seen.has(k)) { delete ign[k]; cleaned = true; }
    if (cleaned) this.saveIgnored(ign);
    const keep = l => l.filter(x => !ign[x.key]);
    const devs = keep(devices), fls = keep(flows.issues);
    const ignoredList = all.filter(x => ign[x.key]).map(x => ({ key: x.key, kind: x.kind, sev: x.sev, title: x.title, problem: x.problem, at: ign[x.key].at }));
    this.last = { at: Date.now(), devices: sort(devs), flows: sort(fls), ignored: ignoredList, flowsDisabled: flows.disabled, flowsTotal: flows.total, devicesTotal: data.devices.length,
      errors: [...devs, ...fls].filter(x => x.sev === 'error').length, warnings: [...devs, ...fls].filter(x => x.sev === 'warn').length };
    return this.last;
  }
  // waar wordt een apparaat gebruikt? (voordat je het verwijdert)
  async usage(id, cfg) {
    const data = this.data || await this.homey.healthData();
    const uses = cards => cards.some(c => c && [c.id, c.droptoken].some(v => String(v || '').startsWith('homey:device:' + id)));
    const flows = [...data.flows.filter(f => uses([f.trigger, ...(f.conditions || []), ...(f.actions || [])])).map(f => f.name),
      ...data.advancedFlows.filter(f => uses(Object.values(f.cards || {}))).map(f => f.name + ' (geavanceerd)')];
    const tiles = [];
    for (const tab of (cfg && cfg.tabs) || []) for (const t of tab.tiles || []) if (t.ref && t.ref.deviceId === id) tiles.push(`${(t.opts && t.opts.title) || 'tegel'} op ${tab.name}`);
    return { flows, tiles };
  }
  async deleteDevice(id, flows, pin) {
    flows.checkPin(pin);
    const d = (this.data ? this.data.devices : this.homey.library().devices).find(x => x.id === id);
    console.log(`[controle] apparaat verwijderen: ${d ? d.name : id}`);
    await this.homey.deleteDevice(id);
    this.last = null;
    return { ok: true };
  }
  async restartApp(id) {
    const a = [...(this.apps || []), ...(this.homey.library().apps || [])].find(x => x.id === id);
    if (!a) throw new Error('Deze app bestaat niet');
    console.log(`[controle] app ${id} herstarten`);
    await this.homey.restartApp(id);
    this.last = null;
    return { ok: true };
  }
}

module.exports = { Health, checkDevices, checkFlows, BATTERY_LOW, STALE_HOURS };
