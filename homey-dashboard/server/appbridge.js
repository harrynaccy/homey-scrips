'use strict';
/* ==========================================================================
   Brug naar widgets van je eigen Homey-apps.

   Een widget uit een Homey-app praat normaal via het `Homey`-object van het
   Homey-dashboard met zijn app. Buiten Homey bestaat dat object niet. Deze
   brug:
     - serveert de widgetbestanden (map appwidgets/<app-id>/<widget-id>/)
       met een vervangend `Homey`-object (public/js/aw-shim.js);
     - stuurt Homey.api(...) van de widget door naar je Homey (met de
       API-sleutel van het dashboard, die nooit in de browser komt);
     - stuurt de live-berichten van de app (Homey.on(...)) door naar de
       widgets.

   Stap 1 (zonder de app te veranderen): de bestaande widget-API van de app
   rechtstreeks aanroepen. Welke adresvorm Homey daarvoor gebruikt is niet
   gedocumenteerd, dus de brug probeert er een paar en onthoudt welke werkt.
   Stap 2 (alleen als stap 1 niet lukt): een extra "/bridge"-ingang in de
   app zelf. Ook die probeert de brug automatisch.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const ROUTES = [
  { id: 'widget', label: 'widget-API (…/widget/<id>)', build: (a, w, p) => ({ path: `/api/app/${a}/widget/${w}${p}` }) },
  { id: 'widgets', label: 'widget-API (…/widgets/<id>)', build: (a, w, p) => ({ path: `/api/app/${a}/widgets/${w}${p}` }) },
  { id: 'widget-api', label: 'widget-API (…/widget/<id>/api)', build: (a, w, p) => ({ path: `/api/app/${a}/widget/${w}/api${p}` }) },
  { id: 'bridge', label: 'brug in de app (/bridge)', bridge: true },
];

class AppBridge extends EventEmitter {
  constructor(homey, dir) {
    super();
    this.homey = homey;
    this.dir = dir;
    this.state = {}; // appId -> { route, error, tried, realtime, lastOkAt, lastCallAt }
    this.subs = {};
    this.lastState = {};
    this.polling = {};
    // Altijd meedraaien (ook als live-berichten "aan" staan): die komen via
    // de API-sleutel niet altijd door, en dan bleef een nieuw nummer tot
    // 30 s hangen. Elke 2 s lokaal bij je Homey kijken; dit gaat NIET naar Spotify.
    setInterval(() => this.pollFallback(), 2000);
  }

  // Welke widgets staan er in de map appwidgets?
  list() {
    const out = [];
    if (!fs.existsSync(this.dir)) return out;
    for (const appId of fs.readdirSync(this.dir)) {
      const ad = path.join(this.dir, appId);
      if (!fs.statSync(ad).isDirectory()) continue;
      let appName = appId;
      try { appName = JSON.parse(fs.readFileSync(path.join(ad, 'app.json'), 'utf8')).name.nl || appName; } catch (e) { /* */ }
      for (const widgetId of fs.readdirSync(ad)) {
        const wd = path.join(ad, widgetId);
        if (!fs.statSync(wd).isDirectory() || !fs.existsSync(path.join(wd, 'index.html'))) continue;
        let name = widgetId, settings = [];
        try {
          const c = JSON.parse(fs.readFileSync(path.join(wd, 'widget.compose.json'), 'utf8'));
          name = (c.name && (c.name.nl || c.name.en)) || widgetId; settings = c.settings || [];
        } catch (e) { /* */ }
        out.push({ appId, appName, widgetId, name, defaults: Object.fromEntries(settings.filter(s => s.id).map(s => [s.id, s.value])) });
      }
    }
    return out;
  }
  known(appId, widgetId) { return this.list().some(w => w.appId === appId && w.widgetId === widgetId); }

  status() {
    const apps = [...new Set(this.list().map(w => w.appId))];
    return apps.map(appId => ({ appId, ...(this.state[appId] || { route: null, error: null }) }));
  }

  st(appId) { return (this.state[appId] = this.state[appId] || { route: null, routeLabel: null, error: null, tried: [], realtime: false }); }

  // Eén aanroep van Homey.api(method, path, body) uit een widget.
  async call(appId, widgetId, method, p, body, internal = false) {
    if (!this.homey.rawCall) throw new Error('Demo-modus: geen Homey gekoppeld');
    if (!this.known(appId, widgetId)) throw new Error('Onbekende widget');
    method = String(method || 'GET').toUpperCase();
    if (!/^(GET|POST|PUT|DELETE)$/.test(method)) throw new Error('Ongeldige methode');
    p = '/' + String(p || '').replace(/^\/+/, '');
    if (p.includes('..')) throw new Error('Ongeldig pad');
    const s = this.st(appId);
    if (!internal) { s.lastCallAt = Date.now(); this.subscribe(appId); }

    const order = s.route ? [ROUTES.find(r => r.id === s.route), ...ROUTES.filter(r => r.id !== s.route)] : ROUTES;
    const tried = [];
    for (const r of order) {
      try {
        const res = r.bridge
          ? await this.homey.rawCall({ method: 'POST', path: `/api/app/${appId}/bridge`, body: { widget: widgetId, method, path: p, body: body ?? null } })
          : await this.homey.rawCall({ method, path: r.build(appId, widgetId, p).path, body: method === 'GET' ? undefined : (body ?? {}) });
        if (s.route !== r.id) console.log(`[appbridge] ${appId}: werkt via ${r.label}`);
        Object.assign(s, { route: r.id, routeLabel: r.label, error: null, tried, lastOkAt: Date.now() });
        return res;
      } catch (err) {
        const code = err.statusCode || err.status || (/not ?found|404/i.test(err.message) ? 404 : 0);
        tried.push(`${r.label}: ${code || err.message}`);
        // 404/405 = deze adresvorm bestaat niet: volgende proberen.
        if (code === 404 || code === 405) continue;
        // Adres bestaat wel, maar de app gaf een fout: route onthouden en fout doorgeven.
        if (s.route === r.id || code === 400 || code >= 500) {
          Object.assign(s, { route: r.id, routeLabel: r.label, error: err.message });
          throw err;
        }
        continue; // bijv. 403 (rechten): volgende vorm proberen
      }
    }
    s.route = null; s.routeLabel = null; s.tried = tried;
    s.error = 'Geen enkele route naar de widget-API werkt. Stap 2 nodig: de /bridge-ingang in de app.';
    throw new Error(s.error);
  }

  // Live-berichten van de app (homey.api.realtime) doorsturen.
  async subscribe(appId) {
    if (this.subs[appId] || !this.homey.subscribeApp) return;
    this.subs[appId] = 'bezig';
    try {
      await this.homey.subscribeApp(appId, (event, data) => {
        // Live-bericht onthouden, zodat de controle hieronder hetzelfde niet nog eens stuurt.
        if (event === 'state') this.lastState[appId] = this.stateKey(data);
        this.emit('event', { appId, event, data });
      });
      this.st(appId).realtime = true;
      console.log(`[appbridge] ${appId}: live-berichten actief`);
    } catch (err) {
      this.st(appId).realtime = false;
      console.warn(`[appbridge] ${appId}: live-berichten niet beschikbaar (${err.message}); status wordt elke 3 s opgevraagd`);
    }
  }

  stateKey(st) {
    const { now, sampledAt, ...cmp } = st || {};
    return JSON.stringify(cmp);
  }

  // Controle naast de live-berichten: zolang er widgets in beeld zijn (die
  // vragen elke 30 s zelf de status op) elke 2 s lokaal de status ophalen
  // en alleen bij verandering doorsturen. Dit gaat naar je Homey, niet naar Spotify.
  async pollFallback() {
    for (const [appId, s] of Object.entries(this.state)) {
      if (this.polling[appId] || !s.route || !s.lastCallAt || Date.now() - s.lastCallAt > 75000) continue;
      const w = this.list().find(x => x.appId === appId); if (!w) continue;
      this.polling[appId] = true;
      try {
        const st = await this.call(appId, w.widgetId, 'GET', '/state', undefined, true);
        const key = this.stateKey(st);
        if (key !== this.lastState[appId]) { this.lastState[appId] = key; this.emit('event', { appId, event: 'state', data: st }); }
      } catch (e) { /* wordt in status getoond */ }
      finally { this.polling[appId] = false; }
    }
  }
}

module.exports = { AppBridge };
