/* Achterkant: bewerkmodus + instellingenpaneel */
(function () {
  const D = window.D; const esc = D.esc; const $ = D.$;
  const E = D.editor = { sel: null, section: 'bibliotheek', undo: [], redo: [], libCat: 'devices', libQ: '', bgScope: 'all', folds: { kleuren: true } };

  const SECTIONS = [
    ['bibliotheek', 'book', 'Toevoegen'], ['knoppen', 'knob', 'Knoppen'], ['pictogrammen', 'shapes', 'Pictogrammen'], ['tegel', 'sliders', 'Tegel'], ['tabs', 'layers', 'Tabbladen'],
    ['scherm', 'sun', 'Scherm'], ['uiterlijk', 'palette', 'Uiterlijk'], ['raster', 'grid', 'Raster'], ['systeem', 'server', 'Systeem'],
  ];

  // ---------- openen / sluiten ----------
  E.open = () => {
    if (D.editing) return;
    D.editing = true; document.body.classList.add('editing');
    E.undo = []; E.redo = []; E.sel = null; E.urls();
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
  // volgende wijziging als eigen stap (niet samenvoegen met de vorige)
  E.breakMerge = () => { lastKey = null; if (E.log && E.log[0]) E.log[0].sealed = true; };
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
      ov.innerHTML = `<span class="lbl">${anyIcon((t.opts && t.opts.mdi) || oi)}${esc(D.titleOf(t))}</span>${t.locked ? `<span class="lk">${icon('lock')}</span>` : '<span class="rs">' + icon('resize') + '</span>'}`;
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
  E.select = id => { E.sel = id; E.fxScope = 'tile'; E.decorate(); E.section = 'tegel'; E.refreshPanel(); };

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
      <button class="ib" data-history title="Laatste wijzigingen">${icon('clock')}</button><button class="ib" data-undo title="Ongedaan maken">${icon('undo')}</button><button class="ib" data-redo title="Opnieuw">${icon('redo')}</button>
      <button class="btn primary sm" data-done>${icon('check')}Klaar</button></header><div class="p-body">${E.render[E.section]()}</div></div>`;
    p.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { E.section = b.dataset.sec; E.refreshPanel(); });
    p.querySelector('[data-undo]').onclick = E.doUndo; p.querySelector('[data-redo]').onclick = E.doRedo; p.querySelector('[data-history]').onclick = E.openHistory;
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
    range: (k, v, min, max, step, fx, fmt = 'n') => { const ps = fmt === 'b' ? 2.55 : step; return `<span class="rg"><button class="ib xs" data-rstep="-${ps}" title="Minder">${icon('minus')}</button><input type="range" data-k="${k}" data-fx="${fx}" data-num min="${min}" max="${max}" step="${step}" value="${v}"><button class="ib xs" data-rstep="${ps}" title="Meer">${icon('plus')}</button><output data-fmt="${fmt}">${E.fmtOut(v, fmt)}</output></span>`; },
    // inklapbaar groepje; open/dicht wordt onthouden
    fold: (title, body, key) => `<details class="fold" data-fold="${key}"${E.folds[key] ? ' open' : ''}><summary>${title}</summary><div class="fold-b">${body}</div></details>`,
    toggle: (k, v, fx) => `<button class="switch${v ? ' on' : ''}" data-k="${k}" data-fx="${fx}" data-bool><i></i></button>`,
    select: (k, v, opts, fx) => `<select data-k="${k}" data-fx="${fx}">${opts.map(([val, l]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`,
    text: (k, v, fx, ph = '') => `<input type="text" data-k="${k}" data-fx="${fx}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`,
    num: (k, v, min, max, fx) => `<span class="num"><button class="ib sm" data-step="-1">${icon('minus')}</button><input type="number" data-k="${k}" data-fx="${fx}" data-num min="${min}" max="${max}" value="${v}"><button class="ib sm" data-step="1">${icon('plus')}</button></span>`,
    // adresveld: standaardbegin al ingevuld, snelknoppen, ✕ om te wissen, eerder gebruikte adressen als suggestie
    url: (k, v, fx) => {
      const U = E.urls(); const val = v || U.prefix || '';
      const recent = [...new Set([...D.cfg.tabs.flatMap(t => t.tiles).filter(t => t.type === 'web' && t.opts && t.opts.url).map(t => t.opts.url), ...U.quick.map(q => q[1])])];
      return `<div class="urlf"><div class="url-chips">${U.quick.filter(q => q[1]).map(([n, u]) => `<button data-urlq="${esc(u)}" title="${esc(u)}">${esc(n || u)}</button>`).join('')}<button data-urlq="https://">https://</button><button data-urlq="http://">http://</button></div>
        <div class="url-in"><input type="text" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" data-urlk="${k}" data-fx="${fx}" value="${esc(val)}" list="urlrecent" placeholder="http://…"><button class="ib sm" data-urlclear title="Leegmaken">${icon('x')}</button></div>
        <datalist id="urlrecent">${recent.map(u => `<option value="${esc(u)}">`).join('')}</datalist>${v ? '' : '<small class="urlhint">Het begin is al ingevuld. Typ de rest erachter, of tik op ✕ voor een heel ander adres.</small>'}</div>`;
    },
    icon: (cur, custom, which = 'on') => `<span class="icctl"><span class="icprev${which === 'off' ? ' off' : ''}">${anyIcon(cur)}</span><button class="btn sm" data-pickicon="${which}">${icon('shapes')}Kiezen</button>${custom ? `<button class="ib sm" data-clearicon="${which}" title="${which === 'off' ? 'Zelfde als aan' : 'Standaard pictogram'}">${icon('refresh')}</button>` : ''}</span>`,
    seg: (k, v, opts, fx) => `<div class="seg">${opts.map(([val, l]) => `<button data-segk="${k}" data-fx="${fx}" data-v="${esc(val)}" class="${String(val) === String(v) ? 'act' : ''}">${l}</button>`).join('')}</div>`,
  };
  E.fmtOut = (v, f) => f === '%' ? Math.round(v * 100) + '%' : f === 'p' ? v + '%' : f === 'px' ? v + 'px' : f === 'x' ? Number(v).toFixed(2) + '×' : f === 'b' ? Math.round(v / 255 * 100) + '%' : f === 'min' ? v + ' min' : f === 's' ? v + ' s' : f === 'deg' ? v + '°' : v;

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
    const apply = (k, v, fx, live, inp) => {
      const info = inp ? E.describe(inp, k) : null;
      E.commit(k, () => { E._chg = []; E.setScoped(k, v); E.noteChange(k, info, v, E._chg); E._chg = null; },
        () => { (FX[fx] || FX.none)(); if (E.fxScope === 'all' && E.sel && fx.startsWith('tile')) D.renderAll(); E.flashFor(k);
          const row = inp && inp.isConnected && inp.closest('.f'); if (row && row.parentNode) E.decorateRows(row.parentNode, apply); });
    };
    E._apply = apply;
    root.querySelectorAll('[data-k]').forEach(inp => {
      const k = inp.dataset.k, fx = inp.dataset.fx || 'none';
      if (inp.hasAttribute('data-bool')) inp.onclick = () => { const v = !inp.classList.contains('on'); inp.classList.toggle('on', v); apply(k, v, fx, false, inp); if (fx === 'panel' || fx === 'tilepanel') E.refreshPanel(); };
      else if (inp.type === 'range') {
        inp.oninput = () => { const v = Number(inp.value); const o = inp.parentNode.querySelector('output'); if (o) o.textContent = E.fmtOut(v, o.dataset.fmt); apply(k, v, fx === 'tilepanel' ? 'tile' : fx, true, inp); };
      } else if (inp.tagName === 'SELECT') inp.onchange = () => { const raw = inp.value; const v = raw === '' ? undefined : (/^-?\d+(\.\d+)?$/.test(raw) && inp.dataset.str === undefined ? Number(raw) : raw); apply(k, v, fx, false, inp); if (fx === 'tilepanel' || fx === 'panel' || inp.hasAttribute('data-refresh')) E.refreshPanel(); };
      else if (inp.type === 'color') { inp.oninput = () => { inp.classList.remove('unset'); apply(k, inp.value, fx === 'tilepanel' ? 'tile' : fx, true, inp); }; inp.onchange = () => { if (fx === 'tilepanel') E.refreshPanel(); }; }
      else if (inp.type === 'number') inp.onchange = () => { const min = Number(inp.min), max = Number(inp.max); const v = D.clamp(Number(inp.value) || 0, min, max); inp.value = v; apply(k, v, fx, false, inp); };
      else inp.oninput = () => apply(k, inp.value, fx === 'tilepanel' ? 'tile' : fx, true, inp);
    });
    root.querySelectorAll('[data-urlk]').forEach(inp => {
      const k = inp.dataset.urlk, fx = inp.dataset.fx || 'none';
      const toEnd = () => { inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (e) { /* */ } };
      inp.oninput = () => apply(k, inp.value.trim(), fx, true);
      // bij het eerste tikken in het veld: cursor achteraan, zodat je direct achter het begin verder typt
      let fresh = false;
      inp.onfocus = () => { fresh = true; setTimeout(() => { if (fresh) toEnd(); }, 0); };
      inp.onclick = () => { if (fresh) { fresh = false; toEnd(); } };
      inp.onblur = () => { fresh = false; };
      const box = inp.closest('.urlf');
      box.querySelectorAll('[data-urlq]').forEach(b => b.onclick = () => { inp.value = b.dataset.urlq; apply(k, inp.value, fx); toEnd(); });
      box.querySelector('[data-urlclear]').onclick = () => { inp.value = ''; apply(k, '', fx); toEnd(); };
    });
    // – en + naast schuifregelaars; ingedrukt houden loopt steeds sneller door
    root.querySelectorAll('[data-rstep]').forEach(b => {
      const inp = b.parentNode.querySelector('input[type=range]'); const d = Number(b.dataset.rstep);
      const once = () => { const v = D.clamp(Math.round((Number(inp.value) + d) * 1e4) / 1e4, Number(inp.min), Number(inp.max)); if (v === Number(inp.value)) return; inp.value = v; if (inp.oninput) inp.oninput(); };
      let t1 = null, t2 = null; const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; };
      b.onpointerdown = e => { e.preventDefault(); stop(); once(); let n = 0; t1 = setTimeout(() => { t2 = setInterval(() => { once(); if (++n === 8) { clearInterval(t2); t2 = setInterval(once, 45); } }, 120); }, 420); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
    });
    root.querySelectorAll('[data-fold]').forEach(d => d.ontoggle = () => { E.folds[d.dataset.fold] = d.open; });
    root.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { const inp = b.parentNode.querySelector('input'); inp.value = Number(inp.value) + Number(b.dataset.step); inp.onchange(); });
    root.querySelectorAll('[data-segk]').forEach(b => b.onclick = () => { const raw = b.dataset.v; const v = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw; apply(b.dataset.segk, v, b.dataset.fx, false, b); E.refreshPanel(); });
    root.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { apply(b.dataset.clear, undefined, b.dataset.fx, false, b); E.refreshPanel(); });
    E.decorateRows(root, apply);
  };

  // ---------- beschrijven, logboek, knipperen, uitleg, bolletjes ----------
  const labelOf = row => { if (!row) return ''; const l = row.querySelector(':scope > label'); if (!l) return ''; const c = l.cloneNode(true); c.querySelectorAll('small, .ovr, .info').forEach(n => n.remove()); return c.textContent.trim(); };
  // naam + weergave van een waarde voor de melding en het logboek
  E.describe = (inp, k) => {
    const row = inp.closest('.f'); let label = labelOf(row) || (inp.closest('.grp') && inp.closest('.grp').querySelector('h3') ? inp.closest('.grp').querySelector('h3').textContent.trim() : '') || k.split('.').pop();
    let fmt = v => v === undefined || v === null || v === '' ? 'standaard' : String(v);
    if (inp.type === 'range') { const o = inp.parentNode.querySelector('output'); const f = o ? o.dataset.fmt : 'n'; fmt = v => v === undefined ? 'standaard' : String(E.fmtOut(v, f)); }
    else if (inp.hasAttribute && inp.hasAttribute('data-bool')) fmt = v => v === undefined ? 'standaard' : v ? 'aan' : 'uit';
    else if (inp.tagName === 'SELECT') { const opts = [...inp.options].map(o => [o.value, o.textContent]); fmt = v => v === undefined ? 'standaard' : (opts.find(o => o[0] === String(v)) || [0, String(v)])[1]; }
    else if (inp.dataset && inp.dataset.segk) { const seg = inp.closest('.seg'); const opts = seg ? [...seg.querySelectorAll('[data-v]')].map(b => [b.dataset.v, b.textContent.trim()]) : []; fmt = v => v === undefined ? 'standaard' : (opts.find(o => o[0] === String(v)) || [0, String(v)])[1]; }
    else if (inp.type === 'color') fmt = v => v === undefined ? 'standaard' : String(v).toUpperCase();
    return { label, fmt };
  };
  E.log = E.log || [];
  const whoOf = (k, n) => {
    const P = E.sel && selPath(); const f = E.sel && D.findTile(E.sel);
    if (P && k.startsWith(P + '.') && f) return D.titleOf(f.tile) + (n > 1 ? ` en ${n - 1} andere` : '');
    if (k.startsWith('settings.theme')) return 'standaard voor alle tegels';
    return '';
  };
  E.noteChange = (k, info, v, changes) => {
    const label = (info && info.label) || k.split('.').pop(); const fmt = (info && info.fmt) || (x => x === undefined ? 'standaard' : String(x));
    const last = E.log[0]; const now = Date.now();
    let e;
    if (last && last.k === k && now - last.at < 2500 && !last.reverted && !last.sealed) { e = last; e.to = v; e.at = now; }
    else { const from = changes.length ? changes[0].old : undefined; e = { k, label, fmt, from, to: v, who: whoOf(k, changes.length), changes, at: now }; E.log.unshift(e); if (E.log.length > 30) E.log.pop(); }
    D.toast(`${e.label}: ${e.fmt(e.from)} → ${e.fmt(e.to)}${e.who ? ' · ' + e.who : ''}`);
    E.updateHeader();
  };
  // losse acties (kant-en-klaar, terugzetten, kopiëren) ook in het logboek
  E.logAction = (label, changes, who) => { E.log.unshift({ k: '_' + Date.now(), label, fmt: () => '', from: '', to: '', who: who || '', changes, at: Date.now(), action: true }); if (E.log.length > 30) E.log.pop(); E.updateHeader(); };
  const snapTile = (x, rel) => ({ tid: x.id, rel, old: getPath(x, rel) === undefined ? undefined : D.clone(getPath(x, rel)) });
  const snapPath = path => ({ path, old: getPath(D.cfg, path) === undefined ? undefined : D.clone(getPath(D.cfg, path)) });
  E.snapTile = snapTile; E.snapPath = snapPath;
  E.revert = i => {
    const e = E.log[i]; if (!e) return;
    const now = e.changes.map(c => c.tid ? (D.findTile(c.tid) ? snapTile(D.findTile(c.tid).tile, c.rel) : null) : snapPath(c.path)).filter(Boolean);
    E.commit(null, () => { for (const c of e.changes) { const val = c.old === undefined ? undefined : D.clone(c.old); if (c.tid) { const f = D.findTile(c.tid); if (f) setPath(f.tile, c.rel, val); } else setPath(D.cfg, c.path, val); } },
      () => { D.applyAll(); E.refreshPanel(); });
    e.reverted = true; E.logAction('Teruggezet: ' + e.label, now, e.who); D.toast('Teruggezet: ' + e.label);
  };
  E.openHistory = () => {
    const t = d => new Date(d).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const rows = E.log.map((e, i) => `<div class="hist-row${e.reverted ? ' rev' : ''}"><div class="ht"><b>${esc(e.label)}</b>${e.action ? '' : `<span>${esc(e.fmt(e.from))} → ${esc(e.fmt(e.to))}</span>`}<small>${t(e.at)}${e.who ? ' · ' + esc(e.who) : ''}${e.reverted ? ' · teruggezet' : ''}</small></div><button class="btn sm" data-rev="${i}" ${e.reverted || !e.changes.length ? 'disabled' : ''}>${icon('undo')}Terugzetten</button></div>`).join('');
    D.openSheet(`<div class="sheet-hd"><div><h2>Laatste wijzigingen</h2><div class="sub">Nieuwste bovenaan · sinds het dashboard geladen is</div></div><button class="xbtn" data-close>${icon('x')}</button></div><div class="hist">${rows || '<div class="muted pad">Nog geen wijzigingen.</div>'}</div>`, 'wide');
    $('#sheet').onclick = e => { if (e.target.closest('[data-close]')) return D.closeSheet(); const b = e.target.closest('[data-rev]'); if (b && !b.disabled) { E.revert(Number(b.dataset.rev)); E.openHistory(); } };
  };
  // kort laten knipperen wat er verandert
  const PART = n => /^(fr|fbw|depth|icStyle|icColor2|colorOn|colorOff|keepColor|brand|kind|mdi|mdiOff)$/.test(n) ? 'face' : /^(tx[NS]|fontScale|text|label|state|hideTitle|font|fontScale)$/.test(n) ? 'text' : 'tile';
  E.flashFor = k => {
    const n = k.split('.').pop(); const part = PART(n); const P = E.sel && selPath(); let ids = [];
    if (P && k.startsWith(P + '.')) ids = [E.sel, ...E.scopeTargets().map(x => x.id)];
    else if (k.startsWith('settings.theme')) ids = D.currentTab().tiles.map(x => x.id);
    for (const id of ids) {
      const el = D.tileEls.get(id); if (!el) continue;
      el.classList.remove('fx-flash-tile', 'fx-flash-face', 'fx-flash-text'); void el.offsetWidth; el.classList.add('fx-flash-' + part);
      clearTimeout(el._fxT); el._fxT = setTimeout(() => el.classList.remove('fx-flash-' + part), 950);
    }
  };
  // uitleg per instelling
  const HELP = {
    'Achtergrond': 'De kleur van het vlak achter de inhoud van de tegel.',
    'Doorzichtigheid': 'Hoe doorzichtig de achtergrond van de tegel is. Op 0% verdwijnen ook de rand en de schaduw: je ziet dan alleen de inhoud.',
    'Tekstkleur': 'De kleur van de naam en de toestand op de tegel.',
    'Accent / aan-kleur': 'De kleur die de tegel krijgt als het apparaat aan staat (gloed, schuifje, verlichte knop).',
    'Hoeken tegel': 'Hoe rond de hoeken van de tegel zelf zijn. 0 = scherp.',
    'Hoeken': 'Hoe rond de hoeken van alle tegels zijn. 0 = scherp.',
    'Knopvorm / hoeken': 'De vorm van de knop of het rondje achter het pictogram, niet van de tegel. 0% = vierkant, 50% = rond.',
    'Binnenmarge': 'Ruimte tussen de rand van de tegel en de inhoud. Meer marge = kleinere knop.',
    'Randdikte': 'De dikte van de lijn rond de tegel.',
    'Randkleur': 'De kleur van de lijn rond de tegel.',
    'Rand doorzichtigheid': 'Hoe zichtbaar de lijn rond de tegel is. 0% = onzichtbaar.',
    'Rand kleurt mee als aan': 'De lijn rond de tegel krijgt de aan-kleur zodra het apparaat aan staat.',
    'Knoprand dikte': 'De rand van de knop zelf (verlichte knop, scène), bij de ronde knop de dikte van de ring. Niet de rand van de tegel.',
    'Zonder kader': 'Haalt achtergrond, rand en schaduw van de tegel weg. Alleen de inhoud blijft over.',
    'Schaduw op': 'Waar de schaduw komt: onder de hele tegel, onder de knop, of achter de tekst.',
    'Schaduw sterkte': 'Hoe donker de schaduw is. 0% = geen schaduw.',
    'Schaduw grootte': 'Hoe groot en zacht de schaduw is.',
    'Richting': 'Waar de schaduw heen valt: recht naar onder, schuin, of gelijk rondom.',
    'Schaduwkleur': 'De kleur van de schaduw, meestal zwart.',
    'Gloed': 'Wanneer er een lichtrand oplicht: nooit, als het apparaat aan staat, altijd, of knipperend bij alarm.',
    'Gloed op': 'Waar de gloed komt: rond de tegel, rond de knop, of rond de tekst.',
    'Gloedkleur': 'De kleur van de gloed. Standaard de aan-kleur.',
    'Gloed sterkte': 'Hoe fel de gloed is.',
    'Gloed grootte': 'Hoe ver de gloed uitstraalt.',
    'Tekstgrootte': 'Groter of kleiner maken van alle tekst op de tegel.',
    'Naam doorzichtigheid': 'Hoe goed de naam van de tegel te zien is.',
    'Toestand doorzichtigheid': 'Hoe goed de toestand ("Aan · 70%", waarden, datum) te zien is.',
    'Titel verbergen': 'Verbergt de naam bovenin de tegel.',
    'Indrukdiepte': 'Hoe ver een 3D-knop, paniekknop of wandschakelaar in- en uitsteekt. 0 = plat.',
    'Tikeffect': 'Hoeveel de tegel even krimpt als je erop tikt. 0 = niet.',
    'Klikgeluid': 'Een geluidje bij het tikken. Met ▶ hoor je het.',
    'Volume': 'Hoe hard het klikgeluid is.',
    'Eerst bevestigen': 'Vraagt "Weet je het zeker?" voordat de knop iets doet.',
    'Knopstijl': 'Hoe de knop eruitziet: 3D, verlicht, wandschakelaar, alleen pictogram, enzovoort.',
    'Toestand van': 'Welke waarde van het apparaat de knop laat zien (bijv. aan/uit of raam open/dicht).',
    'Pictogram (aan)': 'Het pictogram als het apparaat aan staat (of altijd, als je geen uit-pictogram kiest).',
    'Pictogram (uit)': 'Het pictogram als het apparaat uit staat.',
    'Merkkleur': 'Logo in de echte kleur van het merk. Uit = het logo kleurt mee met de aan/uit-kleur.',
    'Kleur behouden bij uit': 'Gekleurde pictogrammen en logo’s worden bij uit normaal grijs. Aan = altijd in kleur.',
    'Kleurstijl': 'Hoe een eenkleurig pictogram wordt gekleurd: één kleur, verloop, met cirkel of tweekleurig.',
    'Kleur als aan': 'De kleur van de knop of het pictogram als het apparaat aan staat.',
    'Kleur als uit': 'De kleur van de knop of het pictogram als het apparaat uit staat.',
    'Naam tonen': 'Laat de naam onder de knop zien.',
    'Toestand tonen': 'Laat de toestand onder de knop zien, bijv. "Aan · 70%".',
    'Accentkleur': 'De hoofdkleur van het dashboard: actief tabblad, schuifjes, knoppen in het menu.',
    'Kleur als iets aan staat': 'De standaardkleur voor alles wat aan staat.',
    'Tegelkleur': 'De standaardkleur van de tegels.',
    'Lettertype': 'Het lettertype van het hele dashboard.',
    'Glas-vervaging': 'Hoeveel de achtergrond achter de tegels wazig wordt (glaseffect).',
  };
  // standaardwaarde bij een pad (voor het bolletje en terugzetten)
  const defaultAt = k => {
    const m = /^settings\.theme\.([a-zA-Z]+)$/.exec(k);
    if (m) { const d = DEFAULT_THEME(); return m[1] in d ? { has: true, v: d[m[1]] } : { has: false }; }
    return { has: true, v: undefined };
  };
  const isOverride = k => {
    const P = E.sel && selPath();
    if (P && k.startsWith(P + '.')) { const rel = k.slice(P.length + 1); return scopable(rel) && getPath(D.cfg, k) !== undefined; }
    if (/^settings\.theme\.fx\./.test(k)) return getPath(D.cfg, k) !== undefined;
    const d = defaultAt(k); if (/^settings\.theme\.[a-zA-Z]+$/.test(k) && d.has && k !== 'settings.theme.preset') { const v = getPath(D.cfg, k); return v !== undefined && String(v).toLowerCase() !== String(d.v).toLowerCase(); }
    return false;
  };
  E.decorateRows = (root, apply) => {
    root.querySelectorAll('.f').forEach(row => {
      const lab = row.querySelector(':scope > label'); if (!lab) return; const name = labelOf(row);
      const inp = row.querySelector('[data-k], [data-segk]'); const k = inp && (inp.dataset.k || inp.dataset.segk);
      if (k && isOverride(k) && !lab.querySelector('.ovr')) {
        lab.insertAdjacentHTML('afterbegin', `<button class="ovr" title="Eigen instelling – tik om terug te zetten naar de standaard" aria-label="Terugzetten naar standaard"></button>`);
        row.querySelectorAll('[data-clear]').forEach(b => b.remove());
        lab.querySelector('.ovr').onclick = ev => { ev.preventDefault(); ev.stopPropagation(); E.breakMerge(); const d = defaultAt(k); apply(k, d.has ? d.v : undefined, inp.dataset.fx === 'tilepanel' ? 'tile' : inp.dataset.fx || 'none', false, inp); E.refreshPanel(); };
      }
      if (HELP[name] && !lab.querySelector('.info')) {
        const sm = lab.querySelector(':scope > small'); const html = `<button class="info" title="Uitleg">i</button>`;
        if (sm) sm.insertAdjacentHTML('beforebegin', html); else lab.insertAdjacentHTML('beforeend', html);
        lab.querySelector('.info').onclick = ev => { ev.preventDefault(); ev.stopPropagation(); const nx = row.nextElementSibling; if (nx && nx.classList.contains('helptext')) { nx.remove(); return; } row.insertAdjacentHTML('afterend', `<p class="helptext">${esc(HELP[name])}</p>`); };
      }
    });
  };

  // ---------- bereik: alleen deze tegel, of alle knoppen/tegels van dit soort ----------
  // Welke instellingen mee mogen naar andere tegels (alleen uiterlijk, nooit inhoud of koppeling)
  const SCOPE_OPTS = ['colorOn', 'colorOff', 'label', 'state', 'icStyle', 'icColor2', 'keepColor', 'brand'];
  const scopable = rel => rel.startsWith('style.') || (rel.startsWith('opts.') && SCOPE_OPTS.includes(rel.slice(5)));
  E.scopeTargets = () => {
    const f = E.sel && D.findTile(E.sel); if (!f || !E.fxScope || E.fxScope === 'tile') return [];
    const same = x => x.id !== f.tile.id && x.type === f.tile.type;
    return (E.fxScope === 'all' ? D.cfg.tabs : [f.tab]).flatMap(tab => tab.tiles.filter(same));
  };
  E.setScoped = (k, v) => {
    const cl = x => x === undefined ? undefined : D.clone(x);
    const P = E.sel && selPath(); const f = E.sel && D.findTile(E.sel);
    if (P && f && k.startsWith(P + '.')) {
      const rel = k.slice(P.length + 1);
      if (E._chg) E._chg.push(E.snapTile(f.tile, rel));
      setPath(D.cfg, k, v);
      if (scopable(rel)) for (const x of E.scopeTargets()) { if (E._chg) E._chg.push(E.snapTile(x, rel)); setPath(x, rel, cl(v)); }
      return;
    }
    if (E._chg) E._chg.push(E.snapPath(k));
    setPath(D.cfg, k, v);
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

  // ---------- adressen: standaardbegin en snelknoppen ----------
  const URL_DEFAULTS = () => ({ prefix: 'http://192.168.178.79:', quick: [['NAS', 'http://192.168.178.79:'], ['Spotify', 'http://192.168.178.79:8090/'], ['Homey', 'http://192.168.178.13/'], ['GitHub', 'https://harrynaccy.github.io/']] });
  E.urls = () => {
    const s = D.cfg.settings;
    if (!s.urls || typeof s.urls !== 'object') s.urls = URL_DEFAULTS();
    if (!Array.isArray(s.urls.quick)) s.urls.quick = URL_DEFAULTS().quick;
    if (typeof s.urls.prefix !== 'string') s.urls.prefix = URL_DEFAULTS().prefix;
    return s.urls;
  };

  // ---------- pictogrammen (grote bibliotheek op de server) ----------
  E._iconCache = new Map();
  E.getIcon = async (name, set = 'mdi') => {
    if (!name) return null; const key = set + ':' + name;
    if (E._iconCache.has(key)) return E._iconCache.get(key);
    const ic = await D.api('GET', `/api/icons/${encodeURIComponent(set)}/${encodeURIComponent(name)}`).catch(() => null);
    if (ic && (ic.p || ic.u)) { E._iconCache.set(key, ic); if (set === 'mdi') E._iconCache.set(name, ic); return ic; }
    return null;
  };
  // tegenhanger voor aan/uit (alleen eenkleurig en Hue)
  E.pairFor = async ic => {
    if (!ic || !ic.n || !['mdi', 'hue'].includes(ic.s || 'mdi')) return null;
    const r = await D.api('GET', `/api/icons/pair/${ic.s || 'mdi'}/${encodeURIComponent(ic.n)}`).catch(() => null);
    return r && r.other ? r : null;
  };
  const niceName = n => String(n || '').replace(/-/g, ' ');
  const icName = ic => ic ? (ic.s === 'paar' ? niceName(ic.on.n) + ' / ' + niceName(ic.off.n) : ic.t || niceName(ic.n)) : '';
  // Zoekveld + sets + categorieën + raster; onPick(icoon of paar) bij tikken
  E.iconBrowser = (root, onPick) => {
    const st = E._icb || (E._icb = { q: '', cat: '', set: 'mdi' }); st.set = st.set || 'mdi';
    root.innerHTML = `<div class="icb-top"><input type="search" class="icb-q" placeholder="Zoek: lamp, raam, spotify, hue go, hond…" value="${esc(st.q)}"><div class="seg icb-sets"></div><div class="chips-row icb-cats"></div></div>
      <div class="note icb-info"></div><div class="icb-grid"></div><div class="acts"><button class="btn sm icb-more" hidden>Meer laden</button></div>`;
    const q = root.querySelector('.icb-q'), grid = root.querySelector('.icb-grid'), more = root.querySelector('.icb-more'), info = root.querySelector('.icb-info'), cats = root.querySelector('.icb-cats'), sets = root.querySelector('.icb-sets');
    let offset = 0, token = 0, items = [], meta = { sets: E._iconSets || [['mdi', 'Eenkleurig'], ['flat', 'Gekleurd plat'], ['3d', 'Gekleurd 3D'], ['merk', 'Merken'], ['hue', 'Hue'], ['paar', 'Aan/uit-paren']], cats: [], counts: null };
    const drawSets = () => {
      sets.innerHTML = meta.sets.map(([k, l]) => `<button data-set="${k}" class="${k === st.set ? 'act' : ''}">${esc(l)}${meta.counts ? ` <i>${meta.counts[k]}</i>` : ''}</button>`).join('');
      sets.querySelectorAll('[data-set]').forEach(b => b.onclick = () => { st.set = b.dataset.set; st.cat = ''; drawSets(); load(false); });
    };
    const drawCats = () => {
      cats.innerHTML = [['', 'Alle'], ...(meta.cats || [])].filter((c, i, a) => a.findIndex(x => x[1] === c[1]) === i).map(([k, l]) => `<button data-c="${esc(k)}" class="${k === st.cat ? 'act' : ''}">${esc(l)}</button>`).join('');
      cats.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.cat = b.dataset.c; drawCats(); load(false); });
    };
    const cell = (i, n) => i.s === 'paar'
      ? `<button class="icb-it pair" data-i="${n}" title="${esc(icName(i))}">${anyIcon(i.on)}<em></em>${anyIcon(i.off)}</button>`
      : `<button class="icb-it${i.s === 'merk' ? ' merk' : ''}" data-i="${n}" title="${esc(icName(i))}">${anyIcon(i)}</button>`;
    const load = async append => {
      const my = ++token;
      if (!append) { offset = 0; items = []; grid.innerHTML = '<div class="muted pad">Laden…</div>'; }
      const r = await D.api('GET', `/api/icons?set=${encodeURIComponent(st.set)}&q=${encodeURIComponent(st.q)}&cat=${encodeURIComponent(st.cat)}&offset=${offset}&limit=160`).catch(e => ({ error: e.message, items: [], total: 0 }));
      if (my !== token || !root.isConnected) return;
      if (r.sets) { meta.sets = E._iconSets = r.sets; }
      meta.cats = r.cats || []; meta.counts = r.counts; drawSets(); drawCats();
      if (!append) grid.innerHTML = '';
      grid.classList.toggle('pairs', st.set === 'paar'); grid.classList.toggle('colored', st.set === 'flat' || st.set === '3d');
      grid.insertAdjacentHTML('beforeend', r.items.map((i, k) => cell(i, items.length + k)).join(''));
      items.push(...r.items); r.items.forEach(i => { if (i.s === 'mdi') E._iconCache.set(i.n, i); });
      offset += r.items.length;
      info.textContent = r.error ? 'Laden mislukt: ' + r.error : r.total ? `${r.total} ${st.set === 'paar' ? 'paren' : 'pictogrammen'}${st.q ? ` voor "${st.q}"` : ''}${st.set === 'merk' ? ' · in de echte merkkleur' : st.set === 'paar' ? ' · links = aan, rechts = uit' : ''}` : 'Niets gevonden in deze set. Kijk bij de andere tabbladen (het getal = aantal gevonden).';
      more.hidden = offset >= r.total;
    };
    drawSets(); drawCats();
    let qt; q.oninput = () => { st.q = q.value; clearTimeout(qt); qt = setTimeout(() => load(false), 250); };
    more.onclick = () => load(true);
    grid.onclick = e => { const b = e.target.closest('[data-i]'); if (b) onPick(items[Number(b.dataset.i)]); };
    load(false);
  };
  // pictogram (of paar) toepassen op een tegel; bij één pictogram wordt de uit-versie automatisch gezocht
  E.applyIcon = async (t, ic, which = 'on') => {
    if (!ic) return;
    if (ic.s === 'paar') { E.commit(null, () => { t.opts.mdi = ic.on; t.opts.mdiOff = ic.off; delete t.opts.mdiAuto; delete t.opts.mdiOffAuto; }, () => { D.renderGrid(); E.refreshPanel(); D.toast('Pictogram voor aan en uit ingesteld'); }); return; }
    if (which === 'off') { E.commit(null, () => { t.opts.mdiOff = ic; delete t.opts.mdiOffAuto; }, () => { D.renderGrid(); E.refreshPanel(); }); return; }
    const pr = (!t.opts.mdiOff || t.opts.mdiOffAuto) ? await E.pairFor(ic) : null;
    E.commit(null, () => {
      t.opts.mdi = ic; delete t.opts.mdiAuto;
      if (pr && pr.role === 'on') { t.opts.mdiOff = pr.other; t.opts.mdiOffAuto = true; }
      else if (pr && pr.role === 'off') { t.opts.mdi = pr.other; t.opts.mdiOff = ic; t.opts.mdiOffAuto = true; }
      else if (t.opts.mdiOffAuto) { delete t.opts.mdiOff; delete t.opts.mdiOffAuto; }
    }, () => { D.renderGrid(); E.refreshPanel(); if (pr) D.toast(`Uit-pictogram automatisch gekozen: ${niceName((pr.role === 'on' ? pr.other : ic).n)}`); });
  };
  // Venster: pictogram kiezen
  E.pickIcon = () => new Promise(resolve => {
    let done = false; const finish = v => { if (done) return; done = true; D._sheetCancel = null; D.closeSheet(); resolve(v); };
    D.openSheet(`<div class="sheet-hd"><div><h2>Pictogram kiezen</h2><div class="sub">Tik op een pictogram</div></div><button class="xbtn" data-close>${icon('x')}</button></div><div id="icb-sheet"></div>`, 'wide');
    D._sheetCancel = () => { if (!done) { done = true; resolve(null); } };
    $('#sheet [data-close]').onclick = () => finish(null);
    E.iconBrowser($('#icb-sheet'), ic => finish(ic));
  });

  // ---------- venster: koppelen aan apparaat, flow of mood ----------
  E.targetOpts = kind => {
    const onoff = d => Object.values(d.caps).some(c => c.setable && c.type === 'boolean');
    return {
      '3d': { targets: ['device', 'flow', 'mood'], allowNone: true },
      glow: { targets: ['device', 'flow', 'mood'], allowNone: true },
      ring: { targets: ['device', 'flow', 'mood'], allowNone: true },
      icon: { targets: ['device', 'flow', 'mood'], allowNone: true, sub: 'Het pictogram kleurt mee met de toestand' },
      rocker: { targets: ['device'], filter: onoff, allowNone: true },
      rockerled: { targets: ['device'], filter: onoff, allowNone: true },
      toggle: { targets: ['device'], filter: onoff, allowNone: true },
      dim: { targets: ['device'], filter: d => !!d.caps.dim, sub: 'Alleen dimbare apparaten' },
      scene: { targets: ['flow', 'mood', 'device'], allowNone: true },
      panic: { targets: ['flow', 'device', 'mood'], allowNone: true },
      cover: { targets: ['device'], filter: d => !!(d.caps.windowcoverings_set || d.caps.windowcoverings_state), sub: 'Alleen rolluiken, gordijnen en zonwering' },
    }[kind] || { targets: ['device', 'flow', 'mood'], allowNone: true };
  };
  E.pickTarget = (opt = {}) => new Promise(resolve => {
    const targets = opt.targets || ['device']; let cur = targets[0]; let q = '';
    let done = false; const finish = v => { if (done) return; done = true; D._sheetCancel = null; D.closeSheet(); resolve(v); };
    const TL = { device: 'Apparaten', flow: 'Flows', mood: 'Moods' };
    D.openSheet(`<div class="sheet-hd"><div><h2>${esc(opt.title || 'Koppelen aan')}</h2><div class="sub">${esc(opt.sub || 'Kies wat deze knop bedient of laat zien')}</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
      ${targets.length > 1 ? `<div class="seg pick-seg">${targets.map(k => `<button data-tt="${k}" class="${k === cur ? 'act' : ''}">${TL[k]}</button>`).join('')}</div>` : ''}
      <input type="search" class="pick-q" placeholder="Zoeken…">
      ${opt.allowNone ? `<button class="pick-it none" data-none><span class="lib-ic">${icon('x')}</span><span class="lib-t"><b>Nog niet koppelen</b><small>Kan later bij Tegel → Gekoppeld aan</small></span></button>` : ''}
      <div class="pick-list"></div>`, 'wide');
    D._sheetCancel = () => { if (!done) { done = true; resolve(null); } };
    const box = $('#sheet'); const list = box.querySelector('.pick-list');
    const row = (attrs, ic, name, sub, on) => `<button class="pick-it" ${attrs}><span class="lib-ic${on ? ' on' : ''}">${anyIcon(ic)}</span><span class="lib-t"><b>${esc(name)}</b><small>${esc(sub || '')}</small></span></button>`;
    const draw = () => {
      const L = D.lib; const m = s => !q || String(s).toLowerCase().includes(q.toLowerCase()); let h = '';
      if (cur === 'device') {
        for (const z of [...L.zones].sort((a, b) => a.name.localeCompare(b.name))) {
          const ds = L.devices.filter(d => d.zone === z.id && (!opt.filter || opt.filter(d)) && (m(d.name) || m(z.name))).sort((a, b) => a.name.localeCompare(b.name));
          if (ds.length) h += `<div class="lib-zone">${esc(z.name)}</div>` + ds.map(d => { const cap = D.btnCap(d); const on = d.caps.onoff && d.caps.onoff.value; return row(`data-dev="${esc(d.id)}"`, D.devIcon(d), d.name, cap ? D.fmt(d.caps[cap], cap) : '', on); }).join('');
        }
      } else if (cur === 'flow') h = [...L.flows, ...L.advancedFlows].filter(f => m(f.name)).sort((a, b) => a.name.localeCompare(b.name)).map(f => row(`data-flow="${esc(f.id)}" data-ft="${esc(f.type || 'flow')}"`, 'play', f.name, f.type === 'advancedflow' ? 'Advanced flow' : 'Flow')).join('');
      else h = L.moods.filter(x => m(x.name)).map(x => row(`data-mood="${esc(x.id)}"`, 'sparkles', x.name, D.zoneName(x.zone))).join('');
      list.innerHTML = h || '<div class="muted pad">Niets gevonden</div>';
    };
    box.onclick = e => {
      if (e.target.closest('[data-close]')) return finish(null);
      const tt = e.target.closest('[data-tt]'); if (tt) { cur = tt.dataset.tt; box.querySelectorAll('[data-tt]').forEach(b => b.classList.toggle('act', b === tt)); draw(); return; }
      if (e.target.closest('[data-none]')) return finish({ target: 'none' });
      const it = e.target.closest('.pick-it'); if (!it) return;
      if (it.dataset.dev) finish({ target: 'device', deviceId: it.dataset.dev });
      else if (it.dataset.flow) finish({ target: 'flow', id: it.dataset.flow, flowType: it.dataset.ft });
      else if (it.dataset.mood) finish({ target: 'mood', id: it.dataset.mood });
    };
    box.querySelector('.pick-q').oninput = e => { q = e.target.value; draw(); };
    draw();
  });

  // ---------- knop of pictogram-tegel toevoegen ----------
  E.addButton = async (kind, ref, mdi, mdiOff) => {
    const tab = D.currentTab(); let auto = false;
    if (mdi && mdi.s === 'paar') { mdiOff = mdi.off; mdi = mdi.on; }
    if (!mdi) { mdi = await E.getIcon(D.defaultMdiName(kind, ref)); auto = true; }
    if (mdi && !mdiOff && !auto) { const pr = await E.pairFor(mdi); if (pr && pr.role === 'on') mdiOff = pr.other; else if (pr && pr.role === 'off') { mdiOff = mdi; mdi = pr.other; } }
    const [w, h] = { cover: [2, 3], dim: [3, 2], toggle: [3, 2] }[kind] || [2, 2];
    const spot = E.firstFree(tab, w, h);
    if (!spot) { D.toast('Geen ruimte meer op dit tabblad. Maak ruimte of vergroot het raster.', true); return; }
    const opts = { kind }; if (mdi) opts.mdi = mdi; if (auto) opts.mdiAuto = true; if (mdiOff) { opts.mdiOff = mdiOff; opts.mdiOffAuto = true; }
    const nt = { id: D.uid('w'), type: 'button', ref, opts, style: kind === 'icon' ? { frameless: true } : {}, ...spot };
    E.commit(null, () => tab.tiles.push(nt), () => { E.sel = nt.id; D.renderGrid(); const el = D.tileEls.get(nt.id); if (el) el.classList.add('flash-ok'); E.refreshPanel(); D.toast(`${D.titleOf(nt)} toegevoegd. Tik erop om kleuren en pictogram aan te passen.`); });
  };

  // Knoppen
  E.render.knoppen = () => `<p class="note">Kies een knopstijl en tik op <b>+</b>. Daarna kies je welk apparaat, welke flow of welke mood de knop bedient. De knop komt op <b>${esc(D.currentTab().name)}</b>.</p>
    <div class="kb-list">${D.BUTTON_KINDS.map(([k, n, sub]) => `<div class="kb-kind"><div class="kb-prevs"><div class="tile kb-prevtile" data-prev="${k}" data-on="0"><div class="inner"></div></div><div class="tile kb-prevtile" data-prev="${k}" data-on="1"><div class="inner"></div></div></div>
      <span class="lib-t"><b>${esc(n)}</b><small>${esc(sub)}</small></span><button class="lib-add" data-addkind="${k}" title="Toevoegen">${icon('plus')}</button></div>`).join('')}</div>
    <p class="note">Links zie je de knop als hij uit staat, rechts als hij aan staat. Kleuren, pictogram en tekst pas je daarna aan bij <b>Tegel</b>.</p>`;
  E.wire.knoppen = async root => {
    const draw = () => root.querySelectorAll('[data-prev]').forEach(el => {
      const k = el.dataset.prev; const mdi = E._iconCache.get((D.BUTTON_KINDS.find(x => x[0] === k) || [])[3]);
      const t = { id: 'prev-' + k, type: 'button', ref: { target: 'none' }, opts: { kind: k, mdi, label: false, state: false, _preview: el.dataset.on === '1' }, style: {} };
      try { D.tiles.button.render(t, el.querySelector('.inner'), el); } catch (e) { /* */ }
    });
    draw();
    root.querySelectorAll('[data-addkind]').forEach(b => b.onclick = async () => {
      const kind = b.dataset.addkind; const ref = await E.pickTarget(E.targetOpts(kind)); if (!ref) return;
      E.addButton(kind, ref);
    });
    const missing = [...new Set(D.BUTTON_KINDS.map(k => k[3]))].filter(n => !E._iconCache.has(n));
    if (missing.length) { await Promise.all(missing.map(n => E.getIcon(n))); if (root.isConnected) draw(); }
  };

  // Pictogrammen
  E.render.pictogrammen = () => `<p class="note">Tik op een pictogram om het op <b>${esc(D.currentTab().name)}</b> te zetten, gekoppeld aan een apparaat, of om het te gebruiken voor de geselecteerde tegel. Zoeken kan in het Nederlands en Engels.</p><div id="icb"></div>`;
  E.wire.pictogrammen = root => E.iconBrowser(root.querySelector('#icb'), ic => E.useIcon(ic));
  E.useIcon = ic => {
    if (!ic) return;
    const f = E.sel && D.findTile(E.sel); const canSel = f && ['device', 'button', 'flow', 'mood'].includes(f.tile.type);
    const prev = ic.s === 'paar' ? anyIcon(ic.on) + anyIcon(ic.off) : anyIcon(ic);
    D.openSheet(`<div class="sheet-hd"><span class="badge big${ic.s === 'paar' ? ' pair' : ''}">${prev}</span><div><h2>${esc(icName(ic))}</h2><div class="sub">Wat wil je met ${ic.s === 'paar' ? 'dit paar (aan / uit)' : 'dit pictogram'}?</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
      <div class="choice">
        <button data-a="device"><span class="lib-ic">${icon('bulb')}</span><span class="lib-t"><b>Op het dashboard, gekoppeld</b><small>Kleurt mee: lamp aan = verlicht, raam open = oranje. Tik = aan/uit.</small></span></button>
        <button data-a="kind"><span class="lib-ic">${icon('knob')}</span><span class="lib-t"><b>Als knop</b><small>Kies een knopstijl (3D, verlicht, wandschakelaar…) met dit pictogram</small></span></button>
        <button data-a="plain"><span class="lib-ic">${icon('shapes')}</span><span class="lib-t"><b>Alleen het pictogram</b><small>Als versiering of label, zonder koppeling</small></span></button>
        ${canSel ? `<button data-a="sel"><span class="lib-ic">${icon('sliders')}</span><span class="lib-t"><b>Voor de geselecteerde tegel</b><small>${esc(D.titleOf(f.tile))}</small></span></button>` : ''}
      </div>`);
    $('#sheet').onclick = async e => {
      if (e.target.closest('[data-close]')) return D.closeSheet();
      const a = e.target.closest('[data-a]'); if (!a) return; const act = a.dataset.a;
      if (act === 'sel') { D.closeSheet(); f.tile.opts = f.tile.opts || {}; E.applyIcon(f.tile, ic); return; }
      if (act === 'plain') { D.closeSheet(); E.addButton('icon', { target: 'none' }, ic); return; }
      if (act === 'device') { const ref = await E.pickTarget(E.targetOpts('icon')); if (ref) E.addButton('icon', ref, ic); return; }
      if (act === 'kind') {
        $('#sheet').innerHTML = `<div class="sheet-hd"><span class="badge big${ic.s === 'paar' ? ' pair' : ''}">${prev}</span><div><h2>Knopstijl kiezen</h2><div class="sub">Met ${esc(icName(ic))}</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
          <div class="choice">${D.BUTTON_KINDS.filter(k => k[0] !== 'icon').map(([k, n, sub]) => `<button data-k2="${k}"><span class="lib-t"><b>${esc(n)}</b><small>${esc(sub)}</small></span></button>`).join('')}</div>`;
        $('#sheet').onclick = async e2 => {
          if (e2.target.closest('[data-close]')) return D.closeSheet();
          const b = e2.target.closest('[data-k2]'); if (!b) return;
          const ref = await E.pickTarget(E.targetOpts(b.dataset.k2)); if (ref) E.addButton(b.dataset.k2, ref, ic);
        };
      }
    };
  };

  // ---------- stijl: kleuren, vorm en rand, schaduw en gloed, tekst, bediening ----------
  // base = pad waar de waarden staan (tegel: tabs.x.tiles.y.style, standaard: settings.theme.fx)
  const FX_PRESETS = {
    zacht: ['Zacht zwevend', { shT: 'tile', shA: 0.35, shS: 40, shD: 'down', glW: 'never' }],
    neon: ['Neon', { glW: 'on', glT: 'face', glA: 0.95, glS: 30, shA: 0, bdW: 2, bdOn: true }],
    warm: ['Warm lampje', { glW: 'on', glT: 'tile', glC: '#ffb347', glA: 0.6, glS: 34 }],
    diep: ['Diepe schaduw', { shT: 'tile', shA: 0.8, shS: 50, shD: 'diag' }],
    alarm: ['Knipperen bij alarm', { glW: 'alarm', glT: 'tile', glC: '#ff5d4d', glA: 0.9, glS: 30 }],
    geen: ['Geen effecten', { shA: 0, glW: 'never' }],
  };
  E.fxControls = (base, raw, v, t) => {
    raw = raw || {}; const th = D.cfg.settings.theme; const fx = t ? 'tile' : 'theme'; const k = n => `${base}.${n}`;
    const kind = t && t.type === 'button' ? (t.opts.kind || 'glow') : null;
    const hasFace = !t || t.type === 'button' || ['device', 'flow', 'mood', 'zone'].includes(t.type);
    const pressy = !t || ['3d', 'panic', 'rocker', 'rockerled'].includes(kind);
    const bordery = !t || ['glow', 'ring', 'scene'].includes(kind);
    const reset = () => ''; // terugzetten gaat via het blauwe bolletje
    const auto = (n, label, dflt, min, max, step, fmt, hint) => F.row(label, F.range(k(n), v[n] ?? dflt, min, max, step, fx, fmt) + reset(n), (v[n] === null || v[n] === undefined ? 'Nu: automatisch. ' : '') + hint);
    const colors = t ? F.row('Achtergrond', F.colorOpt(k('bg'), raw.bg, th.tileBg, 'tilepanel')) + F.row('Doorzichtigheid', F.range(k('opacity'), raw.opacity ?? th.tileOpacity, 0, 1, 0.01, 'tile', '%')) +
      F.row('Tekstkleur', F.colorOpt(k('text'), raw.text, th.text, 'tilepanel')) + F.row('Accent / aan-kleur', F.colorOpt(k('accent'), raw.accent, th.onColor, 'tilepanel')) : '';
    const shape = (t ? F.row('Hoeken tegel', F.range(k('radius'), raw.radius ?? th.radius, 0, 48, 1, 'tile', 'px')) : '') +
      (hasFace ? auto('fr', 'Knopvorm / hoeken', 24, 0, 50, 1, 'p', '0% = vierkant, 50% = rond') : '') +
      auto('pad', 'Binnenmarge', 14, 0, 60, 1, 'px', 'Ruimte tussen inhoud en rand') +
      F.row('Randdikte', F.range(k('bdW'), v.bdW, 0, 12, 1, fx, 'px') + reset('bdW')) + F.row('Randkleur', F.color(k('bdC'), v.bdC, fx) + reset('bdC')) +
      F.row('Rand doorzichtigheid', F.range(k('bdA'), v.bdA, 0, 1, 0.01, fx, '%') + reset('bdA')) + F.row('Rand kleurt mee als aan', F.toggle(k('bdOn'), v.bdOn, fx), 'In de aan-kleur zodra het apparaat aan staat') +
      (bordery ? auto('fbw', 'Knoprand dikte', 3, 0, 12, 1, 'px', 'Rand van de knop zelf, bij de ring de dikte van de ring') : '') +
      (t ? F.row('Zonder kader', F.toggle(k('frameless'), raw.frameless, 'tile')) : '');
    const fxb = `<div class="fxpresets">${Object.entries(FX_PRESETS).map(([id, [n]]) => `<button data-fxpreset="${id}" data-base="${base}" data-fx="${fx}">${esc(n)}</button>`).join('')}</div>` +
      F.row('Schaduw op', F.seg(k('shT'), v.shT, [['tile', 'Tegel'], ['face', 'Knop'], ['text', 'Tekst']], fx)) +
      F.row('Schaduw sterkte', F.range(k('shA'), v.shA, 0, 1, 0.01, fx, '%') + reset('shA')) + F.row('Schaduw grootte', F.range(k('shS'), v.shS, 0, 60, 1, fx, 'px') + reset('shS')) +
      F.row('Richting', F.seg(k('shD'), v.shD, [['down', 'Onder'], ['diag', 'Schuin'], ['around', 'Rondom']], fx)) + F.row('Schaduwkleur', F.color(k('shC'), v.shC, fx) + reset('shC')) +
      F.row('Gloed', F.seg(k('glW'), v.glW, [['never', 'Nooit'], ['on', 'Als aan'], ['always', 'Altijd'], ['alarm', 'Bij alarm']], fx), 'Bij alarm = knipperen, bijv. raam open of beweging') +
      (v.glW !== 'never' ? F.row('Gloed op', F.seg(k('glT'), v.glT, [['tile', 'Tegel'], ['face', 'Knop'], ['text', 'Tekst']], fx)) +
        F.row('Gloedkleur', F.colorOpt(k('glC'), v.glC, th.onColor, t ? 'tilepanel' : 'theme'), 'Standaard: de aan-kleur') +
        F.row('Gloed sterkte', F.range(k('glA'), v.glA, 0, 1, 0.01, fx, '%') + reset('glA')) + F.row('Gloed grootte', F.range(k('glS'), v.glS, 0, 60, 1, fx, 'px') + reset('glS')) : '');
    const text = (t ? F.row('Tekstgrootte', F.range(k('fontScale'), raw.fontScale || 1, 0.5, 2.5, 0.05, 'tile', 'x')) : '') +
      F.row('Naam doorzichtigheid', F.range(k('txN'), v.txN, 0, 1, 0.01, fx, '%') + reset('txN')) + F.row('Toestand doorzichtigheid', F.range(k('txS'), v.txS, 0, 1, 0.01, fx, '%') + reset('txS'), 'Bijv. "Aan · 70%", waarden en datum') +
      (t ? F.row('Titel verbergen', F.toggle(k('hideTitle'), raw.hideTitle, 'tile')) : '');
    const ctrl = (pressy ? F.row('Indrukdiepte', F.range(k('depth'), v.depth, 0, 3, 0.1, fx, 'x') + reset('depth'), '0 = plat, 1 = normaal, 3 = diep') : '') +
      F.row('Tikeffect', F.range(k('tap'), v.tap, 0, 3, 0.1, fx, 'x') + reset('tap'), 'Hoeveel de tegel krimpt als je erop tikt') +
      F.row('Klikgeluid', F.select(k('snd'), v.snd, D.SOUNDS, fx).replace('<select', '<select data-refresh') + `<button class="ib sm" data-sndtest title="Proberen">${icon('play')}</button>`) +
      (v.snd !== 'none' ? F.row('Volume', F.range(k('vol'), v.vol, 0, 1, 0.01, fx, '%') + reset('vol')) : '') +
      (t ? F.row('Eerst bevestigen', F.toggle(k('confirm'), raw.confirm, 'tile'), 'Vraagt "Weet je het zeker?"') : '');
    return (colors ? F.fold('Kleuren', colors, 'kleuren') : '') + F.fold('Vorm en rand', shape, 'vorm') + F.fold('Schaduw en gloed', fxb, 'schaduw') + F.fold('Tekst', text, 'tekst') + F.fold('Bediening: diepte en geluid', ctrl, 'bediening');
  };
  // gedeelde knoppen in de stijl-groepjes (tegel en standaard)
  E.wireFx = (root, getV) => {
    root.querySelectorAll('[data-fxpreset]').forEach(b => b.onclick = () => {
      const [, vals] = FX_PRESETS[b.dataset.fxpreset]; const base = b.dataset.base;
      const snaps = base.endsWith('.style') ? [E.snapPath(base), ...E.scopeTargets().map(x => E.snapTile(x, 'style'))] : [E.snapPath(base)];
      E.logAction('Kant-en-klaar: ' + FX_PRESETS[b.dataset.fxpreset][0], snaps, base.endsWith('.style') ? (E.sel && D.findTile(E.sel) ? D.titleOf(D.findTile(E.sel).tile) : '') : 'standaard voor alle tegels');
      E.commit(null, () => {
        const put = o => { Object.assign(o, D.clone(vals)); if (vals.glC === undefined) delete o.glC; return o; };
        setPath(D.cfg, base, put(getPath(D.cfg, base) || {}));
        if (base.endsWith('.style')) for (const x of E.scopeTargets()) x.style = put(x.style || {});
      }, () => { (FX[b.dataset.fx] || FX.none)(); E.refreshPanel(); D.toast(FX_PRESETS[b.dataset.fxpreset][0] + ' toegepast'); });
    });
    const st = root.querySelector('[data-sndtest]'); if (st) st.onclick = () => { const v = getV(); D.sound(v.snd === 'none' ? 'klik' : v.snd, v.vol); };
  };

  // Keuze bovenaan Stijl: voor wie geldt een wijziging?
  E.scopeBar = (f, t) => {
    const btn = t.type === 'button'; const scope = E.fxScope || 'tile';
    const nTab = f.tab.tiles.filter(x => x.id !== t.id && x.type === t.type).length;
    const nAll = D.cfg.tabs.reduce((n, tab) => n + tab.tiles.filter(x => x.id !== t.id && x.type === t.type).length, 0);
    const what = btn ? 'knoppen' : 'tegels van dit soort';
    const opts = [['tile', btn ? 'Alleen deze knop' : 'Alleen deze tegel'], ['tab', `Alle ${btn ? 'knoppen' : 'van dit soort'} op dit tabblad (${nTab + 1})`], ['all', `Overal (${nAll + 1})`]];
    return `<div class="scopebar${scope !== 'tile' ? ' wide' : ''}"><b>Wijziging geldt voor</b><div class="seg">${opts.map(([v, l]) => `<button data-fxscope data-v="${v}" class="${v === scope ? 'act' : ''}">${esc(l)}</button>`).join('')}</div>` +
      (scope !== 'tile' ? `<p>Let op: wat je nu verandert aan kleuren, vorm, rand, schaduw, gloed, tekst, diepte of geluid, gaat ook naar ${scope === 'tab' ? nTab : nAll} andere ${what}. Alleen die ene instelling verandert, de rest van die ${what} blijft zoals het is. Kies je een andere tegel, dan staat dit weer op "alleen deze".</p>` : `<p>Een <i class="ovr"></i> bolletje = eigen instelling van deze ${btn ? 'knop' : 'tegel'} (wijkt af van de standaard onder Uiterlijk).</p>`) + '</div>';
  };

  // Pictogram-regels bij een tegel: aan, uit, merkkleur, kleur bij uit, kleurstijl
  E.iconRows = (t, dflt) => {
    const o = t.opts, P = selPath(), on = o.mdi || dflt; const kindOf = x => x && typeof x === 'object' ? (x.u ? 'img' : x.c ? 'merk' : 'mono') : 'mono';
    let h = F.row('Pictogram (aan)', F.icon(on, !!o.mdi && !o.mdiAuto, 'on'), 'Tip: kies een paar bij "Aan/uit-paren"');
    h += F.row('Pictogram (uit)', F.icon(o.mdiOff || on, !!o.mdiOff, 'off'), o.mdiOff ? (o.mdiOffAuto ? 'Automatisch gekozen' : 'Eigen keuze') : 'Nu: zelfde als aan');
    const k = kindOf(o.mdiOff && !o.mdi ? o.mdiOff : on), k2 = kindOf(o.mdiOff);
    if (k === 'merk' || k2 === 'merk') h += F.row('Merkkleur', F.toggle(`${P}.opts.brand`, o.brand !== false, 'tilepanel'), 'Logo in de echte kleur van het merk');
    if (t.type === 'button' && (k === 'img' || k === 'merk' || k2 === 'img')) h += F.row('Kleur behouden bij uit', F.toggle(`${P}.opts.keepColor`, !!o.keepColor, 'tile'), 'Uit = anders grijs');
    if (t.type === 'button' && k === 'mono') {
      h += F.row('Kleurstijl', F.select(`${P}.opts.icStyle`, o.icStyle || 'mono', [['mono', 'Eén kleur'], ['verloop', 'Kleurverloop'], ['cirkel', 'Met gekleurde cirkel'], ['duo', 'Tweekleurig']], 'tilepanel'));
      if (o.icStyle && o.icStyle !== 'mono') h += F.row({ verloop: 'Tweede kleur (verloop)', cirkel: 'Kleur pictogram', duo: 'Kleur cirkel' }[o.icStyle] || 'Tweede kleur', F.colorOpt(`${P}.opts.icColor2`, o.icColor2, o.icStyle === 'duo' ? D.cfg.settings.theme.onColor : '#ffffff', 'tilepanel'));
    }
    return h;
  };

  // Keuzelijst knopstijl: bij een apparaat ook "Gewone tegel"
  E.kindSelect = (t, d) => {
    const cur = t.type === 'button' ? (t.opts.kind || 'glow') : '_tile';
    const kinds = D.BUTTON_KINDS.filter(([k]) => { if (!d) return true; const o = E.targetOpts(k); return (!o.filter || o.filter(d)) && o.targets.includes('device'); });
    const opts = [...(d ? [['_tile', 'Gewone tegel']] : []), ...kinds.map(k => [k[0], k[1]])];
    if (!opts.some(o => o[0] === cur)) opts.push([cur, (D.BUTTON_KINDS.find(k => k[0] === cur) || [cur, cur])[1]]);
    return `<select data-kindsel>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  };
  E.setKind = async (t, kind) => {
    if (kind === '_tile') {
      if (t.type !== 'button' || !t.ref || t.ref.target !== 'device') return;
      const prev = t.opts._prev || {}; const custom = t.opts.mdi && !t.opts.mdiAuto ? t.opts.mdi : prev.mdi;
      E.commit(null, () => { t.type = 'device'; t.ref = { deviceId: t.ref.deviceId }; t.opts = { ...prev, title: t.opts.title }; if (custom) t.opts.mdi = custom; else delete t.opts.mdi; if (!t.opts.title) delete t.opts.title; }, () => { D.renderGrid(); E.refreshPanel(); });
      return;
    }
    if (t.type === 'device') {
      const ref = { target: 'device', deviceId: t.ref.deviceId }; const custom = t.opts.mdi;
      const ic = custom || await E.getIcon(D.defaultMdiName(kind, ref));
      const { title, ...prev } = t.opts;
      E.commit(null, () => { t.type = 'button'; t.ref = ref; t.opts = { kind, _prev: prev }; if (title) t.opts.title = title; if (ic) t.opts.mdi = ic; if (!custom && ic) t.opts.mdiAuto = true; if (prev.mdiOff) t.opts.mdiOff = prev.mdiOff; if (prev.brand === false) t.opts.brand = false; }, () => { D.renderGrid(); E.refreshPanel(); });
      return;
    }
    const ic = t.opts.mdiAuto || !t.opts.mdi ? await E.getIcon(D.defaultMdiName(kind, t.ref)) : null;
    E.commit(null, () => { t.opts.kind = kind; if (ic) { t.opts.mdi = ic; t.opts.mdiAuto = true; } }, () => { D.renderGrid(); E.refreshPanel(); });
  };

  // Tegel
  E.render.tegel = () => {
    const f = E.sel && D.findTile(E.sel);
    if (!f) return `<div class="empty-note">${icon('sliders')}<p>Tik op een tegel om die te bewerken.</p><p class="muted">Sleep een tegel om hem te verplaatsen. Met het hoekje rechtsonder maak je hem groter of kleiner.</p></div>`;
    const t = f.tile, P = selPath(), T = D.tiles[t.type], th = D.cfg.settings.theme, s = t.style || {};
    let spec = '';
    if (t.type === 'device') {
      const d = D.dev(t.ref.deviceId);
      spec += F.row('Apparaat', F.select(`${P}.ref.deviceId`, t.ref.deviceId, D.lib.devices.map(x => [x.id, `${x.name} (${D.zoneName(x.zone)})`]).sort((a, b) => a[1].localeCompare(b[1])), 'tilepanel'));
      spec += F.row('Knopstijl', E.kindSelect(t, d), 'Maak van deze tegel een knop');
      spec += F.row('Weergave', F.select(`${P}.opts.view`, t.opts.view || 'auto', [['auto', 'Automatisch'], ['toggle', 'Alleen knop'], ['slider', 'Knop + schuif'], ['value', 'Eén waarde groot']], 'tilepanel'));
      if (d && (t.opts.view === 'value' || D.devKind(d) === 'sensor')) spec += F.row('Waarde', F.select(`${P}.opts.cap`, t.opts.cap || D.measures(d)[0] || '', Object.keys(d.caps).map(k => [k, d.caps[k].title || k]), 'tile'));
      spec += E.iconRows(t, d ? D.devIcon(d) : 'chip');
      spec += F.row('Zone tonen', F.toggle(`${P}.opts.showZone`, t.opts.showZone !== false, 'tile'));
      spec += `<p class="note">Op het dashboard: tik = aan/uit, lang drukken = alle bediening.</p>`;
    } else if (t.type === 'flow') {
      spec += F.row('Flow', F.select(`${P}.ref.id`, t.ref.id, [...D.lib.flows, ...D.lib.advancedFlows].map(x => [x.id, x.name]), 'tile'));
      spec += F.row('Pictogram', F.icon(t.opts.mdi || t.opts.icon || 'play', !!t.opts.mdi));
    } else if (t.type === 'mood') spec += F.row('Mood', F.select(`${P}.ref.id`, t.ref.id, D.lib.moods.map(x => [x.id, x.name]), 'tile')) + F.row('Pictogram', F.icon(t.opts.mdi || 'sparkles', !!t.opts.mdi));
    else if (t.type === 'button') {
      const o = t.opts; const d = t.ref && t.ref.target === 'device' ? D.dev(t.ref.deviceId) : null;
      spec += F.row('Knopstijl', E.kindSelect(t, d));
      spec += F.row('Gekoppeld aan', `<span class="tgt">${esc(D.btnTargetName(t.ref) || 'Niets')}</span><button class="btn sm" data-retarget>Wijzigen</button>`);
      if (d) spec += F.row('Toestand van', F.select(`${P}.opts.cap`, o.cap || '', [['', 'Automatisch'], ...Object.keys(d.caps).map(k => [k, d.caps[k].title || k])], 'tilepanel'), 'Welke waarde de knop laat zien');
      spec += E.iconRows(t, 'chip');
      spec += F.row('Kleur als aan', F.colorOpt(`${P}.opts.colorOn`, o.colorOn, th.onColor, 'tilepanel')) + F.row('Kleur als uit', F.colorOpt(`${P}.opts.colorOff`, o.colorOff, '#9aa3b2', 'tilepanel'));
      spec += F.row('Naam tonen', F.toggle(`${P}.opts.label`, o.label !== false, 'tile')) + F.row('Toestand tonen', F.toggle(`${P}.opts.state`, o.state !== false, 'tile'), 'Bijv. "Aan · 70%" of "Open"');
      spec += `<p class="note">${o.kind === 'panic' ? 'Deze knop vraagt altijd eerst om bevestiging.' : 'Op het dashboard: tik = bedienen, lang drukken = alle bediening van het apparaat.'}</p>`;
    }
    else if (t.type === 'variable') { const v = D.lib.variables.find(x => x.id === t.ref.id); if (v && v.type === 'number') spec += F.row('Stapgrootte', F.text(`${P}.opts.step`, t.opts.step || 1, 'tile')) + F.row('Eenheid', F.text(`${P}.opts.unit`, t.opts.unit || '', 'tile', 'bijv. °C')); }
    else if (t.type === 'insight') spec += F.row('Periode', F.seg(`${P}.opts.resolution`, t.opts.resolution || 'last24Hours', Object.entries(D.RES).map(([k, l]) => [k, l.replace('Laatste ', '')]), 'tile')) + F.row('Lijnkleur', F.colorOpt(`${P}.opts.color`, t.opts.color, th.accent, 'tilepanel'));
    else if (t.type === 'energy') spec += F.row('Totaal van', F.select(`${P}.opts.mainDeviceId`, t.opts.mainDeviceId || '', [['', 'Som van alle apparaten'], ...D.lib.devices.filter(d => d.caps.measure_power).map(d => [d.id, d.name])], 'tile'), 'Kies je P1-meter voor het echte huisverbruik');
    else if (t.type === 'apps') spec += F.row('Alleen problemen', F.toggle(`${P}.opts.onlyProblems`, t.opts.onlyProblems, 'tile'));
    else if (t.type === 'clock') spec += F.row('Seconden', F.toggle(`${P}.opts.seconds`, t.opts.seconds, 'tile')) + F.row('Datum', F.toggle(`${P}.opts.date`, t.opts.date !== false, 'tile'));
    else if (t.type === 'text') spec += `<textarea data-k="${P}.opts.text" data-fx="tile" rows="4">${esc(t.opts.text || '')}</textarea>` + F.row('Uitlijnen', F.seg(`${P}.opts.align`, t.opts.align || 'left', [['left', 'Links'], ['center', 'Midden'], ['right', 'Rechts']], 'tile')) + F.row('Grootte', F.range(`${P}.opts.size`, t.opts.size || 1, 0.5, 4, 0.05, 'tile', 'x'));
    else if (t.type === 'web') spec += `<div class="f col"><label>Adres (URL)</label>${F.url(`${P}.opts.url`, t.opts.url, 'none')}</div>` + `<button class="btn sm" data-reload>${icon('refresh')}Laden</button>` + F.row('Bedienbaar', F.toggle(`${P}.opts.interactive`, t.opts.interactive !== false, 'tile'), 'Uit = alleen kijken') + F.row('Zoom', F.range(`${P}.opts.zoom`, t.opts.zoom || 1, 0.3, 2, 0.05, 'tile', 'x')) + F.row('Verversen', F.num(`${P}.opts.refresh`, t.opts.refresh || 0, 0, 1440, 'tile'), 'minuten, 0 = nooit');

    const tabsOpts = D.cfg.tabs.filter(x => x.id !== f.tab.id).map(x => [x.id, x.name]);
    const hdIcon = t.type === 'device' && D.dev(t.ref.deviceId) ? D.devIcon(D.dev(t.ref.deviceId)) : (T ? T.icon : 'chip');
    return `<div class="tile-hd">${anyIcon(t.opts.mdi || hdIcon)}<div><b>${esc(D.titleOf(t))}</b><small>${esc(T ? T.label : t.type)} · ${t.w}×${t.h}</small></div></div>` +
      F.group('Inhoud', F.row('Titel', F.text(`${P}.opts.title`, t.opts.title, 'tile', T && T.title ? T.title({ ...t, opts: {} }) : '')) + spec) +
      F.group('Plaats en grootte', F.row('Breedte', F.num(`${P}.w`, t.w, 1, f.tab.grid.cols, 'tilepos')) + F.row('Hoogte', F.num(`${P}.h`, t.h, 1, f.tab.grid.rows, 'tilepos')) + F.row('Kolom', F.num(`${P}.x`, t.x, 0, f.tab.grid.cols - 1, 'tilepos')) + F.row('Rij', F.num(`${P}.y`, t.y, 0, f.tab.grid.rows - 1, 'tilepos')) + F.row('Vastzetten', F.toggle(`${P}.locked`, t.locked, 'tilepanel'), 'Kan dan niet per ongeluk verschuiven')) +
      F.group('Stijl', E.scopeBar(f, t) + E.fxControls(`${P}.style`, s, D.fxOf(t), t) +
        `<div class="acts">${t.type === 'button' ? `<button class="btn sm" data-copystyle>${icon('copy')}Stijl naar alle knoppen op dit tabblad</button>` : ''}<button class="btn sm ghost" data-resetstyle>${icon('refresh')}Stijl terugzetten</button></div>`) +
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
    const ks = root.querySelector('[data-kindsel]'); if (ks) ks.onchange = () => E.setKind(t, ks.value);
    E.wireFx(root, () => D.fxOf(t));
    const cs = root.querySelector('[data-copystyle]');
    if (cs) cs.onclick = async () => {
      const others = f.tab.tiles.filter(x => x.type === 'button' && x.id !== t.id);
      if (!others.length) { D.toast('Er staan geen andere knoppen op dit tabblad'); return; }
      if (!(await D.confirm(`Stijl van deze knop (kleuren, vorm, rand, schaduw, gloed, tekst, diepte en geluid) op ${others.length} andere ${others.length === 1 ? 'knop' : 'knoppen'} van "${f.tab.name}" zetten?`, 'Kopiëren'))) return;
      E.logAction('Stijl gekopieerd naar alle knoppen', others.flatMap(x => [E.snapTile(x, 'style'), E.snapTile(x, 'opts')]), `${others.length} knoppen op ${f.tab.name}`);
      E.commit(null, () => others.forEach(x => { x.style = D.clone(t.style || {}); for (const o of ['colorOn', 'colorOff', 'label', 'state']) { if (t.opts[o] === undefined) delete x.opts[o]; else x.opts[o] = t.opts[o]; } }), () => { D.renderGrid(); D.toast(`Stijl gekopieerd naar ${others.length} ${others.length === 1 ? 'knop' : 'knoppen'}`); });
    };
    root.querySelectorAll('[data-pickicon]').forEach(b => b.onclick = async () => { const ic = await E.pickIcon(); if (ic) E.applyIcon(t, ic, b.dataset.pickicon); });
    root.querySelectorAll('[data-clearicon]').forEach(b => b.onclick = async () => {
      if (b.dataset.clearicon === 'off') { E.commit(null, () => { delete t.opts.mdiOff; delete t.opts.mdiOffAuto; }, () => { D.renderGrid(); E.refreshPanel(); }); return; }
      const ic = t.type === 'button' ? await E.getIcon(D.defaultMdiName(t.opts.kind, t.ref)) : null;
      E.commit(null, () => { if (ic) { t.opts.mdi = ic; t.opts.mdiAuto = true; } else delete t.opts.mdi; if (t.opts.mdiOffAuto) { delete t.opts.mdiOff; delete t.opts.mdiOffAuto; } }, () => { D.renderGrid(); E.refreshPanel(); });
    });
    const rt = root.querySelector('[data-retarget]');
    if (rt) rt.onclick = async () => {
      const kind = t.opts.kind || 'glow'; const ref = await E.pickTarget(E.targetOpts(kind)); if (!ref) return;
      const ic = t.opts.mdiAuto || !t.opts.mdi ? await E.getIcon(D.defaultMdiName(kind, ref)) : null;
      E.commit(null, () => { t.ref = ref; delete t.opts.cap; if (ic) { t.opts.mdi = ic; t.opts.mdiAuto = true; } }, () => { D.renderGrid(); E.refreshPanel(); });
    };
    const rl = root.querySelector('[data-reload]'); if (rl) rl.onclick = () => { const el = D.tileEls.get(t.id); if (el) el.querySelector('.inner').innerHTML = ''; D.renderGrid(); };
    root.querySelector('[data-resetstyle]').onclick = async () => {
      const others = E.scopeTargets();
      if (others.length && !(await D.confirm(`Stijl terugzetten voor deze tegel én ${others.length} andere?`, 'Terugzetten'))) return;
      E.logAction('Stijl teruggezet', [t, ...others].map(x => E.snapTile(x, 'style')), D.titleOf(t) + (others.length ? ` en ${others.length} andere` : ''));
      E.commit(null, () => { t.style = {}; others.forEach(x => { x.style = {}; }); }, () => { D.renderAll(); E.refreshPanel(); });
    };
    root.querySelectorAll('[data-fxscope]').forEach(b => b.onclick = () => { E.fxScope = b.dataset.v; E.refreshPanel(); });

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
    const nOwn = D.cfg.tabs.filter(t => t.background).length;
    bgBody += `<div class="acts"><button class="btn sm" data-bgall>${icon('copy')}Deze achtergrond op alle tabbladen</button></div><p class="note">${nOwn ? `${nOwn} ${nOwn === 1 ? 'tabblad heeft' : 'tabbladen hebben'} nu een eigen achtergrond. Met deze knop krijgen alle tabbladen dezelfde achtergrond.` : 'Alle tabbladen gebruiken nu dezelfde achtergrond.'}</p>`;
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
    root.querySelector('[data-bgall]').onclick = async () => {
      const tab = D.currentTab(); const src = (E.bgScope === 'tab' && tab.background) || D.cfg.settings.background;
      const from = E.bgScope === 'tab' && tab.background ? `van "${tab.name}"` : 'die nu is ingesteld';
      if (!(await D.confirm(`De achtergrond ${from} gebruiken voor alle tabbladen? Eigen achtergronden van tabbladen worden weggehaald.`, 'Toepassen'))) return;
      E.commit(null, () => { D.cfg.settings.background = D.clone(src); D.cfg.tabs.forEach(t => { t.background = null; }); }, () => { E.bgScope = 'all'; D.applyBackground(); E.refreshPanel(); D.toast('Achtergrond op alle tabbladen gezet'); });
    };
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
      F.group('Tegels', F.row('Doorzichtigheid', F.range(k + 'tileOpacity', t.tileOpacity, 0, 1, 0.01, 'theme', '%')) + F.row('Glas-vervaging', F.range(k + 'tileBlur', t.tileBlur, 0, 40, 1, 'theme', 'px')) + F.row('Hoeken', F.range(k + 'radius', t.radius, 0, 48, 1, 'theme', 'px'))) +
      F.group('Standaard voor alle tegels en knoppen', `<p class="note">Geldt voor elke tegel. Per tegel kun je afwijken onder <b>Tegel → Stijl</b>.</p>` + E.fxControls('settings.theme.fx', t.fx, D.fxBase(), null)) +
      F.group('Terugzetten', `<p class="note">Kwijt? Zet het uiterlijk terug naar de begininstellingen. Je indeling, tegels, koppelingen en pictogrammen blijven staan. Ongedaan maken kan met het pijltje linksboven.</p>
        <div class="acts"><button class="btn sm" data-resettheme>${icon('refresh')}Uiterlijk terugzetten</button><button class="btn sm danger" data-resetlook>${icon('refresh')}Alles terugzetten, ook alle knoppen</button></div>
        <p class="note"><b>Uiterlijk terugzetten</b>: thema, kleuren, lettertype en de standaard voor alle tegels. Eigen instellingen per knop blijven.<br><b>Alles terugzetten</b>: daarnaast ook de eigen stijl en kleuren van alle tegels en knoppen.</p>`);
  };
  const DEFAULT_THEME = () => ({ preset: 'glas', accent: '#5aa9ff', text: '#ffffff', font: 'Inter', fontScale: 1, tileBg: '#141a24', tileOpacity: 0.5, tileBlur: 16, radius: 20, shadow: 0.35, border: 0.1, onColor: '#ffc34d' });
  E.wire.uiterlijk = root => {
    E.wireFx(root, () => D.fxBase());
    root.querySelector('[data-resettheme]').onclick = async () => {
      if (!(await D.confirm('Thema, kleuren, lettertype en de standaard voor alle tegels terugzetten naar de begininstellingen?', 'Terugzetten'))) return;
      E.logAction('Uiterlijk teruggezet', [E.snapPath('settings.theme')], 'alle tegels');
      E.commit(null, () => { D.cfg.settings.theme = DEFAULT_THEME(); }, () => { FX.theme(); E.refreshPanel(); D.toast('Uiterlijk teruggezet'); });
    };
    root.querySelector('[data-resetlook]').onclick = async () => {
      const n = D.cfg.tabs.reduce((a, tab) => a + tab.tiles.length, 0);
      if (!(await D.confirm(`Alles terugzetten: thema én de eigen stijl en kleuren van alle ${n} tegels en knoppen? Indeling, koppelingen en pictogrammen blijven staan.`, 'Alles terugzetten'))) return;
      E.logAction('Alles teruggezet', [E.snapPath('settings.theme'), ...D.cfg.tabs.flatMap(tab => tab.tiles.flatMap(x => [E.snapTile(x, 'style'), E.snapTile(x, 'opts')]))], 'alle tegels en knoppen');
      E.commit(null, () => {
        D.cfg.settings.theme = DEFAULT_THEME();
        for (const tab of D.cfg.tabs) for (const x of tab.tiles) { x.style = {}; if (x.opts) for (const o of SCOPE_OPTS) delete x.opts[o]; }
      }, () => { FX.theme(); E.refreshPanel(); D.toast('Alles teruggezet naar de begininstellingen'); });
    };
    root.querySelectorAll('[data-preset]').forEach(b => b.onclick = e => {
      if (e.target.closest('[data-delth]')) { const i = Number(b.dataset.preset); E.commit(null, () => D.cfg.themes.splice(i, 1), () => E.refreshPanel()); return; }
      const p = b.hasAttribute('data-own') ? D.cfg.themes[Number(b.dataset.preset)] : PRESETS[b.dataset.preset];
      E.logAction('Thema: ' + p.name, [E.snapPath('settings.theme')], 'alle tegels');
      E.commit(null, () => { const { name, ...rest } = p; const th = D.cfg.settings.theme; Object.assign(th, D.clone(rest), { preset: name, muted: undefined }); delete th.muted; if (th.fx && !rest.fx) { delete th.fx.shA; delete th.fx.bdA; } }, () => { FX.theme(); E.refreshPanel(); });
    });
    root.querySelector('[data-saveth]').onclick = () => {
      const name = root.querySelector('#thname').value.trim() || 'Mijn thema'; const t = D.cfg.settings.theme;
      E.commit(null, () => { D.cfg.themes = D.cfg.themes || []; D.cfg.themes.push({ name, accent: t.accent, onColor: t.onColor, text: t.text, tileBg: t.tileBg, tileOpacity: t.tileOpacity, tileBlur: t.tileBlur, radius: t.radius, shadow: t.shadow, border: t.border, font: t.font, fontScale: t.fontScale, fx: D.clone(t.fx || {}) }); }, () => { E.refreshPanel(); D.toast('Thema opgeslagen'); });
    };
  };

  // Raster
  E.render.raster = () => {
    const tab = D.currentTab(); const P = tabPath() + '.grid.'; const g = tab.grid;
    const all = (E.gridScope || 'tab') === 'all' ? D.cfg.tabs : [tab];
    const canUp = all.every(t => t.grid.cols * 2 <= 24 && t.grid.rows * 2 <= 16), canDown = all.every(t => t.grid.cols % 2 === 0 && t.grid.rows % 2 === 0 && t.grid.cols >= 4 && t.grid.rows >= 4);
    return F.group(`Raster van "${esc(tab.name)}"`, F.row('Kolommen', F.num(P + 'cols', g.cols, 2, 24, 'grid')) + F.row('Rijen', F.num(P + 'rows', g.rows, 2, 16, 'grid')) +
      F.row('Ruimte tussen tegels', F.range(P + 'gap', g.gap, 0, 40, 1, 'grid', 'px')) + F.row('Rand van scherm', F.range(P + 'padding', g.padding, 0, 60, 1, 'grid', 'px')) +
      `<p class="note">Wordt het raster kleiner, dan schuiven tegels mee naar binnen. Controleer daarna of niets overlapt.</p><button class="btn sm" data-gridall>${icon('copy')}Dit raster op alle tabbladen</button>`) +
      F.group('Fijner of grover raster', `<p class="note">${canUp ? `Verdubbelen maakt van ${g.cols}×${g.rows} een raster van ${g.cols * 2}×${g.rows * 2}.` : `Dit raster (${g.cols}×${g.rows}) kan niet verder verdubbeld worden: het maximum is 24×16.`} Alle tegels groeien mee, dus je indeling blijft er hetzelfde uitzien. Daarna kun je tegels fijner verschuiven en kleinere tegels maken. Halveren doet het omgekeerde.</p>` +
        F.row('Voor', F.seg('_gscope', E.gridScope || 'tab', [['tab', `"${esc(tab.name)}"`], ['all', 'Alle tabbladen']], 'none').replace(/data-segk="_gscope"/g, 'data-gscope')) +
        `<div class="acts"><button class="btn sm" data-gscale="2" ${canUp ? '' : 'disabled'}>${icon('plus')}Raster verdubbelen</button><button class="btn sm" data-gscale="0.5" ${canDown ? '' : 'disabled'}>${icon('minus')}Raster halveren</button></div><p class="note">Maximaal 24 kolommen en 16 rijen.</p>`) +
      F.group('Hulplijnen', `<p class="note">Op de achterkant zie je de vakjes van het raster. Op de voorkant zijn ze onzichtbaar.</p>`);
  };
  // Raster schalen met alle tegels erbij. Geeft een foutmelding terug als het niet kan, anders null.
  E.scaleGrid = (tab, f) => {
    const g = tab.grid; const cols = g.cols * f, rows = g.rows * f;
    if (cols > 24 || rows > 16) return `"${tab.name}": ${cols}×${rows} is groter dan het maximum van 24×16`;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return `"${tab.name}": ${g.cols}×${g.rows} kan niet gehalveerd worden`;
    const next = tab.tiles.map(t => f > 1 ? { x: t.x * 2, y: t.y * 2, w: t.w * 2, h: t.h * 2 }
      : { x: Math.floor(t.x / 2), y: Math.floor(t.y / 2), w: Math.max(1, Math.round(t.w / 2)), h: Math.max(1, Math.round(t.h / 2)) });
    const tmp = { grid: { ...g, cols, rows }, tiles: tab.tiles.map((t, i) => ({ id: t.id, ...next[i] })) };
    const bad = tmp.tiles.find(r => !E.fits(tmp, r, r.id));
    if (bad) return `"${tab.name}": tegels zouden over elkaar vallen. Zet de tegels eerst op even vakjes (kolom en rij 0, 2, 4…) met een even breedte en hoogte.`;
    return () => { g.cols = cols; g.rows = rows; tab.tiles.forEach((t, i) => Object.assign(t, next[i])); };
  };
  E.wire.raster = root => {
    root.querySelectorAll('[data-gscope]').forEach(b => b.onclick = () => { E.gridScope = b.dataset.v; E.refreshPanel(); });
    root.querySelectorAll('[data-gscale]').forEach(b => b.onclick = async () => {
      const f = Number(b.dataset.gscale); const tabs = (E.gridScope || 'tab') === 'all' ? D.cfg.tabs : [D.currentTab()];
      const res = tabs.map(t => E.scaleGrid(t, f)); const err = res.find(r => typeof r === 'string');
      if (err) { D.toast(err, true); return; }
      E.commit(null, () => res.forEach(fn => fn()), () => { D.renderAll(); E.refreshPanel(); D.toast(`Raster ${f > 1 ? 'verdubbeld' : 'gehalveerd'}${tabs.length > 1 ? ' op alle tabbladen' : ''}`); });
    });
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
        <div class="acts"><button class="btn sm primary" data-manual>${icon('book')}Gebruiksaanwijzing</button><button class="btn sm" data-relib>${icon('refresh')}Bibliotheek vernieuwen</button><button class="btn sm" data-reload>${icon('refresh')}Dashboard herladen</button></div>`) +
      F.group('Eigen apps', '<div id="awstat"><div class="muted">Laden…</div></div>') +
      F.group('Back-ups', `<p class="note">Elke dag wordt automatisch een back-up gemaakt (14 dagen bewaard).</p><div class="acts"><button class="btn sm" data-bk>${icon('download')}Back-up maken</button><button class="btn sm" data-export>${icon('download')}Exporteren</button><label class="btn sm">${icon('upload')}Importeren<input type="file" accept=".json" id="impfile" hidden></label></div><div id="bklist" class="bklist"><div class="muted">Laden…</div></div>`) +
      F.group('Adressen invullen', F.row('Standaardbegin', F.text('settings.urls.prefix', E.urls().prefix, 'none', 'http://192.168.178.79:'), 'Staat al ingevuld bij een nieuw adres') +
        `<p class="note">Snelknoppen boven het adresveld:</p><div class="urlq-list">${E.urls().quick.map((q, i) => `<div class="urlq-row"><input type="text" class="nm" data-k="settings.urls.quick.${i}.0" data-fx="none" value="${esc(q[0])}" placeholder="Naam"><input type="text" data-k="settings.urls.quick.${i}.1" data-fx="none" value="${esc(q[1])}" placeholder="http://…"><button class="ib sm" data-delurl="${i}" title="Verwijderen">${icon('trash')}</button></div>`).join('')}</div>
        <div class="acts"><button class="btn sm" data-addurl>${icon('plus')}Snelknop toevoegen</button><button class="btn sm ghost" data-reseturl>${icon('refresh')}Standaard terugzetten</button></div>`) +
      F.group('Achterkant openen', F.row('Aantal tikken', F.num('settings.unlock.taps', u.taps, 3, 8, 'none')) + F.row('Binnen', F.range('settings.unlock.window', u.window, 800, 3000, 100, 'none', 'n'), 'milliseconden') + `<p class="note">Tik op een lege plek of op de tabbalk.</p>`) +
      F.group('Opnieuw beginnen', `<button class="btn sm danger" data-reset>${icon('trash')}Alles terugzetten naar begin</button>`) +
      `<p class="note center">Homey Dashboard · ${D.hasFully() ? 'Fully Kiosk' : 'browser'} · ${window.innerWidth}×${window.innerHeight}</p>`;
  };
  E.wire.systeem = async root => {
    root.querySelector('[data-manual]').onclick = () => D.openManual();
    root.querySelector('[data-addurl]').onclick = () => E.commit(null, () => E.urls().quick.push(['', E.urls().prefix || 'http://']), () => E.refreshPanel());
    root.querySelector('[data-reseturl]').onclick = async () => { if (!(await D.confirm('Standaardbegin en snelknoppen terugzetten?', 'Terugzetten'))) return; E.commit(null, () => { D.cfg.settings.urls = URL_DEFAULTS(); }, () => E.refreshPanel()); };
    root.querySelectorAll('[data-delurl]').forEach(b => b.onclick = () => E.commit(null, () => E.urls().quick.splice(Number(b.dataset.delurl), 1), () => E.refreshPanel()));
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
