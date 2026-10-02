'use strict';
// Beveiliging op de NAS: beheer-acties (opslaan, terugzetten, bijwerken, sleutels, tablet, ...) alleen met een geldige sessie.
// Actief zodra er een pincode is ingesteld én "Achterkant op slot" aan staat. De voorkant (lampen, flows starten, camera) blijft vrij.
// Een sessie krijg je met de pincode: gewoon 30 minuten (verlengt bij gebruik), "vertrouwd apparaat" 1 jaar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SHORT = 30 * 60 * 1000;
const LONG = 365 * 24 * 3600 * 1000;
const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');

class Auth {
  constructor({ dataDir, flows, readConfig }) {
    this.file = path.join(dataDir, 'sessies.json');
    this.flows = flows; this.readConfig = readConfig;
    this.s = {}; try { this.s = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch (e) { this.s = {}; }
  }
  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.s, null, 1)); } catch (e) { /* */ } }
  prune() { const now = Date.now(); let ch = false; for (const [k, v] of Object.entries(this.s)) if (!v || v.exp < now) { delete this.s[k]; ch = true; } if (ch) this.save(); }

  // beveiliging aan?
  active() {
    if (!this.flows.pinSet()) return false;
    const c = this.readConfig() || {}; return !!(c.settings && c.settings.lock && c.settings.lock.enabled);
  }
  issue(trusted, name) {
    this.prune();
    const token = crypto.randomBytes(24).toString('hex');
    this.s[sha(token)] = { trusted: !!trusted, exp: Date.now() + (trusted ? LONG : SHORT), name: String(name || '').slice(0, 60), at: new Date().toISOString() };
    this.save(); return token;
  }
  valid(token) {
    if (!token) return false;
    const k = sha(token); const v = this.s[k];
    if (!v || v.exp < Date.now()) { if (v) { delete this.s[k]; this.save(); } return false; }
    if (!v.trusted) { v.exp = Date.now() + SHORT; } // gewone sessie verlengt bij gebruik (niet elke keer wegschrijven)
    return true;
  }
  drop(token) { if (token) { delete this.s[sha(token)]; this.save(); } }
  revokeAll() { this.s = {}; this.save(); }
  trustedCount() { this.prune(); return Object.values(this.s).filter(v => v.trusted).length; }
  tokenOf(req) { return req.get('X-Dash-Token') || (req.query && req.query.token) || ''; }
  state(req) { return { active: this.active(), pinSet: this.flows.pinSet(), valid: this.valid(this.tokenOf(req)), trusted: this.trustedCount() }; }

  // middleware voor beheer-routes
  get guard() {
    return (req, res, next) => {
      if (!this.active() || this.valid(this.tokenOf(req))) return next();
      res.status(401).json({ error: 'Pincode nodig voor deze actie', needPin: true });
    };
  }
}

module.exports = { Auth };
