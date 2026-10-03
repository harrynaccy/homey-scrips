/* Extra tegels (Toevoegen → Overig): overzichten, weer, energie, planning, onderweg, systeem en opmaak.
   Gegevens van buiten komen via de NAS (/api/x/...), zodat de tablet zelf niets van andere sites ophaalt. */
(function () {
  const D = window.D; const T = D.tiles; const esc = D.esc;
  const hd = (t, ic, sub) => `<div class="hd"><span class="badge">${typeof ic === 'string' && ic.length <= 4 && /\p{Extended_Pictographic}/u.test(ic) ? `<span class="x-emo">${ic}</span>` : anyIcon(ic)}</span><div class="ht"><div class="name">${esc(D.titleOf(t))}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div></div>`;
  const loc = () => { const n = (D.cfg && D.cfg.settings.night) || {}; return { lat: Number(n.lat) || 52.22, lon: Number(n.lon) || 6.89 }; };
  const hm = t => new Date(t).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const day = t => { const d = new Date(t); const now = new Date(); const dd = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    return dd === 0 ? 'Vandaag' : dd === 1 ? 'Morgen' : dd === -1 ? 'Gisteren' : d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }); };
  const pressOpen = (el, fn) => D.pressable(el, { tap: fn });
  const sheet = (title, sub, body) => { D.openSheet(`<div class="sheet-hd"><div><h2>${esc(title)}</h2>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div><button class="xbtn" data-close>${icon('x')}</button></div>${body}`, 'wide'); document.querySelector('#sheet [data-close]').onclick = () => D.closeSheet(); };

  // ---------- gegevens van de NAS ophalen met korte cache; tegels hertekenen als het binnen is ----------
  const X = D.xdata = { c: new Map() };
  X.get = (key, ttl, loader, types) => {
    const c = X.c.get(key);
    if ((!c || Date.now() - c.at > ttl) && !(c && c.loading)) {
      const n = { ...(c || {}), loading: true }; X.c.set(key, n);
      loader().then(v => { X.c.set(key, { at: Date.now(), v }); }).catch(e => { X.c.set(key, { at: Date.now(), v: c && c.v, err: e.message }); })
        .finally(() => D.refreshWhere(t => types.includes(t.type)));
    }
    return X.c.get(key) || {};
  };
  setInterval(() => { if (D.cfg && !document.hidden) D.refreshWhere(t => LIVE.includes(t.type)); }, 60e3);
  const LIVE = ['p2000', 'rain', 'weather', 'air', 'price', 'waste', 'agenda', 'departures', 'travel', 'nas', 'homeyinfo', 'sunmoon', 'countdown', 'usage', 'solar'];
  const wait = (t, ic, r, msg) => hd(t, ic) + `<div class="empty">${r && r.err ? `${icon('x')}<span>${esc(r.err)}</span>` : `<span>${esc(msg || 'Laden…')}</span>`}</div>`;

  // ---------- 1. ramen en deuren ----------
  T.openings = {
    label: 'Ramen en deuren', icon: 'door', size: [3, 2], title: t => t.opts.title || 'Ramen en deuren',
    render(t, inner, el) {
      const all = D.lib.devices.filter(d => d.caps.alarm_contact); const open = all.filter(d => d.caps.alarm_contact.value);
      el.classList.toggle('x-bad', open.length > 0);
      inner.innerHTML = hd(t, open.length ? 'unlock' : 'lock') + (open.length
        ? `<div class="big sm x-warn">${open.length} open</div><div class="x-names">${open.map(d => esc(d.name)).join(' · ')}</div>`
        : `<div class="big sm x-ok">Alles dicht</div><div class="sub">${all.length} sensoren</div>`);
      pressOpen(el, () => sheet('Ramen en deuren', `${open.length} van de ${all.length} open`, `<div class="x-sheetlist">${all.sort((a, b) => b.caps.alarm_contact.value - a.caps.alarm_contact.value || a.name.localeCompare(b.name)).map(d => `<div class="x-row"><span>${esc(d.name)}<small>${esc(D.zoneName(d.zone))}</small></span><b class="${d.caps.alarm_contact.value ? 'x-warn' : 'x-ok'}">${d.caps.alarm_contact.value ? 'Open' : 'Dicht'}</b></div>`).join('')}</div>`));
    },
  };

  // ---------- 2. lampen ----------
  const isLight = d => d.caps.onoff && (d.class === 'light' || d.virtualClass === 'light');
  T.lights = {
    label: 'Lampen-overzicht', icon: 'bulb', size: [3, 2], title: t => t.opts.title || 'Lampen',
    render(t, inner, el) {
      const all = D.lib.devices.filter(isLight); const on = all.filter(d => d.caps.onoff.value);
      el.classList.toggle('on', on.length > 0);
      inner.innerHTML = hd(t, 'bulb', `${all.length} lampen`) + `<div class="x-split"><div class="big sm">${on.length ? on.length + ' aan' : 'Alles uit'}</div>${on.length ? `<button class="btn sm nopress" data-alloff>${icon('power')}Alles uit</button>` : ''}</div><div class="x-names">${on.slice(0, 8).map(d => esc(d.name)).join(' · ')}</div>`;
      const b = inner.querySelector('[data-alloff]');
      if (b) b.onclick = async e => { e.stopPropagation(); if (t.style && t.style.confirm && !(await D.confirm(`${on.length} lampen uitzetten?`))) return; D.playFor(el); for (const d of on) D.setCap(d.id, 'onoff', false); };
      pressOpen(el, () => sheet('Lampen', `${on.length} van de ${all.length} aan`, `<div class="x-sheetlist">${all.sort((a, b) => b.caps.onoff.value - a.caps.onoff.value || a.name.localeCompare(b.name)).map(d => `<button class="x-row" data-tg="${d.id}"><span>${esc(d.name)}<small>${esc(D.zoneName(d.zone))}</small></span><b class="${d.caps.onoff.value ? 'x-on' : ''}">${d.caps.onoff.value ? 'Aan' : 'Uit'}</b></button>`).join('')}</div>`)
        || document.querySelectorAll('#sheet [data-tg]').forEach(x => x.onclick = () => { const d = D.dev(x.dataset.tg); D.setCap(d.id, 'onoff', !d.caps.onoff.value); x.querySelector('b').textContent = d.caps.onoff.value ? 'Aan' : 'Uit'; x.querySelector('b').classList.toggle('x-on', d.caps.onoff.value); }));
    },
  };

  // ---------- 3. kamerkaart ----------
  T.room = {
    label: 'Kamerkaart', icon: 'home', size: [3, 3], title: t => t.opts.title || D.zoneName(t.opts.zoneId) || 'Kamer',
    render(t, inner, el) {
      const z = t.opts.zoneId; if (!z) { inner.innerHTML = hd(t, 'home') + '<div class="empty">Kies bij Tegel een ruimte</div>'; return; }
      const ds = D.lib.devices.filter(d => d.zone === z); const avg = cap => { const v = ds.map(d => d.caps[cap] && d.caps[cap].value).filter(x => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const temp = avg('measure_temperature'), hum = avg('measure_humidity'), lights = ds.filter(isLight), on = lights.filter(d => d.caps.onoff.value), open = ds.filter(d => d.caps.alarm_contact && d.caps.alarm_contact.value);
      const motion = ds.some(d => d.caps.alarm_motion && d.caps.alarm_motion.value);
      el.classList.toggle('on', on.length > 0);
      inner.innerHTML = hd(t, 'home', `${ds.length} apparaten`) + `<div class="x-room">
        ${temp !== null ? `<div class="x-big">${temp.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}°</div>` : ''}
        <div class="x-chips">${hum !== null ? `<span>${icon('drop')}${Math.round(hum)}%</span>` : ''}${lights.length ? `<span class="${on.length ? 'x-on' : ''}">${icon('bulb')}${on.length}/${lights.length}</span>` : ''}${open.length ? `<span class="x-warn">${icon('unlock')}${open.length} open</span>` : ''}${motion ? `<span class="x-on">${icon('activity')}beweging</span>` : ''}</div></div>`;
      pressOpen(el, () => { if (t.opts.page && D.openPage) D.openPage(t.opts.page); });
    },
  };

  // ---------- 4. batterijen ----------
  T.batteries = {
    label: 'Batterijen', icon: 'activity', size: [3, 4], title: t => t.opts.title || 'Batterijen',
    render(t, inner) {
      const ds = D.lib.devices.filter(d => d.caps.measure_battery && typeof d.caps.measure_battery.value === 'number').sort((a, b) => a.caps.measure_battery.value - b.caps.measure_battery.value);
      const low = ds.filter(d => d.caps.measure_battery.value < 20).length;
      inner.innerHTML = hd(t, 'activity', low ? `${low} bijna leeg` : `${ds.length} apparaten`) + `<div class="list nopress">${ds.map(d => { const v = Math.round(d.caps.measure_battery.value); return `<div class="x-bat"><span>${esc(d.name)}</span><i style="--w:${v}%" class="${v < 20 ? 'low' : v < 40 ? 'mid' : ''}"></i><b>${v}%</b></div>`; }).join('') || '<div class="empty">Geen apparaten met batterij</div>'}</div>`;
    },
  };

  // ---------- 5. thermostaat groot ----------
  T.thermo = {
    label: 'Thermostaat groot', icon: 'thermo', size: [3, 3], title: t => t.opts.title || ((D.dev(t.opts.deviceId) || {}).name) || 'Thermostaat',
    render(t, inner, el) {
      const d = D.dev(t.opts.deviceId) || D.lib.devices.find(x => x.caps.target_temperature);
      if (!d || !d.caps.target_temperature) { inner.innerHTML = hd(t, 'thermo') + '<div class="empty">Kies bij Tegel een thermostaat</div>'; return; }
      const c = d.caps.target_temperature; const min = c.min ?? 5, max = c.max ?? 30, step = c.step || 0.5; const cur = d.caps.measure_temperature ? d.caps.measure_temperature.value : null;
      let target = el._tt ?? c.value; const p = (target - min) / (max - min);
      const R = 40, len = 2 * Math.PI * R * 0.75;
      inner.innerHTML = `<div class="x-thermo"><svg viewBox="0 0 100 100"><circle class="b" cx="50" cy="50" r="${R}" stroke-dasharray="${len} 999"/><circle class="v" cx="50" cy="50" r="${R}" stroke-dasharray="${len * p} 999"/></svg>
        <div class="x-tc"><small>${esc(d.name)}</small><b>${Number(target).toLocaleString('nl-NL', { minimumFractionDigits: 1 })}°</b>${cur !== null ? `<small>nu ${Number(cur).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}°</small>` : ''}</div>
        <div class="x-tb"><button class="nopress" data-d="-1">${icon('minus')}</button><button class="nopress" data-d="1">${icon('plus')}</button></div></div>`;
      inner.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
        target = D.clamp(Math.round(((el._tt ?? c.value) + Number(b.dataset.d) * step) * 10) / 10, min, max); el._tt = target; D.playFor(el); this.render(t, inner, el);
        clearTimeout(el._ttT); el._ttT = setTimeout(() => { el._tt = undefined; D.setCap(d.id, 'target_temperature', target); }, 900);
      });
      D.pressable(el, { long: () => T.device.sheet(d.id) });
    },
  };

  // ---------- 6. Buienradar ----------
  T.rain = {
    label: 'Buienradar', icon: 'cloud', size: [4, 2], title: t => t.opts.title || 'Regen komende 2 uur',
    render(t, inner) {
      const { lat, lon } = loc(); const r = X.get(`rain:${lat},${lon}`, 4 * 60e3, () => D.api('GET', `/api/x/rain?lat=${lat}&lon=${lon}`), ['rain']);
      if (!r.v) { inner.innerHTML = wait(t, 'cloud', r); return; }
      const pts = r.v.points; const max = Math.max(1, ...pts.map(p => p.mm)); const first = pts.find(p => p.mm > 0.05); const last = [...pts].reverse().find(p => p.mm > 0.05);
      const txt = !first ? 'Droog' : first === pts[0] ? `Regen nu${last && last !== pts[pts.length - 1] ? ', droog vanaf ' + (pts[pts.indexOf(last) + 1] || last).t : ''}` : `Regen vanaf ${first.t}`;
      inner.innerHTML = hd(t, 'cloud', txt) + `<div class="x-rain">${pts.map(p => `<i style="--h:${Math.max(2, p.mm / max * 100)}%" class="${p.mm > 0.05 ? 'w' : ''}" title="${p.t}: ${p.mm} mm/u"></i>`).join('')}</div><div class="x-axis"><span>${pts[0] ? pts[0].t : ''}</span><span>${pts[12] ? pts[12].t : ''}</span><span>${pts[pts.length - 1] ? pts[pts.length - 1].t : ''}</span></div>`;
    },
  };

  // ---------- 7. weer ----------
  const WX = c => c === 0 ? ['☀️', 'Zonnig'] : c <= 2 ? ['🌤️', 'Licht bewolkt'] : c === 3 ? ['☁️', 'Bewolkt'] : c <= 48 ? ['🌫️', 'Mist'] : c <= 57 ? ['🌦️', 'Motregen'] : c <= 67 ? ['🌧️', 'Regen'] : c <= 77 ? ['🌨️', 'Sneeuw'] : c <= 82 ? ['🌧️', 'Buien'] : c <= 86 ? ['🌨️', 'Sneeuwbuien'] : ['⛈️', 'Onweer'];
  const dir = d => ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'][Math.round(((d || 0) % 360) / 45) % 8];
  T.weather = {
    label: 'Weer', icon: 'sun', size: [4, 3], title: t => t.opts.title || 'Weer',
    render(t, inner) {
      const { lat, lon } = loc(); const r = X.get(`wx:${lat},${lon}`, 15 * 60e3, () => D.api('GET', `/api/x/weather?lat=${lat}&lon=${lon}`), ['weather']);
      if (!r.v) { inner.innerHTML = wait(t, 'sun', r); return; }
      const c = r.v.current, dd = r.v.daily; const [e, txt] = WX(c.weather_code); const n = Math.min(dd.time.length, t.opts.days || 5);
      inner.innerHTML = `<div class="x-wx"><div class="x-wxnow"><span class="x-wxe">${e}</span><div><b>${Math.round(c.temperature_2m)}°</b><small>${txt} · voelt als ${Math.round(c.apparent_temperature)}°</small><small>${icon('fan')} ${Math.round(c.wind_speed_10m)} km/u ${dir(c.wind_direction_10m)} · ${icon('drop')} ${c.relative_humidity_2m}%</small></div></div>
        <div class="x-wxdays">${dd.time.slice(0, n).map((d, i) => `<div><small>${i ? new Date(d).toLocaleDateString('nl-NL', { weekday: 'short' }) : 'vand.'}</small><span>${WX(dd.weather_code[i])[0]}</span><b>${Math.round(dd.temperature_2m_max[i])}°</b><small>${Math.round(dd.temperature_2m_min[i])}°</small>${dd.precipitation_probability_max ? `<em>${dd.precipitation_probability_max[i] ?? 0}%</em>` : ''}</div>`).join('')}</div></div>`;
    },
  };

  // ---------- 8. luchtkwaliteit en pollen ----------
  const AQ = v => v == null ? ['–', ''] : v <= 20 ? ['Goed', 'ok'] : v <= 40 ? ['Redelijk', 'ok'] : v <= 60 ? ['Matig', 'mid'] : v <= 80 ? ['Slecht', 'bad'] : ['Zeer slecht', 'bad'];
  const POL = (v, hi) => v == null ? ['–', ''] : v < hi * 0.1 ? ['laag', 'ok'] : v < hi ? ['matig', 'mid'] : ['hoog', 'bad'];
  T.air = {
    label: 'Luchtkwaliteit en pollen', icon: 'activity', size: [3, 3], title: t => t.opts.title || 'Lucht en pollen',
    render(t, inner) {
      const { lat, lon } = loc(); const r = X.get(`air:${lat},${lon}`, 30 * 60e3, () => D.api('GET', `/api/x/air?lat=${lat}&lon=${lon}`), ['air']);
      if (!r.v) { inner.innerHTML = wait(t, 'activity', r); return; }
      const c = r.v.current || {}; const [aq, cls] = AQ(c.european_aqi);
      const pol = [['Gras', c.grass_pollen, 50], ['Berk', c.birch_pollen, 100], ['Els', c.alder_pollen, 100], ['Bijvoet', c.mugwort_pollen, 30], ['Ambrosia', c.ragweed_pollen, 20]].filter(x => x[1] != null);
      inner.innerHTML = hd(t, 'activity', `Fijnstof ${c.pm2_5 != null ? Math.round(c.pm2_5) : '–'} µg/m³`) + `<div class="big sm x-${cls}">${aq}</div><div class="x-chips">${pol.map(([n, v, hi]) => { const [w, k] = POL(v, hi); return `<span class="x-${k}">${n}: ${w}</span>`; }).join('')}</div>`;
    },
  };

  // ---------- 9. zon en maan ----------
  const moon = d => { const syn = 29.530588853; const ref = Date.UTC(2000, 0, 6, 18, 14); const age = (((d - ref) / 864e5) % syn + syn) % syn; const f = age / syn;
    const e = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][Math.round(f * 8) % 8]; const name = f < 0.03 || f > 0.97 ? 'Nieuwe maan' : f < 0.22 ? 'Wassende sikkel' : f < 0.28 ? 'Eerste kwartier' : f < 0.47 ? 'Wassende maan' : f < 0.53 ? 'Volle maan' : f < 0.72 ? 'Afnemende maan' : f < 0.78 ? 'Laatste kwartier' : 'Afnemende sikkel';
    return { e, name, light: Math.round((1 - Math.cos(f * 2 * Math.PI)) / 2 * 100) }; };
  T.sunmoon = {
    label: 'Zon en maan', icon: 'sun', size: [3, 2], title: t => t.opts.title || 'Zon en maan',
    render(t, inner) {
      const { lat, lon } = loc(); const now = new Date(); const s = D.sunTimes(now, lat, lon); const m = moon(now.getTime());
      const len = (s.set - s.rise) / 6e4;
      inner.innerHTML = `<div class="x-sm"><div><span class="x-wxe">🌅</span><b>${hm(s.rise)}</b><small>op</small></div><div><span class="x-wxe">🌇</span><b>${hm(s.set)}</b><small>onder</small></div><div><span class="x-wxe">${m.e}</span><b>${m.light}%</b><small>${m.name}</small></div></div><div class="sub x-c">Daglicht ${Math.floor(len / 60)} u ${Math.round(len % 60)} min</div>`;
    },
  };

  // ---------- 10. stroomprijs ----------
  T.price = {
    label: 'Stroomprijs', icon: 'bolt', size: [4, 3], title: t => t.opts.title || 'Stroomprijs',
    render(t, inner) {
      const r = X.get('price', 30 * 60e3, () => D.api('GET', '/api/x/price'), ['price']);
      if (!r.v) { inner.innerHTML = wait(t, 'bolt', r); return; }
      const now = Date.now(); const ps = r.v.prices.filter(p => new Date(p.t).getTime() > now - 3600e3).slice(0, 24); if (!ps.length) { inner.innerHTML = wait(t, 'bolt', { err: 'Geen prijzen' }); return; }
      const cur = ps[0]; const max = Math.max(...ps.map(p => p.p)), min = Math.min(0, ...ps.map(p => p.p)); const cheap = [...ps].sort((a, b) => a.p - b.p).slice(0, 3).map(p => p.t);
      const ct = v => (v * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 });
      inner.innerHTML = hd(t, 'bolt', `Goedkoopst: ${cheap.map(x => hm(x)).sort().join(', ')}`) + `<div class="x-split"><div class="big sm">${ct(cur.p)} ct</div><small class="muted">per kWh nu, incl. btw</small></div>
        <div class="x-price">${ps.map(p => `<i style="--h:${Math.max(3, (p.p - min) / ((max - min) || 1) * 100)}%" class="${p === cur ? 'now' : ''}${cheap.includes(p.t) ? ' cheap' : ''}${p.p < 0 ? ' neg' : ''}" title="${hm(p.t)}: ${ct(p.p)} ct"></i>`).join('')}</div><div class="x-axis"><span>${hm(ps[0].t)}</span><span>${hm(ps[Math.floor(ps.length / 2)].t)}</span><span>${hm(ps[ps.length - 1].t)}</span></div>`;
    },
  };

  // ---------- 11. zonnepanelen ----------
  T.solar = {
    label: 'Zonnepanelen', icon: 'sun', size: [3, 2], title: t => t.opts.title || ((D.dev(t.opts.deviceId) || {}).name) || 'Zonnepanelen',
    render(t, inner, el) {
      const d = D.dev(t.opts.deviceId) || D.lib.devices.find(x => x.class === 'solarpanel' && x.caps.measure_power);
      if (!d) { inner.innerHTML = hd(t, 'sun') + '<div class="empty">Kies bij Tegel je omvormer of zonnepanelen</div>'; return; }
      const w = d.caps.measure_power ? d.caps.measure_power.value : null; const today = Object.keys(d.caps).find(k => /meter_power.*(today|day|daily)/i.test(k)); const tot = d.caps.meter_power;
      el.classList.toggle('on', w > 10);
      inner.innerHTML = hd(t, 'sun', esc(d.name)) + `<div class="big">${w != null ? Math.round(w).toLocaleString('nl-NL') : '–'} W</div><div class="sub">${today ? `Vandaag ${D.fmt(d.caps[today], today)}` : tot ? `Totaal ${D.fmt(tot, 'meter_power')}` : ''}</div>`;
    },
  };

  // ---------- 12. verbruik per dag ----------
  T.usage = {
    label: 'Verbruik per dag', icon: 'chart', size: [4, 3], title: t => t.opts.title || 'Verbruik per dag',
    render(t, inner) {
      const d = D.dev(t.opts.deviceId); const cap = t.opts.cap || (d && (d.caps.meter_power ? 'meter_power' : d.caps.meter_gas ? 'meter_gas' : Object.keys(d.caps).find(k => k.startsWith('meter_'))));
      if (!d || !cap) { inner.innerHTML = hd(t, 'chart') + '<div class="empty">Kies bij Tegel je slimme meter (P1) of gasmeter</div>'; return; }
      const res = t.opts.days === 31 ? 'last31Days' : 'last7Days';
      const r = X.get(`use:${d.id}:${cap}:${res}`, 30 * 60e3, () => D.api('GET', `/api/insights?uri=${encodeURIComponent('homey:device:' + d.id)}&id=${encodeURIComponent(cap)}&resolution=${res}`), ['usage']);
      if (!r.v) { inner.innerHTML = wait(t, 'chart', r); return; }
      const byDay = new Map(); for (const p of (r.v.values || [])) { if (p.v == null) continue; const k = new Date(p.t).toDateString(); const x = byDay.get(k) || { min: p.v, max: p.v, t: p.t }; x.min = Math.min(x.min, p.v); x.max = Math.max(x.max, p.v); byDay.set(k, x); }
      const days = [...byDay.values()].map(x => ({ t: x.t, v: Math.max(0, x.max - x.min) })); const max = Math.max(0.01, ...days.map(x => x.v)); const unit = (d.caps[cap].units || (cap === 'meter_gas' ? 'm³' : 'kWh'));
      const f = v => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
      inner.innerHTML = hd(t, 'chart', `${esc(d.name)} · ${unit}`) + `<div class="x-days">${days.map(x => `<div><b>${f(x.v)}</b><i style="--h:${x.v / max * 100}%"></i><small>${new Date(x.t).toLocaleDateString('nl-NL', { weekday: 'short' })}</small></div>`).join('')}</div>`;
    },
  };

  // ---------- 13. afvalkalender ----------
  const WASTE_C = { GREY: '#8a9099', GREEN: '#4caf50', PAPER: '#4a90e2', PACKAGES: '#ff9f43', TREE: '#2e7d32', TEXTILE: '#b388ff' };
  T.waste = {
    label: 'Afvalkalender', icon: 'trash', size: [3, 3], title: t => t.opts.title || 'Afval',
    render(t, inner, el) {
      const o = t.opts; if (!o.postcode || !o.nr) { inner.innerHTML = hd(t, 'trash') + '<div class="empty">Vul bij Tegel je postcode en huisnummer in</div>'; return; }
      const key = `waste:${o.postcode}:${o.nr}:${o.letter || ''}:${o.company || ''}`;
      const r = X.get(key, 6 * 3600e3, () => D.api('POST', '/api/x/waste', { postcode: o.postcode, nr: o.nr, letter: o.letter, company: o.company }), ['waste']);
      if (!r.v) { inner.innerHTML = wait(t, 'trash', r); return; }
      const today = new Date().toISOString().slice(0, 10); const items = r.v.items.filter(x => x.date >= today).slice(0, Math.max(2, t.h * 2));
      const tomorrow = items.find(x => day(x.date) === 'Morgen'); el.classList.toggle('x-bad', !!tomorrow);
      inner.innerHTML = hd(t, 'trash', tomorrow ? `Morgen: ${tomorrow.name}` : '') + `<div class="list nopress">${items.map(x => `<div class="x-row"><span><i class="x-dot" style="background:${WASTE_C[x.type] || '#999'}"></i>${esc(x.name)}</span><b class="${day(x.date) === 'Morgen' || day(x.date) === 'Vandaag' ? 'x-warn' : ''}">${day(x.date)}</b></div>`).join('') || '<div class="empty">Geen ophaaldagen gevonden</div>'}</div>`;
    },
  };

  // ---------- 14. agenda ----------
  T.agenda = {
    label: 'Agenda', icon: 'alarm', size: [4, 4], title: t => t.opts.title || 'Agenda',
    render(t, inner) {
      const urls = String(t.opts.urls || '').split(/\s+/).filter(Boolean); if (!urls.length) { inner.innerHTML = hd(t, 'alarm') + '<div class="empty">Plak bij Tegel het iCal-adres van je agenda</div>'; return; }
      const r = X.get('ical:' + urls.join(' '), 15 * 60e3, () => D.api('POST', '/api/x/ical', { urls }), ['agenda']);
      if (!r.v) { inner.innerHTML = wait(t, 'alarm', r); return; }
      let lastDay = ''; const rows = r.v.events.slice(0, 20).map(e => { const dd = day(e.start); const h = dd !== lastDay ? `<div class="lib-zone">${dd}</div>` : ''; lastDay = dd; return h + `<div class="x-row"><span>${esc(e.title)}${e.where ? `<small>${esc(e.where)}</small>` : ''}</span><b>${e.allDay ? 'hele dag' : hm(e.start)}</b></div>`; }).join('');
      inner.innerHTML = hd(t, 'alarm', r.v.events.length ? '' : 'Niets gepland') + `<div class="list nopress">${rows || '<div class="empty">Geen afspraken in de komende 60 dagen</div>'}</div>`;
    },
  };

  // ---------- 15. afteller ----------
  T.countdown = {
    label: 'Afteller', icon: 'clock', size: [3, 2], title: t => t.opts.title || t.opts.label || 'Afteller',
    render(t, inner) {
      const o = t.opts; if (!o.date) { inner.innerHTML = hd(t, 'clock') + '<div class="empty">Kies bij Tegel een datum</div>'; return; }
      const d = new Date(o.date + 'T00:00:00'); const now = new Date(); const n = Math.ceil((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
      inner.innerHTML = `<div class="x-cd"><span class="x-wxe">${esc(o.emoji || '🎉')}</span><b>${n > 0 ? n : n === 0 ? 'Vandaag!' : 'Voorbij'}</b>${n > 0 ? `<small>${n === 1 ? 'dag' : 'dagen'} tot ${esc(o.label || d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }))}</small>` : `<small>${esc(o.label || '')}</small>`}</div>`;
    },
  };

  // ---------- 16. boodschappen en notities (gedeeld) ----------
  const NOTES = new Map();
  D._notesPush = m => { NOTES.set(m.id, m.list); D.refreshWhere(t => t.type === 'notes' && (t.opts.listId || t.id) === m.id); };
  T.notes = {
    label: 'Boodschappen en notities', icon: 'text', size: [3, 4], title: t => t.opts.title || 'Boodschappen',
    render(t, inner) {
      const id = t.opts.listId || t.id;
      if (!NOTES.has(id)) { NOTES.set(id, null); D.api('GET', '/api/x/notes/' + encodeURIComponent(id)).then(l => { NOTES.set(id, l); D.refreshTile(t.id); }).catch(() => {}); }
      const list = NOTES.get(id) || []; const save = l => { NOTES.set(id, l); D.refreshTile(t.id); D.api('POST', '/api/x/notes/' + encodeURIComponent(id), { list: l }).catch(e => D.toast(e.message, true)); };
      const open = list.filter(x => !x.done).length;
      inner.innerHTML = hd(t, 'text', `${open} te doen`) + `<form class="x-add nopress"><input type="text" placeholder="${esc(t.opts.placeholder || 'Toevoegen…')}" enterkeyhint="done"><button>${icon('plus')}</button></form>
        <div class="list nopress">${list.map(x => `<label class="x-note${x.done ? ' done' : ''}"><input type="checkbox" data-n="${esc(x.id)}" ${x.done ? 'checked' : ''}><span>${esc(x.text)}</span><button type="button" data-rm="${esc(x.id)}">${icon('x')}</button></label>`).join('')}</div>
        ${list.some(x => x.done) ? `<button class="btn sm ghost nopress x-clear">Afgevinkt weghalen</button>` : ''}`;
      const f = inner.querySelector('form'); f.onsubmit = e => { e.preventDefault(); const v = f.querySelector('input').value.trim(); if (!v) return; save([...list, { id: Math.random().toString(36).slice(2, 9), text: v, done: false }]); };
      inner.querySelectorAll('[data-n]').forEach(c => c.onchange = () => save(list.map(x => x.id === c.dataset.n ? { ...x, done: c.checked } : x)));
      inner.querySelectorAll('[data-rm]').forEach(b => b.onclick = e => { e.preventDefault(); save(list.filter(x => x.id !== b.dataset.rm)); });
      const cl = inner.querySelector('.x-clear'); if (cl) cl.onclick = () => save(list.filter(x => !x.done));
    },
  };

  // ---------- 17. kookwekker ----------
  const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(); for (let i = 0; i < 6; i++) { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(0.0001, a.currentTime + i * 0.35); g.gain.exponentialRampToValueAtTime(0.4, a.currentTime + i * 0.35 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + i * 0.35 + 0.25); o.start(a.currentTime + i * 0.35); o.stop(a.currentTime + i * 0.35 + 0.3); } } catch (e) { /* geen geluid */ } if (navigator.vibrate) navigator.vibrate([200, 100, 200]); };
  const TIMERS = new Map();
  setInterval(() => { for (const [id, s] of TIMERS) { if (s.end && Date.now() >= s.end && !s.rang) { s.rang = true; beep(); D.toast('⏰ Kookwekker: de tijd is om!'); } } if (TIMERS.size) D.refreshWhere(t => t.type === 'timer'); }, 1000);
  T.timer = {
    label: 'Kookwekker', icon: 'alarm', size: [3, 3], title: t => t.opts.title || 'Kookwekker',
    render(t, inner, el) {
      const s = TIMERS.get(t.id) || { set: (t.opts.dflt || 5) * 60e3 }; const left = s.end ? Math.max(0, s.end - Date.now()) : s.set;
      const mm = Math.floor(left / 6e4), ss = Math.floor(left / 1000) % 60; const done = s.end && left === 0;
      el.classList.toggle('x-bad', !!done); el.classList.toggle('on', !!s.end && !done);
      inner.innerHTML = `<div class="x-timer"><b class="${done ? 'x-warn' : ''}">${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}</b>
        <div class="x-tp nopress">${(t.opts.presets || [1, 3, 5, 10, 15]).map(m => `<button data-set="${m}">${m}m</button>`).join('')}</div>
        <div class="x-tb nopress"><button data-add="-60">${icon('minus')}</button><button class="go" data-go>${s.end && !done ? 'Stop' : done ? 'Oké' : 'Start'}</button><button data-add="60">${icon('plus')}</button></div></div>`;
      const upd = n => { TIMERS.set(t.id, n); this.render(t, inner, el); };
      inner.querySelectorAll('[data-set]').forEach(b => b.onclick = () => upd({ set: Number(b.dataset.set) * 60e3 }));
      inner.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const a = Number(b.dataset.add) * 1000; if (s.end) upd({ ...s, end: Math.max(Date.now(), s.end + a), rang: false }); else upd({ set: Math.max(0, s.set + a) }); });
      inner.querySelector('[data-go]').onclick = () => { if (done) { TIMERS.delete(t.id); this.render(t, inner, el); } else if (s.end) upd({ set: s.end - Date.now() }); else if (s.set > 0) upd({ set: s.set, end: Date.now() + s.set }); };
    },
  };

  // ---------- 18. vertrektijden ----------
  T.departures = {
    label: 'Vertrektijden bus en tram', icon: 'play', size: [4, 3], title: t => t.opts.title || t.opts.stopName || 'Vertrektijden',
    render(t, inner) {
      const code = t.opts.stopCode; if (!code) { inner.innerHTML = hd(t, 'play') + '<div class="empty">Zoek bij Tegel je bushalte</div>'; return; }
      const r = X.get('ov:' + code, 30e3, () => D.api('GET', '/api/x/ov/departures?code=' + encodeURIComponent(code)), ['departures']);
      if (!r.v) { inner.innerHTML = wait(t, 'play', r); return; }
      const only = String(t.opts.lines || '').split(/[,\s]+/).filter(Boolean);
      const deps = r.v.departures.filter(x => !only.length || only.includes(String(x.line))).slice(0, Math.max(2, t.h * 2));
      const min = x => Math.round((new Date(x.expected) - Date.now()) / 6e4); const late = x => Math.round((new Date(x.expected) - new Date(x.planned)) / 6e4);
      inner.innerHTML = hd(t, 'play', esc(t.opts.stopName || '')) + `<div class="list nopress">${deps.map(x => `<div class="x-row"><span><em class="x-line">${esc(x.line)}</em>${esc(x.dest)}</span><b>${min(x) <= 0 ? 'nu' : min(x) + ' min'}${late(x) > 0 ? `<small class="x-warn">+${late(x)}</small>` : ''}</b></div>`).join('') || '<div class="empty">Geen vertrektijden</div>'}</div>`;
    },
  };

  // ---------- 18b. P2000 Twente ----------
  const P2K_KIND = { brandweer: 'Brandweer', ambulance: 'Ambulance', politie: 'Politie', overig: 'Overig' };
  const p2kFilter = (t, items) => {
    const o = t.opts; const places = String(o.places || '').toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    return items.filter(x => !(o.fire === false && x.kind === 'brandweer') && !(o.ambu === false && x.kind === 'ambulance') && !(o.pol === false && x.kind === 'politie')
      && (!o.urgent || x.prio === 1) && (!places.length || places.some(p => String(x.place || '').toLowerCase().includes(p) || x.title.toLowerCase().includes(p))));
  };
  // korte tekst: politie "Politie naar Straat in Plaats voor ongeval met letsel" → "Ongeval met letsel · Straat"; plaats eruit (die staat apart)
  const p2kText = x => {
    let d = x.desc || x.title;
    const pol = /^Politie naar (.+?) in (.+?) voor (.+)$/i.exec(d);
    if (pol) { const w = pol[3].trim().replace(/^(\S+)\s+\1$/i, '$1'); return w.charAt(0).toUpperCase() + w.slice(1) + ' · ' + pol[1]; }
    const pol2 = /^Politie naar (.+?) in .+$/i.exec(d); if (pol2) return 'Politie · ' + pol2[1];
    if (x.place) d = d.replace(new RegExp(`\\s+(in|naar)\\s+${x.place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i'), '');
    return d;
  };
  const p2kRow = (x, full) => full
    ? `<div class="x-row x-p2k${x.prio === 1 ? ' p1' : ''}"><span><i class="x-dot k-${esc(x.kind)}" title="${esc(P2K_KIND[x.kind] || '')}"></i><em class="x-time">${esc(day(x.t))} ${hm(x.t)}</em><span class="x-ptxt">${esc(p2kText(x))}<small>${esc(x.title)}</small></span></span><b>${x.prio === 1 ? '<small class="x-spoed">spoed</small>' : ''}${esc(x.place || '')}</b></div>`
    : `<div class="x-p2r${x.prio === 1 ? ' p1' : ''}"><i class="x-dot k-${esc(x.kind)}" title="${esc(P2K_KIND[x.kind] || '')}"></i><div class="x-pb"><div class="x-pl1"><em class="x-time">${hm(x.t)}</em>${esc(p2kText(x))}</div><div class="x-pl2">${esc(x.place || '')}${x.prio === 1 ? '<span class="x-spoed">spoed</span>' : ''}</div></div></div>`;
  T.p2000 = {
    label: 'P2000 Twente', icon: 'siren', size: [4, 4], title: t => t.opts.title || 'P2000 Twente',
    render(t, inner, el) {
      const r = X.get('p2000', 60e3, () => D.api('GET', '/api/x/p2000'), ['p2000']);
      if (!r.v) { inner.innerHTML = wait(t, 'siren', r); return; }
      const all = p2kFilter(t, r.v.items || []);
      const since = Date.now() - 3600e3; const lastHour = all.filter(x => x.t >= since).length;
      const stale = r.v.error || r.err;
      const sub = stale ? `<span class="x-warn">${esc(r.v.error || 'Geen verbinding')}</span>` : `${all.length} in 24 uur${lastHour ? ` · ${lastHour} laatste uur` : ''}`;
      const rows = all.slice(0, 40).map(x => p2kRow(x)).join('') || `<div class="empty">${r.v.ok || (r.v.items || []).length ? 'Geen meldingen in de afgelopen 24 uur' : 'Nog geen gegevens'}</div>`;
      inner.innerHTML = hd(t, 'siren', sub) + `<div class="list">${rows}</div>`; // bron staat in het venster (tik op de tegel)
      pressOpen(el, () => {
        const list = p2kFilter(t, (r.v && r.v.items) || []);
        sheet(D.titleOf(t), `${list.length} meldingen in de afgelopen 24 uur · bron: alarmeringen.nl`, `<div class="x-sheetlist">${list.map(x => p2kRow(x, true)).join('') || '<div class="empty">Geen meldingen</div>'}</div>`);
      });
    },
  };

  // ---------- Verbindingen (zelfde als de balk linksonder) ----------
  T.conn = {
    label: 'Verbindingen', icon: 'server', size: [3, 1], title: t => t.opts.title || 'Verbindingen',
    render(t, inner, el) {
      const C = D.connbar; if (!C || !C.markup) { inner.innerHTML = '<div class="empty">Laden…</div>'; return; }
      const big = t.h >= 2 && t.opts.info !== false;
      inner.innerHTML = `<div class="cb-tile" data-base="cb-tile">${C.markup()}</div>${big ? `<div class="cb-tinfo" data-cbinfo>${C.info()}</div>` : ''}`;
      C.update();
      pressOpen(el, () => C.details());
    },
  };

  // ---------- NS- en busreisinformatie (los te plaatsen; opmaak als een reisinformatiebord) ----------
  const clockNow = () => new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  // achtergrond: std (NS-blauw / Arriva-rood), colors (eigen verloop), theme, photo (foto + donkerder/vervagen)
  const reisMode = o => o.bgMode || (o.themeColors ? 'theme' : 'std');
  const reisBg = o => {
    const m = reisMode(o); const st = []; let layers = '';
    // vakjes: glas (standaard), eigen kleur of geen; dekking, vervagen en rand instelbaar
    const pm = o.pMode || 'glass'; const pa = o.panel != null ? Number(o.panel) : (m === 'photo' ? 0.35 : null);
    if (pm === 'none') st.push('--xr-panel:transparent', '--xr-pborder:transparent', '--xr-pblur:0px', '--xr-ppad:0px');
    else {
      if (pm === 'color') st.push(`--xr-panel:${D.hexA(o.pColor || '#000000', pa != null ? pa : 0.3)}`);
      else if (pa != null) st.push(`--xr-panel:rgba(0,0,0,${pa})`);
      if (o.pBorder != null) st.push(`--xr-pborder:${pm === 'color' ? D.hexA(o.pColor || '#000000', Number(o.pBorder)) : `rgba(255,255,255,${Number(o.pBorder)})`}`);
      const pb = o.pBlur != null ? Number(o.pBlur) : (m === 'photo' ? 6 : 0); st.push(`--xr-pblur:${pb}px`);
    }
    if (o.warnColor) st.push(`--xr-warn:${o.warnColor}`);
    if (m === 'colors') st.push(`background:linear-gradient(165deg, ${o.c1 || '#0e2a6e'}, ${o.c2 || o.c1 || '#0a1d52'})`);
    if (m === 'photo' && o.photo) {
      layers = `<div class="xr-photo" style="background-image:url('${esc(o.photo)}');${o.blur ? `filter:blur(${Number(o.blur)}px);inset:-${Number(o.blur) * 2}px;` : ''}"></div><div class="xr-dim" style="background:rgba(0,0,0,${o.dim != null ? Number(o.dim) : 0.35})"></div>`;
    }
    return { cls: m === 'theme' ? ' themed' : m === 'photo' ? ' photo' : m === 'colors' ? ' custom' : '', style: st.join(';'), layers };
  };
  const reisWrap = (t, cls, title, sub, body) => { const bg = reisBg(t.opts); return `<div class="x-reis ${cls}${bg.cls}" style="${esc(bg.style)}">${bg.layers}<div class="xr-hd"><div class="xr-ht"><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}</div><b class="xr-clock">${clockNow()}</b></div>${body}</div>`; };
  const panel = (cls, h, inner) => `<div class="xr-panel ${cls}"><h4>${esc(h)}</h4><div class="xr-list">${inner}</div></div>`;
  const note = (r, what) => r && r.err ? (/^NS-vertrektijden zijn bij NS zelf/.test(r.err) ? `<div class="xr-warn">${esc(r.err)}</div>` : `<div class="xr-warn">${esc(what)} nu niet bereikbaar (${esc(r.err)}). Nieuwe poging over 30 sec.</div>`) : `<div class="xr-muted">Laden…</div>`;
  const staleNote = v => v && v.stale ? `<div class="xr-warn sm">Verbinding even weg; dit zijn de laatst bekende gegevens.</div>` : '';
  T.ns = {
    label: 'NS reisinformatie', icon: 'play', size: [6, 8], title: t => t.opts.title || 'NS reisinformatie',
    render(t, inner, el) {
      const o = t.opts; const st = o.stationCode;
      if (!st) { inner.innerHTML = reisWrap(t, 'ns', D.titleOf(t), '', '<div class="xr-muted pad">Kies bij Tegel je station (en vul je NS-sleutel in).</div>'); return; }
      const r = X.get('ns:' + st, 30e3, () => D.api('GET', '/api/x/ns/departures?station=' + encodeURIComponent(st)), ['ns']);
      const showDis = o.disruptions !== false;
      const rd = showDis ? X.get('nsd:' + st, 5 * 60e3, () => D.api('GET', '/api/x/ns/disruptions?station=' + encodeURIComponent(st)), ['ns']) : null;
      const n = Number(o.count) || 0;
      const deps = r.v ? r.v.departures.slice(0, n || 12) : null;
      const depHtml = !deps ? note(r, 'NS-vertrektijden') : staleNote(r.v) + (deps.map(d => `<div class="xr-row${d.cancelled ? ' gone' : ''}">
          <span class="xr-time">${hm(d.planned)}${d.delay ? `<em>+${d.delay}</em>` : ''}</span>
          <span class="xr-main"><b>${esc(d.dest)}</b><small>${esc([d.kind, d.cancelled ? 'rijdt niet' : '', d.via.length ? 'via ' + d.via.join(', ') : '', d.note].filter(Boolean).join(' · '))}</small></span>
          <span class="xr-track${d.trackChanged ? ' chg' : ''}" title="Spoor">${esc(d.track || '–')}</span></div>`).join('') || '<div class="xr-muted">Geen vertrektijden</div>');
      let disHtml = '';
      if (showDis) {
        const list = rd.v ? rd.v.list.filter(d => o.disMine ? d.mine : true) : null;
        disHtml = panel('xr-dis', 'Storingen & stakingen', !list ? note(rd, 'Storingen') : (list.map(d => `<div class="xr-item"><div><span class="xr-badge ${d.type === 'MAINTENANCE' ? 'werk' : d.type === 'CALAMITY' ? 'letop' : 'storing'}">${esc(d.label)}</span><b>${esc(d.title)}</b>${d.mine ? '<span class="xr-mine">dit station</span>' : ''}</div>${d.text ? `<small>${esc(d.text)}</small>` : ''}${d.extra ? `<small>${esc(d.extra)}</small>` : ''}</div>`).join('') || '<div class="xr-muted">Geen storingen of werkzaamheden</div>'));
      }
      inner.innerHTML = reisWrap(t, 'ns', D.titleOf(t), 'Vertrektijden station ' + (o.stationName || st), panel('xr-dep', 'Vertrek', depHtml) + disHtml);
    },
  };
  T.bus = {
    label: 'Bus reisinformatie', icon: 'play', size: [6, 8], title: t => t.opts.title || 'Bus reisinformatie',
    render(t, inner) {
      const o = t.opts; const code = o.stopCode;
      const lines = String(o.lines || '').trim(); const dest = String(o.dest || '').trim();
      const sub = [lines ? 'Lijn ' + lines.split(/[,\s]+/).filter(Boolean).join(', ') : '', [o.stopName ? o.stopName.split(',').pop().trim() : '', dest].filter(Boolean).join(' → ')].filter(Boolean).join(' · ');
      if (!code) { inner.innerHTML = reisWrap(t, 'bus', D.titleOf(t), '', '<div class="xr-muted pad">Kies bij Tegel je bushalte, lijn en richting.</div>'); return; }
      const q = `code=${encodeURIComponent(code)}&lines=${encodeURIComponent(lines)}&dest=${encodeURIComponent(dest)}`;
      const r = X.get('bus:' + q, 30e3, () => D.api('GET', '/api/x/bus?' + q), ['bus']);
      const n = Number(o.count) || 0;
      const mins = x => Math.round((new Date(x.expected) - Date.now()) / 6e4);
      const deps = r.v ? r.v.departures.slice(0, n || 10) : null;
      const depHtml = !deps ? note(r, 'Busgegevens') : staleNote(r.v) + (deps.map(d => `<div class="xr-row${d.cancelled ? ' gone' : ''}">
          <span class="xr-line">${esc(d.line)}</span>
          <span class="xr-main"><b>${esc(d.dest)}</b><small>${esc([hm(d.planned), d.delay ? '+' + d.delay + ' min' : 'op tijd', d.cancelled ? 'rijdt niet' : ''].filter(Boolean).join(' · '))}</small></span>
          <span class="xr-in${d.delay ? ' late' : ''}">${mins(d) <= 0 ? 'nu' : mins(d) + ' min'}</span></div>`).join('') || '<div class="xr-muted">Geen vertrektijden</div>');
      const msgs = r.v ? r.v.messages : null;
      const disHtml = o.disruptions === false ? '' : panel('xr-dis', 'Storingen, stakingen & omleidingen', !msgs ? (r.err ? '' : '<div class="xr-muted">Laden…</div>') : (msgs.map(m => `<div class="xr-item"><div><span class="xr-badge letop">LET OP</span><b>${esc(m.text)}</b></div>${m.end ? `<small>t/m ${esc(new Date(m.end).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</small>` : ''}</div>`).join('') || '<div class="xr-muted">Geen meldingen</div>'));
      inner.innerHTML = reisWrap(t, 'bus', D.titleOf(t), sub, panel('xr-dep', lines ? 'Lijn ' + lines : 'Vertrek', depHtml) + disHtml);
    },
  };
  setInterval(() => { if (D.cfg && !document.hidden) D.refreshWhere(t => t.type === 'ns' || t.type === 'bus'); }, 30e3);

  // ---------- 19. reistijd ----------
  T.travel = {
    label: 'Reistijd naar werk', icon: 'play', size: [3, 2], title: t => t.opts.title || 'Naar ' + (t.opts.label || 'werk'),
    render(t, inner) {
      const to = t.opts.to; if (!to) { inner.innerHTML = hd(t, 'play') + '<div class="empty">Vul bij Tegel het adres in</div>'; return; }
      const from = t.opts.from || loc();
      const r = X.get(`travel:${JSON.stringify(from)}:${to}`, 5 * 60e3, () => D.api('POST', '/api/x/travel', { from, to }), ['travel']);
      if (!r.v) { inner.innerHTML = wait(t, 'play', r); return; }
      const m = Math.round(r.v.sec / 60); const dl = r.v.delay ? Math.round(r.v.delay / 60) : 0;
      inner.innerHTML = hd(t, 'play', `${r.v.km.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} km${r.v.traffic ? ' · met files' : ' · zonder files'}`) + `<div class="big">${m} min</div>${dl ? `<div class="sub x-warn">${dl} min vertraging</div>` : r.v.traffic ? '<div class="sub x-ok">Geen vertraging</div>' : ''}`;
    },
  };

  // ---------- 20. NAS-status ----------
  const gb = b => b ? (b / 1024 ** 4 >= 1 ? (b / 1024 ** 4).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' TB' : Math.round(b / 1024 ** 3) + ' GB') : '–';
  const upt = s => { if (!s) return ''; if (typeof s === 'string') return s; const d = Math.floor(s / 86400); return d ? `${d} dagen aan` : `${Math.floor(s / 3600)} uur aan`; };
  T.nas = {
    label: 'NAS-status', icon: 'server', size: [3, 3], title: t => t.opts.title || 'NAS',
    render(t, inner) {
      const r = X.get('nas', 60e3, () => D.api('GET', '/api/x/nas'), ['nas']);
      if (!r.v) { inner.innerHTML = wait(t, 'server', r); return; }
      const v = r.v;
      inner.innerHTML = hd(t, 'server', esc([v.model, upt(v.uptime)].filter(Boolean).join(' · '))) + `<div class="x-chips">${v.temp != null ? `<span class="${v.temp > 60 ? 'x-warn' : ''}">${icon('thermo')}${v.temp}°C</span>` : ''}${v.cpu != null ? `<span>CPU ${v.cpu}%</span>` : ''}${v.mem != null ? `<span>Geheugen ${v.mem}%</span>` : ''}</div>
        <div class="list nopress">${v.volumes.map(x => `<div class="x-bat"><span>${esc(x.name)}</span><i style="--w:${x.total ? x.used / x.total * 100 : 0}%" class="${x.total && x.used / x.total > 0.9 ? 'low' : ''}"></i><b>${gb(x.total - x.used)} vrij</b></div>`).join('')}
        ${v.disks.map(x => `<div class="x-row"><span>${esc(x.name)}</span><b class="${/normal|good|ok/i.test(x.status || 'normal') ? '' : 'x-warn'}">${x.temp != null ? x.temp + '°C' : ''} ${esc(x.status || '')}</b></div>`).join('')}</div>`;
    },
  };

  // ---------- 21. Homey-status ----------
  T.homeyinfo = {
    label: 'Homey-status', icon: 'chip', size: [3, 3], title: t => t.opts.title || 'Homey',
    render(t, inner) {
      const r = X.get('homeyinfo', 60e3, () => D.api('GET', '/api/x/homey'), ['homeyinfo']);
      if (!r.v) { inner.innerHTML = wait(t, 'chip', r); return; }
      const v = r.v; const bar = (u, tt, n) => u && tt ? `<div class="x-bat"><span>${n}</span><i style="--w:${u / tt * 100}%" class="${u / tt > 0.9 ? 'low' : ''}"></i><b>${Math.round(u / tt * 100)}%</b></div>` : '';
      inner.innerHTML = hd(t, 'chip', esc([v.model, v.version ? 'v' + v.version : '', upt(v.uptime)].filter(Boolean).join(' · '))) +
        `<div class="x-chips"><span>${v.devices} apparaten</span><span>${v.apps} apps</span>${v.flows != null ? `<span>${v.flows} flows</span>` : ''}${v.link && v.link.ms != null ? `<span>${v.link.ms} ms</span>` : ''}</div>${bar(v.memUsed, v.memTotal, 'Geheugen')}${bar(v.stoUsed, v.stoTotal, 'Opslag')}`;
    },
  };

  // ---------- 22. kop en scheidingslijn ----------
  T.heading = {
    label: 'Kop of scheidingslijn', icon: 'text', size: [12, 1], title: t => t.opts.text || 'Kop',
    render(t, inner, el) {
      const o = t.opts; el.classList.add('frameless', 'notitle');
      inner.innerHTML = `<div class="x-head x-l-${o.line || 'under'}" style="text-align:${o.align || 'left'};font-size:${o.size || 1.4}em;${o.color ? `color:${o.color};--lc:${o.color}` : ''}"><span>${esc(o.text || '')}</span></div>`;
    },
  };
  // ---------- 23. lege ruimte en fotolijst ----------
  T.spacer = { label: 'Lege ruimte', icon: 'grid', size: [2, 2], title: () => 'Lege ruimte', render(t, inner, el) { el.classList.add('frameless', 'notitle', 'x-spacer'); inner.innerHTML = D.editing ? '<div class="empty">Lege ruimte</div>' : ''; } };
  let PHOTOS = null;
  T.photos = {
    label: 'Fotolijst', icon: 'image', size: [4, 4], title: t => t.opts.title || 'Fotolijst',
    render(t, inner, el) {
      if (!PHOTOS) { PHOTOS = []; D.api('GET', '/api/backgrounds').then(l => { PHOTOS = l; D.refreshWhere(x => x.type === 'photos'); }).catch(() => {}); }
      if (!PHOTOS.length) { inner.innerHTML = hd(t, 'image') + '<div class="empty">Upload foto\'s bij Scherm → Achtergrond → Foto</div>'; return; }
      const iv = (t.opts.interval || 20) * 1000; const i = Math.floor(Date.now() / iv) % PHOTOS.length;
      inner.innerHTML = `<div class="x-photo" style="background-image:url('${esc(PHOTOS[i])}');background-size:${t.opts.fit === 'contain' ? 'contain' : 'cover'}"></div>`;
      clearTimeout(el._ph); el._ph = setTimeout(() => D.refreshTile(t.id), iv - (Date.now() % iv) + 50);
    },
  };

  // ---------- 24. wifi voor gasten ----------
  let qrLoading = null;
  const qrLib = () => window.qrcode ? Promise.resolve() : (qrLoading = qrLoading || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/vendor/qrcode.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));
  const wesc = s => String(s || '').replace(/([\\;,:"])/g, '\\$1');
  T.wifiqr = {
    label: 'Wifi voor gasten', icon: 'globe', size: [3, 3], title: t => t.opts.title || 'Wifi',
    render(t, inner) {
      const o = t.opts; if (!o.ssid) { inner.innerHTML = hd(t, 'globe') + '<div class="empty">Vul bij Tegel de naam en het wachtwoord van je wifi in</div>'; return; }
      if (!window.qrcode) { inner.innerHTML = hd(t, 'globe') + '<div class="empty">Laden…</div>'; qrLib().then(() => D.refreshTile(t.id)).catch(() => {}); return; }
      const q = window.qrcode(0, 'M'); q.addData(`WIFI:T:${o.enc || 'WPA'};S:${wesc(o.ssid)};P:${wesc(o.pass)};${o.hidden ? 'H:true;' : ''};`); q.make();
      inner.innerHTML = `<div class="x-qr">${q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}<div><b>${esc(o.ssid)}</b>${o.showPass !== false && o.pass ? `<small>${esc(o.pass)}</small>` : ''}<small>Scan met je camera</small></div></div>`;
    },
  };

  // ---------- in de bibliotheek (Toevoegen → Overig) ----------
  D.EXTRA2 = [
    ['openings', 'Ramen en deuren', 'Alles dicht of wat er open staat'], ['lights', 'Lampen-overzicht', 'Hoeveel lampen aan, met Alles uit'], ['room', 'Kamerkaart', 'Temperatuur, vocht, lampen en ramen van één ruimte'],
    ['batteries', 'Batterijen', 'Alle batterijen, de laagste bovenaan'], ['thermo', 'Thermostaat groot', 'Grote ronde thermostaat met plus en min'],
    ['rain', 'Buienradar', 'Regen in de komende 2 uur'], ['weather', 'Weer', 'Nu en de komende dagen'], ['air', 'Luchtkwaliteit en pollen', 'Fijnstof en hooikoorts'], ['sunmoon', 'Zon en maan', 'Op, onder en maanfase'],
    ['price', 'Stroomprijs', 'Dynamische prijs per uur, goedkoopste uren'], ['solar', 'Zonnepanelen', 'Opbrengst nu en vandaag'], ['usage', 'Verbruik per dag', 'Stroom of gas per dag'],
    ['waste', 'Afvalkalender', 'Welke container wanneer (Twente Milieu)'], ['agenda', 'Agenda', 'Afspraken uit Google of iCloud'], ['countdown', 'Afteller', 'Aantal dagen tot …'],
    ['notes', 'Boodschappen en notities', 'Lijstje, gedeeld met alle schermen'], ['timer', 'Kookwekker', 'Timer met geluid'],
    ['departures', 'Vertrektijden bus en tram', 'Bij jouw halte'], ['travel', 'Reistijd naar werk', 'Met de auto'], ['p2000', 'P2000 Twente', 'Meldingen brandweer, ambulance en politie'], ['ns', 'NS reisinformatie', 'Vertrektijden en storingen van je station'], ['bus', 'Bus reisinformatie', 'Live vertrektijden en omleidingen van je halte'],
    ['conn', 'Verbindingen', 'Scherm, NAS, Homey en back-up (zoals de balk linksonder)'], ['nas', 'NAS-status', 'Schijven, temperatuur, opslag'], ['homeyinfo', 'Homey-status', 'Versie, geheugen, aantallen'],
    ['heading', 'Kop of scheidingslijn', 'Tabblad in blokken verdelen'], ['spacer', 'Lege ruimte', 'Onzichtbare tegel als ruimte'], ['photos', 'Fotolijst', 'Diashow van je eigen foto\'s'], ['wifiqr', 'Wifi voor gasten', 'QR-code om te scannen'],
  ];
  D.EXTRA2_DEFAULTS = { ns: { style: { frameless: true, hideTitle: true } }, bus: { style: { frameless: true, hideTitle: true } }, conn: { style: { hideTitle: true } }, heading: { opts: { text: 'Kop', line: 'under', size: 1.4 }, style: { frameless: true, hideTitle: true } }, spacer: { style: { frameless: true, hideTitle: true, opacity: 0 } }, photos: { style: { hideTitle: true } }, wifiqr: { opts: { enc: 'WPA' } } };

  // ---------- opties bij Tegel ----------
  const devSel = (P, F, cur, filter, label = 'Apparaat') => F.row(label, F.select(`${P}.opts.deviceId`, cur || '', [['', 'Kies…'], ...D.lib.devices.filter(filter).sort((a, b) => a.name.localeCompare(b.name)).map(d => [d.id, d.name])], 'tilepanel'));
  D.tileOptions = {
    room: (t, P, F) => F.row('Ruimte', F.select(`${P}.opts.zoneId`, t.opts.zoneId || '', [['', 'Kies…'], ...D.lib.zones.map(z => [z.id, z.name])], 'tilepanel')) +
      F.row('Tik opent pagina', F.select(`${P}.opts.page`, t.opts.page || '', [['', 'Niets'], ...D.cfg.tabs.map(x => [x.id, (x.sub ? 'Subpagina: ' : '') + x.name])], 'tile')),
    thermo: (t, P, F) => devSel(P, F, t.opts.deviceId, d => !!d.caps.target_temperature, 'Thermostaat'),
    solar: (t, P, F) => devSel(P, F, t.opts.deviceId, d => !!d.caps.measure_power, 'Omvormer / panelen'),
    usage: (t, P, F) => devSel(P, F, t.opts.deviceId, d => Object.keys(d.caps).some(k => k.startsWith('meter_')), 'Meter') + F.row('Periode', F.seg(`${P}.opts.days`, t.opts.days || 7, [[7, '7 dagen'], [31, '31 dagen']], 'tile')),
    weather: (t, P, F) => F.row('Aantal dagen', F.range(`${P}.opts.days`, t.opts.days || 5, 1, 7, 1, 'tile', 'n')) + '<p class="note">Plaats: Scherm → Nachtmodus (zon) gebruikt dezelfde plek; standaard Enschede.</p>',
    waste: (t, P, F) => F.row('Postcode', F.text(`${P}.opts.postcode`, t.opts.postcode, 'tile', '7511 AB')) + F.row('Huisnummer', F.text(`${P}.opts.nr`, t.opts.nr, 'tile', '12')) + F.row('Toevoeging', F.text(`${P}.opts.letter`, t.opts.letter, 'tile', 'A')) +
      F.row('Inzamelaar-code', F.text(`${P}.opts.company`, t.opts.company, 'tile', 'leeg = Twente Milieu'), 'Alleen nodig buiten Twente (Ximmio-code)'),
    agenda: (t, P, F) => `<div class="f col"><label>iCal-adres(sen), één per regel<small>Google: Agenda-instellingen → "Geheim adres in iCal-indeling". iCloud: agenda delen als openbaar.</small></label><textarea data-k="${P}.opts.urls" data-fx="tile" rows="3">${esc(t.opts.urls || '')}</textarea></div>`,
    countdown: (t, P, F) => F.row('Datum', `<input type="date" data-k="${P}.opts.date" data-fx="tile" value="${esc(t.opts.date || '')}">`) + F.row('Waarvoor', F.text(`${P}.opts.label`, t.opts.label, 'tile', 'de vakantie')) + F.row('Emoji', F.text(`${P}.opts.emoji`, t.opts.emoji, 'tile', '🎉')),
    notes: (t, P, F) => F.row('Lijst', F.text(`${P}.opts.listId`, t.opts.listId, 'tile', 'leeg = eigen lijst'), 'Zelfde naam op twee tegels = dezelfde lijst') + F.row('Tekst in het veld', F.text(`${P}.opts.placeholder`, t.opts.placeholder, 'tile', 'Toevoegen…')),
    timer: (t, P, F) => F.row('Standaard (min)', F.num(`${P}.opts.dflt`, t.opts.dflt || 5, 1, 180, 'tile')),
    departures: (t, P, F) => `<div class="f col"><label>Halte<small>${esc(t.opts.stopName || 'Nog geen halte gekozen')}</small></label><div class="x-ovsearch"><input type="search" placeholder="Zoek: Enschede, Station" data-ovq><div data-ovres></div></div></div>` +
      F.row('Alleen lijnen', F.text(`${P}.opts.lines`, t.opts.lines, 'tile', 'bijv. 1, 9'), 'Leeg = alle lijnen') + '<p class="note">Bus, tram en metro (OVapi). Treinen van de NS zitten hier niet in.</p>',
    health: (t, P, F) => F.row('Tekst als alles goed is', F.text(`${P}.opts.okText`, (t.opts || {}).okText, 'tile', 'Alles in orde'), 'Leeg = "Alles in orde"'),
    ns: (t, P, F) => `<div class="f col"><label>Station<small>${esc(t.opts.stationName ? t.opts.stationName + ' (' + t.opts.stationCode + ')' : 'Nog geen station gekozen')}</small></label><div class="x-ovsearch"><input type="search" placeholder="Zoek: Enschede" data-nsq><div data-nsres></div></div></div>` +
      F.row('Aantal vertrektijden', F.num(`${P}.opts.count`, t.opts.count || 12, 3, 25, 'tile')) +
      F.row('Storingen tonen', F.toggle(`${P}.opts.disruptions`, t.opts.disruptions !== false, 'tile')) + F.row('Alleen dit station', F.toggle(`${P}.opts.disMine`, !!t.opts.disMine, 'tile'), 'Uit = ook storingen en werkzaamheden elders (dit station bovenaan)') +
      F.row('Achtergrond', F.seg(`${P}.opts.bgMode`, reisMode(t.opts), [['std', 'NS-blauw'], ['colors', 'Kleuren'], ['theme', 'Thema'], ['photo', 'Foto']], 'tilepanel')) +
      (reisMode(t.opts) === 'colors' ? F.row('Kleur boven', F.color(`${P}.opts.c1`, t.opts.c1 || '#0e2a6e', 'tile')) + F.row('Kleur onder', F.color(`${P}.opts.c2`, t.opts.c2 || '#0a1d52', 'tile'), 'Twee keer dezelfde kleur = effen') : '') +
      (reisMode(t.opts) === 'photo' ? `<div class="f col"><label>Foto<small>Kies een foto of upload een nieuwe (ook te gebruiken bij Scherm → Achtergrond)</small></label><div class="gallery" data-xrgal><div class="muted">Laden…</div></div><label class="btn sm upl">${icon('upload')}Foto uploaden<input type="file" accept="image/*" data-xrfile hidden></label></div>` +
        F.row('Donkerder maken', F.range(`${P}.opts.dim`, t.opts.dim != null ? t.opts.dim : 0.35, 0, 0.85, 0.01, 'tile', '%')) + F.row('Vervagen', F.range(`${P}.opts.blur`, t.opts.blur || 0, 0, 20, 1, 'tile', 'px')) : '') +
      F.row('Vakjes', F.seg(`${P}.opts.pMode`, t.opts.pMode || 'glass', [['glass', 'Glas'], ['color', 'Eigen kleur'], ['none', 'Geen']], 'tilepanel'), 'Achtergrond van de vakken Vertrek en Storingen') +
      ((t.opts.pMode || 'glass') === 'none' ? '' :
        ((t.opts.pMode === 'color') ? F.row('Kleur vakjes', F.color(`${P}.opts.pColor`, t.opts.pColor || '#000000', 'tile')) : '') +
        F.row('Dekking vakjes', F.range(`${P}.opts.panel`, t.opts.panel != null ? t.opts.panel : (t.opts.pMode === 'color' ? 0.3 : reisMode(t.opts) === 'photo' ? 0.35 : 0.05), 0, 1, 0.01, 'tile', '%'), '0% = helemaal doorzichtig') +
        F.row('Vervagen', F.range(`${P}.opts.pBlur`, t.opts.pBlur != null ? t.opts.pBlur : (reisMode(t.opts) === 'photo' ? 6 : 0), 0, 20, 1, 'tile', 'px'), 'Hoe wazig de achtergrond achter de vakjes is') +
        F.row('Rand', F.range(`${P}.opts.pBorder`, t.opts.pBorder != null ? t.opts.pBorder : 0.14, 0, 1, 0.01, 'tile', '%'))) +
      F.row('Kleur meldingen', F.colorOpt(`${P}.opts.warnColor`, t.opts.warnColor, '#ffcf4a', 'tile'), 'Bijv. "tijdelijk niet beschikbaar" en "verbinding even weg"') +
      `<div class="f col"><label>NS-sleutel<small data-nsstat>Gratis via apiportal.ns.nl. Wordt alleen op de NAS bewaard.</small></label><div class="x-ovsearch"><input type="password" placeholder="Plak hier je sleutel" data-nskey autocomplete="off"><button class="btn sm" data-nssave>Opslaan</button></div></div>`,
    bus: (t, P, F) => `<div class="f col"><label>Halte<small>${esc(t.opts.stopName || 'Nog geen halte gekozen')}</small></label><div class="x-ovsearch"><input type="search" placeholder="Zoek: Enschede, Het Oosterveld" data-ovq><div data-ovres></div></div></div>` +
      F.row('Lijn(en)', F.text(`${P}.opts.lines`, t.opts.lines, 'tile', 'bijv. 2'), 'Leeg = alle lijnen') +
      F.row('Richting', F.text(`${P}.opts.dest`, t.opts.dest, 'tile', 'bijv. Deppenbroek'), 'Deel van de eindbestemming; leeg = beide richtingen') +
      F.row('Aantal vertrektijden', F.num(`${P}.opts.count`, t.opts.count || 10, 3, 20, 'tile')) +
      F.row('Meldingen tonen', F.toggle(`${P}.opts.disruptions`, t.opts.disruptions !== false, 'tile'), 'Storingen en omleidingen die de vervoerder op de halte zet') +
      F.row('Achtergrond', F.seg(`${P}.opts.bgMode`, reisMode(t.opts), [['std', 'Arriva-rood'], ['colors', 'Kleuren'], ['theme', 'Thema'], ['photo', 'Foto']], 'tilepanel')) +
      (reisMode(t.opts) === 'colors' ? F.row('Kleur boven', F.color(`${P}.opts.c1`, t.opts.c1 || '#3d0b17', 'tile')) + F.row('Kleur onder', F.color(`${P}.opts.c2`, t.opts.c2 || '#5a1526', 'tile'), 'Twee keer dezelfde kleur = effen') : '') +
      (reisMode(t.opts) === 'photo' ? `<div class="f col"><label>Foto<small>Kies een foto of upload een nieuwe (ook te gebruiken bij Scherm → Achtergrond)</small></label><div class="gallery" data-xrgal><div class="muted">Laden…</div></div><label class="btn sm upl">${icon('upload')}Foto uploaden<input type="file" accept="image/*" data-xrfile hidden></label></div>` +
        F.row('Donkerder maken', F.range(`${P}.opts.dim`, t.opts.dim != null ? t.opts.dim : 0.35, 0, 0.85, 0.01, 'tile', '%')) + F.row('Vervagen', F.range(`${P}.opts.blur`, t.opts.blur || 0, 0, 20, 1, 'tile', 'px')) : '') +
      F.row('Vakjes', F.seg(`${P}.opts.pMode`, t.opts.pMode || 'glass', [['glass', 'Glas'], ['color', 'Eigen kleur'], ['none', 'Geen']], 'tilepanel'), 'Achtergrond van de vakken Vertrek en Storingen') +
      ((t.opts.pMode || 'glass') === 'none' ? '' :
        ((t.opts.pMode === 'color') ? F.row('Kleur vakjes', F.color(`${P}.opts.pColor`, t.opts.pColor || '#000000', 'tile')) : '') +
        F.row('Dekking vakjes', F.range(`${P}.opts.panel`, t.opts.panel != null ? t.opts.panel : (t.opts.pMode === 'color' ? 0.3 : reisMode(t.opts) === 'photo' ? 0.35 : 0.05), 0, 1, 0.01, 'tile', '%'), '0% = helemaal doorzichtig') +
        F.row('Vervagen', F.range(`${P}.opts.pBlur`, t.opts.pBlur != null ? t.opts.pBlur : (reisMode(t.opts) === 'photo' ? 6 : 0), 0, 20, 1, 'tile', 'px'), 'Hoe wazig de achtergrond achter de vakjes is') +
        F.row('Rand', F.range(`${P}.opts.pBorder`, t.opts.pBorder != null ? t.opts.pBorder : 0.14, 0, 1, 0.01, 'tile', '%'))) +
      F.row('Kleur meldingen', F.colorOpt(`${P}.opts.warnColor`, t.opts.warnColor, '#ffcf4a', 'tile'), 'Bijv. "tijdelijk niet beschikbaar" en "verbinding even weg"') +
      '<p class="note">Live via OVapi (bus, tram, metro van alle vervoerders, ook Arriva).</p>',
    conn: (t, P, F) => F.row('Tekst eronder', F.toggle(`${P}.opts.info`, t.opts.info !== false, 'tile'), 'Reactietijden en back-up; vanaf 2 hoog') +
      '<p class="note">De vaste balk linksonder stel je in bij Scherm → Statusbalk linksonder.</p>',
    p2000: (t, P, F) => F.row('Brandweer', F.toggle(`${P}.opts.fire`, t.opts.fire !== false, 'tile')) + F.row('Ambulance', F.toggle(`${P}.opts.ambu`, t.opts.ambu !== false, 'tile')) + F.row('Politie', F.toggle(`${P}.opts.pol`, t.opts.pol !== false, 'tile')) +
      F.row('Alleen spoed', F.toggle(`${P}.opts.urgent`, !!t.opts.urgent, 'tile'), 'A0/A1, P 1 en prio 1. Politiemeldingen hebben meestal geen spoedcode en vallen dan weg.') +
      F.row('Alleen plaatsen', F.text(`${P}.opts.places`, t.opts.places, 'tile', 'bijv. Enschede, Hengelo'), 'Leeg = heel Twente') +
      '<p class="note">De NAS haalt elke 2 minuten de meldingen op bij alarmeringen.nl en bewaart die van Twente 24 uur. Tik op de tegel voor de hele lijst met de volledige P2000-tekst.</p>',
    travel: (t, P, F) => F.row('Naar', F.text(`${P}.opts.to`, t.opts.to, 'tile', 'Straat 1, Plaats')) + F.row('Naam', F.text(`${P}.opts.label`, t.opts.label, 'tile', 'werk')) +
      `<div class="f col"><label>TomTom-sleutel (voor files)<small>Optioneel en gratis via developer.tomtom.com. Zonder sleutel: reistijd zonder files.</small></label><div class="x-ovsearch"><input type="password" placeholder="Plak hier je sleutel" data-tomtom><button class="btn sm" data-savekey>Opslaan</button></div></div>`,
    nas: () => `<div class="f col"><label>NAS-account<small>Wordt alleen op de NAS bewaard. Tip: maak een aparte gebruiker zonder tweestapsverificatie.</small></label>
      <div class="x-ovsearch"><input type="text" placeholder="http://192.168.178.79:5000" data-nasurl><input type="text" placeholder="Gebruiker" data-nasuser><input type="password" placeholder="Wachtwoord" data-naspass><button class="btn sm" data-nassave>Opslaan</button></div><small data-nasstat class="muted"></small></div>`,
    heading: (t, P, F) => F.row('Tekst', F.text(`${P}.opts.text`, t.opts.text, 'tile')) + F.row('Grootte', F.range(`${P}.opts.size`, t.opts.size || 1.4, 0.6, 4, 0.05, 'tile', 'x')) +
      F.row('Lijn', F.seg(`${P}.opts.line`, t.opts.line || 'under', [['none', 'Geen'], ['under', 'Onder'], ['through', 'Door'], ['dots', 'Stippel']], 'tile')) + F.row('Uitlijnen', F.seg(`${P}.opts.align`, t.opts.align || 'left', [['left', 'Links'], ['center', 'Midden'], ['right', 'Rechts']], 'tile')) + F.row('Kleur', F.colorOpt(`${P}.opts.color`, t.opts.color, '#ffffff', 'tilepanel')),
    photos: (t, P, F) => F.row('Wissel elke', F.range(`${P}.opts.interval`, t.opts.interval || 20, 5, 300, 5, 'tile', 's')) + F.row('Passend', F.seg(`${P}.opts.fit`, t.opts.fit || 'cover', [['cover', 'Vullen'], ['contain', 'Helemaal tonen']], 'tile')),
    wifiqr: (t, P, F) => F.row('Netwerknaam', F.text(`${P}.opts.ssid`, t.opts.ssid, 'tile')) + F.row('Wachtwoord', F.text(`${P}.opts.pass`, t.opts.pass, 'tile')) + F.row('Beveiliging', F.seg(`${P}.opts.enc`, t.opts.enc || 'WPA', [['WPA', 'WPA/WPA2/WPA3'], ['WEP', 'WEP'], ['nopass', 'Open']], 'tile')) +
      F.row('Wachtwoord tonen', F.toggle(`${P}.opts.showPass`, t.opts.showPass !== false, 'tile')) + F.row('Verborgen netwerk', F.toggle(`${P}.opts.hidden`, !!t.opts.hidden, 'tile')) + '<p class="note">Let op: het wachtwoord staat in je indeling op de NAS.</p>',
  };
  // foto kiezen/uploaden voor de reistegels
  const reisPhotoWire = async (root, t) => {
    const gal = root.querySelector('[data-xrgal]'); if (!gal) return;
    const pick = url => D.editor.commit(null, () => { t.opts.photo = url; t.opts.bgMode = 'photo'; }, () => { D.renderGrid(); D.editor.refreshPanel(); });
    const list = await D.api('GET', '/api/backgrounds').catch(() => []);
    gal.innerHTML = list.map(u => `<div class="thumb${u === t.opts.photo ? ' act' : ''}" data-img="${esc(u)}" style="background-image:url('${esc(u)}')"></div>`).join('') || '<div class="muted">Nog geen foto\'s. Upload er een.</div>';
    gal.querySelectorAll('[data-img]').forEach(th => th.onclick = () => pick(th.dataset.img));
    const f = root.querySelector('[data-xrfile]');
    if (f) f.onchange = async () => {
      const file = f.files[0]; if (!file) return; D.toast('Foto verwerken…');
      try {
        const bmp = await createImageBitmap(file); const r = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * r); c.height = Math.round(bmp.height * r); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const { url } = await D.api('POST', '/api/backgrounds', { name: file.name, dataUrl: c.toDataURL('image/jpeg', 0.86) });
        pick(url); D.toast('Foto toegevoegd');
      } catch (e) { D.toast('Uploaden mislukt: ' + e.message, true); }
    };
  };
  D.tileWire = {
    ns: (root, t) => {
      reisPhotoWire(root, t);
      const q = root.querySelector('[data-nsq]'), res = root.querySelector('[data-nsres]'); let tm;
      if (q) q.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { if (q.value.trim().length < 2) { res.innerHTML = ''; return; } res.innerHTML = '<small class="muted">Zoeken…</small>';
        try { const l = await D.api('GET', '/api/x/ns/stations?q=' + encodeURIComponent(q.value.trim())); res.innerHTML = l.map(s2 => `<button class="btn sm ghost" data-st="${esc(s2.code)}" data-name="${esc(s2.name)}">${esc(s2.name)}</button>`).join('') || '<small class="muted">Niets gevonden</small>';
          res.querySelectorAll('[data-st]').forEach(b => b.onclick = () => D.editor.commit(null, () => { t.opts.stationCode = b.dataset.st; t.opts.stationName = b.dataset.name; }, () => { X.c.clear(); D.renderGrid(); D.editor.refreshPanel(); })); } catch (e) { res.innerHTML = `<small class="muted">${esc(e.message)}</small>`; } }, 400); };
      const st = root.querySelector('[data-nsstat]'); D.api('GET', '/api/x/secrets').then(s2 => { if (st && s2.ns) st.textContent = 'Sleutel is ingesteld (staat alleen op de NAS). Opnieuw invullen vervangt hem.'; }).catch(() => {});
      const b = root.querySelector('[data-nssave]'); if (b) b.onclick = async () => { const v = root.querySelector('[data-nskey]').value.trim(); if (!v) { D.toast('Plak eerst je sleutel', true); return; }
        try { await D.api('POST', '/api/x/key', { name: 'ns', value: v }); root.querySelector('[data-nskey]').value = ''; D.toast('NS-sleutel opgeslagen op de NAS'); X.c.clear(); D.renderGrid(); D.editor.refreshPanel(); } catch (e) { D.toast(e.message, true); } };
    },
    bus: (root, t, P) => { reisPhotoWire(root, t); D.tileWire.departures(root, t, P); },
    departures: (root, t, P) => {
      const q = root.querySelector('[data-ovq]'), res = root.querySelector('[data-ovres]'); if (!q) return; let tm;
      q.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => { if (q.value.trim().length < 3) { res.innerHTML = ''; return; } res.innerHTML = '<small class="muted">Zoeken…</small>';
        try { const l = await D.api('GET', '/api/x/ov/search?q=' + encodeURIComponent(q.value.trim())); res.innerHTML = l.map(s => `<button class="btn sm ghost" data-ov="${esc(s.code)}" data-name="${esc(s.name)}">${esc(s.name)}</button>`).join('') || '<small class="muted">Niets gevonden</small>';
          res.querySelectorAll('[data-ov]').forEach(b => b.onclick = () => D.editor.commit(null, () => { t.opts.stopCode = b.dataset.ov; t.opts.stopName = b.dataset.name; }, () => { D.renderGrid(); D.editor.refreshPanel(); })); } catch (e) { res.innerHTML = `<small class="muted">${esc(e.message)}</small>`; } }, 400); };
    },
    travel: root => { const b = root.querySelector('[data-savekey]'); if (b) b.onclick = async () => { try { await D.api('POST', '/api/x/key', { name: 'tomtom', value: root.querySelector('[data-tomtom]').value }); D.toast('Sleutel opgeslagen op de NAS'); X.c.clear(); D.renderGrid(); } catch (e) { D.toast(e.message, true); } }; },
    nas: root => {
      const st = root.querySelector('[data-nasstat]');
      D.api('GET', '/api/x/secrets').then(s => { if (st) st.textContent = s.nas ? `Ingesteld voor ${s.nasUser} (${s.nasUrl})` : 'Nog niet ingesteld'; const u = root.querySelector('[data-nasurl]'); if (u && s.nasUrl) u.value = s.nasUrl; const us = root.querySelector('[data-nasuser]'); if (us && s.nasUser) us.value = s.nasUser; }).catch(() => {});
      const b = root.querySelector('[data-nassave]'); if (b) b.onclick = async () => {
        const url = root.querySelector('[data-nasurl]').value.trim() || 'http://192.168.178.79:5000'; const user = root.querySelector('[data-nasuser]').value.trim(); const pass = root.querySelector('[data-naspass]').value;
        try { await D.api('POST', '/api/x/nas/setup', { url, user, pass: pass || undefined }); D.toast('NAS-account opgeslagen'); X.c.delete('nas'); D.renderGrid(); } catch (e) { D.toast(e.message, true); }
      };
    },
  };
})();
