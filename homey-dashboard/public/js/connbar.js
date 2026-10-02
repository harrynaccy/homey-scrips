/* Verbindingsbalk linksonder: Scherm — NAS — Homey, met bewegende puntjes als het goed gaat. */
(function () {
  const D = window.D; const esc = D.esc;
  const C = D.connbar = {};
  let bar = null, rtt = null, lastState = {};

  const since = t => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 90) return `${s} seconden`;
    const m = Math.round(s / 60); if (m < 90) return `${m} minuten`;
    const h = Math.round(m / 60); return h < 48 ? `${h} uur` : `${Math.round(h / 24)} dagen`;
  };
  // toestand van de twee verbindingen: ok | slow | down
  const state = () => {
    const c = D.conn; const quiet = Date.now() - c.nasAt;
    const nas = !c.nasAt ? (c.nasErr ? 'down' : 'slow') : quiet > 35000 ? 'down' : (c.nasErr || quiet > 22000 || (rtt && rtt > 1500)) ? 'slow' : 'ok';
    const h = c.homey; const st = D.status || {};
    let homey;
    if (nas === 'down') homey = 'unknown';
    else if (st.mode === 'demo') homey = 'ok';
    else if (!st.connected || (h && !h.ok)) homey = 'down';
    else if (!h) homey = 'slow';
    else homey = h.ms > 2000 || Date.now() - h.at > 60000 ? 'slow' : 'ok';
    return { nas, homey };
  };
  const label = { ok: 'goed', slow: 'traag of bezig', down: 'geen verbinding', unknown: 'onbekend' };

  const BK = { ok: 'goed', warn: 'let op', bad: 'probleem', unknown: 'onbekend' };
  C.markup = () => `<span class="cb-node" title="Dit scherm">${icon('tv')}</span><span class="cb-link l1"><i></i><b>✕</b></span><span class="cb-node" title="NAS">${icon('server')}</span><span class="cb-link l2"><i></i><b>✕</b></span><span class="cb-node" title="Homey">${icon('home')}</span><span class="cb-sep"></span><span class="cb-bk" title="Back-up"><i></i>${icon('download')}</span><span class="cb-msg"></span>`;
  // vaste balk linksonder: altijd, alleen bij storing of nooit (Scherm → Statusbalk). Standaard: alleen bij storing zodra er een tegel Verbindingen is.
  C.mode = () => {
    const m = D.cfg && D.cfg.settings && D.cfg.settings.connbar && D.cfg.settings.connbar.show;
    if (m === 'always' || m === 'problem' || m === 'never') return m;
    return D.cfg && D.cfg.tabs.some(t => t.tiles.some(x => x.type === 'conn')) ? 'problem' : 'always';
  };
  const paint = (el, s, bk) => {
    el.className = `connbar ${el.dataset.base || ''} nas-${s.nas} homey-${s.homey} bk-${bk}`.replace(/\s+/g, ' ');
    const msg = el.querySelector('.cb-msg'); if (msg) msg.textContent = s.nas === 'down' ? 'NAS niet bereikbaar' : s.homey === 'down' ? 'Homey reageert niet' : '';
    el.title = `Scherm ↔ NAS: ${label[s.nas]} · NAS ↔ Homey: ${label[s.homey]} · Back-up: ${BK[bk]}`;
  };
  C.update = () => {
    if (!bar) return;
    const s = state();
    if (s.nas !== lastState.nas) D.conn.nasSince = Date.now();
    lastState = s;
    const bk = C.reserve && C.reserve.health ? C.reserve.health.level : 'unknown';
    paint(bar, s, bk);
    const trouble = s.nas === 'down' || s.homey === 'down' || bk === 'bad' || bk === 'warn';
    const m = C.mode(); bar.classList.toggle('cb-hide', m === 'never' || (m === 'problem' && !trouble));
    document.querySelectorAll('.cb-tile').forEach(el => paint(el, s, bk));
    document.querySelectorAll('[data-cbinfo]').forEach(el => { el.innerHTML = C.info(s, bk); });
  };
  // korte tekst voor de grotere tegel
  C.info = (s = state(), bk = (C.reserve && C.reserve.health ? C.reserve.health.level : 'unknown')) => {
    const h = D.conn.homey; const st = D.status || {};
    const nas = s.nas === 'down' ? 'NAS weg' : `NAS <b>${rtt ? rtt + ' ms' : label[s.nas]}</b>`;
    const hom = s.homey === 'down' ? 'Homey weg' : st.mode === 'demo' ? 'Homey <b>demo</b>' : `Homey <b>${h && h.ok ? h.ms + ' ms' : label[s.homey]}</b>`;
    const r = C.reserve; const lb = r && r.lastBackup ? new Date(r.lastBackup) : null;
    const when = lb ? (Date.now() - lb < 864e5 && lb.getDate() === new Date().getDate() ? 'vandaag ' : lb.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) + ' ') + lb.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : 'nog geen';
    return `${nas} · ${hom}<br>Back-up <b>${BK[bk]}</b> · ${esc(when)}`;
  };

  C.details = () => {
    const s = state(); const c = D.conn; const h = c.homey; const st = D.status || {};
    const row = (name, st2, lines) => `<div class="cb-row ${st2}"><i class="cb-dot"></i><div><b>${name}: ${label[st2]}</b>${lines.filter(Boolean).map(l => `<small>${esc(l)}</small>`).join('')}</div></div>`;
    D.openSheet(`<div class="sheet-hd"><div><h2>Verbindingen</h2><div class="sub">Van dit scherm naar de NAS, en van de NAS naar Homey</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
      ${row('Scherm ↔ NAS', s.nas, [
        c.nasAt ? `Laatste teken van leven: ${since(c.nasAt)} geleden` : 'Nog geen contact gehad',
        rtt ? `Reactietijd: ${rtt} ms` : '',
        s.nas === 'down' ? 'Staat de NAS aan? Is de wifi van dit scherm goed? Draait het project in Container Manager?' : '',
      ])}
      ${row('NAS ↔ Homey', s.homey, [
        st.mode === 'demo' ? 'Demo-modus: er is nog geen echte Homey gekoppeld' : '',
        h && h.ok ? `Reactietijd: ${h.ms} ms · goed sinds ${since(h.since)}` : '',
        h && !h.ok ? `Weg sinds ${since(h.since)} geleden. ${h.error ? 'Melding: ' + h.error : ''}` : '',
        !st.connected && st.mode !== 'demo' && st.error ? 'Melding: ' + st.error : '',
        s.homey === 'down' ? 'Staat Homey aan en heeft hij netwerk? Klopt HOMEY_ADDRESS in docker-compose.yml?' : '',
      ])}
      ${(() => {
        const r = C.reserve; if (!r) return row('Back-up', 'unknown', ['Nog niet bekend']);
        const lv = { ok: 'ok', warn: 'slow', bad: 'down' }[r.health.level];
        const when = d => d ? new Date(d).toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'nog nooit';
        const zip = (r.files.backup || []).find(x => /met-sleutels\.zip$/.test(x.name));
        return `<div class="cb-row ${lv}"><i class="cb-dot"></i><div><b>Back-up: ${{ ok: 'goed', warn: 'let op', bad: 'probleem' }[r.health.level]}</b>
          <small>Laatste controle: ${esc(when(r.lastCheck))} · laatste back-up: ${esc(when(r.lastBackup))}${zip ? ' (' + (zip.size / 1048576).toFixed(1) + ' MB)' : ''}</small>
          <small>Installatiebestand: ${r.exe.length ? esc(r.exe[0]) : 'ontbreekt'} · extra mappen: ${r.extra.length ? esc(r.extra.join(', ')) : 'geen'}</small>
          ${r.appUpdated ? `<small>Spotify-app op de NAS laatst gewijzigd: ${esc(when(r.appUpdated))}</small>` : ''}
          ${r.health.items.map(x => `<small>⚠ ${esc(x.problem)}: ${esc(x.detail)}</small>`).join('')}
          <small>Of de back-ups op je laptop en tablet aankomen, zie je in Synology Drive Client en FolderSync zelf.</small></div></div>`;
      })()}
      <p class="note">Groen met bewegende puntjes = goed. Oranje = traag of bezig opnieuw te verbinden. Rood met ✕ = geen verbinding.</p>`, 'small');
    const box = document.getElementById('sheet'); box.querySelector('[data-close]').onclick = () => D.closeSheet();
  };

  const build = () => {
    bar = document.createElement('button');
    bar.id = 'connbar'; bar.type = 'button';
    bar.innerHTML = C.markup();
    bar.onclick = e => { e.stopPropagation(); C.details(); };
    bar.addEventListener('pointerdown', e => e.stopPropagation());
    document.body.appendChild(bar); if (D.watchConnbar) D.watchConnbar();
    C.update();
  };
  // reactietijd naar de NAS meten
  const ping = async () => {
    const t = performance.now();
    try { const r = await fetch('/api/ping', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); rtt = Math.round(performance.now() - t); D.conn.nasAt = Date.now(); D.conn.nasErr = false; if (j.homey) D.conn.homey = j.homey; } else D.conn.nasErr = true; }
    catch (e) { D.conn.nasErr = true; }
    C.update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  setInterval(C.update, 3000);
  // back-upstatus van de NAS (elke 10 minuten)
  const loadReserve = async () => { try { C.reserve = await D.api('GET', '/api/reserve'); } catch (e) { /* */ } C.update(); };
  setTimeout(loadReserve, 3000); setInterval(loadReserve, 10 * 60 * 1000);
  C.loadReserve = loadReserve;
  setInterval(ping, 30000); setTimeout(ping, 1500);
})();
