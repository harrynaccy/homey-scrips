/* Tegeltypes */
(function () {
  const D = window.D; const esc = D.esc;
  const tiles = D.tiles = {};

  // ---------- gedeelde hulpfuncties ----------
  const CLASS_ICON = { light: 'bulb', socket: 'plug', thermostat: 'thermo', heater: 'thermo', sensor: 'activity', lock: 'lock', windowcoverings: 'blinds', blinds: 'blinds', curtain: 'blinds', sunshade: 'blinds', speaker: 'speaker', amplifier: 'speaker', tv: 'tv', fan: 'fan', garagedoor: 'garage', doorbell: 'bell', homealarm: 'bell', button: 'power', kettle: 'plug', coffeemachine: 'plug', camera: 'eye', airconditioning: 'fan', vacuumcleaner: 'chip' };
  D.devIcon = d => CLASS_ICON[d.virtualClass] || CLASS_ICON[d.class] || 'chip';
  D.devKind = d => {
    const c = d.caps;
    if (c.windowcoverings_set || c.windowcoverings_state) return 'cover';
    if (c.target_temperature) return 'thermostat';
    if (c.locked) return 'lock';
    if (c.onoff) return 'switch';
    if (c.button) return 'button';
    return 'sensor';
  };
  D.fmt = (c, id) => {
    if (!c) return '–'; const v = c.value; id = id || c.id;
    if (v === null || v === undefined) return '–';
    if (typeof v === 'boolean') {
      if (id === 'onoff') return v ? 'Aan' : 'Uit';
      if (id === 'locked') return v ? 'Op slot' : 'Open';
      if (id === 'alarm_contact') return v ? 'Open' : 'Dicht';
      if (id === 'alarm_motion') return v ? 'Beweging' : 'Rust';
      if (id.startsWith('alarm_')) return v ? 'Alarm' : 'OK';
      return v ? 'Ja' : 'Nee';
    }
    if (typeof v === 'number') {
      if (id === 'dim' || id === 'windowcoverings_set' || id === 'volume_set' || (c.max === 1 && c.min === 0 && c.type === 'number')) return Math.round(v * 100) + '%';
      const dec = c.decimals ?? (Math.abs(v) < 100 && v % 1 ? 1 : 0);
      return v.toLocaleString('nl-NL', { maximumFractionDigits: dec, minimumFractionDigits: 0 }) + (c.units ? (c.units === '%' || c.units.startsWith('°') ? '' : ' ') + c.units : '');
    }
    if (typeof v === 'string' && c.values) { const o = c.values.find(x => x.id === v); if (o) return o.title; }
    return String(v);
  };
  const MEASURE_ORDER = ['measure_temperature', 'measure_power', 'measure_humidity', 'measure_luminance', 'measure_co2', 'meter_power', 'measure_battery'];
  D.measures = d => Object.keys(d.caps).filter(k => k.startsWith('measure_') || k.startsWith('meter_') || k.startsWith('alarm_'))
    .sort((a, b) => (MEASURE_ORDER.indexOf(a) + 1 || 99) - (MEASURE_ORDER.indexOf(b) + 1 || 99));

  // tik / lang drukken
  D.pressable = (el, { tap, long }) => {
    let timer, start, moved, longed;
    el.onpointerdown = e => {
      if (D.editing || e.target.closest('.nopress')) return;
      start = { x: e.clientX, y: e.clientY }; moved = false; longed = false; el.classList.add('pressing');
      if (long) timer = setTimeout(() => { longed = true; el.classList.remove('pressing'); if (navigator.vibrate) navigator.vibrate(15); long(e); }, 550);
    };
    el.onpointermove = e => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) { moved = true; clearTimeout(timer); el.classList.remove('pressing'); } };
    el.onpointerup = e => { clearTimeout(timer); el.classList.remove('pressing'); if (start && !moved && !longed && tap && !D.editing && !e.target.closest('.nopress')) tap(e); start = null; };
    el.onpointercancel = el.onpointerleave = () => { clearTimeout(timer); el.classList.remove('pressing'); start = null; };
  };
  const guard = async (t, text) => !(t.style && t.style.confirm) || D.confirm(text || `${titleOf(t)}: weet je het zeker?`);
  const flash = (el, ok = true) => { el.classList.remove('flash-ok', 'flash-bad'); void el.offsetWidth; el.classList.add(ok ? 'flash-ok' : 'flash-bad'); };
  const titleOf = t => (t.opts && t.opts.title) || (tiles[t.type].title ? tiles[t.type].title(t) : tiles[t.type].label);
  D.titleOf = titleOf;
  const head = (t, ic, sub, on) => `<div class="hd"><span class="badge${on ? ' on' : ''}">${anyIcon(ic)}</span><div class="ht"><div class="name">${esc(titleOf(t))}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
  const size = t => ({ big: t.w * t.h >= 6 || (t.w >= 3 && t.h >= 2), wide: t.w >= 3, tall: t.h >= 3 });

  // schuifregelaar
  D.slider = (cls, val, min, max, step, onChange, onInput) => {
    const id = D.uid('s');
    setTimeout(() => {
      const inp = document.getElementById(id); if (!inp) return;
      inp.addEventListener('input', () => { inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%'); onInput && onInput(Number(inp.value)); });
      inp.addEventListener('change', () => onChange(Number(inp.value)));
    });
    return `<input id="${id}" type="range" class="rng nopress ${cls || ''}" min="${min}" max="${max}" step="${step}" value="${val}" style="--p:${((val - min) / (max - min) * 100)}%">`;
  };

  // ---------- Apparaat ----------
  tiles.device = {
    label: 'Apparaat', icon: 'bulb', size: [3, 2],
    title: t => { const d = D.dev(t.ref.deviceId); return d ? d.name : 'Apparaat niet gevonden'; },
    render(t, inner, el) {
      const d = D.dev(t.ref.deviceId);
      if (!d) { inner.innerHTML = `<div class="empty">${icon('chip')}<span>Apparaat niet gevonden</span></div>`; return; }
      const view = (t.opts && t.opts.view) || 'auto'; const kind = D.devKind(d); const c = d.caps; const sz = size(t);
      const on = c.onoff ? !!c.onoff.value : (c.locked ? !!c.locked.value : false);
      el.classList.toggle('on', kind === 'switch' && on);
      el.classList.toggle('offline', !d.available);
      const zone = t.opts && t.opts.showZone === false ? '' : D.zoneName(d.zone);

      if (view === 'value' || kind === 'sensor') {
        const capId = (t.opts && t.opts.cap) || D.measures(d)[0];
        const main = c[capId]; const rest = D.measures(d).filter(k => k !== capId).slice(0, sz.big ? 4 : 0);
        const alarm = main && typeof main.value === 'boolean' && main.value;
        inner.innerHTML = head(t, t.opts.mdi || D.devIcon(d), esc(zone), alarm) +
          `<div class="big${alarm ? ' alarm' : ''}">${esc(D.fmt(main, capId))}</div>` +
          (rest.length ? `<div class="chips">${rest.map(k => `<span class="chip${typeof c[k].value === 'boolean' && c[k].value ? ' alert' : ''}">${esc(D.fmt(c[k], k))}</span>`).join('')}</div>` : '');
        D.pressable(el, { long: () => tiles.device.sheet(d.id) });
        return;
      }
      if (kind === 'thermostat') {
        const tg = c.target_temperature; const cur = c.measure_temperature;
        const step = tg.step || 0.5;
        inner.innerHTML = head(t, t.opts.mdi || 'thermo', esc(zone)) +
          `<div class="big">${cur ? esc(D.fmt(cur)) : esc(D.fmt(tg))}</div>` +
          `<div class="stepper nopress"><button class="rb" data-s="-1">${icon('minus')}</button><span>${esc(D.fmt(tg))}</span><button class="rb" data-s="1">${icon('plus')}</button></div>`;
        inner.querySelectorAll('[data-s]').forEach(b => b.onclick = () => D.setCap(d.id, 'target_temperature', D.clamp(Math.round((tg.value + step * Number(b.dataset.s)) * 100) / 100, tg.min ?? 5, tg.max ?? 35)));
        D.pressable(el, { long: () => tiles.device.sheet(d.id) });
        return;
      }
      if (kind === 'cover') {
        const pos = c.windowcoverings_set;
        inner.innerHTML = head(t, t.opts.mdi || 'blinds', pos ? `${esc(zone)} · ${esc(D.fmt(pos))}` : esc(zone)) +
          `<div class="btnrow nopress"><button class="rb" data-p="1">${icon('up')}</button>${c.windowcoverings_state ? `<button class="rb" data-st="idle">${icon('stop')}</button>` : ''}<button class="rb" data-p="0">${icon('down')}</button></div>` +
          (pos && sz.big ? D.slider('', pos.value, 0, 1, 0.01, v => D.setCap(d.id, 'windowcoverings_set', v)) : '');
        inner.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => { if (await guard(t)) pos ? D.setCap(d.id, 'windowcoverings_set', Number(b.dataset.p)) : D.setCap(d.id, 'windowcoverings_state', b.dataset.p === '1' ? 'up' : 'down'); });
        inner.querySelectorAll('[data-st]').forEach(b => b.onclick = () => D.setCap(d.id, 'windowcoverings_state', 'idle'));
        D.pressable(el, { long: () => tiles.device.sheet(d.id) });
        return;
      }
      if (kind === 'lock') {
        const lk = !!c.locked.value;
        inner.innerHTML = head(t, t.opts.mdi || (lk ? 'lock' : 'unlock'), esc(zone), !lk) + `<div class="big${lk ? '' : ' alarm'}">${lk ? 'Op slot' : 'Open'}</div><div class="hint">Tik om te ${lk ? 'openen' : 'vergrendelen'}</div>`;
        D.pressable(el, { tap: async () => { if (await D.confirm(`${d.name} ${lk ? 'openen' : 'vergrendelen'}?`)) D.setCap(d.id, 'locked', !lk); }, long: () => tiles.device.sheet(d.id) });
        return;
      }
      if (kind === 'button') {
        inner.innerHTML = head(t, t.opts.mdi || 'power', esc(zone)) + `<div class="big sm">Druk</div>`;
        D.pressable(el, { tap: async () => { if (await guard(t)) { D.setCap(d.id, 'button', true); flash(el); } } });
        return;
      }
      // schakelaar / lamp
      const parts = [];
      if (on && c.dim) parts.push(D.fmt(c.dim));
      if (c.measure_power && c.measure_power.value !== null) parts.push(D.fmt(c.measure_power));
      const state = (on ? 'Aan' : 'Uit') + (parts.length ? ' · ' + parts.join(' · ') : '');
      let color = '';
      if (on && c.light_hue && c.light_saturation && (!c.light_mode || c.light_mode.value !== 'temperature')) color = `hsl(${Math.round(c.light_hue.value * 360)},${Math.round(c.light_saturation.value * 100)}%,60%)`;
      if (color) el.style.setProperty('--lamp', color); else el.style.removeProperty('--lamp');
      const showSlider = c.dim && view !== 'toggle' && (sz.big || view === 'slider');
      inner.innerHTML = head(t, t.opts.mdi || D.devIcon(d), esc(zone), on) + `<div class="state">${esc(state)}</div>` +
        (showSlider ? D.slider('', c.dim.value ?? 0, 0, 1, 0.01, v => D.setCap(d.id, 'dim', v)) : '');
      D.pressable(el, { tap: async () => { if (await guard(t)) D.setCap(d.id, 'onoff', !on); }, long: () => tiles.device.sheet(d.id) });
    },
    // detailvenster met alle bediening
    sheet(id) { D._sheetDevice = id; D.openSheet('<div id="devsheet"></div>'); tiles.device.refreshSheet(id); },
    refreshSheet(id) {
      const box = document.getElementById('devsheet'); const d = D.dev(id); if (!box || !d) return;
      if (box.contains(document.activeElement) && document.activeElement.type === 'range') return;
      const c = d.caps; const rows = [];
      const sw = (cap, label) => `<div class="srow"><span>${label}</span><button class="switch${c[cap].value ? ' on' : ''}" data-bool="${cap}"><i></i></button></div>`;
      if (c.onoff) rows.push(sw('onoff', 'Aan/uit'));
      if (c.dim) rows.push(`<div class="srow col"><span>Helderheid <b>${D.fmt(c.dim)}</b></span>${D.slider('', c.dim.value ?? 0, 0, 1, 0.01, v => D.setCap(id, 'dim', v))}</div>`);
      if (c.light_hue) rows.push(`<div class="srow col"><span>Kleur</span>${D.slider('hue', c.light_hue.value ?? 0, 0, 1, 0.005, v => { if (c.light_mode) D.setCap(id, 'light_mode', 'color'); D.setCap(id, 'light_hue', v); })}</div>`);
      if (c.light_saturation) rows.push(`<div class="srow col"><span>Verzadiging</span>${D.slider('sat', c.light_saturation.value ?? 0, 0, 1, 0.01, v => D.setCap(id, 'light_saturation', v))}</div>`);
      if (c.light_temperature) rows.push(`<div class="srow col"><span>Wit (warm ↔ koel)</span>${D.slider('ct', 1 - (c.light_temperature.value ?? 0.5), 0, 1, 0.01, v => { if (c.light_mode) D.setCap(id, 'light_mode', 'temperature'); D.setCap(id, 'light_temperature', 1 - v); })}</div>`);
      if (c.target_temperature) { const tg = c.target_temperature; rows.push(`<div class="srow"><span>Doeltemperatuur</span><div class="stepper"><button class="rb" data-tt="-1">${icon('minus')}</button><span>${D.fmt(tg)}</span><button class="rb" data-tt="1">${icon('plus')}</button></div></div>`); }
      if (c.windowcoverings_set) rows.push(`<div class="srow col"><span>Positie <b>${D.fmt(c.windowcoverings_set)}</b></span>${D.slider('', c.windowcoverings_set.value ?? 0, 0, 1, 0.01, v => D.setCap(id, 'windowcoverings_set', v))}</div>`);
      if (c.volume_set) rows.push(`<div class="srow col"><span>Volume <b>${D.fmt(c.volume_set)}</b></span>${D.slider('', c.volume_set.value ?? 0, 0, 1, 0.01, v => D.setCap(id, 'volume_set', v))}</div>`);
      if (c.locked) rows.push(sw('locked', 'Vergrendeld'));
      for (const [k, cp] of Object.entries(c)) {
        if (['onoff', 'dim', 'light_hue', 'light_saturation', 'light_temperature', 'light_mode', 'target_temperature', 'windowcoverings_set', 'volume_set', 'locked'].includes(k)) continue;
        if (cp.setable && cp.type === 'boolean') rows.push(sw(k, esc(cp.title || k)));
        else if (cp.setable && cp.type === 'enum' && cp.values) rows.push(`<div class="srow"><span>${esc(cp.title || k)}</span><select data-enum="${k}">${cp.values.map(o => `<option value="${esc(o.id)}"${o.id === cp.value ? ' selected' : ''}>${esc(o.title)}</option>`).join('')}</select></div>`);
      }
      const ms = D.measures(d);
      box.innerHTML = `<div class="sheet-hd"><span class="badge big${c.onoff && c.onoff.value ? ' on' : ''}">${icon(D.devIcon(d))}</span><div><h2>${esc(d.name)}</h2><div class="sub">${esc(D.zoneName(d.zone))}${d.available ? '' : ' · niet bereikbaar'}</div></div><button class="xbtn" data-close>${icon('x')}</button></div>` +
        rows.join('') + (ms.length ? `<div class="mgrid">${ms.map(k => `<div class="m"><small>${esc(c[k].title || k)}</small><b>${esc(D.fmt(c[k], k))}</b></div>`).join('')}</div>` : '');
      box.querySelector('[data-close]').onclick = () => D.closeSheet();
      box.querySelectorAll('[data-bool]').forEach(b => b.onclick = async () => { const k = b.dataset.bool; if (k === 'locked' && !(await D.confirm(`${d.name} ${c.locked.value ? 'openen' : 'vergrendelen'}?`))) return; D.setCap(id, k, !c[k].value); });
      box.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { const tg = c.target_temperature; D.setCap(id, 'target_temperature', D.clamp(Math.round((tg.value + (tg.step || 0.5) * Number(b.dataset.tt)) * 100) / 100, tg.min ?? 5, tg.max ?? 35)); });
      box.querySelectorAll('[data-enum]').forEach(s => s.onchange = () => D.setCap(id, s.dataset.enum, s.value));
    },
  };


  // ---------- Knop / pictogram (gekoppeld aan apparaat, flow of mood) ----------
  // Knopstijlen: [sleutel, naam, uitleg, standaard-pictogram]
  D.BUTTON_KINDS = [
    ['3d', 'Drukknop 3D', 'Steekt uit als het uit is, ingedrukt als het aan is', 'power'],
    ['glow', 'Verlichte knop', 'Neutraal als het uit is, licht op als het aan is', 'lightbulb'],
    ['rocker', 'Wandschakelaar', 'Klassieke tuimelschakelaar, klapt om', 'light-switch'],
    ['rockerled', 'Schakelaar met led', 'Wandschakelaar met een ledje dat brandt als het aan is', 'light-switch'],
    ['ring', 'Ronde knop met ring', 'Rond pictogram, de ring licht op als het aan is', 'lightbulb-outline'],
    ['toggle', 'Schuifschakelaar', 'Schuifje zoals op je telefoon', 'toggle-switch'],
    ['dim', 'Dimknop', 'Tik = aan/uit, schuif = helderheid', 'brightness-6'],
    ['scene', 'Scène- of flowknop', 'Start een flow of mood en licht kort op', 'palette'],
    ['panic', 'Paniek- of alarmknop', 'Rode knop, vraagt altijd eerst om bevestiging', 'alarm-light'],
    ['cover', 'Rolluikknoppen', 'Omhoog, stop en omlaag', 'window-shutter'],
    ['icon', 'Pictogram', 'Alleen het pictogram, kleurt mee met de toestand', 'lightbulb'],
  ];
  const CAP_ORDER = ['onoff', 'alarm_contact', 'alarm_motion', 'alarm_smoke', 'alarm_water', 'alarm_co', 'alarm_tamper', 'locked'];
  D.btnCap = (d, kind) => {
    if (!d) return null; const c = d.caps;
    if (kind === 'dim' && c.dim) return 'dim';
    if (kind === 'cover') return c.windowcoverings_set ? 'windowcoverings_set' : c.windowcoverings_state ? 'windowcoverings_state' : null;
    for (const k of CAP_ORDER) if (c[k]) return k;
    const b = Object.keys(c).find(k => c[k].type === 'boolean'); if (b) return b;
    if (c.dim) return 'dim'; if (c.windowcoverings_set) return 'windowcoverings_set';
    return D.measures(d)[0] || Object.keys(c)[0] || null;
  };
  // Standaard-pictogram (naam in de bibliotheek) bij een apparaat
  const CLASS_MDI = { light: 'lightbulb', socket: 'power-socket-eu', thermostat: 'thermostat', heater: 'radiator', lock: 'lock', windowcoverings: 'window-shutter', blinds: 'window-shutter', curtain: 'curtains', sunshade: 'window-shutter', speaker: 'speaker', amplifier: 'speaker', tv: 'television', fan: 'fan', garagedoor: 'garage', doorbell: 'doorbell', homealarm: 'shield-home', kettle: 'kettle', coffeemachine: 'coffee-maker', camera: 'cctv', airconditioning: 'air-conditioner', vacuumcleaner: 'robot-vacuum', button: 'gesture-tap-button' };
  const CAP_MDI = { alarm_contact: 'door-open', alarm_motion: 'motion-sensor', alarm_smoke: 'smoke-detector', alarm_water: 'water-alert', alarm_co: 'molecule-co', locked: 'lock', measure_temperature: 'thermometer' };
  D.defaultMdiName = (kind, ref) => {
    const K = D.BUTTON_KINDS.find(k => k[0] === kind) || D.BUTTON_KINDS[0];
    if (['cover', 'panic'].includes(kind)) return K[3];
    if (ref && ref.target === 'flow') return kind === 'scene' ? 'play-circle' : K[3];
    if (ref && ref.target === 'mood') return 'palette';
    const d = ref && ref.target === 'device' ? D.dev(ref.deviceId) : null;
    if (d) { const cap = D.btnCap(d, kind); return CLASS_MDI[d.virtualClass] || CLASS_MDI[d.class] || CAP_MDI[cap] || (d.caps.onoff ? 'power' : K[3]); }
    return K[3];
  };
  D.btnTargetName = ref => {
    if (!ref || !ref.target || ref.target === 'none') return '';
    if (ref.target === 'device') { const d = D.dev(ref.deviceId); return d ? d.name : 'Apparaat niet gevonden'; }
    if (ref.target === 'flow') { const f = [...D.lib.flows, ...D.lib.advancedFlows].find(x => x.id === ref.id); return f ? f.name : 'Flow niet gevonden'; }
    if (ref.target === 'mood') { const m = D.lib.moods.find(x => x.id === ref.id); return m ? m.name : 'Mood niet gevonden'; }
    return '';
  };
  const runTarget = async (t, el) => {
    const r = t.ref || {};
    const url = r.target === 'flow' ? `/api/flow/${r.flowType || 'flow'}/${r.id}` : r.target === 'mood' ? `/api/mood/${r.id}` : null;
    if (!url) return;
    const k = el.querySelector('.kb'); if (k) { k.classList.remove('hit'); void k.offsetWidth; k.classList.add('hit'); }
    try { await D.api('POST', url); flash(el); } catch (e) { flash(el, false); D.toast('Mislukt: ' + e.message, true); }
  };
  tiles.button = {
    label: 'Knop', icon: 'knob', size: [2, 2],
    title: t => D.btnTargetName(t.ref) || (D.BUTTON_KINDS.find(k => k[0] === t.opts.kind) || [0, 'Knop'])[1],
    render(t, inner, el) {
      const o = t.opts || {}; const kind = o.kind || 'glow'; const r = t.ref || {};
      const d = r.target === 'device' ? D.dev(r.deviceId) : null;
      if (r.target === 'device' && !d) { inner.innerHTML = `<div class="empty">${icon('chip')}<span>Apparaat niet gevonden</span></div>`; return; }
      const cap = d ? (o.cap && d.caps[o.cap] ? o.cap : D.btnCap(d, kind)) : null; const cp = d && cap ? d.caps[cap] : null;
      const val = cp ? cp.value : null;
      const on = kind === 'cover' ? (typeof val === 'number' ? val > 0.01 : val === 'up') : typeof val === 'number' ? val > 0 : !!val;
      const isAlarm = cap && cap.startsWith('alarm_');
      // toestandstekst
      let state = '';
      if (d) {
        if (cap === 'onoff') { state = on ? 'Aan' : 'Uit'; if (on && d.caps.dim && kind !== 'dim') state += ' · ' + D.fmt(d.caps.dim); }
        else state = D.fmt(cp, cap);
        if (kind === 'dim' && d.caps.onoff && !d.caps.onoff.value) state = 'Uit';
      }
      const dimOn = kind === 'dim' && d && d.caps.onoff ? !!d.caps.onoff.value : on;
      const active = o._preview !== undefined ? o._preview : kind === 'dim' ? dimOn : on; // _preview: voorbeeld in het menu
      const ic = o.mdi || D.BUTTON_KINDS.find(k => k[0] === kind)?.[3] || 'power';
      el.classList.toggle('offline', !!d && !d.available); el.classList.remove('on'); el.style.removeProperty('--lamp');
      el.style.setProperty('--kon', o.colorOn || (isAlarm ? '#ff8a5c' : 'var(--on)'));
      if (o.colorOff) el.style.setProperty('--koff', o.colorOff); else el.style.removeProperty('--koff');
      const showLabel = o.label !== false, showState = o.state !== false && !!state;
      const label = showLabel ? `<div class="kb-label">${esc(titleOf(t))}</div>` : '';
      const st = showState ? `<div class="kb-state">${esc(state)}</div>` : '';
      const svg = anyIcon(ic);
      let face;
      if (kind === 'rocker' || kind === 'rockerled') face = `<div class="face"><div class="paddle">${svg}${kind === 'rockerled' ? '<i class="led"></i>' : ''}</div></div>`;
      else if (kind === 'panic') face = `<div class="face"><div class="cap">${svg}</div></div>`;
      else face = `<div class="face">${svg}</div>`;
      let body;
      if (kind === 'cover') {
        body = `<div class="kb-row">${label ? `<span class="kb-mini">${svg}</span>` : ''}<div>${label}${st}</div></div><div class="face">${svg}</div><div class="btnrow nopress"><button class="rb" data-p="up">${icon('up')}</button><button class="rb" data-p="idle">${icon('stop')}</button><button class="rb" data-p="down">${icon('down')}</button></div>`;
      } else if (kind === 'dim') {
        body = `<div class="kb-row"><div class="face sm">${svg}</div><div class="kb-txt">${label}${st}</div></div>` + (d && d.caps.dim ? D.slider('', d.caps.dim.value ?? 0, 0, 1, 0.01, v => D.setCap(d.id, 'dim', v)) : '');
      } else if (kind === 'toggle') {
        body = `<div class="kb-row"><div class="face sm">${svg}</div><div class="kb-txt">${label}${st}</div></div><div class="kb-sw"><span class="switch${active ? ' on' : ''}"><i></i></span></div>`;
      } else body = face + (label || st ? `<div class="kb-txt">${label}${st}</div>` : '');
      inner.innerHTML = `<div class="kb kb-${kind}${active ? ' is-on' : ''}${isAlarm ? ' is-alarm' : ''}${!showLabel && !showState ? ' nolabel' : ''}">${body}</div>`;

      if (kind === 'cover') {
        inner.querySelectorAll('[data-p]').forEach(b => b.onclick = async () => {
          if (!d || !(await guard(t))) return; const p = b.dataset.p;
          if (p === 'idle') { if (d.caps.windowcoverings_state) D.setCap(d.id, 'windowcoverings_state', 'idle'); return; }
          if (d.caps.windowcoverings_set) D.setCap(d.id, 'windowcoverings_set', p === 'up' ? 1 : 0);
          else if (d.caps.windowcoverings_state) D.setCap(d.id, 'windowcoverings_state', p);
        });
        D.pressable(el, { long: d ? () => tiles.device.sheet(d.id) : null });
        return;
      }
      const tap = async () => {
        if (!r.target || r.target === 'none') return;
        if (kind === 'panic') { if (!(await D.confirm(`${titleOf(t)}: weet je het zeker?`, 'Ja, doorgaan'))) return; }
        else if (!(await guard(t))) return;
        if (r.target !== 'device') return runTarget(t, el);
        const tc = kind === 'dim' && d.caps.onoff ? 'onoff' : cap; const c = d.caps[tc];
        if (!c || !c.setable) { tiles.device.sheet(d.id); return; }
        if (tc === 'locked' && kind !== 'panic' && !(await D.confirm(`${d.name} ${c.value ? 'openen' : 'vergrendelen'}?`))) return;
        if (c.type === 'boolean' || typeof c.value === 'boolean') D.setCap(d.id, tc, !c.value);
        else if (tc === 'dim') D.setCap(d.id, 'dim', c.value > 0 ? 0 : 1);
        else tiles.device.sheet(d.id);
        if (kind === 'scene' || kind === 'panic') { const k = el.querySelector('.kb'); if (k) { k.classList.remove('hit'); void k.offsetWidth; k.classList.add('hit'); } }
      };
      D.pressable(el, { tap, long: d ? () => tiles.device.sheet(d.id) : null });
    },
  };

  // ---------- Zone ----------
  tiles.zone = {
    label: 'Zone', icon: 'home', size: [3, 4],
    title: t => D.zoneName(t.ref.zoneId) || 'Zone',
    render(t, inner) {
      const devs = D.lib.devices.filter(d => d.zone === t.ref.zoneId);
      const sw = devs.filter(d => d.caps.onoff); const onN = sw.filter(d => d.caps.onoff.value).length;
      const temp = devs.map(d => d.caps.measure_temperature).find(Boolean);
      inner.innerHTML = head(t, 'home', `${onN} van ${sw.length} aan${temp ? ' · ' + esc(D.fmt(temp)) : ''}`, onN > 0) +
        `<div class="list nopress">${sw.map(d => `<div class="li" data-d="${d.id}"><span class="lic${d.caps.onoff.value ? ' on' : ''}">${icon(D.devIcon(d))}</span><span class="lname">${esc(d.name)}</span><button class="switch sm${d.caps.onoff.value ? ' on' : ''}"><i></i></button></div>`).join('') || '<div class="muted">Geen schakelbare apparaten</div>'}</div>` +
        (onN ? `<button class="pill nopress" data-alloff>${icon('power')} Alles uit</button>` : '');
      inner.querySelectorAll('.li').forEach(li => {
        li.querySelector('.switch').onclick = () => { const d = D.dev(li.dataset.d); D.setCap(d.id, 'onoff', !d.caps.onoff.value); };
        li.querySelector('.lname').onclick = () => tiles.device.sheet(li.dataset.d);
      });
      const off = inner.querySelector('[data-alloff]');
      if (off) off.onclick = async () => { if (await guard(t, 'Alles uit in ' + titleOf(t) + '?')) sw.filter(d => d.caps.onoff.value).forEach(d => D.setCap(d.id, 'onoff', false)); };
    },
  };

  // ---------- Flow ----------
  tiles.flow = {
    label: 'Flow', icon: 'play', size: [2, 2],
    title: t => { const f = [...D.lib.flows, ...D.lib.advancedFlows].find(x => x.id === t.ref.id); return f ? f.name : 'Flow niet gevonden'; },
    render(t, inner, el) {
      inner.innerHTML = `<div class="actbtn"><span class="badge xl">${anyIcon(t.opts.mdi || t.opts.icon || 'play')}</span><div class="name">${esc(titleOf(t))}</div></div>`;
      D.pressable(el, { tap: async () => {
        if (!(await guard(t))) return;
        try { await D.api('POST', `/api/flow/${t.ref.flowType || 'flow'}/${t.ref.id}`); flash(el); } catch (e) { flash(el, false); D.toast('Flow mislukt: ' + e.message, true); }
      } });
    },
  };

  // ---------- Mood ----------
  tiles.mood = {
    label: 'Mood', icon: 'sparkles', size: [2, 2],
    title: t => { const m = D.lib.moods.find(x => x.id === t.ref.id); return m ? m.name : 'Mood niet gevonden'; },
    render(t, inner, el) {
      const m = D.lib.moods.find(x => x.id === t.ref.id);
      inner.innerHTML = `<div class="actbtn"><span class="badge xl">${anyIcon(t.opts.mdi || 'sparkles')}</span><div class="name">${esc(titleOf(t))}</div>${m ? `<div class="sub">${esc(D.zoneName(m.zone))}</div>` : ''}</div>`;
      D.pressable(el, { tap: async () => {
        if (!(await guard(t))) return;
        try { await D.api('POST', `/api/mood/${t.ref.id}`); flash(el); } catch (e) { flash(el, false); D.toast('Mood mislukt: ' + e.message, true); }
      } });
    },
  };

  // ---------- Variabele ----------
  tiles.variable = {
    label: 'Variabele', icon: 'braces', size: [2, 2],
    title: t => { const v = D.lib.variables.find(x => x.id === t.ref.id); return v ? v.name : 'Variabele niet gevonden'; },
    render(t, inner, el) {
      const v = D.lib.variables.find(x => x.id === t.ref.id);
      if (!v) { inner.innerHTML = `<div class="empty">Variabele niet gevonden</div>`; return; }
      const set = val => D.api('POST', `/api/variable/${v.id}`, { value: val }).catch(e => D.toast(e.message, true));
      if (v.type === 'boolean') {
        el.classList.toggle('on', !!v.value);
        inner.innerHTML = head(t, 'braces', '', v.value) + `<div class="big">${v.value ? 'Ja' : 'Nee'}</div>`;
        D.pressable(el, { tap: async () => { if (await guard(t)) { v.value = !v.value; set(v.value); D.refreshTile(t.id); } } });
      } else if (v.type === 'number') {
        const step = Number(t.opts.step || 1);
        inner.innerHTML = head(t, 'braces') + `<div class="big">${esc(Number(v.value).toLocaleString('nl-NL'))}${esc(t.opts.unit || '')}</div><div class="stepper nopress"><button class="rb" data-s="-1">${icon('minus')}</button><button class="rb" data-s="1">${icon('plus')}</button></div>`;
        inner.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { v.value = Math.round((Number(v.value) + step * b.dataset.s) * 1000) / 1000; set(v.value); D.refreshTile(t.id); });
      } else {
        inner.innerHTML = head(t, 'braces') + `<div class="big sm">${esc(v.value)}</div>`;
      }
    },
  };

  // ---------- Insights grafiek ----------
  const RES = { lastHour: 'Laatste uur', last6Hours: '6 uur', last24Hours: '24 uur', last7Days: '7 dagen', last31Days: '31 dagen' };
  D.RES = RES;
  tiles.insight = {
    label: 'Grafiek', icon: 'chart', size: [4, 3],
    title: t => { const l = D.lib.insights.find(x => x.id === t.ref.id && x.uri === t.ref.uri); return l ? `${l.ownerName || ''} · ${l.title}` : 'Grafiek'; },
    async render(t, inner, el) {
      const res = t.opts.resolution || 'last24Hours';
      const l = D.lib.insights.find(x => x.id === t.ref.id && x.uri === t.ref.uri) || {};
      inner.innerHTML = head(t, 'chart', RES[res]) + `<div class="chart"><div class="muted">Laden…</div></div>`;
      const key = `${t.ref.uri}|${t.ref.id}|${res}`; D._ins = D._ins || {};
      let data = D._ins[key];
      if (!data || Date.now() - data.at > 5 * 6e4) {
        try { data = { at: Date.now(), v: (await D.api('GET', `/api/insights?uri=${encodeURIComponent(t.ref.uri)}&id=${encodeURIComponent(t.ref.id)}&resolution=${res}`)).values || [] }; D._ins[key] = data; }
        catch (e) { inner.querySelector('.chart').innerHTML = `<div class="muted">Geen gegevens</div>`; return; }
      }
      const pts = data.v.filter(p => p.v !== null && p.v !== undefined).map(p => ({ t: new Date(p.t).getTime(), v: typeof p.v === 'boolean' ? (p.v ? 1 : 0) : p.v }));
      const box = inner.querySelector('.chart'); if (!box) return;
      if (pts.length < 2) { box.innerHTML = `<div class="muted">Te weinig gegevens</div>`; return; }
      const W = 400, H = 160; const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      let lo = Math.min(...pts.map(p => p.v)), hi = Math.max(...pts.map(p => p.v)); if (hi === lo) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
      const X = x => ((x - t0) / (t1 - t0)) * W, Y = y => H - ((y - lo) / (hi - lo)) * H;
      const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
      const col = t.opts.color || 'var(--accent)'; const gid = D.uid('g');
      const u = l.units ? ' ' + l.units : ''; const dec = l.decimals ?? 1;
      const f = v => v.toLocaleString('nl-NL', { maximumFractionDigits: dec }) + u;
      const vals = pts.map(p => p.v);
      box.innerHTML = `<div class="cstat"><b>${f(vals[vals.length - 1])}</b><span>min ${f(Math.min(...vals))} · max ${f(Math.max(...vals))}</span></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
        <path d="${line}L${W},${H}L0,${H}Z" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
    },
  };

  // ---------- Energie ----------
  tiles.energy = {
    label: 'Energie', icon: 'bolt', size: [3, 3],
    title: () => 'Energie',
    render(t, inner) {
      const withP = D.lib.devices.filter(d => d.caps.measure_power && typeof d.caps.measure_power.value === 'number');
      const main = t.opts.mainDeviceId ? D.dev(t.opts.mainDeviceId) : null;
      const others = withP.filter(d => !main || d.id !== main.id).sort((a, b) => b.caps.measure_power.value - a.caps.measure_power.value);
      const total = main && main.caps.measure_power ? main.caps.measure_power.value : others.reduce((s, d) => s + d.caps.measure_power.value, 0);
      const n = Math.max(0, t.h * 2 - 3);
      inner.innerHTML = head(t, 'bolt', main ? esc(main.name) : 'Som van alle apparaten') +
        `<div class="big">${Math.round(total).toLocaleString('nl-NL')} W</div>` +
        (n ? `<div class="bars">${others.slice(0, n).map(d => { const v = d.caps.measure_power.value; return `<div class="bar"><span>${esc(d.name)}</span><i style="--w:${Math.min(100, total ? v / total * 100 : 0)}%"></i><b>${Math.round(v)} W</b></div>`; }).join('')}</div>` : '');
    },
  };

  // ---------- Aanwezigheid ----------
  tiles.presence = {
    label: 'Wie is thuis', icon: 'users', size: [3, 2],
    title: () => 'Wie is thuis',
    render(t, inner) {
      const us = D.lib.users.filter(u => !(t.opts.hide || []).includes(u.id));
      const home = us.filter(u => u.present).length;
      inner.innerHTML = head(t, 'users', `${home} van ${us.length} thuis`) +
        `<div class="people">${us.map(u => `<div class="person${u.present ? ' home' : ''}"><span class="av"${u.avatar ? ` style="background-image:url('${esc(u.avatar)}')"` : ''}>${u.avatar ? '' : esc((u.name || '?')[0])}</span><small>${esc(u.name)}</small></div>`).join('')}</div>`;
    },
  };

  // ---------- Wekkers ----------
  const DAYS = { monday: 'ma', tuesday: 'di', wednesday: 'wo', thursday: 'do', friday: 'vr', saturday: 'za', sunday: 'zo' };
  tiles.alarms = {
    label: 'Wekkers', icon: 'alarm', size: [3, 3],
    title: () => 'Wekkers',
    render(t, inner) {
      inner.innerHTML = head(t, 'alarm') + `<div class="list nopress">${D.lib.alarms.map(a => `<div class="li" data-a="${a.id}"><b class="atime">${esc(a.time)}</b><span class="lname">${esc(a.name)}<small>${Object.keys(DAYS).filter(k => a.repetition && a.repetition[k]).map(k => DAYS[k]).join(' ') || 'eenmalig'}</small></span><button class="switch sm${a.enabled ? ' on' : ''}"><i></i></button></div>`).join('') || '<div class="muted">Geen wekkers</div>'}</div>`;
      inner.querySelectorAll('[data-a]').forEach(li => li.querySelector('.switch').onclick = async () => {
        const a = D.lib.alarms.find(x => x.id === li.dataset.a); a.enabled = !a.enabled; D.refreshTile(t.id);
        D.api('POST', `/api/alarm/${a.id}`, { enabled: a.enabled }).catch(e => D.toast(e.message, true));
      });
    },
  };

  // ---------- Meldingen ----------
  tiles.notifications = {
    label: 'Meldingen', icon: 'bell', size: [4, 4],
    title: () => 'Meldingen',
    async render(t, inner) {
      inner.innerHTML = head(t, 'bell') + `<div class="list"><div class="muted">Laden…</div></div>`;
      if (!D._notif || Date.now() - D._notif.at > 6e4) D._notif = { at: Date.now(), v: await D.api('GET', '/api/notifications').catch(() => []) };
      const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
      const ago = d => { const m = Math.round((Date.now() - new Date(d)) / 6e4); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} uur` : `${Math.round(m / 1440)} d`; };
      const l = inner.querySelector('.list'); if (!l) return;
      l.innerHTML = D._notif.v.map(n => `<div class="li note"><span class="lname">${md(n.excerpt)}</span><small>${ago(n.dateCreated)}</small></div>`).join('') || '<div class="muted">Geen meldingen</div>';
    },
  };

  // ---------- Apps ----------
  tiles.apps = {
    label: 'Apps', icon: 'apps', size: [4, 4],
    title: () => 'Homey-apps',
    render(t, inner) {
      let apps = [...D.lib.apps].sort((a, b) => a.name.localeCompare(b.name));
      if (t.opts.onlyProblems) apps = apps.filter(a => a.state !== 'running');
      const bad = D.lib.apps.filter(a => a.state !== 'running').length;
      inner.innerHTML = head(t, 'apps', `${D.lib.apps.length} apps${bad ? ` · ${bad} gestopt` : ''}`) +
        `<div class="list">${apps.map(a => `<div class="li"><span class="dot ${a.state === 'running' ? 'ok' : a.crashed ? 'bad' : 'off'}"></span><span class="lname">${esc(a.name)}</span><small>${esc(a.version || '')}</small></div>`).join('') || '<div class="muted">Alles draait</div>'}</div>`;
    },
  };

  // ---------- Klok ----------
  tiles.clock = {
    label: 'Klok', icon: 'clock', size: [4, 3],
    title: () => 'Klok',
    render(t, inner) {
      const now = new Date();
      const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: t.opts.seconds ? '2-digit' : undefined });
      inner.innerHTML = `<div class="clock"><b>${time}</b>${t.opts.date !== false ? `<span>${now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</span>` : ''}</div>`;
    },
  };
  setInterval(() => { if (D.cfg) D.refreshWhere(t => t.type === 'clock' && (t.opts.seconds || new Date().getSeconds() < 2)); }, 1000);

  // ---------- Tekst ----------
  tiles.text = {
    label: 'Tekst', icon: 'text', size: [4, 2],
    title: () => 'Tekst',
    render(t, inner) {
      inner.innerHTML = `<div class="txt" style="text-align:${t.opts.align || 'left'};font-size:${t.opts.size || 1}em">${esc(t.opts.text || '').replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>`;
    },
  };

  // ---------- Widget van een eigen Homey-app ----------
  tiles.appwidget = {
    label: 'App-widget', icon: 'apps', size: [3, 8],
    title: t => t.opts.title || t.ref.name || t.ref.widgetId,
    render(t, inner) {
      const url = `/aw/${encodeURIComponent(t.ref.appId)}/${encodeURIComponent(t.ref.widgetId)}/`;
      tiles.web.render({ ...t, opts: { ...t.opts, url, interactive: true } }, inner);
    },
  };
  tiles.appgeheel = {
    label: 'App-widgets naadloos', icon: 'apps', size: [12, 8],
    title: t => t.opts.title || (t.ref.name || 'Spotify') + ' (naadloos)',
    render(t, inner) {
      const url = `/aw-geheel.html?app=${encodeURIComponent(t.ref.appId)}&w=${encodeURIComponent((t.ref.widgets || []).join(','))}`;
      tiles.web.render({ ...t, opts: { ...t.opts, url, interactive: true } }, inner);
    },
  };

  // ---------- Webpagina ----------
  tiles.web = {
    label: 'Webpagina', icon: 'globe', size: [4, 4],
    title: t => t.opts.title || 'Webpagina',
    render(t, inner) {
      if (!t.opts.url) { inner.innerHTML = `<div class="empty">${icon('globe')}<span>Stel een adres in</span></div>`; return; }
      const z = t.opts.zoom || 1; const pad = t.style && t.style.frameless ? '' : head(t, 'globe');
      const src = t.opts.url;
      const existing = inner.querySelector('iframe');
      if (existing && existing.dataset.src === src && existing.dataset.z == z && !!pad === !!inner.querySelector('.hd')) return; // niet opnieuw laden
      inner.innerHTML = pad + `<div class="frame${t.opts.interactive === false ? ' noint' : ''}"><iframe data-src="${esc(src)}" data-z="${z}" src="${esc(src)}" style="width:${100 / z}%;height:${100 / z}%;transform:scale(${z})" allow="autoplay; fullscreen" loading="lazy"></iframe></div>`;
      if (t.opts.refresh) { clearInterval(inner._r); inner._r = setInterval(() => { const f = inner.querySelector('iframe'); if (f) f.src = f.src; }, t.opts.refresh * 6e4); }
    },
  };
})();
