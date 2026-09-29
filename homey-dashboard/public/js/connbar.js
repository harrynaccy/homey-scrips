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

  C.update = () => {
    if (!bar) return;
    const s = state();
    if (s.nas !== lastState.nas) D.conn.nasSince = Date.now();
    lastState = s;
    bar.className = `connbar nas-${s.nas} homey-${s.homey}`;
    const bad = s.nas === 'down' ? 'NAS niet bereikbaar' : s.homey === 'down' ? 'Homey reageert niet' : '';
    bar.querySelector('.cb-msg').textContent = bad;
    bar.title = `Scherm ↔ NAS: ${label[s.nas]} · NAS ↔ Homey: ${label[s.homey]}`;
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
      <p class="note">Groen met bewegende puntjes = goed. Oranje = traag of bezig opnieuw te verbinden. Rood met ✕ = geen verbinding.</p>`, 'small');
    const box = document.getElementById('sheet'); box.querySelector('[data-close]').onclick = () => D.closeSheet();
  };

  const build = () => {
    bar = document.createElement('button');
    bar.id = 'connbar'; bar.type = 'button';
    bar.innerHTML = `<span class="cb-node" title="Dit scherm">${icon('tv')}</span><span class="cb-link l1"><i></i><b>✕</b></span><span class="cb-node" title="NAS">${icon('server')}</span><span class="cb-link l2"><i></i><b>✕</b></span><span class="cb-node" title="Homey">${icon('home')}</span><span class="cb-msg"></span>`;
    bar.onclick = e => { e.stopPropagation(); C.details(); };
    bar.addEventListener('pointerdown', e => e.stopPropagation());
    document.body.appendChild(bar);
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
  setInterval(ping, 30000); setTimeout(ping, 1500);
})();
