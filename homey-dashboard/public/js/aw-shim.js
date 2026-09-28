/* ==========================================================================
   Vervangend `Homey`-object voor widgets van je eigen Homey-apps, zodat ze
   ook buiten het Homey-dashboard werken. Wordt door de dashboardserver
   automatisch bovenin de widgetpagina gezet.

   Homey.api(...)  → via de dashboardserver naar je Homey (/api/aw/call)
   Homey.on(...)   → live-berichten van de app, via de dashboardserver
   Homey.ready()   → niets nodig (de tegel bepaalt de grootte)

   ?naadloos=1 in het adres: de eigen achtergrond van de widget verbergen
   (gebruikt door aw-geheel.html, die één doorlopende achtergrond tekent).
   ========================================================================== */
(function () {
  var m = location.pathname.match(/^\/aw\/([^/]+)\/([^/]+)/);
  if (!m) return;
  var APP = decodeURIComponent(m[1]), WIDGET = decodeURIComponent(m[2]);
  var q = new URLSearchParams(location.search);
  var listeners = {};

  function emit(ev, data) {
    (listeners[ev] || []).slice().forEach(function (cb) { try { cb(data); } catch (e) { console.error(e); } });
  }

  // Live-berichten: liefst via het dashboard of de naadloze pagina eromheen
  // (één verbinding voor alle widgets), anders een eigen verbinding.
  var bus = null;
  try { if (window.top !== window && window.top.__awBus) bus = window.top.__awBus; } catch (e) { /* ander adres */ }
  try { if (!bus && window.parent !== window && window.parent.__awBus) bus = window.parent.__awBus; } catch (e) { /* */ }
  if (bus) {
    var off = bus.add(APP, emit);
    window.addEventListener('pagehide', function () { try { off(); } catch (e) { /* */ } });
  } else {
    var es = new EventSource('/api/events');
    es.addEventListener('appevent', function (ev) {
      try { var d = JSON.parse(ev.data); if (d.appId === APP) emit(d.event, d.data); } catch (e) { /* */ }
    });
  }

  function raw(method, path, body) {
    return fetch('/api/aw/call', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: APP, widget: WIDGET, method: method, path: path, body: body }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || r.statusText);
        return j.result;
      });
    });
  }

  // Sommige antwoorden zeggen "wordt opgehaald" en sturen het resultaat later
  // als live-bericht. Voor het geval live-berichten niet doorkomen, vragen we
  // het na een paar seconden zelf nog eens na (lokaal, niet bij Spotify).
  function followUp(path, body, res, n) {
    n = n || 0;
    if (n > 15 || !res) return;
    var again = function (ms, ev) {
      setTimeout(function () {
        raw('POST', path, body).then(function (r2) {
          var stillBusy = path === '/playlist' ? r2 && r2.loading : r2 && (r2.status === 'loading' || r2.status === 'deferred');
          if (stillBusy) followUp(path, body, r2, n + 1); else emit(ev, r2);
        }).catch(function () { /* */ });
      }, ms);
    };
    if (path === '/playlist' && res.loading) again(2500, 'playlist');
    if (path === '/artist' && (res.status === 'loading' || res.status === 'deferred')) again(Math.min(30000, Math.max(3000, res.waitMs || 3000)), 'aura_artist');
  }

  // Instellingen: standaardwaarden uit widget.compose.json, eventueel aangevuld via ?s={...}
  var settings = Object.assign({}, window.__AW_DEFAULTS || {});
  try { Object.assign(settings, JSON.parse(q.get('s') || '{}') || {}); } catch (e) { /* */ }

  var Homey = {
    api: function (method, path, body) {
      return raw(method, path, body).then(function (res) { followUp(path, body, res); return res; });
    },
    on: function (ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return Homey; },
    off: function (ev, cb) { listeners[ev] = (listeners[ev] || []).filter(function (x) { return x !== cb; }); return Homey; },
    ready: function () { return Promise.resolve(); },
    setHeight: function () { return Promise.resolve(); },
    getSettings: function () { return settings; },
    getWidgetInstanceId: function () { return 'dashboard-' + WIDGET; },
    hapticFeedback: function () { if (navigator.vibrate) navigator.vibrate(10); },
    popup: function (url) { window.open(url, '_blank'); },
    __: function (k) { return typeof k === 'string' ? k : (k && (k.nl || k.en)) || ''; },
  };
  window.Homey = Homey;

  // Platenkast: ook zonder live-berichten af en toe verversen (lokaal).
  if (WIDGET === 'platenkast') setInterval(function () { raw('POST', '/platenkast', {}).then(function (r) { if (r) emit('platenkast', r); }).catch(function () { /* */ }); }, 60000);

  if (q.get('naadloos') === '1') {
    var st = document.createElement('style');
    st.textContent = 'html,body{background:transparent!important}.bg,.shade{display:none!important}';
    document.head.appendChild(st);
  }

  window.addEventListener('load', function () {
    if (typeof window.onHomeyReady === 'function') window.onHomeyReady(Homey);
  });
})();
