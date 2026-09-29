'use strict';
// Automatische controle: elk uur (instelbaar) de Controle draaien en bij NIEUWE problemen een
// melding sturen via Homey (tijdlijn of pushbericht naar een telefoon).
const fs = require('fs');
const path = require('path');

class AutoCheck {
  constructor({ health, homey, dataDir, readConfig }) {
    this.health = health; this.homey = homey; this.readConfig = readConfig;
    this.file = path.join(dataDir, 'controle-status.json');
    this.last = this.load();
    setInterval(() => this.tick().catch(e => console.error('[controle] automatisch:', e.message || e)), 5 * 60 * 1000);
    setTimeout(() => this.tick().catch(() => {}), 90 * 1000);
  }
  load() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { return { at: 0, known: {} }; } }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.last)); }
  settings() { const c = this.readConfig(); return { every: 1, notify: 'timeline', user: null, ...((c && c.settings && c.settings.autocheck) || {}) }; }

  async tick(force) {
    const s = this.settings();
    if (!force && (!Number(s.every) || Date.now() - this.last.at < Number(s.every) * 3600e3)) return null;
    if (this.homey.status.mode !== 'demo' && !this.homey.status.connected) return null;
    const r = await this.health.run(true);
    const issues = [...r.devices, ...r.flows];
    const key = x => `${x.kind}|${x.id}|${x.problem.replace(/\d+/g, '#')}`;
    const known = this.last.known || {}; const now = Date.now(); const next = {}; const fresh = [];
    for (const x of issues) { const k = key(x); next[k] = known[k] || now; if (!known[k]) fresh.push(x); }
    this.last = { at: now, known: next, total: issues.length, fresh: fresh.length };
    this.save();
    console.log(`[controle] automatisch: ${issues.length} problemen, ${fresh.length} nieuw`);
    if (fresh.length && s.notify !== 'uit') {
      const lines = fresh.slice(0, 5).map(x => `${x.title}: ${x.problem.toLowerCase()}`);
      const text = `Homey Dashboard – ${fresh.length === 1 ? 'nieuw probleem' : fresh.length + ' nieuwe problemen'}: ${lines.join('; ')}${fresh.length > 5 ? ` en nog ${fresh.length - 5}` : ''}. Kijk bij Controle.`;
      await this.notify(text, s).catch(e => console.error('[controle] melding sturen mislukt:', e.message || e));
    }
    return this.last;
  }
  // melding via een flowkaart van Homey zelf
  async notify(text, s = this.settings()) {
    const actions = await this.homey.flowCards('action');
    if (s.notify === 'push') {
      const card = actions.find(c => /^homey:manager:mobile:/.test(c.id) && /push/i.test(c.id));
      if (!card) throw new Error('Homey heeft geen kaart om pushberichten te sturen');
      if (!s.user) throw new Error('Kies eerst naar wie het pushbericht moet (Controle → Automatisch controleren)');
      return this.homey.runAction(card.id, { text, user: s.user });
    }
    const card = actions.find(c => /^homey:manager:notifications:/.test(c.id) && /create/i.test(c.id));
    if (!card) throw new Error('Homey heeft geen kaart om meldingen te maken');
    return this.homey.runAction(card.id, { text });
  }
  async users() {
    const actions = await this.homey.flowCards('action');
    const card = actions.find(c => /^homey:manager:mobile:/.test(c.id) && /push/i.test(c.id));
    if (!card) return [];
    const r = await this.homey.flowAutocomplete('action', card.id, 'user', '', {});
    return Array.isArray(r) ? r : Object.values(r || {});
  }
}

module.exports = { AutoCheck };
