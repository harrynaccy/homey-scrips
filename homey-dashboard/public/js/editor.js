/* Achterkant: bewerkmodus + instellingenpaneel */
(function () {
  const D = window.D; const esc = D.esc; const $ = D.$;
  const E = D.editor = { sel: null, section: 'bibliotheek', undo: [], redo: [], libCat: 'devices', libQ: '', bgScope: 'all' };

  const SECTIONS = [
    ['bibliotheek', 'book', 'Toevoegen'], ['tegel', 'sliders', 'Tegel'], ['tabs', 'layers', 'Tabbladen'],
    ['scherm', 'sun', 'Scherm'], ['uiterlijk', 'palette', 'Uiterlijk'], ['raster', 'grid', 'Raster'], ['systeem', 'server', 'Systeem'],
  ];

  // ---------- openen / sluiten ----------
  E.open = () => {
    if (D.editing) return;
    D.editing = true; document.body.classList.add('editing');
    E.undo = []; E.redo = []; E.sel = null;
    E.layout(); D.renderTabbar(); D.renderGrid();
    $('#panel').hidden = false; E.refreshPanel();
    window.addEventListener('resize', E.layout);
  };
  E.close = async () => {
    await E.saveNow();
    D.editing = false; document.body.classList.remove('editing'); E.sel = null;
    $('#panel').hidden = true; $('#app').style.transform = '';
    window.removeEventListener('resize', E.layout);
    document.querySelectorAll('.edit-ov,.guides,.ghost').forEach(n => n.remove());
    if (D.currentTab().hidden) { const v = D.cfg.tabs.find(t => !t.hidden); if (v) D.activeTab = v.id; }
    D.applyAll();
  };
  E.layout = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = Math.round(Math.min(430, Math.max(330, vw * 0.34)));
    document.documentElement.style.setProperty('--panel-w', pw + 'px');
    const s = (vw - pw - 16) / vw;
    $('#app').style.transform = `translate(8px, ${Math.round((vh - vh * s) / 2)}px) scale(${s})`;
    E.scale = s;
  };
  E.onTabChange = () => { E.sel = null; D.renderGrid(); E.refreshPanel(); };

  // ---------- opslaan / ongedaan maken ----------
  let saveT = null, lastKey = null, lastKeyAt = 0;
  E.commit = (key, fn, after) => {
    const now = Date.now();
    if (!(key && key === lastKey && now - lastKeyAt < 1200)) { E.undo.push(JSON.stringify(D.cfg)); if (E.undo.length > 80) E.undo.shift(); E.redo = []; }
    lastKey = key; lastKeyAt = now;
    fn(); (after || (() => {}))(); E.scheduleSave(); E.updateHeader();
  };
  E.scheduleSave = () => { clearTimeout(saveT); E.setSaved('Opslaan…'); saveT = setTimeout(E.saveNow, 700); };
  E.saveNow = async () => {
    clearTimeout(saveT); saveT = null;
    try { await D.api('PUT', '/api/config', D.cfg); E.setSaved('Opgeslagen'); } catch (e) { E.setSaved('Niet opgeslagen!'); D.toast('Opslaan mislukt: ' + e.message, true); }
  };
  E.setSaved = txt => { const s = $('#p-saved'); if (s) s.textContent = txt; };
  E.doUndo = () => { if (!E.undo.length) return; E.redo.push(JSON.stringify(D.cfg)); D.cfg = JSON.parse(E.undo.pop()); lastKey = null; E.afterHistory(); };
  E.doRedo = () => { if (!E.redo.length) return; E.undo.push(JSON.stringify(D.cfg)); D.cfg = JSON.parse(E.redo.pop()); lastKey = null; E.afterHistory(); };
  E.afterHistory = () => {
    if (E.sel && !D.findTile(E.sel)) E.sel = null;
    D.applyAll(); E.scheduleSave(); E.refreshPanel();
  };

  // ---------- pad-helpers ----------
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); let cur = o; for (const k of ks) { if (cur[k] == null) cur[k] = {}; cur = cur[k]; } if (v === undefined) delete cur[last]; else cur[last] = v; };
  const tabPath = () => `tabs.${D.cfg.tabs.indexOf(D.currentTab())}`;
  const selPath = () => { const f = D.findTile(E.sel); return f ? `tabs.${D.cfg.tabs.indexOf(f.tab)}.tiles.${f.tab.tiles.indexOf(f.tile)}` : null; };

  // ---------- raster-hulpfuncties ----------
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  E.fits = (tab, r, ignoreId) => r.x >= 0 && r.y >= 0 && r.x + r.w <= tab.grid.cols && r.y + r.h <= tab.grid.rows && !tab.tiles.some(t => t.id !== ignoreId && overlap(t, r));
  E.firstFree = (tab, w, h) => {
    for (const [ww, hh] of [[w, h], [Math.min(w, 2), Math.min(h, 2)], [1, 1]]) {
      for (let y = 0; y + hh <= tab.grid.rows; y++) for (let x = 0; x + ww <= tab.grid.cols; x++) if (E.fits(tab, { x, y, w: ww, h: hh })) return { x, y, w: ww, h: hh };
    }
    return null;
  };
  E.clampTiles = tab => { for (const t of tab.tiles) { t.w = D.clamp(t.w, 1, tab.grid.cols); t.h = D.clamp(t.h, 1, tab.grid.rows); t.x = D.clamp(t.x, 0, tab.grid.cols - t.w); t.y = D.clamp(t.y, 0, tab.grid.rows - t.h); } };

  // ---------- tegels decoreren + slepen ----------
  E.decorate = () => {
    const tab = D.currentTab(); const grid = D.gridEl(tab);
    grid.querySelectorAll('.guides').forEach(n => n.remove());
    const gd = document.createElement('div'); gd.className = 'guides';
    Object.assign(gd.style, { gridTemplateColumns: grid.style.gridTemplateColumns, gridTemplateRows: grid.style.gridTemplateRows, gap: grid.style.gap, padding: grid.style.padding });
    gd.innerHTML = '<i></i>'.repeat(tab.grid.cols * tab.grid.rows); grid.prepend(gd);
    for (const t of tab.tiles) {
      const el = D.tileEls.get(t.id); if (!el) continue;
      el.querySelectorAll('.edit-ov').forEach(n => n.remove());
      const ov = document.createElement('div'); ov.className = 'edit-ov' + (t.locked ? ' locked' : '');
      const oi = t.type === 'device' && D.dev(t.ref.deviceId) ? D.devIcon(D.dev(t.ref.deviceId)) : (D.tiles[t.type] ? D.tiles[t.type].icon : 'chip');
      ov.innerHTML = `<span class="lbl">${icon(oi)}${esc(D.titleOf(t))}</span>${t.locked ? `<span class="lk">${icon('lock')}</span>` : '<span class="rs">' + icon('resize') + '</span>'}`;
      el.appendChild(ov); el.classList.toggle('sel', t.id === E.sel);
      E.dragify(ov, t);
    }
  };
  grid_click: {
    document.addEventListener('pointerdown', e => {
      if (!D.editing) return;
      if (e.target.classList && (e.target.classList.contains('grid') || e.target.classList.contains('guides') || e.target.parentNode && e.target.parentNode.classList && e.target.parentNode.classList.contains('guides'))) {
        if (E.sel) { E.sel = null; E.decorate(); if (E.section === 'tegel') E.refreshPanel(); }
      }
    });
  }
  E.select = id => { E.sel = id; E.decorate(); E.section = 'tegel'; E.refreshPanel(); };

  E.dragify = (ov, t) => {
    ov.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      const tab = D.currentTab(); const grid = D.gridEl(tab); const rect = grid.getBoundingClientRect();
      const g = tab.grid; const s = E.scale || 1;
      const pitchX = (rect.width - 2 * g.padding * s + g.gap * s) / g.cols;
      const pitchY = (rect.height - 2 * g.padding * s + g.gap * s) / g.rows;
      const resizing = !!e.target.closest('.rs'); const orig = { x: t.x, y: t.y, w: t.w, h: t.h };
      const sx = e.clientX, sy = e.clientY; let moved = false; let cur = { ...orig };
      const el = D.tileEls.get(t.id);
      ov.setPointerCapture(e.pointerId);
      ov.onpointermove = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        if (t.locked) return;
        moved = true; el.classList.add('dragging');
        const cx = Math.round(dx / pitchX), cy = Math.round(dy / pitchY);
        cur = resizing
          ? { x: orig.x, y: orig.y, w: D.clamp(orig.w + cx, 1, g.cols - orig.x), h: D.clamp(orig.h + cy, 1, g.rows - orig.y) }
          : { x: D.clamp(orig.x + cx, 0, g.cols - orig.w), y: D.clamp(orig.y + cy, 0, g.rows - orig.h), w: orig.w, h: orig.h };
        D.placeTile(el, cur);
        el.classList.toggle('bad', !E.fits(tab, cur, t.id));
      };
      ov.onpointerup = ov.onpointercancel = () => {
        ov.onpointermove = null; ov.onpointerup = null; el.classList.remove('dragging', 'bad');
        if (!moved) { E.select(t.id); return; }
        if (!E.fits(tab, cur, t.id)) { D.placeTile(el, orig); D.toast('Daar ligt al een tegel'); return; }
        if (cur.x === orig.x && cur.y === orig.y && cur.w === orig.w && cur.h === orig.h) return;
        E.commit(null, () => Object.assign(t, cur), () => { E.sel = t.id; D.renderGrid(); E.refreshPanel(); });
      };
    };
  };

  // ---------- paneel ----------
  E.refreshPanel = only => {
    if (!D.editing) return;
    if (only && only !== E.section) return;
    const p = $('#panel'); const scroll = p.querySelector('.p-body') ? p.querySelector('.p-body').scrollTop : 0;
    const title = SECTIONS.find(s => s[0] === E.section)[2];
    p.innerHTML = `<nav class="p-nav">${SECTIONS.map(([k, ic, l]) => `<button data-sec="${k}" class="${k === E.section ? 'act' : ''}">${icon(ic)}<span>${l}</span></button>`).join('')}</nav>
      <div class="p-main"><header class="p-head"><div><h1>${title}</h1><small id="p-saved">${saveT ? 'Opslaan…' : 'Opgeslagen'}</small></div>
      <button class="ib" data-undo title="Ongedaan maken">${icon('undo')}</button><button class="ib" data-redo title="Opnieuw">${icon('redo')}</button>
      <button class="btn primary sm" data-done>${icon('check')}Klaar</button></header><div class="p-body">${E.render[E.section]()}</div></div>`;
    p.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { E.section = b.dataset.sec; E.refreshPanel(); });
    p.querySelector('[data-undo]').onclick = E.doUndo; p.querySelector('[data-redo]').onclick = E.doRedo;
    p.querySelector('[data-done]').onclick = E.close;
    E.updateHeader(); E.bind(p.querySelector('.p-body'));
    (E.wire[E.section] || (() => {}))(p.querySelector('.p-body'));
    if (!only) p.querySelector('.p-body').scrollTop = scroll; else p.querySelector('.p-body').scrollTop = scroll;
  };
  E.updateHeader = () => { const p = $('#panel'); const u = p.querySelector('[data-undo]'), r = p.querySelector('[data-redo]'); if (u) u.disabled = !E.undo.length; if (r) r.disabled = !E.redo.length; };

  // ---------- formulier-bouwstenen ----------
  const F = {
    group: (title, body, extra = '') => `<section class="grp"><h3>${title}${extra}</h3>${body}</section>`,
    row: (label, ctrl, hint) => `<div class="f"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label><div class="c">${ctrl}</div></div>`,
    color: (k, v, fx) => `<input type="color" data-k="${k}" data-fx="${fx}" value="${v || '#000000'}">`,
    colorOpt: (k, v, def, fx) => `<span class="copt"><input type="color" data-k="${k}" data-fx="${fx}" value="${v || def}" class="${v ? '' : 'unset'}">${v ? `<button class="ib sm" data-clear="${k}" data-fx="${fx}" title="Standaard">${icon('refresh')}</button>` : '<small>standaard</small>'}</span>`,
    range: (k, v, min, max, step, fx, fmt = 'n') => `<span class="rg"><input type="range" data-k="${k}" data-fx="${fx}" data-num min="${min}" max="${max}" step="${step}" value="${v}"><output data-fmt="${fmt}">${E.fmtOut(v, fmt)}</output></span>`,
    toggle: (k, v, fx) => `<button class="switch${v ? ' on' : ''}" data-k="${k}" data-fx="${fx}" data-bool><i></i></button>`,
    select: (k, v, opts, fx) => `<select data-k="${k}" data-fx="${fx}">${opts.map(([val, l]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`,
    text: (k, v, fx, ph = '') => `<input type="text" data-k="${k}" data-fx="${fx}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`,
    num: (k, v, min, max, fx) => `<span class="num"><button class="ib sm" data-step="-1">${icon('minus')}</button><input type="number" data-k="${k}" data-fx="${fx}" data-num min="${min}" max="${max}" value="${v}"><button class="ib sm" data-step="1">${icon('plus')}</button></span>`,
    seg: (k, v, opts, fx) => `<div class="seg">${opts.map(([val, l]) => `<button data-segk="${k}" data-fx="${fx}" data-v="${esc(val)}" class="${String(val) === String(v) ? 'act' : ''}">${l}</button>`).join('')}</div>`,
  };
  E.fmtOut = (v, f) => f === '%' ? Math.round(v * 100) + '%' : f === 'px' ? v + 'px' : f === 'x' ? Number(v).toFixed(2) + '×' : f === 'b' ? Math.round(v / 255 * 100) + '%' : f === 'min' ? v + ' min' : f === 's' ? v + ' s' : f === 'deg' ? v + '°' : v;

  // effecten na een wijziging
  const FX = {
    theme: () => { D.applyTheme(); D.renderAll(); },
    bg: () => D.applyBackground(),
    tile: () => { D.renderGrid(); },
    tilepanel: () => { D.renderGrid(); E.refreshPanel(); },
    grid: () => { E.clampTiles(D.currentTab()); D.renderGrid(); },
    tabs: () => { D.renderTabbar(); D.applyBackground(); },
    tabbar: () => { D.applyTheme(); D.renderTabbar(); },
    bright: () => D.applyBrightness(),
    panel: () => { D.applyBrightness(); E.refreshPanel(); },
    none: () => {},
  };
  E.bind = root => {
    const apply = (k, v, fx, live) => E.commit(k, () => setPath(D.cfg, k, v), () => { (FX[fx] || FX.none)(); if (fx === 'panel' || (!live && fx === 'tilepanel')) {} });
    root.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k, fx = inp.dataset.fx || 'none';
      if (inp.hasAttribute('data-bool')) inp.onclick = () => { const v = !getPath(D.cfg, k); inp.classList.toggle('on', v); apply(k, v, fx); if (fx === 'panel' || fx === 'tilepanel') E.refreshPanel(); };
      else if (inp.type === 'range') {
        inp.oninput = () => { const v = Number(inp.value); const o = inp.parentNode.querySelector('output'); if (o) o.textContent = E.fmtOut(v, o.dataset.fmt); apply(k, v, fx === 'tilepanel' ? 'tile' : fx, true); };
      } else if (inp.tagName === 'SELECT') inp.onchange = () => { const raw = inp.value; const v = raw === '' ? undefined : (/^-?\d+(\.\d+)?$/.test(raw) && inp.dataset.str === undefined ? Number(raw) : raw); apply(k, v, fx); if (fx === 'tilepanel' || fx === 'panel') E.refreshPanel(); };
      else if (inp.type === 'color') { inp.oninput = () => { inp.classList.remove('unset'); apply(k, inp.value, fx === 'tilepanel' ? 'tile' : fx, true); }; inp.onchange = () => { if (fx === 'tilepanel') E.refreshPanel(); }; }
      else if (inp.type === 'number') inp.onchange = () => { const min = Number(inp.min), max = Number(inp.max); const v = D.clamp(Number(inp.value) || 0, min, max); inp.value = v; apply(k, v, fx); };
      else inp.oninput = () => apply(k, inp.value, fx === 'tilepanel' ? 'tile' : fx, true);
    });
    root.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const inp = b.parentNode.querySelector('input'); inp.value = Number(inp.value) + Number(b.dataset.step); inp.onchange(); });
    root.querySelectorAll('[data-segk]').forEach(b => b.onclick = () => { const raw = b.dataset.v; const v = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw; apply(b.dataset.segk, v, b.dataset.fx); E.refreshPanel(); });
    root.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { apply(b.dataset.clear, undefined, b.dataset.fx); E.refreshPanel(); });
  };

  // ---------- secties ----------
  E.render = {}; E.wire = {};

  // Bibliotheek
  const CATS = [['devices', 'Apparaten'], ['zones', 'Zones'], ['flows', 'Flows'], ['moods', 'Moods'], ['variables', 'Variabelen'], ['insights', 'Grafieken'], ['appw', 'Eigen apps'], ['extra', 'Overig']];
  E.loadAppWidgets = async () => { try { E._aw = await D.api('GET', '/api/appwidgets'); } catch (e) { E._aw = { widgets: [], status: [] }; } return E._aw; };
  const EXTRA = [['clock', 'Klok', 'Tijd en datum'], ['text', 'Tekst', 'Eigen tekst of label'], ['web', 'Webpagina', 'Andere pagina of eigen widget'], ['energy', 'Energie', 'Live verbruik'], ['presence', 'Wie is thuis', 'Aanwezigheid gebruikers'], ['alarms', 'Wekkers', 'Homey-wekkers aan/uit'], ['notifications', 'Meldingen', 'Tijdlijn van Homey'], ['apps', 'Apps', 'Status van Homey-apps']];
  const capSummary = d => { const k = D.devKind(d); return { switch: d.caps.dim ? 'Dimbaar' : 'Aan/uit', thermostat: 'Thermostaat', cover: 'Zonwering', lock: 'Slot', button: 'Knop', sensor: D.measures(d).map(m => (d.caps[m].title || m)).slice(0, 2).join(', ') || 'Sensor' }[k]; };
  const placedIds = () => new Set(D.currentTab().tiles.map(t => (t.ref && (t.ref.deviceId || t.ref.zoneId || t.ref.id)) || null));
  E.render.bibliotheek = () => {
    const q = E.libQ.toLowerCase(); const L = D.lib; const placed = placedIds();
    const m = s => !q || String(s).toLowerCase().includes(q);
    const item = (key, ic, name, sub, on) => `<div class="lib-it${on ? ' placed' : ''}" data-add="${esc(key)}"><span class="lib-ic">${icon(ic)}</span><span class="lib-t"><b>${esc(name)}</b><small>${esc(sub || '')}</small></span><span class="lib-add">${icon('plus')}</span></div>`;
    let body = '';
    const c = E.libCat;
    if (c === 'devices') {
      const zones = [...L.zones].sort((a, b) => a.name.localeCompare(b.name));
      for (const z of zones) {
        const ds = L.devices.filter(d => d.zone === z.id && (m(d.name) || m(z.name))).sort((a, b) => a.name.localeCompare(b.name));
        if (ds.length) body += `<div class="lib-zone">${esc(z.name)}</div>` + ds.map(d => item('device:' + d.id, D.devIcon(d), d.name, capSummary(d), placed.has(d.id))).join('');
      }
    } else if (c === 'zones') body = L.zones.filter(z => m(z.name)).map(z => item('zone:' + z.id, 'home', z.name, `${L.devices.filter(d => d.zone === z.id).length} apparaten`, placed.has(z.id))).join('');
    else if (c === 'flows') body = [...L.flows, ...L.advancedFlows].filter(f => m(f.name)).sort((a, b) => a.name.localeCompare(b.name)).map(f => item(`flow:${f.type}:${f.id}`, 'play', f.name, (f.type === 'advancedflow' ? 'Advanced flow' : 'Flow') + (f.enabled === false ? ' · uitgeschakeld' : '') + (f.triggerable === false ? ' · niet startbaar' : ''), placed.has(f.id))).join('');
    else if (c === 'moods') body = L.moods.filter(x => m(x.name)).map(x => item('mood:' + x.id, 'sparkles', x.name, D.zoneName(x.zone), placed.has(x.id))).join('');
    else if (c === 'variables') body = L.variables.filter(x => m(x.name)).map(x => item('variable:' + x.id, 'braces', x.name, { boolean: 'Ja/nee', number: 'Getal', string: 'Tekst' }[x.type] + ' · ' + String(x.value), placed.has(x.id))).join('');
    else if (c === 'insights') body = L.insights.filter(x => x.type !== 'boolean' && (m(x.title) || m(x.ownerName))).sort((a, b) => (a.ownerName || '').localeCompare(b.ownerName || '')).map(x => item(`insight:${x.uri}|${x.id}`, 'chart', `${x.ownerName || ''} · ${x.title}`, x.units || '', false)).join('');
    else if (c === 'appw') {
      const aw = E._aw; if (!aw) { E.loadAppWidgets().then(() => E.refreshPanel('bibliotheek')); body = '<div class="muted pad">Laden…</div>'; }
      else {
        const apps = [...new Set(aw.widgets.map(w => w.appId))];
        for (const a of apps) {
          const ws = aw.widgets.filter(w => w.appId === a); const ORDER = ['nu-speelt', 'afspeellijst', 'platenkast', 'aura'];
          ws.sort((x, y) => (ORDER.indexOf(x.widgetId) + 1 || 99) - (ORDER.indexOf(y.widgetId) + 1 || 99));
          body += `<div class="lib-zone">${esc(ws[0].appName)}</div>` + item(`awall:${a}`, 'layers', 'Alle widgets naadloos', 'Naast elkaar, één doorlopende achtergrond') +
            ws.filter(w => m(w.name)).map(w => item(`aw:${a}:${w.widgetId}`, 'apps', w.name, 'Losse widget')).join('');
        }
        body = body || '<div class="muted pad">Geen widgets gevonden in de map appwidgets</div>';
        body += `<p class="note">De gegevens komen van de app op je Homey. Of dat werkt, zie je bij Systeem → Eigen apps.</p>`;
      }
    }
    else body = EXTRA.filter(x => m(x[1])).map(([k, n, s]) => item('extra:' + k, D.tiles[k].icon, n, s)).join('') + `<div class="lib-it disabled"><span class="lib-ic">${icon('eye')}</span><span class="lib-t"><b>Camera</b><small>Voegen we later samen toe</small></span></div>`;
    const counts = { appw: E._aw ? E._aw.widgets.length : '…', devices: L.devices.length, zones: L.zones.length, flows: L.flows.length + L.advancedFlows.length, moods: L.moods.length, variables: L.variables.length, insights: L.insights.length, extra: EXTRA.length };
    return `<div class="lib-top"><input type="search" id="libq" placeholder="Zoeken in Homey…" value="${esc(E.libQ)}"><div class="chips-row">${CATS.map(([k, l]) => `<button data-cat="${k}" class="${k === c ? 'act' : ''}">${l}<i>${counts[k]}</i></button>`).join('')}</div></div>
      <p class="note">Tik op <b>+</b> om iets op <b>${esc(D.currentTab().name)}</b> te zetten. Daarna kun je het slepen en groter of kleiner maken.</p>
      <div class="lib-list">${body || '<div class="muted pad">Niets gevonden</div>'}</div>`;
  };
  E.wire.bibliotheek = root => {
    const q = root.querySelector('#libq');
    q.oninput = () => { E.libQ = q.value; const pos = q.selectionStart; E.refreshPanel(); const n = $('#libq'); n.focus(); n.setSelectionRange(pos, pos); };
    root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { E.libCat = b.dataset.cat; E.refreshPanel(); });
    root.querySelectorAll('[data-add]').forEach(b => b.onclick = () => E.addFromLibrary(b.dataset.add));
  };
  E.addFromLibrary = key => {
    const [kind, ...rest] = key.split(':'); const id = rest.join(':');
    let tile;
    if (kind === 'device') { const d = D.dev(id); const k = D.devKind(d); const sz = { switch: d.caps.dim ? [3, 2] : [2, 2], thermostat: [3, 3], cover: [2, 2], lock: [2, 2], button: [2, 2], sensor: [2, 2] }[k]; tile = { type: 'device', ref: { deviceId: id }, opts: {}, w: sz[0], h: sz[1] }; }
    else if (kind === 'zone') tile = { type: 'zone', ref: { zoneId: id } };
    else if (kind === 'flow') { const [ft, fid] = id.split(':'); tile = { type: 'flow', ref: { id: fid, flowType: ft } }; }
    else if (kind === 'mood') tile = { type: 'mood', ref: { id } };
    else if (kind === 'variable') tile = { type: 'variable', ref: { id } };
    else if (kind === 'aw' || kind === 'awall') {
      const [appId, widgetId] = kind === 'aw' ? [rest[0], rest[1]] : [id, null];
      const ws = (E._aw ? E._aw.widgets : []).filter(w => w.appId === appId);
      const tab0 = D.currentTab();
      if (kind === 'awall') {
        const ORDER = ['nu-speelt', 'afspeellijst', 'platenkast', 'aura'];
        const list = ws.map(w => w.widgetId).sort((x, y) => (ORDER.indexOf(x) + 1 || 99) - (ORDER.indexOf(y) + 1 || 99));
        const full = { x: 0, y: 0, w: tab0.grid.cols, h: tab0.grid.rows };
        if (!E.fits(tab0, full)) { D.toast('Voor naadloos is een leeg tabblad nodig. Maak een nieuw tabblad aan.', true); return; }
        tile = { type: 'appgeheel', ref: { appId, widgets: list, name: ws[0] ? ws[0].appName : appId }, style: { frameless: true, hideTitle: true, radius: 0 }, ...full };
        E.commit(null, () => { tab0.grid.gap = 0; tab0.grid.padding = 0; });
      } else {
        const w = ws.find(x => x.widgetId === widgetId);
        tile = { type: 'appwidget', ref: { appId, widgetId, name: w ? w.name : widgetId }, style: { frameless: true, hideTitle: true }, w: 3, h: tab0.grid.rows };
      }
    }
    else if (kind === 'insight') { const [uri, lid] = id.split('|'); tile = { type: 'insight', ref: { uri, id: lid }, opts: { resolution: 'last24Hours' } }; }
    else tile = { type: id, opts: id === 'clock' ? { date: true } : id === 'text' ? { text: 'Nieuwe tekst', size: 1.2 } : id === 'web' ? { url: '', interactive: true } : {} };
    const T = D.tiles[tile.type]; const tab = D.currentTab();
    const spot = tile.x !== undefined ? { x: tile.x, y: tile.y, w: tile.w, h: tile.h } : E.firstFree(tab, tile.w || T.size[0], tile.h || T.size[1]);
    if (!spot) { D.toast('Geen ruimte meer op dit tabblad. Maak ruimte of vergroot het raster.', true); return; }
    const nt = { id: D.uid('w'), opts: {}, style: {}, ...tile, ...spot };
    if (nt.type === 'appgeheel') D.renderGrid();
    E.commit(null, () => tab.tiles.push(nt), () => { E.sel = nt.id; D.renderGrid(); const el = D.tileEls.get(nt.id); if (el) { el.classList.add('flash-ok'); } E.refreshPanel(); D.toast(`${D.titleOf(nt)} toegevoegd`); });
  };

  // Tegel
  const ICON_CHOICES = ['play', 'sparkles', 'home', 'power', 'bulb', 'bell', 'moon', 'sun', 'lock', 'speaker', 'tv', 'garage', 'thermo', 'fan', 'bolt', 'users'];
  E.render.tegel = () => {
    const f = E.sel && D.findTile(E.sel);
    if (!f) return `<div class="empty-note">${icon('sliders')}<p>Tik op een tegel om die te bewerken.</p><p class="muted">Sleep een tegel om hem te verplaatsen. Met het hoekje rechtsonder maak je hem groter of kleiner.</p></div>`;
    const t = f.tile, P = selPath(), T = D.tiles[t.type], th = D.cfg.settings.theme, s = t.style || {};
    let spec = '';
    if (t.type === 'device') {
      const d = D.dev(t.ref.deviceId);
      spec += F.row('Apparaat', F.select(`${P}.ref.deviceId`, t.ref.deviceId, D.lib.devices.map(x => [x.id, `${x.name} (${D.zoneName(x.zone)})`]).sort((a, b) => a[1].localeCompare(b[1])), 'tilepanel'));
      spec += F.row('Weergave', F.select(`${P}.opts.view`, t.opts.view || 'auto', [['auto', 'Automatisch'], ['toggle', 'Alleen knop'], ['slider', 'Knop + schuif'], ['value', 'Eén waarde groot']], 'tilepanel'));
      if (d && (t.opts.view === 'value' || D.devKind(d) === 'sensor')) spec += F.row('Waarde', F.select(`${P}.opts.cap`, t.opts.cap || D.measures(d)[0] || '', Object.keys(d.caps).map(k => [k, d.caps[k].title || k]), 'tile'));
      spec += F.row('Zone tonen', F.toggle(`${P}.opts.showZone`, t.opts.showZone !== false, 'tile'));
      spec += `<p class="note">Op het dashboard: tik = aan/uit, lang drukken = alle bediening.</p>`;
    } else if (t.type === 'flow') {
      spec += F.row('Flow', F.select(`${P}.ref.id`, t.ref.id, [...D.lib.flows, ...D.lib.advancedFlows].map(x => [x.id, x.name]), 'tile'));
      spec += `<div class="icons-pick">${ICON_CHOICES.map(i => `<button data-segk="${P}.opts.icon" data-fx="tile" data-v="${i}" class="${(t.opts.icon || 'play') === i ? 'act' : ''}">${icon(i)}</button>`).join('')}</div>`;
    } else if (t.type === 'mood') spec += F.row('Mood', F.select(`${P}.ref.id`, t.ref.id, D.lib.moods.map(x => [x.id, x.name]), 'tile'));
    else if (t.type === 'variable') { const v = D.lib.variables.find(x => x.id === t.ref.id); if (v && v.type === 'number') spec += F.row('Stapgrootte', F.text(`${P}.opts.step`, t.opts.step || 1, 'tile')) + F.row('Eenheid', F.text(`${P}.opts.unit`, t.opts.unit || '', 'tile', 'bijv. °C')); }
    else if (t.type === 'insight') spec += F.row('Periode', F.seg(`${P}.opts.resolution`, t.opts.resolution || 'last24Hours', Object.entries(D.RES).map(([k, l]) => [k, l.replace('Laatste ', '')]), 'tile')) + F.row('Lijnkleur', F.colorOpt(`${P}.opts.color`, t.opts.color, th.accent, 'tilepanel'));
    else if (t.type === 'energy') spec += F.row('Totaal van', F.select(`${P}.opts.mainDeviceId`, t.opts.mainDeviceId || '', [['', 'Som van alle apparaten'], ...D.lib.devices.filter(d => d.caps.measure_power).map(d => [d.id, d.name])], 'tile'), 'Kies je P1-meter voor het echte huisverbruik');
    else if (t.type === 'apps') spec += F.row('Alleen problemen', F.toggle(`${P}.opts.onlyProblems`, t.opts.onlyProblems, 'tile'));
    else if (t.type === 'clock') spec += F.row('Seconden', F.toggle(`${P}.opts.seconds`, t.opts.seconds, 'tile')) + F.row('Datum', F.toggle(`${P}.opts.date`, t.opts.date !== false, 'tile'));
    else if (t.type === 'text') spec += `<textarea data-k="${P}.opts.text" data-fx="tile" rows="4">${esc(t.opts.text || '')}</textarea>` + F.row('Uitlijnen', F.seg(`${P}.opts.align`, t.opts.align || 'left', [['left', 'Links'], ['center', 'Midden'], ['right', 'Rechts']], 'tile')) + F.row('Grootte', F.range(`${P}.opts.size`, t.opts.size || 1, 0.5, 4, 0.05, 'tile', 'x'));
    else if (t.type === 'web') spec += F.row('Adres (URL)', F.text(`${P}.opts.url`, t.opts.url, 'none', 'http://…')) + `<button class="btn sm" data-reload>${icon('refresh')}Laden</button>` + F.row('Bedienbaar', F.toggle(`${P}.opts.interactive`, t.opts.interactive !== false, 'tile'), 'Uit = alleen kijken') + F.row('Zoom', F.range(`${P}.opts.zoom`, t.opts.zoom || 1, 0.3, 2, 0.05, 'tile', 'x')) + F.row('Verversen', F.num(`${P}.opts.refresh`, t.opts.refresh || 0, 0, 1440, 'tile'), 'minuten, 0 = nooit');

    const tabsOpts = D.cfg.tabs.filter(x => x.id !== f.tab.id).map(x => [x.id, x.name]);
    const hdIcon = t.type === 'device' && D.dev(t.ref.deviceId) ? D.devIcon(D.dev(t.ref.deviceId)) : (T ? T.icon : 'chip');
    return `<div class="tile-hd">${icon(hdIcon)}<div><b>${esc(D.titleOf(t))}</b><small>${esc(T ? T.label : t.type)} · ${t.w}×${t.h}</small></div></div>` +
      F.group('Inhoud', F.row('Titel', F.text(`${P}.opts.title`, t.opts.title, 'tile', T && T.title ? T.title({ ...t, opts: {} }) : '')) + spec) +
      F.group('Plaats en grootte', F.row('Breedte', F.num(`${P}.w`, t.w, 1, f.tab.grid.cols, 'tilepos')) + F.row('Hoogte', F.num(`${P}.h`, t.h, 1, f.tab.grid.rows, 'tilepos')) + F.row('Kolom', F.num(`${P}.x`, t.x, 0, f.tab.grid.cols - 1, 'tilepos')) + F.row('Rij', F.num(`${P}.y`, t.y, 0, f.tab.grid.rows - 1, 'tilepos')) + F.row('Vastzetten', F.toggle(`${P}.locked`, t.locked, 'tilepanel'), 'Kan dan niet per ongeluk verschuiven')) +
      F.group('Stijl', F.row('Achtergrond', F.colorOpt(`${P}.style.bg`, s.bg, th.tileBg, 'tilepanel')) + F.row('Doorzichtigheid', F.range(`${P}.style.opacity`, s.opacity ?? th.tileOpacity, 0, 1, 0.01, 'tile', '%')) +
        F.row('Tekstkleur', F.colorOpt(`${P}.style.text`, s.text, th.text, 'tilepanel')) + F.row('Accent / aan-kleur', F.colorOpt(`${P}.style.accent`, s.accent, th.onColor, 'tilepanel')) +
        F.row('Hoeken', F.range(`${P}.style.radius`, s.radius ?? th.radius, 0, 48, 1, 'tile', 'px')) + F.row('Tekstgrootte', F.range(`${P}.style.fontScale`, s.fontScale || 1, 0.5, 2.5, 0.05, 'tile', 'x')) +
        F.row('Zonder kader', F.toggle(`${P}.style.frameless`, s.frameless, 'tile')) + F.row('Titel verbergen', F.toggle(`${P}.style.hideTitle`, s.hideTitle, 'tile')) + F.row('Eerst bevestigen', F.toggle(`${P}.style.confirm`, s.confirm, 'tile'), 'Vraagt "Weet je het zeker?"') +
        `<button class="btn sm ghost" data-resetstyle>${icon('refresh')}Stijl terugzetten</button>`) +
      F.group('Acties', `<div class="acts"><button class="btn sm" data-dup>${icon('copy')}Dupliceren</button><button class="btn sm danger" data-del>${icon('trash')}Verwijderen</button></div>` +
        (tabsOpts.length ? F.row('Naar tabblad', `<select id="totab">${tabsOpts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>`) + `<div class="acts"><button class="btn sm" data-copyto>${icon('copy')}Kopiëren</button><button class="btn sm" data-moveto>${icon('right')}Verplaatsen</button></div>` : ''));
  };
  E.wire.tegel = root => {
    const f = E.sel && D.findTile(E.sel); if (!f) return; const t = f.tile;
    // plaats-velden met botsingscontrole
    root.querySelectorAll('[data-fx="tilepos"]').forEach(inp => inp.onchange = () => {
      const key = inp.dataset.k.split('.').pop(); const v = D.clamp(Number(inp.value) || 0, Number(inp.min), Number(inp.max));
      const r = { x: t.x, y: t.y, w: t.w, h: t.h, [key]: v };
      if (!E.fits(f.tab, r, t.id)) { D.toast('Past niet: buiten het raster of op een andere tegel', true); inp.value = t[key]; return; }
      E.commit(null, () => { t[key] = v; }, () => { D.renderGrid(); E.refreshPanel(); });
    });
    const rl = root.querySelector('[data-reload]'); if (rl) rl.onclick = () => { const el = D.tileEls.get(t.id); if (el) el.querySelector('.inner').innerHTML = ''; D.renderGrid(); };
    root.querySelector('[data-resetstyle]').onclick = () => E.commit(null, () => { t.style = {}; }, () => { D.renderGrid(); E.refreshPanel(); });
    root.querySelector('[data-dup]').onclick = () => {
      const spot = E.firstFree(f.tab, t.w, t.h); if (!spot) { D.toast('Geen ruimte om te dupliceren', true); return; }
      const n = { ...D.clone(t), id: D.uid('w'), ...spot, locked: false };
      E.commit(null, () => f.tab.tiles.push(n), () => { E.sel = n.id; D.renderGrid(); E.refreshPanel(); });
    };
    root.querySelector('[data-del]').onclick = async () => {
      if (!(await D.confirm(`"${D.titleOf(t)}" verwijderen?`, 'Verwijderen'))) return;
      E.commit(null, () => f.tab.tiles.splice(f.tab.tiles.indexOf(t), 1), () => { E.sel = null; D.renderGrid(); E.refreshPanel(); });
    };
    const move = copy => {
      const dest = D.cfg.tabs.find(x => x.id === root.querySelector('#totab').value);
      const spot = E.firstFree(dest, t.w, t.h); if (!spot) { D.toast(`Geen ruimte op ${dest.name}`, true); return; }
      const n = { ...D.clone(t), id: D.uid('w'), ...spot };
      E.commit(null, () => { dest.tiles.push(n); if (!copy) f.tab.tiles.splice(f.tab.tiles.indexOf(t), 1); }, () => { if (!copy) E.sel = null; D.renderAll(); E.refreshPanel(); D.toast(`${copy ? 'Gekopieerd' : 'Verplaatst'} naar ${dest.name}`); });
    };
    const c = root.querySelector('[data-copyto]'); if (c) { c.onclick = () => move(true); root.querySelector('[data-moveto]').onclick = () => move(false); }
  };

  // Tabbladen
  E.render.tabs = () => {
    const S = D.cfg.settings; const n = D.cfg.tabs.length;
    return F.group('Tabbladen', `<div class="tablist">${D.cfg.tabs.map((t, i) => `<div class="tabrow${t.id === D.activeTab ? ' cur' : ''}">
        <input class="emo" type="text" data-k="tabs.${i}.icon" data-fx="tabs" value="${esc(t.icon || '')}" maxlength="4">
        <input type="text" data-k="tabs.${i}.name" data-fx="tabs" value="${esc(t.name)}">
        <button class="ib sm${S.startTab === t.id ? ' on' : ''}" data-start="${t.id}" title="Starttabblad">${icon('home')}</button>
        <button class="ib sm" data-hide="${i}" title="${t.hidden ? 'Verborgen' : 'Zichtbaar'}">${icon(t.hidden ? 'eyeoff' : 'eye')}</button>
        <button class="ib sm" data-mv="${i}:-1" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button>
        <button class="ib sm" data-mv="${i}:1" ${i === n - 1 ? 'disabled' : ''}>${icon('down')}</button>
        <button class="ib sm" data-deltab="${i}" ${n === 1 ? 'disabled' : ''}>${icon('trash')}</button></div>`).join('')}</div>
        <button class="btn sm" data-addtab ${n >= 10 ? 'disabled' : ''}>${icon('plus')}Tabblad toevoegen (${n}/10)</button>
        <p class="note">${icon('home')} = starttabblad · ${icon('eye')} verborgen tabbladen zie je alleen op de achterkant.</p>`) +
      F.group('Tabbalk onderaan', F.row('Hoogte', F.range('settings.tabbar.height', S.tabbar.height, 32, 72, 1, 'tabbar', 'px')) + F.row('Iconen tonen', F.toggle('settings.tabbar.showIcons', S.tabbar.showIcons, 'tabbar')) + F.row('Namen tonen', F.toggle('settings.tabbar.showNames', S.tabbar.showNames, 'tabbar')) + F.row('Donkerte balk', F.range('settings.tabbar.opacity', S.tabbar.opacity, 0, 1, 0.01, 'tabbar', '%')));
  };
  E.wire.tabs = root => {
    root.querySelectorAll('[data-start]').forEach(b => b.onclick = () => E.commit(null, () => { D.cfg.settings.startTab = b.dataset.start; }, () => E.refreshPanel()));
    root.querySelectorAll('[data-hide]').forEach(b => b.onclick = () => { const t = D.cfg.tabs[b.dataset.hide]; E.commit(null, () => { t.hidden = !t.hidden; }, () => { D.renderTabbar(); E.refreshPanel(); }); });
    root.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.mv.split(':').map(Number); E.commit(null, () => { const a = D.cfg.tabs; [a[i], a[i + d]] = [a[i + d], a[i]]; }, () => { D.renderTabbar(); D.applyBackground(); E.refreshPanel(); }); });
    root.querySelectorAll('[data-deltab]').forEach(b => b.onclick = async () => {
      const t = D.cfg.tabs[b.dataset.deltab];
      if (!(await D.confirm(`Tabblad "${t.name}" met ${t.tiles.length} tegels verwijderen?`, 'Verwijderen'))) return;
      E.commit(null, () => { D.cfg.tabs.splice(D.cfg.tabs.indexOf(t), 1); if (D.cfg.settings.startTab === t.id) D.cfg.settings.startTab = D.cfg.tabs[0].id; }, () => { if (D.activeTab === t.id) D.activeTab = D.cfg.tabs[0].id; D.applyAll(); E.refreshPanel(); });
    });
    const add = root.querySelector('[data-addtab]');
    add.onclick = () => { if (D.cfg.tabs.length >= 10) return; const cur = D.currentTab(); const nt = { id: D.uid('t'), name: 'Tabblad ' + (D.cfg.tabs.length + 1), icon: '⭐', hidden: false, grid: D.clone(cur.grid), background: null, tiles: [] };
      E.commit(null, () => D.cfg.tabs.push(nt), () => { D.renderAll(); D.switchTab(nt.id); E.refreshPanel(); }); };
  };

  // Scherm (achtergrond, helderheid, nacht, screensaver)
  E.render.scherm = () => {
    const S = D.cfg.settings; const tab = D.currentTab(); const own = E.bgScope === 'tab';
    const bp = own ? `${tabPath()}.background` : 'settings.background'; const b = own ? tab.background : S.background;
    let bgBody = F.seg('_scope', E.bgScope, [['all', 'Alle tabbladen'], ['tab', `Alleen "${esc(tab.name)}"`]], 'none').replace(/data-segk="_scope"/g, 'data-scope');
    if (own && !b) bgBody += `<p class="note">Dit tabblad gebruikt de algemene achtergrond.</p><button class="btn sm" data-ownbg>${icon('image')}Eigen achtergrond voor dit tabblad</button>`;
    else {
      bgBody += F.row('Soort', F.seg(`${bp}.type`, b.type, [['color', 'Kleur'], ['gradient', 'Verloop'], ['image', 'Foto']], 'bg'));
      if (b.type === 'color') bgBody += F.row('Kleur', F.color(`${bp}.color`, b.color, 'bg'));
      if (b.type === 'gradient') bgBody += F.row('Kleur 1', F.color(`${bp}.gradient.0`, b.gradient[0], 'bg')) + F.row('Kleur 2', F.color(`${bp}.gradient.1`, b.gradient[1], 'bg')) + F.row('Richting', F.range(`${bp}.angle`, b.angle || 160, 0, 360, 5, 'bg', 'deg'));
      if (b.type === 'image') bgBody += `<div class="gallery" id="gallery"><div class="muted">Laden…</div></div><label class="btn sm upl">${icon('upload')}Foto uploaden<input type="file" accept="image/*" id="bgfile" hidden></label>` + (own ? '' : F.row('Panorama', F.toggle(`${bp}.panorama`, b.panorama, 'bg'), 'Eén brede foto die doorschuift per tabblad'));
      bgBody += F.row('Vervagen', F.range(`${bp}.blur`, b.blur || 0, 0, 40, 1, 'bg', 'px')) + F.row('Donkerder maken', F.range(`${bp}.dim`, b.dim || 0, 0, 0.9, 0.01, 'bg', '%'));
      if (own) bgBody += `<button class="btn sm ghost" data-dropbg>${icon('x')}Terug naar algemene achtergrond</button>`;
    }
    const n = S.night; let sun = '';
    if (n.mode === 'sun') { const st = D.sunTimes(new Date(), n.lat, n.lon); const f = d => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }); sun = `<p class="note">Vandaag: donker vanaf ${f(st.set)} tot ${f(st.rise)}</p>`; }
    return F.group('Achtergrond', bgBody) +
      F.group('Helderheid', F.row('Schermhelderheid', F.range('settings.display.brightness', S.display.brightness, 1, 255, 1, 'bright', 'b')) + `<p class="note">${D.hasFully() ? '✓ Fully Kiosk gevonden: de echte schermhelderheid wordt geregeld.' : 'Fully Kiosk niet gevonden (bijv. op de laptop): er wordt een donkere laag gebruikt.'}</p>`) +
      F.group('Nachtmodus', F.row('Aan', F.toggle('settings.night.enabled', n.enabled, 'panel')) + (n.enabled ? F.row('Wanneer', F.seg('settings.night.mode', n.mode, [['time', 'Vaste tijden'], ['sun', 'Zon onder → op']], 'bright')) +
        (n.mode === 'time' ? F.row('Van', `<input type="time" data-k="settings.night.from" data-fx="bright" value="${n.from}">`) + F.row('Tot', `<input type="time" data-k="settings.night.to" data-fx="bright" value="${n.to}">`) : sun) +
        F.row('Helderheid \'s nachts', F.range('settings.night.brightness', n.brightness, 1, 255, 1, 'bright', 'b')) + F.row('Extra dimmen', F.range('settings.night.dim', n.dim || 0, 0, 0.8, 0.01, 'bright', '%')) + `<p class="note">Nu: ${D.isNight() ? '🌙 nacht' : '☀️ dag'}</p>` : '')) +
      F.group('Screensaver', F.row('Aan', F.toggle('settings.screensaver.enabled', S.screensaver.enabled, 'panel')) + (S.screensaver.enabled ? F.row('Na', F.range('settings.screensaver.after', S.screensaver.after, 1, 60, 1, 'none', 'min')) +
        F.row('Soort', F.select('settings.screensaver.type', S.screensaver.type, [['clock', 'Grote klok'], ['photos', "Foto's (je achtergronden)"], ['black', 'Zwart'], ['off', 'Scherm uit (Fully)']], 'panel')) +
        (S.screensaver.type === 'photos' ? F.row('Wissel elke', F.range('settings.screensaver.interval', S.screensaver.interval, 5, 120, 5, 'none', 's')) : '') + `<button class="btn sm" data-preview>${icon('eye')}Voorbeeld</button>` : '')) +
      F.group('Terug naar start', F.row('Automatisch terug', F.toggle('settings.returnHome.enabled', S.returnHome.enabled, 'panel'), 'Naar het starttabblad als niemand het scherm gebruikt') + (S.returnHome.enabled ? F.row('Na', F.range('settings.returnHome.after', S.returnHome.after, 1, 30, 1, 'none', 'min')) : ''));
  };
  E.wire.scherm = async root => {
    root.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { E.bgScope = b.dataset.v; E.refreshPanel(); });
    const own = root.querySelector('[data-ownbg]'); if (own) own.onclick = () => E.commit(null, () => { D.currentTab().background = D.clone(D.cfg.settings.background); }, () => { D.applyBackground(); E.refreshPanel(); });
    const drop = root.querySelector('[data-dropbg]'); if (drop) drop.onclick = () => E.commit(null, () => { D.currentTab().background = null; }, () => { D.applyBackground(); E.refreshPanel(); });
    const pv = root.querySelector('[data-preview]'); if (pv) pv.onclick = () => D.startSaver(true);
    const file = root.querySelector('#bgfile'); if (file) file.onchange = () => E.uploadBg(file.files[0]);
    const gal = root.querySelector('#gallery');
    if (gal) {
      const list = await D.api('GET', '/api/backgrounds').catch(() => []);
      const bp = E.bgScope === 'tab' ? `${tabPath()}.background` : 'settings.background'; const cur = getPath(D.cfg, bp + '.image');
      gal.innerHTML = list.map(u => `<div class="thumb${u === cur ? ' act' : ''}" data-img="${esc(u)}" style="background-image:url('${esc(u)}')"><button class="tx" data-delimg="${esc(u)}">${icon('x')}</button></div>`).join('') || '<div class="muted">Nog geen foto\'s. Upload er een.</div>';
      gal.querySelectorAll('[data-img]').forEach(th => th.onclick = e => { if (e.target.closest('[data-delimg]')) return; E.commit(null, () => setPath(D.cfg, bp + '.image', th.dataset.img), () => { D.applyBackground(); gal.querySelectorAll('.thumb').forEach(x => x.classList.toggle('act', x === th)); }); });
      gal.querySelectorAll('[data-delimg]').forEach(b => b.onclick = async () => { if (!(await D.confirm('Deze foto verwijderen?', 'Verwijderen'))) return; await D.api('DELETE', '/api/backgrounds/' + encodeURIComponent(b.dataset.delimg.split('/').pop())); E.refreshPanel(); });
    }
  };
  E.uploadBg = async file => {
    if (!file) return; D.toast('Foto verwerken…');
    try {
      const bmp = await createImageBitmap(file); const max = 2560; const r = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const { url } = await D.api('POST', '/api/backgrounds', { name: file.name, dataUrl: c.toDataURL('image/jpeg', 0.86) });
      const bp = E.bgScope === 'tab' ? `${tabPath()}.background` : 'settings.background';
      E.commit(null, () => setPath(D.cfg, bp + '.image', url), () => { D.applyBackground(); E.refreshPanel(); D.toast('Foto toegevoegd'); });
    } catch (e) { D.toast('Uploaden mislukt: ' + e.message, true); }
  };

  // Uiterlijk
  const PRESETS = {
    glas: { name: 'Glas', accent: '#5aa9ff', onColor: '#ffc34d', text: '#ffffff', tileBg: '#141a24', tileOpacity: 0.5, tileBlur: 16, radius: 20, shadow: 0.35, border: 0.1 },
    donker: { name: 'Donker', accent: '#7c8cff', onColor: '#ffb84d', text: '#eef1f6', tileBg: '#1a1d24', tileOpacity: 0.94, tileBlur: 0, radius: 16, shadow: 0.4, border: 0.05 },
    licht: { name: 'Licht', accent: '#2f6fed', onColor: '#f5a300', text: '#1b2230', tileBg: '#ffffff', tileOpacity: 0.78, tileBlur: 14, radius: 20, shadow: 0.12, border: 0.4 },
    oled: { name: 'OLED zwart', accent: '#39d98a', onColor: '#39d98a', text: '#ffffff', tileBg: '#000000', tileOpacity: 1, tileBlur: 0, radius: 14, shadow: 0, border: 0.12 },
    warm: { name: 'Warm', accent: '#ff9f5a', onColor: '#ffd166', text: '#fff7ef', tileBg: '#2a1d16', tileOpacity: 0.55, tileBlur: 18, radius: 24, shadow: 0.35, border: 0.1 },
    oceaan: { name: 'Oceaan', accent: '#3fd1d6', onColor: '#9ef0c9', text: '#eafcff', tileBg: '#0b2230', tileOpacity: 0.5, tileBlur: 20, radius: 26, shadow: 0.3, border: 0.12 },
  };
  E.render.uiterlijk = () => {
    const t = D.cfg.settings.theme; const k = 'settings.theme.';
    const card = (id, p, own) => `<button class="preset" data-preset="${id}" ${own ? 'data-own' : ''} style="--pa:${p.accent};--pb:${D.hexA(p.tileBg, Math.max(0.6, p.tileOpacity))};--pt:${p.text}"><i></i><span>${esc(p.name)}</span>${own ? `<em data-delth="${id}">${icon('x')}</em>` : ''}</button>`;
    return F.group('Thema\'s', `<div class="presets">${Object.entries(PRESETS).map(([id, p]) => card(id, p)).join('')}${(D.cfg.themes || []).map((p, i) => card(i, p, true)).join('')}</div>
        <div class="saverow"><input type="text" id="thname" placeholder="Naam eigen thema"><button class="btn sm" data-saveth>${icon('plus')}Opslaan</button></div>`) +
      F.group('Kleuren', F.row('Accentkleur', F.color(k + 'accent', t.accent, 'theme')) + F.row('Kleur als iets aan staat', F.color(k + 'onColor', t.onColor, 'theme')) + F.row('Tekstkleur', F.color(k + 'text', t.text, 'theme')) + F.row('Tegelkleur', F.color(k + 'tileBg', t.tileBg, 'theme'))) +
      F.group('Tekst', F.row('Lettertype', F.select(k + 'font', t.font, D.FONTS.map(f => [f, f]), 'theme')) + F.row('Tekstgrootte', F.range(k + 'fontScale', t.fontScale, 0.7, 1.6, 0.05, 'theme', 'x'))) +
      F.group('Tegels', F.row('Doorzichtigheid', F.range(k + 'tileOpacity', t.tileOpacity, 0, 1, 0.01, 'theme', '%')) + F.row('Glas-vervaging', F.range(k + 'tileBlur', t.tileBlur, 0, 40, 1, 'theme', 'px')) + F.row('Hoeken', F.range(k + 'radius', t.radius, 0, 48, 1, 'theme', 'px')) + F.row('Schaduw', F.range(k + 'shadow', t.shadow, 0, 0.9, 0.01, 'theme', '%')) + F.row('Rand', F.range(k + 'border', t.border, 0, 0.5, 0.01, 'theme', '%')));
  };
  E.wire.uiterlijk = root => {
    root.querySelectorAll('[data-preset]').forEach(b => b.onclick = e => {
      if (e.target.closest('[data-delth]')) { const i = Number(b.dataset.preset); E.commit(null, () => D.cfg.themes.splice(i, 1), () => E.refreshPanel()); return; }
      const p = b.hasAttribute('data-own') ? D.cfg.themes[Number(b.dataset.preset)] : PRESETS[b.dataset.preset];
      E.commit(null, () => { const { name, ...rest } = p; Object.assign(D.cfg.settings.theme, rest, { preset: name, muted: undefined }); delete D.cfg.settings.theme.muted; }, () => { FX.theme(); E.refreshPanel(); });
    });
    root.querySelector('[data-saveth]').onclick = () => {
      const name = root.querySelector('#thname').value.trim() || 'Mijn thema'; const t = D.cfg.settings.theme;
      E.commit(null, () => { D.cfg.themes = D.cfg.themes || []; D.cfg.themes.push({ name, accent: t.accent, onColor: t.onColor, text: t.text, tileBg: t.tileBg, tileOpacity: t.tileOpacity, tileBlur: t.tileBlur, radius: t.radius, shadow: t.shadow, border: t.border, font: t.font, fontScale: t.fontScale }); }, () => { E.refreshPanel(); D.toast('Thema opgeslagen'); });
    };
  };

  // Raster
  E.render.raster = () => {
    const tab = D.currentTab(); const P = tabPath() + '.grid.'; const g = tab.grid;
    return F.group(`Raster van "${esc(tab.name)}"`, F.row('Kolommen', F.num(P + 'cols', g.cols, 2, 24, 'grid')) + F.row('Rijen', F.num(P + 'rows', g.rows, 2, 16, 'grid')) +
      F.row('Ruimte tussen tegels', F.range(P + 'gap', g.gap, 0, 40, 1, 'grid', 'px')) + F.row('Rand van scherm', F.range(P + 'padding', g.padding, 0, 60, 1, 'grid', 'px')) +
      `<p class="note">Wordt het raster kleiner, dan schuiven tegels mee naar binnen. Controleer daarna of niets overlapt.</p><button class="btn sm" data-gridall>${icon('copy')}Dit raster op alle tabbladen</button>`) +
      F.group('Hulplijnen', `<p class="note">Op de achterkant zie je de vakjes van het raster. Op de voorkant zijn ze onzichtbaar.</p>`);
  };
  E.wire.raster = root => {
    root.querySelector('[data-gridall]').onclick = async () => {
      if (!(await D.confirm('Kolommen, rijen en ruimte van dit tabblad op alle tabbladen toepassen?'))) return;
      const g = D.currentTab().grid; E.commit(null, () => D.cfg.tabs.forEach(t => { t.grid = D.clone(g); E.clampTiles(t); }), () => { D.renderAll(); D.toast('Toegepast op alle tabbladen'); });
    };
  };

  // Systeem
  E.render.systeem = () => {
    const st = D.status; const L = D.lib; const u = D.cfg.settings.unlock;
    const stat = st.mode === 'demo' ? `<span class="stat warn">Demo-modus</span><p class="note">Er is nog geen Homey gekoppeld. Je ziet voorbeeldapparaten. Vul HOMEY_ADDRESS en HOMEY_TOKEN in (zie de handleiding).</p>`
      : st.connected ? `<span class="stat ok">Verbonden met Homey</span>` : `<span class="stat bad">Geen verbinding</span><p class="note">${esc(st.error || '')}</p>`;
    return F.group('Homey', stat + `<div class="counts">${[['Apparaten', L.devices.length], ['Zones', L.zones.length], ['Flows', L.flows.length + L.advancedFlows.length], ['Moods', L.moods.length], ['Variabelen', L.variables.length], ['Insights', L.insights.length], ['Apps', L.apps.length], ['Gebruikers', L.users.length]].map(([l, n]) => `<div><b>${n}</b><small>${l}</small></div>`).join('')}</div>
        <div class="acts"><button class="btn sm" data-relib>${icon('refresh')}Bibliotheek vernieuwen</button><button class="btn sm" data-reload>${icon('refresh')}Dashboard herladen</button></div>`) +
      F.group('Eigen apps', '<div id="awstat"><div class="muted">Laden…</div></div>') +
      F.group('Back-ups', `<p class="note">Elke dag wordt automatisch een back-up gemaakt (14 dagen bewaard).</p><div class="acts"><button class="btn sm" data-bk>${icon('download')}Back-up maken</button><button class="btn sm" data-export>${icon('download')}Exporteren</button><label class="btn sm">${icon('upload')}Importeren<input type="file" accept=".json" id="impfile" hidden></label></div><div id="bklist" class="bklist"><div class="muted">Laden…</div></div>`) +
      F.group('Achterkant openen', F.row('Aantal tikken', F.num('settings.unlock.taps', u.taps, 3, 8, 'none')) + F.row('Binnen', F.range('settings.unlock.window', u.window, 800, 3000, 100, 'none', 'n'), 'milliseconden') + `<p class="note">Tik op een lege plek of op de tabbalk.</p>`) +
      F.group('Opnieuw beginnen', `<button class="btn sm danger" data-reset>${icon('trash')}Alles terugzetten naar begin</button>`) +
      `<p class="note center">Homey Dashboard · ${D.hasFully() ? 'Fully Kiosk' : 'browser'} · ${window.innerWidth}×${window.innerHeight}</p>`;
  };
  E.wire.systeem = async root => {
    root.querySelector('[data-relib]').onclick = async () => { D.toast('Vernieuwen…'); await D.api('POST', '/api/library/refresh').catch(e => D.toast(e.message, true)); await D.loadLibrary(); D.renderAll(); E.refreshPanel(); D.toast('Bibliotheek bijgewerkt'); };
    root.querySelector('[data-reload]').onclick = async () => { await E.saveNow(); location.reload(); };
    root.querySelector('[data-bk]').onclick = async () => { await E.saveNow(); await D.api('POST', '/api/backups'); D.toast('Back-up gemaakt'); E.refreshPanel(); };
    root.querySelector('[data-export]').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D.cfg, null, 2)], { type: 'application/json' })); a.download = `homey-dashboard-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
    root.querySelector('#impfile').onchange = async e => {
      try { const cfg = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(cfg.tabs)) throw new Error('Geen dashboard-bestand'); if (!(await D.confirm('Huidige indeling vervangen door dit bestand?', 'Vervangen'))) return; E.commit(null, () => { D.cfg = cfg; }, () => { D.applyAll(); E.refreshPanel(); }); }
      catch (err) { D.toast('Importeren mislukt: ' + err.message, true); }
    };
    root.querySelector('[data-reset]').onclick = async () => { if (!(await D.confirm('Echt alles terugzetten? Tegels, tabbladen en instellingen gaan weg (back-ups blijven).', 'Terugzetten'))) return; const c = await D.api('POST', '/api/reset'); E.undo.push(JSON.stringify(D.cfg)); D.cfg = c; D.activeTab = null; D.applyAll(); E.refreshPanel(); };
    E.loadAppWidgets().then(aw => {
      const box = root.querySelector('#awstat'); if (!box) return;
      if (aw.demo) { box.innerHTML = '<p class="note">Demo-modus: er wordt een nep-versie van je Spotify-app getoond.</p>'; return; }
      box.innerHTML = aw.status.map(s => `<div class="awrow"><b>${esc(s.appId)}</b>` +
        (s.route ? `<span class="stat ok">Werkt</span><p class="note">Via ${esc(s.routeLabel)} · live-berichten: ${s.realtime ? 'ja' : 'nee (elke 3 s opvragen)'}${s.error ? '<br>Laatste fout: ' + esc(s.error) : ''}</p>`
          : s.error ? `<span class="stat bad">Werkt niet</span><p class="note">${esc(s.error)}${(s.tried || []).length ? '<br>' + s.tried.map(esc).join('<br>') : ''}</p>`
          : `<span class="stat warn">Nog niet geprobeerd</span><p class="note">Zet een widget van deze app op het dashboard; daarna zie je hier of het werkt.</p>`) + '</div>').join('') || '<p class="note">Geen app-widgets gevonden.</p>';
    });
    const list = await D.api('GET', '/api/backups').catch(() => []); const box = root.querySelector('#bklist'); if (!box) return;
    box.innerHTML = list.map(b => `<div class="bk"><span>${esc(b.name.replace('.json', ''))}<small>${new Date(b.date).toLocaleString('nl-NL')}</small></span><button class="ib sm" data-rs="${esc(b.name)}" title="Terugzetten">${icon('undo')}</button><a class="ib sm" href="/api/backups/${encodeURIComponent(b.name)}" title="Downloaden">${icon('download')}</a><button class="ib sm" data-rm="${esc(b.name)}" title="Verwijderen">${icon('trash')}</button></div>`).join('') || '<div class="muted">Nog geen back-ups</div>';
    box.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => { if (!(await D.confirm(`Back-up "${b.dataset.rs}" terugzetten?`, 'Terugzetten'))) return; E.undo.push(JSON.stringify(D.cfg)); D.cfg = await D.api('POST', '/api/restore/' + encodeURIComponent(b.dataset.rs)); D.applyAll(); E.refreshPanel(); D.toast('Back-up teruggezet'); });
    box.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!(await D.confirm('Deze back-up verwijderen?', 'Verwijderen'))) return; await D.api('DELETE', '/api/backups/' + encodeURIComponent(b.dataset.rm)); E.refreshPanel(); });
  };
})();
