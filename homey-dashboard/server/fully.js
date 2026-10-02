'use strict';
// Tablet (Fully Kiosk) bedienen via de REST-koppeling van Fully Remote Admin (alleen in het eigen netwerk).
// Adres en wachtwoord staan in data/extra-geheim.json, net als de andere sleutels; het wachtwoord gaat nooit terug naar de browser.

// Aanbevolen Fully-instellingen voor dit dashboard: [sleutel, waarde, naam, waarom]
const RECOMMENDED = [
  ['websiteIntegration', true, 'JavaScript-koppeling', 'Nodig voor helderheid, nachtstand en "scherm uit"'],
  ['keepScreenOn', true, 'Scherm aan houden', 'Het dashboard bepaalt zelf wanneer het scherm uit gaat'],
  ['timeToScreensaverV2', '0', 'Screensaver van Fully', 'Uit: het dashboard heeft een eigen screensaver'],
  ['enableZoom', false, 'Zoomen', 'Uit: niet per ongeluk inzoomen'],
  ['webviewOverscroll', false, 'Terugveren bij scrollen', 'Uit: rustiger beeld'],
  ['enableBackButton', false, 'Terugknop van Android', 'Uit: niet per ongeluk weg van het dashboard'],
  ['reloadPageFailure', '30', 'Herladen als de pagina niet laadt', 'Na 30 seconden, bijvoorbeeld na een herstart van de NAS'],
  ['timeToRestartUnresponsiveWebview', '60', 'Vastgelopen pagina herstarten', 'Na 60 seconden'],
  ['remoteAdminCamshot', false, 'Camshot', 'Uit: een camerafoto op afstand is niet nodig'],
];
const ACTIONS = { screenOn: 'Scherm aan', screenOff: 'Scherm uit', loadStartURL: 'Dashboard herladen', restartApp: 'Fully herstarten', startScreensaver: 'Screensaver van Fully starten', stopScreensaver: 'Screensaver van Fully stoppen' };

class Fully {
  constructor(extra) { this.extra = extra; }

  conf() { const f = this.extra.secrets().fully || {}; return { host: f.host || '', pass: f.pass || '' }; }
  setConf({ host, pass }) {
    const o = this.extra.secrets(); const cur = o.fully || {};
    const h = String(host === undefined ? (cur.host || '') : host).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (h && !/^[\w.-]+(:\d+)?$/.test(h)) throw new Error('Ongeldig adres. Vul alleen het IP-adres in, bijvoorbeeld 192.168.178.116');
    o.fully = { host: h, pass: pass === undefined || pass === '' ? (cur.pass || '') : String(pass) };
    this.extra.saveSecrets(o);
  }
  info() { const c = this.conf(); return { host: c.host, hasPass: !!c.pass, actions: ACTIONS }; }

  url(cmd, extra, raw) {
    const c = this.conf();
    if (!c.host || !c.pass) throw new Error('Vul eerst het adres en het wachtwoord van de tablet in');
    const host = /:\d+$/.test(c.host) ? c.host : c.host + ':2323';
    return `http://${host}/?` + new URLSearchParams({ cmd, password: c.pass, ...(raw ? {} : { type: 'json' }), ...(extra || {}) });
  }

  async call(cmd, extra, raw) {
    const u = this.url(cmd, extra, raw);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    let r;
    try { r = await fetch(u, { signal: ctl.signal }); }
    catch (e) { throw new Error('Tablet niet bereikbaar. Staat hij aan, draait Fully en klopt het adres?'); }
    finally { clearTimeout(t); }
    if (raw) {
      const type = r.headers.get('content-type') || '';
      if (!r.ok || !/^image\//.test(type)) throw new Error(/^image\//.test(type) ? `Tablet gaf fout ${r.status}` : 'Geen schermafdruk ontvangen. Staat "Enable Screenshot on Remote Admin" aan en klopt het wachtwoord?');
      return { type, buf: Buffer.from(await r.arrayBuffer()) };
    }
    const txt = await r.text(); let j;
    try { j = JSON.parse(txt); } catch (e) { j = null; }
    if (!j) throw new Error(/password|login/i.test(txt) ? 'Verkeerd Fully-wachtwoord' : 'Onverwacht antwoord van de tablet');
    if (j.status === 'Error' || j.status === 'error') throw new Error(/password|login/i.test(j.statusText || '') ? 'Verkeerd Fully-wachtwoord' : (j.statusText || 'Fully meldt een fout'));
    return j;
  }

  async status() {
    const d = await this.call('deviceInfo');
    const pick = (...ks) => { for (const k of ks) if (d[k] !== undefined && d[k] !== null && d[k] !== '') return d[k]; return null; };
    return {
      model: [pick('deviceManufacturer'), pick('deviceModel')].filter(Boolean).join(' ') || pick('deviceName'),
      version: pick('appVersionName', 'version'),
      battery: pick('batteryLevel'), plugged: pick('isPlugged', 'plugged'),
      brightness: pick('screenBrightness'), screenOn: pick('isScreenOn', 'screenOn'),
      screensaver: pick('isInScreensaver', 'screensaverActive'),
      page: pick('currentPage', 'currentPageUrl'), ip: pick('ip4', 'ipAddress'),
      kiosk: pick('kioskMode', 'isKioskMode', 'kioskLocked'),
    };
  }

  async check() {
    const s = await this.call('listSettings');
    const set = s.settings && typeof s.settings === 'object' ? s.settings : s;
    return RECOMMENDED.map(([key, want, label, why]) => {
      const now = set[key];
      const ok = now !== undefined && String(now) === String(want);
      return { key, label, why, want, now: now === undefined ? null : now, ok, missing: now === undefined };
    });
  }

  async apply() {
    const list = await this.check(); const done = []; const failed = [];
    for (const it of list) {
      if (it.ok || it.missing) continue;
      const want = RECOMMENDED.find(x => x[0] === it.key)[1];
      try {
        if (typeof want === 'boolean') await this.call('setBooleanSetting', { key: it.key, value: String(want) });
        else await this.call('setStringSetting', { key: it.key, value: String(want) });
        done.push(it.label);
      } catch (e) { failed.push(it.label + ': ' + e.message); }
    }
    return { done, failed };
  }

  async action(cmd) {
    if (!ACTIONS[cmd]) throw new Error('Onbekende opdracht');
    await this.call(cmd);
    return { ok: true, label: ACTIONS[cmd] };
  }

  screenshot() { return this.call('getScreenshot', null, true); }
}

module.exports = { Fully, RECOMMENDED };
