/* Subpagina's: pagina's die niet in de tabbalk staan, maar die je opent met een knop "Open pagina".
   Een subpagina is verder een gewoon tabblad (eigen tegels, achtergrond, raster…) met tab.sub = true.
   Linksboven staat een terugknop; na een paar minuten niets doen gaat hij vanzelf terug. */
(function () {
  const D = window.D; const T = D.tiles; const esc = D.esc;
  const MAX_SUB = 20;
  D.MAX_SUB = MAX_SUB;
  D.isSub = t => !!(t && t.sub);
  D.mainTabs = () => D.cfg.tabs.filter(t => !t.sub);
  D.subTabs = () => D.cfg.tabs.filter(t => t.sub);

  // subpagina's niet in de tabbalk; het tabblad waar je vandaan kwam blijft gemarkeerd
  D.visibleTabs = (orig => () => orig().filter(t => !t.sub))(D.visibleTabs);
  D.renderTabbar = (orig => () => {
    orig();
    const cur = D.currentTab();
    if (D.isSub(cur) && D._subFrom) { const b = document.querySelector(`#tabs [data-tab="${D._subFrom}"]`); if (b) b.classList.add('active'); }
    drawBack();
  })(D.renderTabbar);

  // ---------- openen en terug ----------
  D.openPage = id => {
    const t = D.cfg.tabs.find(x => x.id === id);
    if (!t) { D.toast('Deze pagina bestaat niet meer', true); return; }
    const cur = D.currentTab();
    if (!D.isSub(cur)) D._subFrom = cur.id;
    D._subAt = Date.now();
    D.switchTab(id);
  };
  D.closePage = () => {
    const back = D._subFrom && D.cfg.tabs.find(t => t.id === D._subFrom && !t.sub) ? D._subFrom : (D.cfg.settings.startTab || D.mainTabs()[0].id);
    D.switchTab(back);
  };
  D.switchTab = (orig => id => { orig(id); drawBack(); })(D.switchTab);

  const drawBack = () => {
    const app = document.getElementById('tabbar'); if (!app || !D.cfg) return;
    let b = document.getElementById('subback'); const cur = D.currentTab();
    if (!D.isSub(cur)) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.id = 'subback'; app.appendChild(b); b.onclick = e => { e.stopPropagation(); D.closePage(); }; }
    b.innerHTML = `${icon('left')}<span>${esc((cur.icon ? cur.icon + ' ' : '') + cur.name)}</span>`;
  };

  // vanzelf terug na een paar minuten niets doen (zelfde tijd als "Terug naar start", anders 3 minuten)
  let last = Date.now();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { last = Date.now(); }, true));
  setInterval(() => {
    if (!D.cfg || D.editing || !D.isSub(D.currentTab())) return;
    const r = D.cfg.settings.returnHome || {}; const min = r.enabled ? r.after : 3;
    if (Date.now() - last > min * 6e4) D.closePage();
  }, 15000);

  // ---------- knop "Open pagina" ----------
  D.BUTTON_KINDS.push(['page', 'Open pagina', 'Opent een subpagina of ander tabblad (bijv. Woonkamer)', 'arrow-right-circle-outline']);
  const pageOf = t => t.ref && t.ref.target === 'page' ? D.cfg.tabs.find(x => x.id === t.ref.tabId) : null;
  D.btnTargetName = (orig => ref => ref && ref.target === 'page' ? ((D.cfg.tabs.find(x => x.id === ref.tabId) || {}).name || 'Pagina niet gevonden') : orig(ref))(D.btnTargetName);
  T.button.render = (orig => function (t, inner, el) {
    const o = t.opts || {};
    if (o.kind !== 'page') return orig.call(this, t, inner, el);
    const pg = pageOf(t); const prev = o._preview !== undefined;
    el.classList.toggle('nolink', !pg && !prev); el.classList.remove('is-on', 'alarm-on', 'on');
    el.style.setProperty('--kon', o.colorOn || 'var(--on)');
    if (o.colorOff) el.style.setProperty('--koff', o.colorOff); else el.style.removeProperty('--koff');
    const ic = D.pic(t, false, 'home');
    const label = o.label !== false ? `<div class="kb-label">${esc(D.titleOf(t))}</div>` : '';
    const sub = o.state !== false && pg ? `<div class="kb-state">${pg.tiles.length} ${pg.tiles.length === 1 ? 'tegel' : 'tegels'}</div>` : '';
    inner.innerHTML = `<div class="kb kb-page kb-glow${o.label === false && o.state === false ? ' nolabel' : ''}"><div class="face">${anyIcon(ic, '', { brand: o.brand !== false })}<span class="pg-go">${icon('right')}</span></div>${label || sub ? `<div class="kb-txt">${label}${sub}</div>` : ''}</div>`;
    D.pressable(el, { tap: () => { if (pg) { D.playFor(el); D.openPage(pg.id); } else D.toast('Kies bij Tegel welke pagina deze knop opent'); } });
  })(T.button.render);

  // ---------- achterkant ----------
  const E = D.editor;
  E.targetOpts = (orig => kind => kind === 'page' ? { pages: true, targets: ['page'] } : orig(kind))(E.targetOpts);
  E.pickTarget = (orig => (opt = {}) => opt.pages ? pickPage() : orig(opt))(E.pickTarget);
  const pickPage = () => new Promise(resolve => {
    let done = false; const finish = v => { if (done) return; done = true; D._sheetCancel = null; D.closeSheet(); resolve(v); };
    const row = (t, sub) => `<button class="pick-it" data-pg="${t.id}"><span class="lib-ic">${t.icon ? `<span class="emo-ic">${esc(t.icon)}</span>` : icon(sub ? 'layers' : 'home')}</span><span class="lib-t"><b>${esc(t.name)}</b><small>${sub ? 'Subpagina' : 'Tabblad'} · ${t.tiles.length} tegels</small></span></button>`;
    D.openSheet(`<div class="sheet-hd"><div><h2>Welke pagina?</h2><div class="sub">Tik op de knop en deze pagina gaat open</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
      <div class="pick-list">${D.subTabs().map(t => row(t, true)).join('')}${D.mainTabs().map(t => row(t, false)).join('')}</div>
      <div class="acts"><button class="btn sm primary" data-newsub ${D.subTabs().length >= MAX_SUB ? 'disabled' : ''}>${icon('plus')}Nieuwe subpagina</button></div>`, 'wide');
    D._sheetCancel = () => finish(null);
    const box = document.getElementById('sheet');
    box.querySelector('[data-close]').onclick = () => finish(null);
    box.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => finish({ target: 'page', tabId: b.dataset.pg }));
    box.querySelector('[data-newsub]').onclick = async () => { done = true; D._sheetCancel = null; D.closeSheet(); const t = await E.newSubpage(false); resolve(t ? { target: 'page', tabId: t.id } : null); };
  });

  // nieuwe subpagina: naam, pictogram en eventueel meteen vullen met de apparaten van een zone
  E.newSubpage = (openIt = true) => new Promise(resolve => {
    if (D.subTabs().length >= MAX_SUB) { D.toast(`Maximaal ${MAX_SUB} subpagina's`, true); resolve(null); return; }
    const zones = [...D.lib.zones].sort((a, b) => a.name.localeCompare(b.name));
    D.openSheet(`<div class="sheet-hd"><div><h2>Nieuwe subpagina</h2><div class="sub">Staat niet in de tabbalk; je opent hem met een knop "Open pagina"</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
      <div class="f"><label>Naam</label><div class="c"><input type="text" id="sp-name" placeholder="bijv. Woonkamer" style="width:200px"></div></div>
      <div class="f"><label>Pictogram (emoji)</label><div class="c"><input type="text" id="sp-icon" maxlength="4" value="🛋️" style="width:60px"></div></div>
      <div class="f"><label>Vullen met apparaten uit<small>Daarna kun je ze aanpassen of weghalen</small></label><div class="c"><select id="sp-zone"><option value="">Niets, ik kies zelf</option>${zones.map(z => `<option value="${esc(z.id)}">${esc(z.name)} (${D.lib.devices.filter(d => d.zone === z.id).length})</option>`).join('')}</select></div></div>
      <div class="f"><label>Knop "Open pagina" erbij zetten<small>Op ${esc(D.currentTab().name)}</small></label><div class="c"><input type="checkbox" id="sp-btn" ${openIt ? 'checked' : ''}></div></div>
      <div class="row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn ghost" data-close>Annuleren</button><button class="btn primary" data-ok>Maken</button></div>`, 'wide');
    const box = document.getElementById('sheet'); let done = false;
    const fin = v => { if (done) return; done = true; D._sheetCancel = null; D.closeSheet(); resolve(v); };
    D._sheetCancel = () => fin(null);
    box.querySelectorAll('[data-close]').forEach(b => b.onclick = () => fin(null));
    const nm = box.querySelector('#sp-name'); setTimeout(() => nm.focus(), 50);
    nm.oninput = () => { const z = zones.find(x => x.name.toLowerCase() === nm.value.trim().toLowerCase()); if (z) box.querySelector('#sp-zone').value = z.id; };
    box.querySelector('[data-ok]').onclick = () => {
      const name = nm.value.trim() || 'Subpagina'; const zone = box.querySelector('#sp-zone').value; const withBtn = box.querySelector('#sp-btn').checked;
      const from = D.currentTab(); const fromMain = D.isSub(from) ? D.mainTabs()[0] : from;
      const tab = { id: D.uid('t'), name, icon: box.querySelector('#sp-icon').value.trim(), hidden: false, sub: true, grid: D.clone(fromMain.grid), background: null, tiles: [] };
      if (zone) for (const d of D.lib.devices.filter(x => x.zone === zone)) {
        const k = D.devKind(d); const [w, h] = { switch: d.caps.dim ? [3, 2] : [2, 2], thermostat: [3, 3] }[k] || [2, 2];
        const spot = E.firstFree(tab, w, h); if (!spot) break;
        tab.tiles.push({ id: D.uid('w'), type: 'device', ref: { deviceId: d.id }, opts: {}, style: {}, ...spot });
      }
      E.commit(null, () => {
        D.cfg.tabs.push(tab);
        if (withBtn && !D.isSub(from)) { const spot = E.firstFree(from, 2, 2); if (spot) from.tiles.push({ id: D.uid('w'), type: 'button', ref: { target: 'page', tabId: tab.id }, opts: { kind: 'page', title: name }, style: {}, ...spot }); }
      }, () => { D.renderAll(); E.refreshPanel(); });
      D.toast(`Subpagina "${name}" gemaakt${zone ? ` met ${tab.tiles.length} apparaten` : ''}`);
      fin(tab);
      if (openIt) D.openPage(tab.id);
    };
  });
})();
