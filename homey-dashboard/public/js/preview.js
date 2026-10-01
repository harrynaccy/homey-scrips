/* ==========================================================================
   Voorbeeld op een ander scherm (Samsung Galaxy Tab A11+)

   Op de laptop: het dashboard wordt getoond in een kader met precies de
   schermmaat van de tablet, verkleind tot het op je laptop past (nooit
   groter dan 1 op 1). Bewerken werkt gewoon in dat kader.

   - Aan/uit en liggend/staand worden per apparaat in de browser onthouden
     (dus alleen op de laptop, de tablet merkt hier niets van).
   - De maat van de tablet staat in de indeling op de NAS
     (settings.devices), zodat "Meet dit scherm" op de tablet later de
     echte maat kan opslaan en de laptop die meteen gebruikt.

   Instellen: achterkant → Scherm → "Voorbeeld op tablet".
   ========================================================================== */
(function () {
  const D = window.D; const E = D.editor; const esc = D.esc; const $ = D.$;
  const LS = 'hdPreview';
  const DEFAULT_DEV = { id: 'a11', name: 'Samsung Galaxy Tab A11+', w: 1280, h: 800, measured: false };

  const load = () => { try { return Object.assign({ on: false, dev: 'a11', orient: 'land' }, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { return { on: false, dev: 'a11', orient: 'land' }; } };
  const P = D.preview = { st: load() };
  P.save = () => { try { localStorage.setItem(LS, JSON.stringify(P.st)); } catch (e) { /* alleen voor deze sessie */ } };

  P.devices = () => {
    const s = D.cfg && D.cfg.settings;
    return (s && Array.isArray(s.devices) && s.devices.length) ? s.devices : [DEFAULT_DEV];
  };
  P.device = () => P.devices().find(d => d.id === P.st.dev) || P.devices()[0];
  // Afmeting in beeld (CSS-pixels), rekening houdend met liggend/staand
  P.size = () => {
    if (!P.st.on || !D.cfg) return null;
    const d = P.device(); const big = Math.max(d.w, d.h), small = Math.min(d.w, d.h);
    return P.st.orient === 'port' ? { w: small, h: big } : { w: big, h: small };
  };

  // ---------- kader tekenen ----------
  P.apply = () => {
    const app = $('#app'); const sz = P.size();
    document.body.classList.toggle('preview', !!sz);
    if (!sz) {
      app.style.width = ''; app.style.height = '';
      if (!D.editing) app.style.transform = '';
      P.bar(false);
      if (D.editing) E.layout();
      return;
    }
    app.style.width = sz.w + 'px'; app.style.height = sz.h + 'px';
    if (D.editing) { E.layout(); P.bar(false); return; }
    const vw = window.innerWidth, vh = window.innerHeight, top = 52;
    const s = Math.min((vw - 32) / sz.w, (vh - top - 16) / sz.h, 1);
    const x = Math.round((vw - sz.w * s) / 2), y = Math.round(top + (vh - top - 16 - sz.h * s) / 2);
    app.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    P.scale = s; P.bar(true);
  };

  // Balkje boven het kader (alleen buiten de bewerkmodus)
  P.bar = show => {
    let b = $('#pv-bar');
    if (!show) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'pv-bar'; document.body.appendChild(b); }
    const d = P.device(); const sz = P.size();
    b.innerHTML = `<span class="pv-t">${icon('eye')}Voorbeeld: <b>${esc(d.name)}</b> · ${sz.w}×${sz.h} · ${Math.round(P.scale * 100)}%</span>` +
      `<span class="pv-seg"><button data-o="land" class="${P.st.orient === 'land' ? 'act' : ''}">Liggend</button><button data-o="port" class="${P.st.orient === 'port' ? 'act' : ''}">Staand</button></span>` +
      `<button class="pv-x" data-off>${icon('x')}Uit</button>`;
    b.querySelectorAll('[data-o]').forEach(x => x.onclick = () => { P.st.orient = x.dataset.o; P.save(); P.apply(); });
    b.querySelector('[data-off]').onclick = () => { P.st.on = false; P.save(); P.apply(); };
  };

  // ---------- bewerkmodus: kader naast het paneel ----------
  const origLayout = E.layout;
  E.layout = () => {
    const sz = P.size();
    if (!sz) { $('#app').style.width = ''; $('#app').style.height = ''; return origLayout(); }
    const vw = window.innerWidth, vh = window.innerHeight;
    const pw = Math.round(Math.min(430, Math.max(330, vw * 0.34)));
    document.documentElement.style.setProperty('--panel-w', pw + 'px');
    const aw = vw - pw - 16, ah = vh - 16;
    const s = Math.min(aw / sz.w, ah / sz.h, 1);
    const x = Math.round(8 + (aw - sz.w * s) / 2), y = Math.round((vh - sz.h * s) / 2);
    const app = $('#app'); app.style.width = sz.w + 'px'; app.style.height = sz.h + 'px';
    app.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    E.scale = s;
  };

  // Na sluiten van de bewerkmodus en na elke volledige herteken het kader terugzetten
  const origClose = E.close;
  E.close = async () => { await origClose(); P.apply(); };
  const origApplyAll = D.applyAll;
  D.applyAll = () => { origApplyAll(); P.apply(); };
  window.addEventListener('resize', () => { if (!D.editing && P.size()) P.apply(); });

  // ---------- instellingen: achterkant → Scherm ----------
  const origRender = E.render.scherm, origWire = E.wire.scherm;
  E.render.scherm = () => {
    const d = P.device(); const sz = P.size();
    const cur = `${window.innerWidth}×${window.innerHeight}`;
    const body =
      `<div class="f"><label>Voorbeeld tonen<small>Alleen in deze browser</small></label><div class="c"><button class="switch${P.st.on ? ' on' : ''}" data-pv-on><i></i></button></div></div>` +
      `<div class="f"><label>Apparaat</label><div class="c"><b>${esc(d.name)}</b></div></div>` +
      `<div class="f"><label>Stand</label><div class="c"><div class="seg"><button data-pv-o="land" class="${P.st.orient === 'land' ? 'act' : ''}">Liggend</button><button data-pv-o="port" class="${P.st.orient === 'port' ? 'act' : ''}">Staand</button></div></div></div>` +
      `<div class="f"><label>Schermmaat<small>Breedte × hoogte in beeldpunten (liggend)</small></label><div class="c"><span class="num"><input type="number" min="300" max="4000" value="${Math.max(d.w, d.h)}" data-pv-w></span>×<span class="num"><input type="number" min="300" max="4000" value="${Math.min(d.w, d.h)}" data-pv-h></span></div></div>` +
      `<p class="note">${d.measured ? '✓ Gemeten op de tablet zelf.' : 'Geschatte maat (1280×800 is gebruikelijk voor dit scherm). Open later deze pagina op de tablet en tik op "Meet dit scherm" voor de exacte maat.'}` +
      `${sz ? `<br>Nu getoond: ${sz.w}×${sz.h} op ${Math.round((E.scale || 1) * 100)}%.` : ''}</p>` +
      `<div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-pv-measure>${icon('resize')}Meet dit scherm (${cur})</button><button class="btn sm ghost" data-pv-reset>${icon('refresh')}Standaard 1280×800</button></div>`;
    return `<section class="grp"><h3>Voorbeeld op tablet</h3>${body}</section>` + origRender();
  };
  E.wire.scherm = async root => {
    const setDev = (w, h, measured) => {
      E.commit(null, () => {
        const s = D.cfg.settings;
        if (!Array.isArray(s.devices) || !s.devices.length) s.devices = [D.clone(DEFAULT_DEV)];
        const d = s.devices.find(x => x.id === P.st.dev) || s.devices[0];
        d.w = Math.round(Math.max(w, h)); d.h = Math.round(Math.min(w, h)); d.measured = !!measured;
      }, () => { P.apply(); E.refreshPanel(); });
    };
    const on = root.querySelector('[data-pv-on]');
    if (on) on.onclick = () => { P.st.on = !P.st.on; P.save(); P.apply(); E.refreshPanel(); };
    root.querySelectorAll('[data-pv-o]').forEach(b => b.onclick = () => { P.st.orient = b.dataset.pvO; P.save(); P.apply(); E.refreshPanel(); });
    const wi = root.querySelector('[data-pv-w]'), hi = root.querySelector('[data-pv-h]');
    const sizeChange = () => { const w = D.clamp(Number(wi.value) || 0, 300, 4000), h = D.clamp(Number(hi.value) || 0, 300, 4000); setDev(w, h, false); };
    if (wi) wi.onchange = sizeChange; if (hi) hi.onchange = sizeChange;
    const m = root.querySelector('[data-pv-measure]');
    if (m) m.onclick = async () => {
      if (P.st.on) { D.toast('Zet eerst het voorbeeld uit en meet op de tablet zelf', true); return; }
      const w = window.innerWidth, h = window.innerHeight;
      if (!(await D.confirm(`Dit scherm (${Math.max(w, h)}×${Math.min(w, h)}) opslaan als maat van "${P.device().name}"? Doe dit op de tablet zelf, in Fully Kiosk.`, 'Opslaan'))) return;
      setDev(w, h, true); D.toast('Schermmaat opgeslagen');
    };
    const r = root.querySelector('[data-pv-reset]');
    if (r) r.onclick = () => setDev(DEFAULT_DEV.w, DEFAULT_DEV.h, false);
    if (origWire) await origWire(root);
  };
})();
