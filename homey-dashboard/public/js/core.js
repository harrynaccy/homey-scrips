/* Kern: status, API, thema, achtergrond, voorkant, tabbladen, 4-tik, nacht, screensaver */
(function () {
  const D = window.D = {
    cfg: null, lib: { devices: [], zones: [], flows: [], advancedFlows: [], moods: [], variables: [], insights: [], apps: [], users: [], alarms: [] },
    status: { mode: '?', connected: false }, activeTab: null, editing: false,
    clientId: Math.random().toString(36).slice(2), tileEls: new Map(),
  };
  const $ = D.$ = (s, r = document) => r.querySelector(s);
  D.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  D.uid = p => p + Math.random().toString(36).slice(2, 9);
  D.clone = o => JSON.parse(JSON.stringify(o));
  D.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- API ----------
  D.NO_NAS = 'Geen verbinding met het dashboard op de NAS. Staat de NAS aan en is de wifi goed?';
  D.api = async (method, url, body) => {
    let res;
    try { res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Client-Id': D.clientId }, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch (e) { throw new Error(D.NO_NAS); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || ({ 404: 'Dit bestaat niet (meer).', 413: 'Het bestand is te groot.', 502: D.NO_NAS, 503: 'Het dashboard op de NAS start net op. Probeer het over een minuut opnieuw.', 504: D.NO_NAS }[res.status]) || `Er ging iets mis op de NAS (fout ${res.status}).`);
    return j;
  };
  D.loadLibrary = async () => { const l = await D.api('GET', '/api/library'); for (const k of ['devices', 'zones', 'flows', 'advancedFlows', 'moods', 'variables', 'insights', 'apps', 'users', 'alarms']) l[k] = l[k] || []; D.lib = l; D.devById = new Map(D.lib.devices.map(d => [d.id, d])); };
  D.dev = id => D.devById && D.devById.get(id);
  D.zoneName = id => (D.lib.zones.find(z => z.id === id) || {}).name || '';

  D.setCap = async (deviceId, cap, value) => {
    const d = D.dev(deviceId);
    if (d && d.caps[cap]) { d.caps[cap].value = value; D.refreshDevice(deviceId); }
    try { await D.api('POST', `/api/device/${encodeURIComponent(deviceId)}/${encodeURIComponent(cap)}`, { value }); }
    catch (e) { D.toast('Mislukt: ' + e.message, true); }
  };

  // ---------- live-berichten voor widgets van eigen apps (één verbinding voor alle tegels) ----------
  window.__awBus = (function () {
    const subs = new Set();
    return {
      add(appId, fn) { const e = { appId, fn }; subs.add(e); return () => subs.delete(e); },
      dispatch(d) { for (const e of [...subs]) if (e.appId === d.appId) { try { e.fn(d.event, d.data); } catch (err) { subs.delete(e); } } },
    };
  })();

  // ---------- live updates ----------
  D.conn = { nasAt: 0, nasErr: false, nasSince: Date.now(), homey: null };
  D.connectEvents = () => {
    const es = new EventSource('/api/events');
    es.addEventListener('appevent', ev => { try { window.__awBus.dispatch(JSON.parse(ev.data)); } catch (e) { /* */ } });
    es.addEventListener('update', ev => {
      const u = JSON.parse(ev.data);
      if (u.kind === 'cap') {
        const d = D.dev(u.deviceId);
        if (d && d.caps[u.cap]) { d.caps[u.cap].value = u.value; D.refreshDevice(u.deviceId); }
      } else if (u.kind === 'var') {
        const v = D.lib.variables.find(x => x.id === u.id); if (v) v.value = u.value; D.refreshWhere(t => t.type === 'variable' && t.ref && t.ref.id === u.id);
      } else if (u.kind === 'user') {
        const x = D.lib.users.find(y => y.id === u.id); if (x) { x.present = u.present; x.asleep = u.asleep; } D.refreshWhere(t => t.type === 'presence');
      }
    });
    es.addEventListener('library', async () => { await D.loadLibrary(); D.renderAll(); if (D.editing) D.editor.refreshPanel(); });
    es.addEventListener('status', ev => { D.status = JSON.parse(ev.data); if (D.editing) D.editor.refreshPanel('systeem'); });
    es.addEventListener('config', async ev => {
      const m = JSON.parse(ev.data);
      if (m.by === D.clientId || D.editing) return;
      D.cfg = await D.api('GET', '/api/config'); D.applyAll();
    });
    // verbindingsbalk: hartslag van de NAS en status van Homey
    const seen = () => { D.conn.nasAt = Date.now(); D.conn.nasErr = false; D.connbar && D.connbar.update(); };
    es.onopen = seen;
    es.addEventListener('hb', seen);
    es.addEventListener('link', ev => { D.conn.homey = JSON.parse(ev.data); seen(); });
    es.onerror = () => { D.conn.nasErr = true; D.connbar && D.connbar.update(); /* EventSource maakt zelf opnieuw verbinding */ };
  };

  // ---------- helpers ----------
  D.currentTab = () => D.cfg.tabs.find(t => t.id === D.activeTab) || D.cfg.tabs[0];
  D.findTile = id => { for (const t of D.cfg.tabs) { const w = t.tiles.find(x => x.id === id); if (w) return { tab: t, tile: w }; } return null; };
  D.toast = (msg, bad) => { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(t._t); t._t = setTimeout(() => t.className = '', 2600); };
  D.hexA = (hex, a) => { const h = (hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

  D.confirm = (text, okLabel = 'Ja') => new Promise(resolve => {
    D.openSheet(`<div class="confirm"><p>${D.esc(text)}</p><div class="row"><button class="btn ghost" data-a="no">Annuleren</button><button class="btn primary" data-a="yes">${D.esc(okLabel)}</button></div></div>`, 'small');
    $('#sheet').onclick = e => { const a = e.target.closest('[data-a]'); if (!a) return; D._sheetCancel = null; D.closeSheet(); resolve(a.dataset.a === 'yes'); };
    D._sheetCancel = () => resolve(false);
  });
  D.openSheet = (html, size) => {
    const w = $('#sheet-wrap'); const s = $('#sheet');
    s.className = size || ''; s.innerHTML = html; s.onclick = null; w.hidden = false;
    requestAnimationFrame(() => w.classList.add('open'));
  };
  D.closeSheet = () => { const w = $('#sheet-wrap'); w.classList.remove('open'); w.hidden = true; $('#sheet').innerHTML = ''; D._sheetDevice = null; if (D._sheetCancel) { const c = D._sheetCancel; D._sheetCancel = null; c(); } };
  $('#sheet-wrap').addEventListener('pointerdown', e => { if (e.target.id === 'sheet-wrap') { D._sheetCancel && D._sheetCancel(); D._sheetCancel = null; D.closeSheet(); } });

  // ---------- thema ----------
  const FONTS = { Inter: 'Inter:wght@300;400;500;600;700', Nunito: 'Nunito:wght@300;400;600;700;800', Roboto: 'Roboto:wght@300;400;500;700', Poppins: 'Poppins:wght@300;400;500;600;700', Montserrat: 'Montserrat:wght@300;400;500;600;700', 'Space Grotesk': 'Space+Grotesk:wght@300;400;500;600;700', Quicksand: 'Quicksand:wght@400;500;600;700', Systeem: null };
  D.FONTS = Object.keys(FONTS);
  D.applyTheme = () => {
    const t = D.cfg.settings.theme; const r = document.documentElement.style;
    r.setProperty('--accent', t.accent); r.setProperty('--on', t.onColor || t.accent);
    r.setProperty('--text', t.text); r.setProperty('--muted', t.muted || D.hexA(t.text, 0.62));
    r.setProperty('--tile', D.hexA(t.tileBg, t.tileOpacity)); r.setProperty('--tile-solid', t.tileBg);
    r.setProperty('--blur', t.tileBlur + 'px'); r.setProperty('--radius', t.radius + 'px');
    r.setProperty('--shadow', `0 10px 30px rgba(0,0,0,${t.shadow})`); r.setProperty('--border', `rgba(255,255,255,${t.border})`);
    r.setProperty('--fs', t.fontScale || 1);
    const fam = FONTS[t.font] ? `'${t.font}', system-ui, sans-serif` : 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    r.setProperty('--font', fam);
    if (FONTS[t.font]) { const href = `https://fonts.googleapis.com/css2?family=${FONTS[t.font]}&display=swap`; const l = $('#fontlink'); if (l.href !== href) l.href = href; }
    const tb = D.cfg.settings.tabbar; r.setProperty('--tabbar-h', tb.height + 'px'); r.setProperty('--tabbar-a', tb.opacity);
  };

  // ---------- achtergrond ----------
  D.applyBackground = () => {
    const tab = D.currentTab(); const g = D.cfg.settings.background; const b = (tab && tab.background) || g;
    const img = $('#bg-img'); const dim = $('#bg-dim');
    let css = '';
    if (b.type === 'image' && b.image) css = `url("${b.image}") center/cover no-repeat`;
    else if (b.type === 'gradient') css = `linear-gradient(${b.angle || 160}deg, ${b.gradient[0]}, ${b.gradient[1]})`;
    else css = b.color || '#000';
    img.style.background = css;
    if (b.type === 'image' && b.image && b.panorama && !(tab && tab.background)) {
      const vis = D.cfg.tabs.filter(t => !t.hidden); const i = Math.max(0, vis.indexOf(tab)); const n = Math.max(1, vis.length);
      img.style.backgroundSize = `${n * 100}% 100%`; img.style.backgroundPosition = `${n > 1 ? (i / (n - 1)) * 100 : 50}% 50%`;
      img.style.transition = 'background-position .6s ease';
    } else img.style.transition = '';
    img.style.filter = b.blur ? `blur(${b.blur}px)` : ''; img.style.inset = b.blur ? `-${b.blur * 2}px` : '0';
    dim.style.background = `rgba(0,0,0,${b.dim || 0})`;
  };

  // ---------- helderheid (Fully Kiosk) ----------
  D.hasFully = () => typeof window.fully !== 'undefined';
  D.applyBrightness = () => {
    const s = D.cfg.settings; const night = D.isNight();
    const val = night ? s.night.brightness : s.display.brightness; // 0-255
    const dim = $('#dimmer');
    if (D.hasFully()) {
      try { fully.setScreenBrightness(Math.round(D.clamp(val, 1, 255))); } catch (e) { /* */ }
      dim.style.opacity = night ? (s.night.dim || 0) : 0;
    } else {
      const o = (1 - D.clamp(val, 0, 255) / 255) * 0.7 + (night ? (s.night.dim || 0) : 0);
      dim.style.opacity = D.clamp(o, 0, 0.92);
    }
    document.body.classList.toggle('night', night);
  };

  // zonsopkomst/-ondergang (NOAA-benadering)
  D.sunTimes = (date, lat, lon) => {
    const rad = Math.PI / 180; const day = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
    const g = 2 * Math.PI / 365 * (day - 1);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(dec)) - Math.tan(lat * rad) * Math.tan(dec)) / rad;
    const mid = new Date(date); mid.setUTCHours(0, 0, 0, 0);
    const rise = new Date(mid.getTime() + (720 - 4 * (lon + ha) - eq) * 6e4);
    const set = new Date(mid.getTime() + (720 - 4 * (lon - ha) - eq) * 6e4);
    return { rise, set };
  };
  D.isNight = () => {
    const n = D.cfg.settings.night; if (!n.enabled) return false;
    const now = new Date();
    if (n.mode === 'sun') { const s = D.sunTimes(now, n.lat, n.lon); return now < s.rise || now > s.set; }
    const m = now.getHours() * 60 + now.getMinutes();
    const p = x => { const [h, mi] = String(x).split(':').map(Number); return h * 60 + (mi || 0); };
    const a = p(n.from), b = p(n.to);
    return a <= b ? (m >= a && m < b) : (m >= a || m < b);
  };

  // ---------- voorkant ----------
  D.visibleTabs = () => D.cfg.tabs.filter(t => D.editing || !t.hidden);
  D.renderTabbar = () => {
    const tb = D.cfg.settings.tabbar; const box = $('#tabs');
    box.innerHTML = D.visibleTabs().map(t => `<button class="tab${t.id === D.activeTab ? ' active' : ''}${t.hidden ? ' hid' : ''}" data-tab="${t.id}">${tb.showIcons && t.icon ? `<span class="ti">${D.esc(t.icon)}</span>` : ''}${tb.showNames || !t.icon ? `<span class="tn">${D.esc(t.name)}</span>` : ''}</button>`).join('');
    const act = box.querySelector('.active'); if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  };
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) D.switchTab(b.dataset.tab); });
  D.switchTab = id => {
    if (id === D.activeTab) return;
    D.activeTab = id; D.renderTabbar(); D.applyBackground();
    document.querySelectorAll('.grid').forEach(g => g.classList.toggle('active', g.dataset.tab === id));
    if (D.editing) D.editor.onTabChange();
  };

  D.gridEl = tab => {
    let g = document.querySelector(`.grid[data-tab="${tab.id}"]`);
    if (!g) { g = document.createElement('div'); g.className = 'grid'; g.dataset.tab = tab.id; $('#stage').appendChild(g); }
    return g;
  };
  D.renderGrid = (tab) => {
    tab = tab || D.currentTab(); const grid = D.gridEl(tab); const g = tab.grid;
    grid.style.gridTemplateColumns = `repeat(${g.cols}, minmax(0,1fr))`;
    grid.style.gridTemplateRows = `repeat(${g.rows}, minmax(0,1fr))`;
    grid.style.gap = g.gap + 'px'; grid.style.padding = g.padding + 'px';
    grid.classList.toggle('active', tab.id === D.activeTab);
    const keep = new Set(tab.tiles.map(t => t.id));
    for (const el of [...grid.children]) if (el.classList.contains('tile') && !keep.has(el.dataset.id)) { D.tileEls.delete(el.dataset.id); el.remove(); }
    for (const t of tab.tiles) {
      let el = D.tileEls.get(t.id);
      if (el && el.parentNode !== grid) { el.remove(); el = null; }
      if (!el) { grid.appendChild(D.buildTile(t)); continue; }
      el.className = 'tile t-' + t.type; D.placeTile(el, t); D.styleTile(el, t); D.renderTileContent(t, el);
    }
    if (D.editing && tab.id === D.activeTab) D.editor.decorate();
  };
  D.renderAll = () => {
    const ids = new Set(D.cfg.tabs.map(t => t.id));
    document.querySelectorAll('.grid').forEach(g => { if (!ids.has(g.dataset.tab)) { g.querySelectorAll('.tile').forEach(el => D.tileEls.delete(el.dataset.id)); g.remove(); } });
    for (const t of D.cfg.tabs) D.renderGrid(t);
  };
  D.buildTile = t => {
    const el = document.createElement('div');
    el.className = 'tile t-' + t.type; el.dataset.id = t.id;
    D.placeTile(el, t); D.styleTile(el, t);
    const inner = document.createElement('div'); inner.className = 'inner'; el.appendChild(inner);
    D.tileEls.set(t.id, el);
    D.renderTileContent(t, el);
    return el;
  };
  D.placeTile = (el, t) => { el.style.gridColumn = `${t.x + 1} / span ${t.w}`; el.style.gridRow = `${t.y + 1} / span ${t.h}`; };
  // ---------- stijl-effecten: schaduw, gloed, rand, tekst, vorm, marge, diepte, geluid ----------
  // Standaardwaarden; per tegel te overschrijven in t.style, voor alle tegels in settings.theme.fx
  D.FX_DEFAULT = { shT: 'tile', shS: 30, shD: 'down', shC: '#000000', glW: 'never', glT: 'face', glC: '', glA: 0.7, glS: 24,
    bdW: 1, bdC: '#ffffff', bdOn: false, txN: 1, txS: 1, fr: null, pad: null, fbw: null, depth: 1, tap: 1, snd: 'none', vol: 0.6 };
  D.FX_KEYS = [...Object.keys(D.FX_DEFAULT), 'shA', 'bdA'];
  D.fxBase = () => { const th = D.cfg.settings.theme; return { ...D.FX_DEFAULT, shA: th.shadow ?? 0.35, bdA: th.border ?? 0.1, ...(th.fx || {}) }; };
  D.fxOf = t => { const out = D.fxBase(); const s = (t && t.style) || {}; for (const k of D.FX_KEYS) if (s[k] !== undefined && s[k] !== null && s[k] !== '') out[k] = s[k]; return out; };
  const mix = (c, a) => /^#/.test(c) ? D.hexA(c, a) : `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;
  D.applyFx = (el, t) => {
    const fx = D.fxOf(t); const st = el.style;
    // rand
    st.setProperty('--bw', fx.bdW + 'px'); st.setProperty('--border', D.hexA(fx.bdC, fx.bdA));
    el.classList.toggle('bd-on', !!fx.bdOn);
    // schaduw
    const S = Number(fx.shS) || 0; const off = { down: [0, 0.35], diag: [0.3, 0.35], around: [0, 0] }[fx.shD] || [0, 0.35];
    const x = Math.round(off[0] * S), y = Math.round(off[1] * S); const sc = D.hexA(fx.shC, fx.shA); const has = fx.shA > 0 && S >= 0;
    st.setProperty('--shadow', has && fx.shT === 'tile' ? `${x}px ${y}px ${S}px ${sc}` : '0 0 0 transparent');
    if (has && fx.shT === 'face') st.setProperty('--fsh', `drop-shadow(${Math.round(x / 2)}px ${Math.round(y / 2)}px ${Math.round(S / 3)}px ${sc})`); else st.removeProperty('--fsh');
    st.setProperty('--tsh', has && fx.shT === 'text' ? `${Math.round(x / 3)}px ${Math.max(1, Math.round(y / 3))}px ${Math.max(1, Math.round(S / 4))}px ${sc}` : '0 0 0 transparent');
    // gloed
    const gc = mix(fx.glC || 'var(--kon, var(--on))', fx.glA); const G = Number(fx.glS) || 0;
    st.setProperty('--glow-box', `0 0 ${G}px ${Math.round(G / 5)}px ${gc}`);
    st.setProperty('--glow-drop', `drop-shadow(0 0 ${Math.round(G / 2)}px ${gc})`);
    st.setProperty('--glow-text', `0 0 ${Math.round(G / 2)}px ${gc}`);
    for (const w of ['never', 'on', 'always', 'alarm']) el.classList.toggle('gw-' + w, fx.glW === w);
    for (const g of ['tile', 'face', 'text']) el.classList.toggle('gt-' + g, fx.glT === g);
    // tekst
    st.setProperty('--txn', fx.txN); st.setProperty('--txs', fx.txS);
    // vorm, marge, knoprand, diepte, tikeffect
    if (fx.fr !== null && fx.fr !== undefined) { st.setProperty('--fr', fx.fr + '%'); el.classList.add('has-fr'); } else { st.removeProperty('--fr'); el.classList.remove('has-fr'); }
    if (fx.pad !== null && fx.pad !== undefined) { st.setProperty('--pad', fx.pad + 'px'); el.classList.add('has-pad'); } else { st.removeProperty('--pad'); el.classList.remove('has-pad'); }
    if (fx.fbw !== null && fx.fbw !== undefined) st.setProperty('--fbw', fx.fbw + 'px'); else st.removeProperty('--fbw');
    st.setProperty('--depth', fx.depth); st.setProperty('--tap', fx.tap);
  };

  // ---------- klikgeluid (gemaakt in de browser, geen bestanden nodig) ----------
  let actx = null;
  D.SOUNDS = [['none', 'Geen'], ['klik', 'Klik'], ['tik', 'Tik'], ['schakelaar', 'Schakelaar'], ['plop', 'Zachte plop']];
  D.sound = (type, vol = 0.6, on = true) => {
    if (!type || type === 'none' || !(vol > 0)) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime + 0.005;
      const tone = (f1, f2, dur, at, wave, v) => {
        const o = actx.createOscillator(); const g = actx.createGain(); o.type = wave;
        o.frequency.setValueAtTime(f1, t0 + at); o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * v), t0 + at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
        o.connect(g).connect(actx.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
      };
      const noise = (dur, at, freq, v) => {
        const n = Math.floor(actx.sampleRate * dur); const buf = actx.createBuffer(1, n, actx.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
        const src = actx.createBufferSource(); src.buffer = buf; const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.2;
        const g = actx.createGain(); g.gain.value = vol * v * 1.8; src.connect(bp).connect(g).connect(actx.destination); src.start(t0 + at);
      };
      if (type === 'klik') { noise(0.012, 0, 3200, 1); tone(2400, 1200, 0.02, 0, 'square', 0.12); }
      else if (type === 'tik') tone(1900, 1500, 0.035, 0, 'sine', 0.7);
      else if (type === 'schakelaar') { noise(0.01, 0, on ? 2600 : 1800, 1); noise(0.012, 0.045, on ? 3400 : 2200, 0.8); }
      else if (type === 'plop') tone(700, 140, 0.11, 0, 'sine', 0.9);
    } catch (e) { /* geen geluid mogelijk */ }
  };
  D.playFor = el => {
    const f = el && el.dataset && el.dataset.id && D.findTile(el.dataset.id); if (!f) return;
    const fx = D.fxOf(f.tile); D.sound(fx.snd, fx.vol, !(el.classList.contains('on') || el.classList.contains('is-on')));
  };

  D.styleTile = (el, t) => {
    const s = t.style || {}; const th = D.cfg.settings.theme;
    el.style.removeProperty('--tile'); el.style.removeProperty('--text'); el.style.removeProperty('--accent'); el.style.removeProperty('--radius'); el.style.removeProperty('--tfs'); el.style.removeProperty('--on');
    if (s.bg || s.opacity !== undefined) el.style.setProperty('--tile', D.hexA(s.bg || th.tileBg, s.opacity ?? th.tileOpacity));
    if (s.text) { el.style.setProperty('--text', s.text); el.style.setProperty('--muted', D.hexA(s.text, 0.62)); }
    if (s.accent) { el.style.setProperty('--accent', s.accent); el.style.setProperty('--on', s.accent); }
    if (s.radius !== undefined) el.style.setProperty('--radius', s.radius + 'px');
    el.style.setProperty('--tfs', s.fontScale || 1);
    el.classList.toggle('frameless', !!s.frameless);
    el.classList.toggle('notitle', !!s.hideTitle);
    D.applyFx(el, t);
    // doorzichtigheid 0% = helemaal onzichtbaar kader (geen achtergrond, rand of schaduw)
    const clear = Number(s.opacity ?? th.tileOpacity) === 0; el.classList.toggle('clear', clear);
    if (clear) el.style.setProperty('--shadow', '0 0 0 transparent');
  };
  D.renderTileContent = (t, el) => {
    const inner = el.querySelector('.inner'); const T = D.tiles[t.type];
    if (!T) { inner.innerHTML = `<div class="empty">Onbekend tegeltype</div>`; return; }
    try { T.render(t, inner, el); } catch (e) { console.error(e); inner.innerHTML = `<div class="empty">Deze tegel kan niet worden getoond</div>`; }
  };
  D.refreshTile = id => { const el = D.tileEls.get(id); const f = D.findTile(id); if (el && f) D.renderTileContent(f.tile, el); };
  D.refreshWhere = pred => { for (const tab of D.cfg.tabs) for (const t of tab.tiles) if (pred(t)) D.refreshTile(t.id); };
  D.refreshDevice = deviceId => {
    const d = D.dev(deviceId);
    D.refreshWhere(t => ((t.type === 'device' || t.type === 'button') && t.ref && t.ref.deviceId === deviceId) || (t.type === 'zone' && d && t.ref && t.ref.zoneId === d.zone) || t.type === 'energy');
    if (D._sheetDevice === deviceId && D.tiles.device.refreshSheet) D.tiles.device.refreshSheet(deviceId);
  };

  D.applyAll = () => {
    if (!D.cfg.tabs.find(t => t.id === D.activeTab)) D.activeTab = D.cfg.settings.startTab && D.cfg.tabs.find(t => t.id === D.cfg.settings.startTab) ? D.cfg.settings.startTab : D.cfg.tabs[0].id;
    D.applyTheme(); D.applyBackground(); D.renderTabbar(); D.renderAll(); D.applyBrightness();
  };

  // ---------- gebruiksaanwijzing (F1 of Systeem → Gebruiksaanwijzing) ----------
  D.openManual = (zoek) => {
    D.openSheet(`<div class="manual-hd"><b>Gebruiksaanwijzing</b><a class="btn sm ghost" href="handleiding.html" target="_blank" rel="noopener">Apart openen</a><button class="xbtn" data-close>${icon('x')}</button></div><iframe class="manual" src="handleiding.html${zoek ? '?zoek=' + encodeURIComponent(zoek) : ''}"></iframe>`, 'manual');
    $('#sheet [data-close]').onclick = () => D.closeSheet();
  };
  document.addEventListener('keydown', e => { if (e.key === 'F1') { e.preventDefault(); if ($('#sheet').classList.contains('manual') && !$('#sheet-wrap').hidden) D.closeSheet(); else D.openManual(); } });

  // ---------- 4× tikken: alleen op lege plek of tabbalk ----------
  let taps = [];
  document.addEventListener('pointerdown', e => {
    D.poke();
    if (D.editing || !$('#saver').hidden) return;
    const onEmpty = e.target.classList.contains('grid') || e.target.id === 'stage' || e.target.id === 'app' || e.target.closest('#tabbar');
    if (!onEmpty) { taps = []; return; }
    const u = D.cfg.settings.unlock; const now = Date.now();
    taps = taps.filter(x => now - x < u.window); taps.push(now);
    if (taps.length >= u.taps) { taps = []; D.editor.open(); }
  }, true);

  // ---------- inactiviteit: terug naar start + screensaver ----------
  let lastAct = Date.now();
  D.poke = () => { lastAct = Date.now(); if (!$('#saver').hidden) D.stopSaver(); };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lastAct = Date.now(); }, true));
  setInterval(() => {
    if (!D.cfg) return;
    const s = D.cfg.settings; const idleMin = (Date.now() - lastAct) / 6e4;
    if (!D.editing && s.returnHome.enabled && idleMin >= s.returnHome.after && D.activeTab !== s.startTab && D.cfg.tabs.find(t => t.id === s.startTab)) D.switchTab(s.startTab);
    if (!D.editing && s.screensaver.enabled && idleMin >= s.screensaver.after && $('#saver').hidden) D.startSaver();
    D.applyBrightness();
  }, 15000);

  D.startSaver = (preview) => {
    const s = D.cfg.settings.screensaver; const sv = $('#saver');
    sv.hidden = false; sv.className = 'type-' + s.type;
    if (s.type === 'off' && D.hasFully() && !preview) { try { fully.turnScreenOff(true); } catch (e) { /* */ } }
    const draw = async () => {
      const now = new Date();
      const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      const date = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
      if (s.type === 'photos') {
        if (!D._photos) D._photos = await D.api('GET', '/api/backgrounds').catch(() => []);
        const p = D._photos.length ? D._photos[Math.floor(Date.now() / (s.interval * 1000)) % D._photos.length] : null;
        sv.innerHTML = `<div class="ph" style="background-image:url('${p || ''}')"></div><div class="sclock small"><b>${time}</b><span>${date}</span></div>`;
      } else if (s.type === 'clock') sv.innerHTML = `<div class="sclock"><b>${time}</b><span>${date}</span></div>`;
      else sv.innerHTML = '';
    };
    draw(); clearInterval(D._saverT); D._saverT = setInterval(draw, s.type === 'photos' ? s.interval * 1000 : 10000);
  };
  D.stopSaver = () => { const sv = $('#saver'); sv.hidden = true; sv.innerHTML = ''; clearInterval(D._saverT); D._photos = null; if (D.hasFully()) { try { fully.turnScreenOn(); } catch (e) { /* */ } } };
})();
