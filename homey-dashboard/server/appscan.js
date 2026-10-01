'use strict';
// Proef: widgets van apps op je Homey zoeken en (als Homey dat toelaat) de bestanden ophalen,
// zodat ze in het dashboard kunnen draaien via de bestaande brug (appbridge.js).
// Welke adressen Homey hiervoor gebruikt is niet gedocumenteerd; daarom worden er een paar geprobeerd.
const fs = require('fs');
const path = require('path');

const CANDIDATES = [
  (a, w, f) => `/app/${a}/widgets/${w}/public/${f}`,
  (a, w, f) => `/app/${a}/widgets/${w}/${f}`,
  (a, w, f) => `/api/app/${a}/widgets/${w}/public/${f}`,
  (a, w, f) => `/api/app/${a}/widget/${w}/public/${f}`,
];

class AppScan {
  constructor(homey, dir) { this.homey = homey; this.dir = dir; this.last = null; }

  async getFile(p) {
    const h = this.homey; if (!h.address) throw new Error('Demo-modus: geen Homey gekoppeld');
    const r = await fetch(h.address + p, { headers: { Authorization: 'Bearer ' + h.token } });
    if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
    return Buffer.from(await r.arrayBuffer());
  }

  // Welke apps hebben widgets? Eerst de app-gegevens, dan de dashboard-manager van Homey.
  async listWidgets() {
    const api = this.homey.api; if (!api) throw new Error('Nog geen verbinding met Homey (of demo-modus)');
    const out = []; const seen = new Set(); const notes = [];
    const push = (appId, appName, widgetId, name, settings) => { const k = appId + '/' + widgetId; if (seen.has(k)) return; seen.add(k); out.push({ appId, appName: appName || appId, widgetId, name: name || widgetId, settings: settings || [] }); };
    const nm = n => (n && typeof n === 'object' ? (n.nl || n.en || Object.values(n)[0]) : n) || '';
    try {
      const apps = await api.apps.getApps();
      for (const a of Object.values(apps || {})) {
        const ws = a.widgets || (a.manifest && a.manifest.widgets);
        if (ws) for (const [wid, w] of Object.entries(ws)) push(a.id, nm(a.name), w.id || wid, nm(w.name), w.settings);
      }
    } catch (e) { notes.push('Apps: ' + (e.message || e)); }
    for (const p of ['/api/manager/dashboards/widget', '/api/manager/dashboards/widgets', '/api/manager/dashboards/app-widget']) {
      try {
        const r = await this.homey.rawCall({ method: 'GET', path: p });
        for (const w of Object.values(r || {})) { const appId = w.appId || (w.uri || '').replace('homey:app:', '') || (w.ownerUri || '').replace('homey:app:', ''); if (appId && (w.widgetId || w.id)) push(appId, w.appName, w.widgetId || w.id, nm(w.name), w.settings); }
        notes.push(`${p}: gevonden`);
        break;
      } catch (e) { notes.push(`${p}: ${e.statusCode || e.status || e.message}`); }
    }
    return { widgets: out, notes };
  }

  // Lijst plus per widget: kan het bestand worden opgehaald, en via welk adres?
  async scan() {
    const { widgets, notes } = await this.listWidgets();
    for (const w of widgets) {
      w.installed = fs.existsSync(path.join(this.dir, w.appId, w.widgetId, 'index.html'));
      w.tried = [];
      for (let i = 0; i < CANDIDATES.length; i++) {
        const p = CANDIDATES[i](w.appId, w.widgetId, 'index.html');
        try { await this.getFile(p); w.route = i; w.tried.push(p + ': ok'); break; } catch (e) { w.tried.push(p + ': ' + (e.status || e.message)); }
      }
      w.ok = w.route !== undefined;
    }
    this.last = { at: Date.now(), widgets, notes };
    return this.last;
  }

  // Bestanden van één widget ophalen en in appwidgets/<app>/<widget>/ zetten
  async install(appId, widgetId) {
    if (!/^[\w.-]+$/.test(appId) || !/^[\w.-]+$/.test(widgetId)) throw new Error('Ongeldige naam');
    const w = (this.last && this.last.widgets.find(x => x.appId === appId && x.widgetId === widgetId)) || (await this.scan()).widgets.find(x => x.appId === appId && x.widgetId === widgetId);
    if (!w || !w.ok) throw new Error('Deze widget kan niet worden opgehaald van je Homey');
    const mk = f => CANDIDATES[w.route](appId, widgetId, f);
    const dest = path.join(this.dir, appId, widgetId); fs.mkdirSync(dest, { recursive: true });
    const html = (await this.getFile(mk('index.html'))).toString('utf8');
    fs.writeFileSync(path.join(dest, 'index.html'), html);
    // lokaal verwezen bestanden (src/href zonder http) ook ophalen
    const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map(m => m[1]).filter(u => !/^(https?:|data:|\/\/|\/|mailto:)/.test(u) && !u.includes('..'));
    const got = []; const failed = [];
    for (const r of [...new Set(refs)].slice(0, 40)) {
      try { const b = await this.getFile(mk(r)); const f = path.join(dest, r); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); got.push(r); } catch (e) { failed.push(r); }
    }
    const appJson = path.join(this.dir, appId, 'app.json');
    if (!fs.existsSync(appJson)) fs.writeFileSync(appJson, JSON.stringify({ id: appId, name: { nl: w.appName } }, null, 1));
    fs.writeFileSync(path.join(dest, 'widget.compose.json'), JSON.stringify({ name: { nl: w.name }, settings: w.settings || [] }, null, 1));
    w.installed = true;
    return { ok: true, files: got.length + 1, failed };
  }
}

module.exports = { AppScan };
