/* Dimmers en schuifregelaars als knopstijl: vooral verticaal, ook horizontaal en rond.
   Werkt met helderheid (dim), volume, positie van rolluiken, kleurtemperatuur en kleur.
   Bediening: vegen = waarde, tikken = aan/uit (of naar die plek springen, instelbaar),
   lang drukken = alle bediening van het apparaat. De waarde gaat naar Homey bij loslaten. */
(function () {
  const D = window.D; const T = D.tiles; const esc = D.esc;

  // [id, naam, omschrijving, pictogram, standaard-tik, richting]
  const KINDS = [
    ['fv-fill', 'Dimmer: volle balk', 'Verticaal, de hele tegel vult zich van onder naar boven', 'brightness-6', 'toggle', 'v'],
    ['fv-slim', 'Dimmer: smalle balk', 'Verticale smalle balk met naam en procent', 'lightbulb-on-outline', 'toggle', 'v'],
    ['fv-knob', 'Dimmer: schuif met bolletje', 'Dunne verticale baan met een rond schuifje', 'lightbulb-outline', 'toggle', 'v'],
    ['fv-mixer', 'Dimmer: mengpaneel', 'Schuif zoals op een mengpaneel, met streepjes', 'tune-vertical', 'toggle', 'v'],
    ['fv-wall', 'Dimmer: wanddimmer', 'Verticale schuifdimmer in een wandplaat', 'light-switch', 'toggle', 'v'],
    ['fv-glass', 'Dimmer: glazen buis', 'Glazen buis die zich vult met licht', 'test-tube', 'toggle', 'v'],
    ['fv-grad', 'Dimmer: kleurverloop', 'Verticale balk met verloop van donker naar de aan-kleur', 'gradient-vertical', 'toggle', 'v'],
    ['fv-blocks', 'Dimmer: blokjes', '10 blokjes boven elkaar, tik op een blokje', 'view-sequential', 'set', 'v'],
    ['fv-led', 'Dimmer: ledladder', 'Rij lampjes boven elkaar, zoals een volumemeter', 'dots-vertical', 'set', 'v'],
    ['fv-ticks', 'Dimmer: schaal met streepjes', 'Verticale schaal 0–100 met een wijzer', 'ruler', 'set', 'v'],
    ['fv-pm', 'Dimmer: plus en min', 'Plus boven, procent in het midden, min onder', 'plus-minus-variant', 'none', 'v'],
    ['fv-ct', 'Dimmer: warm en koel wit', 'Verticale balk van warm naar koel wit', 'thermometer-lines', 'set', 'v'],
    ['fv-hue', 'Dimmer: kleur', 'Verticale regenboogbalk voor kleurlampen', 'palette', 'set', 'v'],
    ['fh-fill', 'Dimmer: liggende balk', 'Horizontaal, de hele tegel vult zich van links naar rechts', 'brightness-6', 'toggle', 'h'],
    ['fh-knob', 'Dimmer: liggende schuif', 'Dunne horizontale baan met een rond schuifje', 'lightbulb-outline', 'toggle', 'h'],
    ['fh-blocks', 'Dimmer: liggende blokjes', '10 blokjes naast elkaar', 'view-parallel', 'set', 'h'],
    ['fr-arc', 'Dimmer: draaiknop', 'Ronde knop met een meelopende boog', 'knob', 'toggle', 'r'],
    ['fr-ring', 'Dimmer: ring', 'Volle ring die rondloopt, procent in het midden', 'circle-slice-6', 'toggle', 'r'],
  ];
  D.FADER_KINDS = KINDS;
  const K = id => KINDS.find(k => k[0] === id);
  D.isFader = kind => !!K(kind);
  // na 'dim' in het lijstje knopstijlen zetten
  const at = D.BUTTON_KINDS.findIndex(k => k[0] === 'dim') + 1;
  D.BUTTON_KINDS.splice(at, 0, ...KINDS.map(([id, n, sub, ic]) => [id, n, sub, ic]));

  // welke waarde bedient de dimmer?
  const NUM_CAPS = ['dim', 'volume_set', 'windowcoverings_set', 'light_temperature', 'light_hue', 'light_saturation'];
  D.faderCaps = d => NUM_CAPS.filter(c => d.caps[c] && d.caps[c].setable !== false);
  const capFor = (d, kind, o) => {
    if (!d) return null;
    if (o.cap && d.caps[o.cap] && NUM_CAPS.includes(o.cap)) return o.cap;
    if (kind === 'fv-ct') return d.caps.light_temperature ? 'light_temperature' : null;
    if (kind === 'fv-hue') return d.caps.light_hue ? 'light_hue' : null;
    return ['dim', 'volume_set', 'windowcoverings_set'].find(c => d.caps[c]) || D.faderCaps(d)[0] || null;
  };
  // waarde 0..1 zoals getoond (kleurtemperatuur: onder = warm)
  const toShow = (cap, v) => cap === 'light_temperature' ? 1 - v : v;
  const fromShow = toShow;

  const pctText = (cap, p) => cap === 'light_hue' ? `${Math.round(p * 360)}°` : cap === 'light_temperature' ? (p < 0.34 ? 'Warm' : p > 0.66 ? 'Koel' : 'Neutraal') : `${Math.round(p * 100)}%`;

  // ---------- tekenen ----------
  const track = (kind, n) => {
    const st = kind.slice(3);
    if (kind === 'fr-arc') return `<svg class="farc" viewBox="0 0 100 100"><circle class="fa-bg" cx="50" cy="50" r="40" pathLength="100"/><circle class="fa-val" cx="50" cy="50" r="40" pathLength="100"/><g class="fa-knob"><circle cx="50" cy="13" r="5.5"/></g></svg><span class="fpct" data-fpct></span>`;
    if (kind === 'fr-ring') return `<svg class="fring" viewBox="0 0 100 100"><circle class="fa-bg" cx="50" cy="50" r="42" pathLength="100"/><circle class="fa-val" cx="50" cy="50" r="42" pathLength="100"/></svg><span class="fpct" data-fpct></span>`;
    if (st === 'blocks' || st === 'led') return `<div class="fcells">${Array.from({ length: n }, (_, i) => `<i data-i="${i}"></i>`).join('')}</div>`;
    if (st === 'ticks') return `<div class="fscale">${Array.from({ length: 11 }, (_, i) => `<i style="--t:${i * 10}"><em>${i % 5 === 0 ? 100 - i * 10 : ''}</em></i>`).join('')}</div><b class="fmark"></b>`;
    if (st === 'mixer') return `<div class="fslot"></div><div class="fscale">${Array.from({ length: 11 }, (_, i) => `<i style="--t:${i * 10}"></i>`).join('')}</div><b class="fcap"></b>`;
    if (st === 'wall') return `<div class="fplate"><div class="fslot"></div><b class="flever"></b></div>`;
    if (st === 'glass') return `<div class="ftube"><i class="fliquid"></i><i class="fshine"></i></div>`;
    if (st === 'knob' || st === 'ct' || st === 'hue') return `<div class="fline"><i class="fdone"></i></div><b class="fball"></b>`;
    return `<i class="ffill"></i>`;
  };

  T.button.render = (orig => function (t, inner, el) {
    const o = t.opts || {}; const kind = o.kind || 'glow';
    if (!K(kind)) return orig.call(this, t, inner, el);
    if (el._fdrag) return; // niet hertekenen tijdens het vegen
    const [, , , dIc, dTap, dir] = K(kind); const r = t.ref || {};
    const d = r.target === 'device' ? D.dev(r.deviceId) : null;
    if (r.target === 'device' && !d) { inner.innerHTML = `<div class="empty">${icon('chip')}<span>Apparaat niet gevonden</span></div>`; return; }
    const cap = capFor(d, kind, o); const c = d && cap ? d.caps[cap] : null;
    const onoff = d && d.caps.onoff ? !!d.caps.onoff.value : null;
    let v = c && typeof c.value === 'number' ? D.clamp(toShow(cap, c.value), 0, 1) : 0;
    const preview = o._preview !== undefined;
    if (preview) v = o._preview ? 0.65 : 0.2;
    const active = preview ? !!o._preview : cap === 'dim' && onoff !== null ? onoff : cap === 'light_hue' || cap === 'light_temperature' ? (onoff !== null ? onoff : true) : v > 0;
    const shown = cap === 'dim' && !active && !preview ? 0 : v; // uit = leeg
    const n = 10; const st = kind.slice(3);
    const ic = D.pic(t, active, ({ dim: 'bulb', volume_set: 'speaker', windowcoverings_set: 'blinds', light_temperature: 'thermo', light_hue: 'palette' })[cap] || 'bulb');
    el.classList.toggle('nolink', !r.target || r.target === 'none');
    el.classList.toggle('offline', !!d && !d.available); el.classList.remove('on');
    el.classList.toggle('is-on', !!active); el.classList.remove('alarm-on');
    el.style.setProperty('--kon', o.colorOn || 'var(--on)');
    if (o.colorOff) el.style.setProperty('--koff', o.colorOff); else el.style.removeProperty('--koff');
    const label = o.label !== false ? `<div class="kb-label">${esc(D.titleOf(t))}</div>` : '';
    const stateTxt = !d && !preview ? '' : active || cap !== 'dim' ? pctText(cap, shown) : 'Uit';
    const state = o.state !== false ? `<div class="kb-state" data-fstate>${esc(stateTxt)}</div>` : '';
    const svg = anyIcon(ic, '', { brand: o.brand !== false });
    const pm = kind === 'fv-pm';
    const body = pm
      ? `<button class="fpm nopress" data-pm="1">${icon('plus')}</button><div class="fpmv"><span class="kb-mini">${svg}</span><b data-fpct></b>${label}</div><button class="fpm nopress" data-pm="-1">${icon('minus')}</button>`
      : (dir === 'h' ? `<div class="kb-row"><span class="kb-mini">${svg}</span><div class="kb-txt">${label}${state}</div></div>` : dir === 'r' ? `<div class="kb-txt">${label}</div>` : `<div class="kb-txt">${label}${state}</div>`) +
        `<div class="ftrack nopress" data-ftrack>${track(kind, n)}${['fill', 'grad'].includes(st) && dir !== 'r' ? `<span class="fic">${svg}</span>` : ''}</div>`;
    inner.innerHTML = `<div class="kb fd fd-${st} fd-${dir}${active ? ' is-on' : ''}${o.label === false && o.state === false ? ' nolabel' : ''}">${body}</div>`;
    const box = inner.querySelector('.fd');
    const paint = p => {
      box.style.setProperty('--pv', Math.round(p * 1000) / 10);
      const cells = Math.round(p * n);
      box.querySelectorAll('[data-i]').forEach(b => { const i = +b.dataset.i; b.classList.toggle('on', (dir === 'v' ? n - 1 - i : i) < cells); });
      const s = box.querySelector('[data-fstate]'); const txt = pctText(cap, p);
      if (s) s.textContent = cap === 'dim' && p === 0 && !preview ? 'Uit' : txt;
      box.querySelectorAll('[data-fpct]').forEach(x => { x.textContent = txt; });
      const val = box.querySelector('.fa-val');
      if (val) val.setAttribute('stroke-dasharray', `${(kind === 'fr-arc' ? 75 : 100) * p} 100`);
      const kn = box.querySelector('.fa-knob'); if (kn) kn.setAttribute('transform', `rotate(${-135 + 270 * p} 50 50)`);
    };
    paint(shown);
    if (cap === 'light_hue') box.style.setProperty('--fhue', `hsl(${Math.round(v * 360)} 100% 50%)`);

    const send = async p => {
      if (!d || !cap) return;
      if (!(await guardT(t))) { paint(shown); return; }
      const val = Math.round(fromShow(cap, p) * 100) / 100;
      D.playFor(el);
      if (cap === 'dim' && val > 0 && onoff === false) D.setCap(d.id, 'onoff', true);
      D.setCap(d.id, cap, val);
    };
    const stepOf = () => Number(o.step) || (['blocks', 'led'].includes(st) ? 0.1 : pm ? 0.1 : 0.01);
    const snap = p => { const s = stepOf(); return D.clamp(Math.round(p / s) * s, 0, 1); };
    const tapAct = o.tapAct || dTap;
    const toggle = async () => {
      if (!d) return;
      if (!(await guardT(t))) return;
      D.playFor(el);
      if (d.caps.onoff && d.caps.onoff.setable !== false) D.setCap(d.id, 'onoff', !d.caps.onoff.value);
      else if (cap) D.setCap(d.id, cap, fromShow(cap, v > 0 ? 0 : 1));
    };

    if (pm) {
      inner.querySelectorAll('[data-pm]').forEach(b => b.onclick = () => { const p = snap(shown + Number(b.dataset.pm) * stepOf()); paint(p); send(p); });
      D.pressable(el, { tap: null, long: d ? () => T.device.sheet(d.id) : null });
      return;
    }
    // vegen en tikken op de baan
    const tr = inner.querySelector('[data-ftrack]');
    const posToVal = e => {
      const b = tr.getBoundingClientRect();
      if (dir === 'v') return D.clamp(1 - (e.clientY - b.top) / b.height, 0, 1);
      if (dir === 'h') return D.clamp((e.clientX - b.left) / b.width, 0, 1);
      const a = Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2))) * 180 / Math.PI; // 0 = boven, met de klok mee
      if (kind === 'fr-ring') return D.clamp(((a + 360) % 360) / 360, 0, 1);
      return D.clamp((a + 135) / 270, 0, 1);
    };
    let start = null, cur = shown, moved = false, longT = null;
    tr.onpointerdown = e => {
      if (D.editing) return;
      e.preventDefault(); tr.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, p: shown }; moved = false; cur = shown; el._fdrag = true;
      clearTimeout(longT); longT = setTimeout(() => { if (!moved && start) { start = null; el._fdrag = false; if (navigator.vibrate) navigator.vibrate(15); if (d) T.device.sheet(d.id); } }, 550);
    };
    tr.onpointermove = e => {
      if (!start) return;
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return;
      moved = true; clearTimeout(longT);
      // volle balken: relatief vegen (zoals op een telefoon); de rest: naar de plek van je vinger
      if (['fill', 'grad', 'glass', 'slim'].includes(st)) {
        const b = tr.getBoundingClientRect();
        const delta = dir === 'v' ? -(e.clientY - start.y) / b.height : (e.clientX - start.x) / b.width;
        cur = snap(start.p + delta);
      } else cur = snap(posToVal(e));
      paint(cur);
    };
    tr.onpointerup = tr.onpointercancel = e => {
      clearTimeout(longT);
      if (!start) { el._fdrag = false; return; }
      const wasMoved = moved; start = null; el._fdrag = false;
      if (e.type === 'pointercancel') { paint(shown); return; }
      if (wasMoved) { send(cur); return; }
      if (tapAct === 'toggle') toggle();
      else if (tapAct === 'set') { const p = snap(posToVal(e)); paint(p); send(p); }
    };
    // tikken naast de baan (op de naam): aan/uit; lang drukken: alle bediening
    D.pressable(el, { tap: tapAct === 'none' ? null : () => toggle(), long: d ? () => T.device.sheet(d.id) : null });
  })(T.button.render);

  const guardT = async t => !(t.style && t.style.confirm) || D.confirm(`${D.titleOf(t)}: weet je het zeker?`);
})();
