/* Controle van apparaten, apps en flows: tegel op de voorkant + onderdeel "Controle" op de achterkant. */
(function () {
  const D = window.D; const esc = D.esc; const $ = D.$;
  const H = D.health = { data: null, loading: null, err: null };

  H.load = force => {
    if (H.loading) return H.loading;
    H.loading = D.api('GET', '/api/health' + (force ? '?force=1' : ''))
      .then(d => { H.data = d; H.err = null; return d; })
      .catch(e => { H.err = e.message; return null; })
      .finally(() => { H.loading = null; refreshTiles(); if (D.editing && D.editor.section === 'controle') D.editor.refreshPanel(); });
    return H.loading;
  };
  const refreshTiles = () => {
    for (const tab of D.cfg.tabs) for (const t of tab.tiles) if (t.type === 'health') { const el = D.tileEls.get(t.id); if (el) D.renderTileContent(t, el); }
  };
  setInterval(() => { if (D.cfg && D.cfg.tabs.some(tab => tab.tiles.some(t => t.type === 'health'))) H.load(false); }, 10 * 60 * 1000);

  const time = at => new Date(at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const summary = d => !d ? '' : d.errors + d.warnings === 0 ? 'Alles in orde'
    : [d.errors ? `${d.errors} ${d.errors === 1 ? 'probleem' : 'problemen'}` : '', d.warnings ? `${d.warnings} ${d.warnings === 1 ? 'waarschuwing' : 'waarschuwingen'}` : ''].filter(Boolean).join(' · ');

  // lijst met problemen; editor = true geeft ook de knop "Laat Claude repareren"
  H.listHtml = (d, editor) => {
    const row = (x, i, group) => {
      let fix = '';
      if (x.fix && x.fix.type === 'restartApp') fix = `<button class="btn sm${x.fix.optional ? '' : ' primary'}" data-hrestart="${esc(x.fix.appId)}">${icon('refresh')}${esc(x.fix.optional ? 'Probeer: ' + x.fix.label.toLowerCase() : x.fix.label)}</button>`;
      else if (x.fix && x.fix.type === 'assistant') fix = editor ? `<button class="btn sm primary" data-hai="${group}:${i}">${icon('sparkles')}${esc(x.fix.label)}</button>` : '<small class="muted">Repareren: achterkant → Controle</small>';
      else if (x.fix && x.fix.type === 'advice') fix = `<small class="h-adv">${esc(x.fix.text)}</small>`;
      return `<div class="h-row ${x.sev}"><i class="h-dot"></i><div class="h-t"><b>${esc(x.title)}</b><span>${esc(x.problem)}</span>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}${fix ? `<div class="h-fix">${fix}</div>` : ''}</div></div>`;
    };
    const dev = d.devices.map((x, i) => row(x, i, 'devices')).join('');
    const fl = d.flows.map((x, i) => row(x, i, 'flows')).join('');
    return `<div class="h-sum ${d.errors ? 'bad' : d.warnings ? 'warn' : 'ok'}">${icon(d.errors + d.warnings ? 'bell' : 'check')}<div><b>${esc(summary(d))}</b><small>Gecontroleerd om ${time(d.at)} · ${d.devicesTotal} apparaten, ${d.flowsTotal} flows</small></div></div>
      <h4 class="h-h">Apparaten en apps</h4>${dev || '<p class="note">Geen problemen gevonden.</p>'}
      <h4 class="h-h">Flows</h4>${fl || '<p class="note">Geen problemen gevonden.</p>'}
      ${d.flowsDisabled ? `<p class="note">${d.flowsDisabled} ${d.flowsDisabled === 1 ? 'flow staat' : 'flows staan'} uit (geen probleem, ter info).</p>` : ''}`;
  };
  H.wire = (root, rerender) => {
    root.querySelectorAll('[data-hrestart]').forEach(b => b.onclick = async () => {
      const id = b.dataset.hrestart; const a = (D.lib.apps || []).find(x => x.id === id);
      if (!(await D.confirm(`De app ${a ? a.name : id} herstarten? Apparaten van deze app zijn dan even niet te bedienen.`, 'Herstarten'))) return;
      b.disabled = true;
      try { await D.api('POST', '/api/health/restart-app/' + encodeURIComponent(id)); D.toast('App wordt herstart. Over 20 seconden controleer ik opnieuw.'); setTimeout(() => H.load(true).then(() => rerender && rerender()), 20000); }
      catch (e) { D.toast('Herstarten mislukt: ' + e.message, true); b.disabled = false; }
    });
    root.querySelectorAll('[data-hai]').forEach(b => b.onclick = () => {
      const [g, i] = b.dataset.hai.split(':'); const x = H.data[g][Number(i)];
      const E = D.editor; E.ai.draft = x.fix.prompt; E.section = 'assistent'; E.refreshPanel();
      D.toast('De vraag staat klaar. Tik op Vraag om Claude te laten repareren.');
    });
  };

  // ---------- tegel op de voorkant ----------
  D.tiles.health = {
    label: 'Controle', icon: 'activity', size: [3, 2],
    title: () => 'Controle',
    render(t, inner, el) {
      const d = H.data;
      if (!d && !H.loading && !H.err) H.load(false);
      const st = !d ? (H.err ? 'bad' : 'wait') : d.errors ? 'bad' : d.warnings ? 'warn' : 'ok';
      el.classList.remove('h-ok', 'h-warn', 'h-bad', 'h-wait'); el.classList.add('h-' + st);
      inner.innerHTML = `<div class="h-tile"><span class="h-big">${icon(st === 'ok' ? 'check' : st === 'wait' ? 'refresh' : 'bell')}</span><div><b>${esc(d ? summary(d) : H.err ? 'Controle lukt niet' : 'Controleren…')}</b><small>${d ? 'Om ' + time(d.at) + ' · tik voor details' : esc(H.err || '')}</small></div></div>`;
      D.pressable(el, { tap: () => H.openSheet() });
    },
  };
  H.openSheet = async () => {
    const draw = () => {
      const d = H.data;
      D.openSheet(`<div class="sheet-hd"><div><h2>Controle</h2><div class="sub">Apparaten, apps en flows</div></div><button class="ib" data-hre title="Opnieuw controleren">${icon('refresh')}</button><button class="xbtn" data-close>${icon('x')}</button></div>
        <div class="h-list">${d ? H.listHtml(d, false) : `<div class="muted pad">${esc(H.err || 'Controleren…')}</div>`}</div>`, 'wide');
      const box = $('#sheet');
      box.querySelector('[data-close]').onclick = () => D.closeSheet();
      box.querySelector('[data-hre]').onclick = async () => { await H.load(true); draw(); };
      H.wire(box, draw);
    };
    draw(); if (!H.data) { await H.load(true); draw(); }
  };

  // ---------- achterkant: onderdeel Controle ----------
  const E = D.editor;
  E.render.controle = () => {
    const d = H.data;
    return `<p class="note">Zoekt naar apparaten die niet bereikbaar zijn, lege batterijen, sensoren die lang niets meldden, vastgelopen apps en flows met ontbrekende of kapotte onderdelen. Controleren kost niets.</p>
      <div class="acts"><button class="btn sm primary" data-hcheck ${H.loading ? 'disabled' : ''}>${icon('refresh')}${H.loading ? 'Bezig met controleren…' : d ? 'Opnieuw controleren' : 'Nu controleren'}</button></div>
      ${H.err ? `<p class="note h-err">${esc(H.err)}</p>` : ''}
      <div class="h-list">${d ? H.listHtml(d, true) : ''}</div>
      <p class="note">Batterij telt als bijna leeg onder 20%. Een sensor die 24 uur niets meldde, krijgt een waarschuwing. Zet de tegel <b>Controle</b> (Toevoegen → Overig) op het dashboard om de stand altijd te zien.</p>`;
  };
  E.wire.controle = root => {
    if (!H.data && !H.loading && !H.err) H.load(true);
    const b = root.querySelector('[data-hcheck]'); if (b) b.onclick = () => { H.load(true); E.refreshPanel(); };
    H.wire(root, () => E.refreshPanel());
  };
})();
