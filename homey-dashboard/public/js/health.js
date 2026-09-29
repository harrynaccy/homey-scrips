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
      if (x.canDelete) fix += x.kind === 'flow'
        ? `<button class="btn sm danger" data-hdelflow="${esc(x.id)}" data-adv="${x.adv ? 1 : 0}" data-name="${esc(x.title)}">${icon('trash')}Flow verwijderen</button>`
        : `<button class="btn sm danger" data-hdeldev="${esc(x.id)}" data-name="${esc(x.title)}">${icon('trash')}Apparaat verwijderen</button>`;
      return `<div class="h-row ${x.sev}"><i class="h-dot"></i><div class="h-t"><b>${esc(x.title)}</b><span>${esc(x.problem)}</span>${x.detail ? `<small>${esc(x.detail)}</small>` : ''}${fix ? `<div class="h-fix">${fix}</div>` : ''}</div></div>`;
    };
    const dev = d.devices.map((x, i) => row(x, i, 'devices')).join('');
    const fl = d.flows.map((x, i) => row(x, i, 'flows')).join('');
    const del = H.deleted.filter(x => !x.restored).map(x => `<div class="h-row info"><i class="h-dot"></i><div class="h-t"><b>${esc(x.name)}</b><span>Verwijderd om ${time(x.at)}</span><div class="h-fix"><button class="btn sm" data-hundo="${esc(x.batch)}">${icon('undo')}Terugzetten</button></div></div></div>`).join('');
    return (del ? `<h4 class="h-h">Net verwijderd</h4>${del}` : '') + `<div class="h-sum ${d.errors ? 'bad' : d.warnings ? 'warn' : 'ok'}">${icon(d.errors + d.warnings ? 'bell' : 'check')}<div><b>${esc(summary(d))}</b><small>Gecontroleerd om ${time(d.at)} · ${d.devicesTotal} apparaten, ${d.flowsTotal} flows</small></div></div>
      <h4 class="h-h">Apparaten en apps</h4>${dev || '<p class="note">Geen problemen gevonden.</p>'}
      <h4 class="h-h">Flows</h4>${fl || '<p class="note">Geen problemen gevonden.</p>'}
      ${d.flowsDisabled ? `<p class="note">${d.flowsDisabled} ${d.flowsDisabled === 1 ? 'flow staat' : 'flows staan'} uit (geen probleem, ter info).</p>` : ''}`;
  };
  H.deleted = [];
  const pinFor = async acties => {
    if (!(await D.api('POST', '/api/flows/needpin', { acties })).pin) return '';
    if (!(await D.api('GET', '/api/flows/pin')).set) throw new Error('Stel eerst een pincode in: achterkant → Assistent → Instellingen → Pincode voor flows');
    return D.editor.ai.askPin('Voer je pincode in om te verwijderen.');
  };
  H.wire = (root, rerender) => {
    const again = async () => { await H.load(true); rerender && rerender(); };
    root.querySelectorAll('[data-hdelflow]').forEach(b => b.onclick = async () => {
      const name = b.dataset.name; const adv = b.dataset.adv === '1';
      if (!(await D.confirm(`Flow "${name}" verwijderen uit Homey? Er wordt eerst een kopie bewaard, zodat je hem kunt terugzetten.`, 'Verwijderen'))) return;
      try {
        const acties = [{ actie: 'flow_verwijderen', flowId: b.dataset.hdelflow, geavanceerd: adv, omschrijving: name }];
        const pin = await pinFor(acties); if (pin === null) return;
        const r = await D.api('POST', '/api/flows/apply', { acties, pin });
        if (!r.steps[0] || !r.steps[0].ok) throw new Error((r.steps[0] && r.steps[0].note) || 'Verwijderen lukte niet');
        H.deleted.push({ name: 'Flow ' + name, batch: r.batch, at: Date.now() });
        D.toast(`Flow "${name}" verwijderd`); await D.loadLibrary(); await again();
      } catch (e) { D.toast(e.message, true); }
    });
    root.querySelectorAll('[data-hdeldev]').forEach(b => b.onclick = async () => {
      const id = b.dataset.hdeldev; const name = b.dataset.name;
      try {
        const u = await D.api('GET', '/api/health/usage/' + encodeURIComponent(id));
        const where = [u.flows.length ? `${u.flows.length} ${u.flows.length === 1 ? 'flow' : 'flows'} (${u.flows.slice(0, 4).join(', ')}${u.flows.length > 4 ? ', …' : ''})` : '', u.tiles.length ? `${u.tiles.length} ${u.tiles.length === 1 ? 'tegel' : 'tegels'}` : ''].filter(Boolean).join(' en ');
        if (!(await D.confirm(`"${name}" uit Homey verwijderen? ${where ? 'Het wordt gebruikt in ' + where + '; die werken daarna niet meer.' : 'Het wordt nergens in flows of tegels gebruikt.'}`, 'Verder'))) return;
        if (!(await D.confirm(`Weet je het zeker? Dit is niet terug te draaien. Wil je "${name}" later terug, dan moet je het opnieuw koppelen.`, 'Ja, verwijderen'))) return;
        if (!(await D.api('GET', '/api/flows/pin')).set) throw new Error('Stel eerst een pincode in: achterkant → Assistent → Instellingen → Pincode voor flows');
        const pin = await D.editor.ai.askPin(`Voer je pincode in om "${name}" te verwijderen.`); if (pin === null) return;
        await D.api('POST', '/api/health/delete-device/' + encodeURIComponent(id), { pin });
        D.toast(`"${name}" is verwijderd uit Homey`); await D.loadLibrary(); D.renderAll(); await again();
      } catch (e) { D.toast(e.message, true); }
    });
    root.querySelectorAll('[data-hundo]').forEach(b => b.onclick = async () => {
      try {
        const r = await D.api('POST', '/api/flows/undo/' + encodeURIComponent(b.dataset.hundo));
        const x = H.deleted.find(y => y.batch === b.dataset.hundo); if (x) x.restored = true;
        D.toast(r.ok ? 'Teruggezet' : 'Deels teruggezet: ' + r.problems.join(', '), !r.ok); await D.loadLibrary(); await again();
      } catch (e) { D.toast(e.message, true); }
    });
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
      ${autoGroup()}
      <p class="note">Batterij telt als bijna leeg onder 20%. Een sensor die 24 uur niets meldde, krijgt een waarschuwing. Zet de tegel <b>Controle</b> (Toevoegen → Overig) op het dashboard om de stand altijd te zien.</p>`;
  };
  const autoGroup = () => {
    const F = E.F; const ac = { every: 1, notify: 'timeline', ...(D.cfg.settings.autocheck || {}) };
    return F.group('Automatisch controleren', `<p class="note">Het dashboard controleert op de achtergrond en stuurt alleen een melding bij <b>nieuwe</b> problemen.</p>` +
      F.row('Hoe vaak', F.select('settings.autocheck.every', String(ac.every), [['0', 'Uit'], ['1', 'Elk uur'], ['3', 'Elke 3 uur'], ['24', 'Eén keer per dag']], 'panel')) +
      F.row('Melding', F.select('settings.autocheck.notify', ac.notify, [['timeline', 'In de tijdlijn van de Homey-app'], ['push', 'Pushbericht naar een telefoon'], ['uit', 'Geen melding']], 'panel')) +
      (ac.notify === 'push' ? F.row('Naar', '<select data-acuser><option>Laden…</option></select>') : '') +
      `<div class="acts"><button class="btn sm" data-actest>${icon('bell')}Testmelding sturen</button><button class="btn sm" data-acrun>${icon('refresh')}Nu automatisch controleren</button></div><p class="note" id="aclast"></p>`);
  };
  const wireAuto = root => {
    const t = root.querySelector('[data-actest]'); if (t) t.onclick = async () => { try { await E.saveNow(); await D.api('POST', '/api/autocheck/test'); D.toast('Testmelding verstuurd. Kijk in de Homey-app.'); } catch (e) { D.toast(e.message, true); } };
    const r = root.querySelector('[data-acrun]'); if (r) r.onclick = async () => { try { await E.saveNow(); const x = await D.api('POST', '/api/autocheck/run'); D.toast(x ? `${x.total} problemen, waarvan ${x.fresh} nieuw${x.fresh ? ' (melding verstuurd)' : ''}` : 'Automatisch controleren staat uit'); H.load(true); } catch (e) { D.toast(e.message, true); } };
    D.api('GET', '/api/autocheck').then(a => { const el = root.querySelector('#aclast'); if (el && a.last && a.last.at) el.textContent = `Laatste automatische controle: ${time(a.last.at)} · ${a.last.total} problemen, ${a.last.fresh} nieuw.`; }).catch(() => {});
    const sel = root.querySelector('[data-acuser]');
    if (sel) D.api('GET', '/api/autocheck/users').then(list => {
      const cur = (D.cfg.settings.autocheck || {}).user;
      sel.innerHTML = '<option value="">Kies een gebruiker…</option>' + list.map((u, i) => `<option value="${i}"${cur && cur.id === u.id ? ' selected' : ''}>${esc(u.name || u.title || u.id)}</option>`).join('');
      sel.onchange = () => { const u = list[Number(sel.value)]; E.commit(null, () => { D.cfg.settings.autocheck = { ...(D.cfg.settings.autocheck || {}), user: u || null }; }); D.toast(u ? 'Pushberichten gaan naar ' + (u.name || u.id) : 'Geen gebruiker gekozen'); };
    }).catch(e => { sel.innerHTML = `<option>${esc(e.message)}</option>`; });
  };
  E.wire.controle = root => {
    wireAuto(root);
    if (!H.data && !H.loading && !H.err) H.load(true);
    const b = root.querySelector('[data-hcheck]'); if (b) b.onclick = () => { H.load(true); E.refreshPanel(); };
    H.wire(root, () => E.refreshPanel());
  };
})();
