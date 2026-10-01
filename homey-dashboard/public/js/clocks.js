/* Klokken: 12 analoge en 12 digitale stijlen, allemaal aan te passen (kleuren, seconden, datum, 12/24 uur, grootte).
   Stijl en opties staan in t.opts; kleuren als CSS-variabelen op de tegel. */
(function () {
  const D = window.D; const T = D.tiles; const esc = D.esc;
  const STYLES = [
    ['d-thin', 'Digitaal: groot en dun', 'd'], ['d-bold', 'Digitaal: vet', 'd'], ['d-7seg', 'Digitaal: 7-segment (ledwekker)', 'd'],
    ['d-flip', 'Digitaal: flipklok', 'd'], ['d-nixie', 'Digitaal: nixiebuizen', 'd'], ['d-lcd', 'Digitaal: lcd retro', 'd'],
    ['d-matrix', 'Digitaal: puntjesmatrix', 'd'], ['d-stack', 'Digitaal: uren boven minuten', 'd'], ['d-ring', 'Digitaal: met secondenring', 'd'],
    ['d-words', 'Digitaal: woordklok', 'd'], ['d-week', 'Digitaal: met datum en week', 'd'], ['d-sun', 'Digitaal: met zon op en onder', 'd'],
    ['a-minimal', 'Analoog: strak minimaal', 'a'], ['a-roman', 'Analoog: Romeinse cijfers', 'a'], ['a-station', 'Analoog: stationsklok', 'a'],
    ['a-bauhaus', 'Analoog: grote cijfers', 'a'], ['a-chrono', 'Analoog: chronograaf', 'a'], ['a-dots', 'Analoog: stippen', 'a'],
    ['a-neon', 'Analoog: neon', 'a'], ['a-glass', 'Analoog: glas', 'a'], ['a-skeleton', 'Analoog: skelet', 'a'],
    ['a-vintage', 'Analoog: vintage', 'a'], ['a-kids', 'Analoog: kinderklok', 'a'], ['a-world', 'Analoog: twee tijdzones', 'a'],
  ];
  D.CLOCK_STYLES = STYLES;
  const pad = n => String(n).padStart(2, '0');
  const ROMAN = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  const KIDS = ['#ff5d5d', '#ff9f43', '#ffd166', '#7bd389', '#4cc9f0', '#5aa9ff', '#9b7bff', '#ff7ac6', '#ff5d5d', '#ff9f43', '#7bd389', '#4cc9f0'];

  // tijd in een andere tijdzone (voor de wereldklok)
  const inTz = (tz, now) => { try { const s = now.toLocaleString('en-US', { timeZone: tz }); return new Date(s); } catch (e) { return now; } };

  // ---------- analoog ----------
  const analog = (st, now, o, small) => {
    const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
    const aH = (h + m / 60) * 30, aM = (m + s / 60) * 6, aS = s * 6;
    const P = (a, r) => { const rad = (a - 90) * Math.PI / 180; return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)]; };
    let face = '', marks = '', nums = '', extra = '';
    const tick = (i, r1, r2, w, cls = '') => { const [x1, y1] = P(i * 6, r1), [x2, y2] = P(i * 6, r2); return `<line class="ck-t ${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${w}"/>`; };
    const num = (i, r, txt, cls = '', fill = '') => { const [x, y] = P(i * 30, r); return `<text class="ck-n ${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}"${fill ? ` style="fill:${fill}"` : ''}>${txt}</text>`; };
    face = `<circle class="ck-face" cx="100" cy="100" r="96"/>`;
    if (st === 'a-minimal') for (let i = 0; i < 60; i += 5) marks += tick(i, 84, 92, i % 15 ? 2 : 4);
    if (st === 'a-roman' || st === 'a-vintage') { for (let i = 0; i < 60; i++) marks += tick(i, i % 5 ? 89 : 86, 92, i % 5 ? 0.8 : 2); for (let i = 0; i < 12; i++) nums += num(i, 72, st === 'a-roman' ? ROMAN[i] : (i || 12), 'serif'); }
    if (st === 'a-station') for (let i = 0; i < 60; i++) marks += tick(i, i % 5 ? 85 : 72, 90, i % 5 ? 2 : 6, 'sq');
    if (st === 'a-bauhaus') for (let i = 0; i < 12; i++) nums += num(i, 74, i || 12, 'big');
    if (st === 'a-kids') for (let i = 0; i < 12; i++) nums += num(i, 74, i || 12, 'big kid', KIDS[i]);
    if (st === 'a-dots') for (let i = 0; i < 12; i++) { const [x, y] = P(i * 30, 82); marks += `<circle class="ck-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 ? 3.2 : 6}"/>`; }
    if (st === 'a-neon') { face += `<circle class="ck-neon" cx="100" cy="100" r="90"/>`; for (let i = 0; i < 60; i += 5) marks += tick(i, 78, 84, i % 15 ? 2 : 4, 'acc'); }
    if (st === 'a-glass') { face += `<ellipse class="ck-shine" cx="80" cy="56" rx="62" ry="34"/>`; for (let i = 0; i < 60; i += 5) marks += tick(i, 86, 92, 2); }
    if (st === 'a-skeleton') { face = `<circle class="ck-face ck-skel" cx="100" cy="100" r="96"/>`; extra += `<g class="ck-gears"><circle cx="70" cy="128" r="22"/><circle cx="70" cy="128" r="8"/><circle cx="132" cy="124" r="16"/><circle cx="132" cy="124" r="5"/><circle cx="100" cy="66" r="18"/><circle cx="100" cy="66" r="6"/></g>`; for (let i = 0; i < 60; i += 5) marks += tick(i, 84, 92, 2.5); }
    if (st === 'a-chrono') {
      for (let i = 0; i < 60; i++) marks += tick(i, i % 5 ? 90 : 84, 93, i % 5 ? 0.8 : 2.4);
      for (let i = 0; i < 12; i += 3) nums += num(i, 72, i || 12, 'mid');
      const sub = (cx, cy, a, lbl) => `<circle class="ck-sub" cx="${cx}" cy="${cy}" r="17"/><line class="ck-subh" x1="${cx}" y1="${cy}" x2="${(cx + 13 * Math.sin(a * Math.PI / 180)).toFixed(1)}" y2="${(cy - 13 * Math.cos(a * Math.PI / 180)).toFixed(1)}"/><text class="ck-subl" x="${cx}" y="${cy + 9}">${lbl}</text>`;
      extra += sub(100, 138, aS, '') + sub(62, 100, (now.getDate() / 31) * 360, now.getDate()) + sub(138, 100, ((now.getDay() + 6) % 7) * (360 / 7), ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'][(now.getDay() + 6) % 7]);
    }
    const hand = (cls, a, len, w, tail = 12) => { const [x1, y1] = P(a + 180, tail), [x2, y2] = P(a, len); return `<line class="ck-h ${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${w}"/>`; };
    const thick = { 'a-station': [9, 6], 'a-bauhaus': [7, 5], 'a-kids': [10, 7], 'a-minimal': [4, 3], 'a-vintage': [4, 2.5], 'a-roman': [4.5, 3] }[st] || [5, 3.5];
    let hands = hand('hh', aH, 52, thick[0]) + hand('mh', aM, 76, thick[1]);
    if (o.seconds !== false) {
      const sty = o.smooth ? `animation-delay:-${(s + ms / 1000).toFixed(2)}s` : `transform:rotate(${aS}deg)`;
      hands += st === 'a-station'
        ? `<g class="ck-sec${o.smooth ? ' smooth' : ''}" style="${sty}"><line class="ck-h sh" x1="100" y1="128" x2="100" y2="42" stroke-width="2.4"/><circle class="ck-sdot" cx="100" cy="40" r="8"/></g>`
        : `<g class="ck-sec${o.smooth ? ' smooth' : ''}" style="${sty}"><line class="ck-h sh" x1="100" y1="118" x2="100" y2="18" stroke-width="1.6"/></g>`;
    }
    hands += `<circle class="ck-cap" cx="100" cy="100" r="${st === 'a-station' ? 4 : 5}"/>`;
    return `<svg class="ck-an ${st}${small ? ' small' : ''}" viewBox="0 0 200 200">${face}${extra}${marks}${nums}${hands}</svg>`;
  };

  // ---------- digitaal: 7-segment en matrix ----------
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const seg7 = ch => { const on = SEG[ch] || ''; const p = { a: 'M6,2h20l-4,4h-12z', b: 'M28,4v20l-4,-3v-14z', c: 'M28,28v20l-4,-4v-13z', d: 'M6,50h20l-4,-4h-12z', e: 'M4,28v20l4,-4v-13z', f: 'M4,4v20l4,-3v-14z', g: 'M6,26h20l-3,3h-14l-3,-3z' };
    return `<svg class="s7" viewBox="0 0 32 52">${Object.entries(p).map(([k, d]) => `<path d="${d}" class="${on.includes(k) ? 'on' : ''}"/>`).join('')}</svg>`; };
  const FONT5x7 = { 0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], 2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'], 4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'], 6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], 8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'], ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'] };
  const matrix = txt => { const ch = [...txt]; const W = ch.length * 6 - 1; let dots = '';
    ch.forEach((c, ci) => (FONT5x7[c] || FONT5x7[0]).forEach((row, y) => [...row].forEach((b, x) => { dots += `<circle cx="${ci * 6 + x + 0.5}" cy="${y + 0.5}" r=".38" class="${b === '1' ? 'on' : ''}${c === ':' ? ' col' : ''}"/>`; })));
    return `<svg class="mx" viewBox="0 0 ${W} 7">${dots}</svg>`; };

  // woordklok (Nederlands, per 5 minuten)
  const UREN = ['twaalf', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf'];
  const words = now => {
    let h = now.getHours(), m = Math.round(now.getMinutes() / 5) * 5; if (m === 60) { m = 0; h++; }
    const u = i => UREN[(i + 12) % 12];
    const t = { 0: `${u(h)} uur`, 5: `vijf over ${u(h)}`, 10: `tien over ${u(h)}`, 15: `kwart over ${u(h)}`, 20: `tien voor half ${u(h + 1)}`, 25: `vijf voor half ${u(h + 1)}`, 30: `half ${u(h + 1)}`,
      35: `vijf over half ${u(h + 1)}`, 40: `tien over half ${u(h + 1)}`, 45: `kwart voor ${u(h + 1)}`, 50: `tien voor ${u(h + 1)}`, 55: `vijf voor ${u(h + 1)}` }[m];
    return 'het is ' + t;
  };
  const weekNr = d => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); };

  const dateText = (now, f) => {
    if (f === 'short') return now.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    if (f === 'num') return now.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (f === 'weekday') return now.toLocaleDateString('nl-NL', { weekday: 'long' });
    if (f === 'week') return now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · week ' + weekNr(now);
    return now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  T.clock.render = function (t, inner, el) {
    const o = t.opts || {}; const st = o.style || 'd-thin'; const now = new Date();
    const H = o.h12 ? (now.getHours() % 12 || 12) : now.getHours(); const hh = o.h12 ? String(H) : pad(H), mm = pad(now.getMinutes()), ss = pad(now.getSeconds());
    const ap = o.h12 ? (now.getHours() < 12 ? 'AM' : 'PM') : '';
    for (const [k, v] of [['--ck-face', o.cFace], ['--ck-hand', o.cHand], ['--ck-sec', o.cSec], ['--ck-num', o.cNum], ['--ck-acc', o.cAcc]]) if (v) el.style.setProperty(k, v); else el.style.removeProperty(k);
    el.style.setProperty('--ck-size', o.size || 1);
    const sec = o.seconds && o.seconds !== false; // digitaal: standaard zonder seconden
    const colon = `<i class="ck-col${o.blink ? ' blink' : ''}">:</i>`;
    const dt = o.date !== false ? `<span class="ck-date">${esc(dateText(now, o.dateFmt))}</span>` : '';
    let html = '';
    if (st[0] === 'a') {
      const oo = { ...o, seconds: o.seconds !== false };
      if (st === 'a-world') {
        const tz2 = o.tz2 || 'America/New_York'; const n2 = inTz(tz2, now);
        html = `<div class="ck-world"><figure><div class="ck-anwrap">${analog('a-minimal', now, oo, true)}</div><figcaption>${esc(o.tz1Label || 'Hier')}</figcaption></figure><figure><div class="ck-anwrap">${analog('a-minimal', n2, oo, true)}</div><figcaption>${esc(o.tz2Label || tz2.split('/').pop().replace(/_/g, ' '))}</figcaption></figure></div>`;
      } else html = `<div class="ck-anwrap">${analog(st, now, oo)}</div>${dt}`;
    } else if (st === 'd-7seg') html = `<div class="ck-7">${[...hh].map(seg7).join('')}${colon}${[...mm].map(seg7).join('')}${sec ? `<span class="ck-7s">${[...ss].map(seg7).join('')}</span>` : ''}${ap ? `<em>${ap}</em>` : ''}</div>${dt}`;
    else if (st === 'd-matrix') html = `<div class="ck-mx">${matrix(hh.padStart(2, ' ').replace(' ', '0') + ':' + mm)}</div>${dt}`;
    else if (st === 'd-flip') html = `<div class="ck-flip">${[...hh].map(c => `<b>${c}</b>`).join('')}<i class="ck-sp"></i>${[...mm].map(c => `<b>${c}</b>`).join('')}${sec ? `<i class="ck-sp"></i>${[...ss].map(c => `<b class="s">${c}</b>`).join('')}` : ''}</div>${dt}`;
    else if (st === 'd-nixie') html = `<div class="ck-nix">${[...hh].map(c => `<b><i>8</i>${c}</b>`).join('')}<i class="ck-dotz"></i>${[...mm].map(c => `<b><i>8</i>${c}</b>`).join('')}${sec ? `<i class="ck-dotz"></i>${[...ss].map(c => `<b><i>8</i>${c}</b>`).join('')}` : ''}</div>${dt}`;
    else if (st === 'd-lcd') html = `<div class="ck-lcd"><span class="ghost">88:88${sec ? ':88' : ''}</span><span class="real">${hh.padStart(2, '!').replace('!', ' ')}${colon}${mm}${sec ? ':' + ss : ''}</span>${ap ? `<em>${ap}</em>` : ''}${o.date !== false ? `<small>${esc(dateText(now, o.dateFmt || 'num'))}</small>` : ''}</div>`;
    else if (st === 'd-stack') html = `<div class="ck-stack"><b>${hh}</b><b class="m">${mm}</b>${sec ? `<small>${ss}</small>` : ''}</div>${dt}`;
    else if (st === 'd-ring') { const p = (now.getSeconds() + now.getMilliseconds() / 1000) / 60; html = `<div class="ck-ring"><svg viewBox="0 0 100 100"><circle class="r0" cx="50" cy="50" r="45" pathLength="100"/><circle class="r1" cx="50" cy="50" r="45" pathLength="100" stroke-dasharray="${(p * 100).toFixed(1)} 100"/></svg><div><b>${hh}${colon}${mm}</b>${dt}</div></div>`; }
    else if (st === 'd-words') html = `<div class="ck-words">${esc(words(now))}</div>${dt}`;
    else if (st === 'd-week') {
      const wd = (now.getDay() + 6) % 7;
      html = `<div class="clock ck-dig"><b>${hh}${colon}${mm}${sec ? `<small>${ss}</small>` : ''}</b></div><div class="ck-wk">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((n, i) => `<span class="${i === wd ? 'on' : i < wd ? 'past' : ''}">${n}</span>`).join('')}</div><span class="ck-date">${esc(dateText(now, 'long'))} · week ${weekNr(now)}</span>`;
    } else if (st === 'd-sun') {
      const n = D.cfg.settings.night || {}; const s = D.sunTimes(now, n.lat || 52.22, n.lon || 6.89); const f = d => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      html = `<div class="clock ck-dig"><b>${hh}${colon}${mm}${sec ? `<small>${ss}</small>` : ''}</b>${dt}</div><div class="ck-sun"><span>${icon('sun')} op ${f(s.rise)}</span><span>${icon('moon')} onder ${f(s.set)}</span></div>`;
    } else html = `<div class="clock ck-dig${st === 'd-bold' ? ' bold' : ''}"><b>${hh}${colon}${mm}${sec ? `<small>${ss}</small>` : ''}${ap ? `<em>${ap}</em>` : ''}</b>${o.date !== false ? `<span>${esc(dateText(now, o.dateFmt))}</span>` : ''}</div>`;
    inner.innerHTML = `<div class="ck ck-${st}">${html}</div>`;
  };

  // elke seconde voor klokken die dat nodig hebben, anders bij elke nieuwe minuut
  const needsSec = t => { const o = t.opts || {}; const st = o.style || 'd-thin'; return st === 'd-ring' || (st[0] === 'a' ? o.seconds !== false : !!o.seconds) || o.blink; };
  setInterval(() => { if (D.cfg && !document.hidden) D.refreshWhere(t => t.type === 'clock' && (needsSec(t) || new Date().getSeconds() < 1)); }, 1000);
})();
