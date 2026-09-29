'use strict';
// Flows maken en aanpassen in Homey (voor de assistent).
// - Nieuwe flows komen aan te staan, in de map "Dashboard".
// - Bestaande flows aanpassen kan alleen met de pincode (gehasht bewaard in data/flowpin.json).
// - Elke toepassing is een "batch" die in één keer terug te draaien is (data/flow-batches.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FOLDER = 'Dashboard';
const KINDS = ['trigger', 'condition', 'action'];

class FlowService {
  constructor(homey, dataDir) {
    this.homey = homey;
    this.pinFile = path.join(dataDir, 'flowpin.json');
    this.batchFile = path.join(dataDir, 'flow-batches.json');
    this.fails = 0; this.lockUntil = 0;
  }
  supported() { return typeof this.homey.flowCards === 'function' && (this.homey.status.mode === 'demo' || this.homey.status.connected); }

  // ---------- pincode ----------
  pinSet() { try { return !!JSON.parse(fs.readFileSync(this.pinFile, 'utf8')).hash; } catch (e) { return false; } }
  hash(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }
  setPin(oldPin, newPin) {
    if (!/^\d{4,8}$/.test(String(newPin || ''))) throw new Error('De pincode moet uit 4 tot 8 cijfers bestaan');
    if (this.pinSet()) this.checkPin(oldPin);
    const salt = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(this.pinFile, JSON.stringify({ salt, hash: this.hash(newPin, salt) }));
  }
  checkPin(pin) {
    if (Date.now() < this.lockUntil) throw new Error(`Te vaak een verkeerde pincode. Probeer het over ${Math.ceil((this.lockUntil - Date.now()) / 60000)} minuten opnieuw.`);
    let rec; try { rec = JSON.parse(fs.readFileSync(this.pinFile, 'utf8')); } catch (e) { throw new Error('Er is nog geen pincode ingesteld (Systeem → Pincode voor flows)'); }
    const ok = crypto.timingSafeEqual(Buffer.from(this.hash(pin || '', rec.salt), 'hex'), Buffer.from(rec.hash, 'hex'));
    if (!ok) { this.fails++; if (this.fails >= 5) { this.lockUntil = Date.now() + 5 * 60 * 1000; this.fails = 0; } throw new Error('Verkeerde pincode'); }
    this.fails = 0;
  }

  // ---------- kaartjes zoeken (tool voor Claude) ----------
  owner(uri) {
    const [, type, id] = String(uri || '').split(':');
    if (type === 'device') return 'apparaat ' + (this.homey.deviceName(id) || id);
    if (type === 'app') return 'app ' + (this.homey.appName(id) || id);
    return 'Homey ' + (id || '');
  }
  argText(a) {
    let s = `${a.name} (${a.type}${a.title ? ', ' + a.title : ''}`;
    if (a.type === 'dropdown' && Array.isArray(a.values)) s += ': ' + a.values.map(v => `${v.id}=${v.label && typeof v.label === 'object' ? v.label.nl || v.label.en : v.label}`).join(', ');
    if (a.type === 'range' || a.type === 'number') s += `: ${a.min ?? ''}..${a.max ?? ''}`;
    if (a.type === 'autocomplete') s += ': waarde ophalen met zoek_keuze';
    if (a.required === false) s += ', optioneel';
    return s + ')';
  }
  async searchCards({ soort, zoekterm, apparaatId }) {
    if (!KINDS.includes(soort)) throw new Error('soort moet trigger, condition of action zijn');
    const words = String(zoekterm || '').toLowerCase().split(/\s+/).filter(Boolean);
    let list = (await this.homey.flowCards(soort)).filter(c => !c.deprecated);
    if (apparaatId) list = list.filter(c => c.ownerUri === 'homey:device:' + apparaatId);
    const hay = c => `${c.title} ${c.titleFormatted || ''} ${this.owner(c.ownerUri)} ${c.id}`.toLowerCase();
    if (words.length) list = list.map(c => [c, words.filter(w => hay(c).includes(w)).length]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (!list.length) return 'Geen kaartjes gevonden. Probeer een ander woord of zoek zonder apparaat.';
    return list.slice(0, 25).map(c => `${c.id} | ${c.titleFormatted || c.title} | ${this.owner(c.ownerUri)}${c.args.length ? ' | args: ' + c.args.map(a => this.argText(a)).join('; ') : ''}${c.duration ? ' | kan met duur' : ''}`).join('\n') + (list.length > 25 ? `\n(${list.length - 25} meer; zoek specifieker)` : '');
  }
  async autocomplete({ soort, kaart, argument, zoekterm, args }) {
    const r = await this.homey.flowAutocomplete(soort, kaart, argument, zoekterm, args);
    const arr = Array.isArray(r) ? r : Object.values(r || {});
    return arr.length ? arr.slice(0, 20).map(x => JSON.stringify(x)).join('\n') + '\nGebruik één van deze objecten in zijn geheel als waarde.' : 'Geen keuzes gevonden.';
  }
  async readFlow(id) {
    const f = await this.homey.getFlowRaw(id);
    return JSON.stringify(f);
  }

  // ---------- controleren (voordat de gebruiker het voorstel ziet) ----------
  async check(flow) {
    const errs = []; const out = { trigger: null, conditions: [], actions: [] };
    if (!flow || typeof flow !== 'object') return { errs: ['flow ontbreekt'], out };
    const cards = {}; for (const k of KINDS) cards[k] = new Map((await this.homey.flowCards(k)).map(c => [c.id, c]));
    const card = (kind, c, where) => {
      if (!c || !c.id) { errs.push(`${where}: kaart-id ontbreekt`); return null; }
      const def = cards[kind].get(c.id);
      if (!def) { errs.push(`${where}: kaart ${c.id} bestaat niet (gebruik zoek_flowkaart)`); return null; }
      const args = c.args && typeof c.args === 'object' ? c.args : {};
      for (const a of def.args) if (a.required !== false && !(a.type === 'device' && /^homey:device:/.test(def.ownerUri)) && (args[a.name] === undefined || args[a.name] === '')) errs.push(`${where}: argument "${a.name}" ontbreekt bij ${c.id}`);
      return { id: c.id, args };
    };
    if (flow.trigger) out.trigger = card('trigger', flow.trigger, 'ALS'); else errs.push('ALS-kaart (trigger) ontbreekt');
    (flow.conditions || []).forEach((c, i) => { const r = card('condition', c, `EN ${i + 1}`); if (r) out.conditions.push({ ...r, group: ['group1', 'group2', 'group3'].includes(c.group) ? c.group : 'group1', inverted: !!c.inverted }); });
    (flow.actions || []).forEach((c, i) => {
      const r = card('action', c, `DAN ${i + 1}`); if (!r) return;
      const a = { ...r, group: c.group === 'else' ? 'else' : 'then' };
      if (c.delay && Number(c.delay.number) > 0) a.delay = { number: String(c.delay.number), multiplier: c.delay.multiplier === 60 ? 60 : 1 };
      out.actions.push(a);
    });
    if (!out.actions.length && !errs.length) errs.push('er is geen DAN-kaart (actie)');
    return { errs, out };
  }

  // ---------- toepassen en terugdraaien ----------
  batches() { try { return JSON.parse(fs.readFileSync(this.batchFile, 'utf8')); } catch (e) { return []; } }
  saveBatches(b) { fs.writeFileSync(this.batchFile, JSON.stringify(b.slice(-30), null, 1)); }
  async apply(acties, pin) {
    const list = (acties || []).filter(a => a && (a.actie === 'flow_maken' || a.actie === 'flow_aanpassen'));
    if (list.some(a => a.actie === 'flow_aanpassen')) this.checkPin(pin);
    const batch = { id: 'b' + Date.now().toString(36), at: new Date().toISOString(), created: [], updated: [] };
    const keys = {}; const steps = [];
    let folder = null;
    for (const a of list) {
      try {
        const { errs, out } = await this.check(a.flow);
        if (errs.length) throw new Error(errs.join('; '));
        if (a.actie === 'flow_maken') {
          folder = folder || await this.homey.flowFolder(FOLDER);
          const id = await this.homey.createFlow({ name: String(a.naam || 'Nieuwe flow').slice(0, 80), enabled: true, folder, ...out });
          batch.created.push(id); if (a.sleutel) keys[a.sleutel] = id;
          steps.push({ ok: true, text: a.omschrijving, id });
        } else {
          const before = await this.homey.getFlowRaw(a.flowId);
          const next = { ...out }; if (a.naam) next.name = String(a.naam).slice(0, 80); if (typeof a.aan === 'boolean') next.enabled = a.aan;
          await this.homey.updateFlow(a.flowId, next);
          batch.updated.push({ id: a.flowId, before: { name: before.name, enabled: before.enabled, trigger: before.trigger, conditions: before.conditions, actions: before.actions } });
          steps.push({ ok: true, text: a.omschrijving, id: a.flowId });
        }
      } catch (e) { steps.push({ ok: false, text: a.omschrijving, note: String(e.message || e) }); }
    }
    if (batch.created.length || batch.updated.length) { const b = this.batches(); b.push(batch); this.saveBatches(b); }
    if (this.homey.refresh && this.homey.status.mode !== 'demo') await this.homey.refresh().catch(() => {});
    return { batch: batch.created.length || batch.updated.length ? batch.id : null, keys, steps };
  }
  async undo(batchId) {
    const all = this.batches(); const b = all.find(x => x.id === batchId);
    if (!b) throw new Error('Deze wijziging is niet meer terug te draaien');
    const problems = [];
    for (const id of b.created) await this.homey.deleteFlow(id).catch(e => problems.push(e.message));
    for (const u of b.updated) await this.homey.updateFlow(u.id, u.before).catch(e => problems.push(e.message));
    this.saveBatches(all.filter(x => x !== b));
    if (this.homey.refresh && this.homey.status.mode !== 'demo') await this.homey.refresh().catch(() => {});
    return { ok: !problems.length, problems };
  }
}

module.exports = { FlowService, FOLDER };
