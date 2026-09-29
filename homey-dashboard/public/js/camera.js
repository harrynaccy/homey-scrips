/* Camera's: tegel, groot beeld, pop-up bij beweging en de instellingen (Systeem → Camera's).
   Het beeld komt altijd via de NAS (/api/camera/...), zodat wachtwoorden nooit in de browser staan. */
(function () {
  const D = window.D; const esc = D.esc; const $ = D.$;
  const C = D.cam = { list: null, ss: null };
  const SRC = { ss: 'Surveillance Station', homey: 'Homey', reolink: 'Rechtstreeks (Reolink)' };

  C.load = async () => { try { const r = await D.api('GET', '/api/cameras'); C.list = r.cams; C.ss = r.ss; } catch (e) { C.list = C.list || []; } return C.list; };
  C.find = id => (C.list || []).find(c => c.id === id);
  // losse beelden: hoe vaak per seconde (Homey levert zelf niet sneller dan elke 3 s)
  const SPEEDS = { rustig: 3000, normaal: 1000, snel: 300 };
  const speed = (c, s) => Math.max(c && c.source === 'homey' ? 3000 : 0, SPEEDS[s] || SPEEDS.normaal);

  // mpegts.js (video in de browser) pas laden als er echt video getoond wordt
  let libP = null;
  C.lib = () => libP || (libP = new Promise(res => {
    if (window.mpegts) return res(window.mpegts);
    const s = document.createElement('script'); s.src = 'vendor/mpegts.js';
    s.onload = () => res(window.mpegts || null); s.onerror = () => { libP = null; res(null); };
    document.head.appendChild(s);
  }));
  const canVideo = m => { try { return !!(m && m.isSupported() && m.getFeatureList().mseLivePlayback); } catch (e) { return false; } };
  C.hasVideo = c => !!(c && c.source === 'reolink');

  // Een beeld dat zichzelf ververst zolang het zichtbaar is. Geeft een stop-functie terug.
  // opt.video = 'sub' (tegel) of 'main' (groot beeld): echte video van een Reolink; lukt dat niet,
  // dan vanzelf losse beelden. Het laatste losse beeld blijft onder de video staan tot die speelt.
  C.stream = (img, camId, opt = {}) => {
    let stop = false, url = null, timer = null, fails = 0;
    const c = C.find(camId); const id = encodeURIComponent(camId);
    const onErr = opt.onError || (() => {}); const onOk = opt.onOk || (() => {});
    if (opt.live && c && c.source === 'ss') {
      img.onerror = () => { img.onerror = null; if (!stop) { onErr('Vloeiend beeld lukt niet, losse beelden worden getoond'); loop(); } };
      img.onload = () => onOk();
      img.src = `/api/camera/${id}/live?t=${Date.now()}`;
      return () => { stop = true; img.removeAttribute('src'); };
    }
    // één los beeld ophalen; het nieuwe beeld wordt pas getoond als het helemaal klaar is (geen flikkeren)
    const grab = async () => {
      const r = await fetch(`/api/camera/${id}/snapshot?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Geen beeld'); }
      const b = await r.blob(); if (stop) return;
      const nu = URL.createObjectURL(b);
      const pre = new Image(); pre.src = nu; await pre.decode().catch(() => {});
      if (stop) { URL.revokeObjectURL(nu); return; }
      img.src = nu; if (url) URL.revokeObjectURL(url); url = nu;
    };
    const loop = async () => {
      if (stop) return;
      if (!img.isConnected) { stop = true; return; }
      if (document.hidden) { timer = setTimeout(loop, 2000); return; }
      try { await grab(); fails = 0; onOk(); } catch (e) { fails++; onErr(e.message === 'Failed to fetch' ? D.NO_NAS : e.message); }
      if (!stop) timer = setTimeout(loop, fails ? Math.min(15000, 2000 * fails) : speed(C.find(camId), opt.speed));
    };

    if (!(opt.video && C.hasVideo(c))) { loop(); return () => { stop = true; clearTimeout(timer); if (url) URL.revokeObjectURL(url); }; }

    // ---------- echte video ----------
    const qs = opt.video === 'main' ? ['main', 'sub'] : ['sub'];
    let m = null, player = null, video = null, wd = null, played = false, retries = 0, qi = 0, startedAt = 0, lastT = -1, still = 0;
    const kill = () => { if (player) { try { player.destroy(); } catch (e) { /* */ } player = null; } };
    const toPhotos = msg => {
      kill(); clearInterval(wd); wd = null; if (video) video.remove(); video = null;
      if (msg) { onErr(msg); console.warn('[camera]', msg); }
      loop();
    };
    const start = () => {
      if (stop) return;
      if (!video) {
        video = document.createElement('video');
        video.muted = true; video.autoplay = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
        video.className = 'cam-video';
        video.addEventListener('playing', () => { played = true; retries = 0; onOk(); });
        img.after(video);
      }
      kill();
      player = m.createPlayer({ type: 'flv', isLive: true, hasAudio: false, url: `${location.origin}/api/camera/${id}/video?q=${qs[qi]}` },
        { enableWorker: false, enableStashBuffer: false, stashInitialSize: 128, lazyLoad: false, autoCleanupSourceBuffer: true,
          liveBufferLatencyChasing: true, liveBufferLatencyMaxLatency: 1.5, liveBufferLatencyMinRemain: 0.3 });
      player.on(m.Events.ERROR, () => failed());
      player.attachMediaElement(video); player.load();
      const p = player.play(); if (p && p.catch) p.catch(() => {});
      startedAt = Date.now(); lastT = -1; still = 0;
    };
    const failed = () => {
      if (stop || !player) return;
      kill();
      if (played && retries < 5) { retries++; setTimeout(start, 2000); return; }   // werkte al: opnieuw verbinden
      if (!played && qi < qs.length - 1) { qi++; start(); return; }               // scherpe stroom lukt niet (bijv. H.265): lichte stroom
      toPhotos('Video lukt niet, losse beelden worden getoond');
    };
    const watch = () => {
      if (stop) return;
      if (!img.isConnected) { stopAll(); return; }
      if (document.hidden) { kill(); return; }       // scherm uit of ander tabblad: niets binnenhalen
      if (!player) { start(); return; }
      if (!played) { if (Date.now() - startedAt > 15000) failed(); return; }
      const t = video.currentTime;
      if (t === lastT) { still += 3; if (still >= 12) failed(); } else still = 0;   // beeld staat stil: opnieuw verbinden
      lastT = t;
    };
    const stopAll = () => { stop = true; clearTimeout(timer); clearInterval(wd); kill(); if (video) video.remove(); if (url) URL.revokeObjectURL(url); };
    grab().then(onOk, () => {});                      // meteen een los beeld tot de video speelt
    C.lib().then(lib => {
      if (stop) return;
      if (!canVideo(lib)) { toPhotos(); return; }     // dit apparaat kan geen video: gewoon losse beelden
      m = lib; start(); wd = setInterval(watch, 3000);
    });
    return stopAll;
  };

  // ---------- tegel ----------
  D.tiles.camera = {
    label: 'Camera', icon: 'eye', size: [4, 3],
    title: t => (C.find(t.opts && t.opts.cameraId) || {}).name || 'Camera',
    render(t, inner, el) {
      const o = t.opts || {};
      if (!C.list) { inner.innerHTML = '<div class="empty">Laden…</div>'; C.load().then(() => D.renderTileContent(t, el)); return; }
      const c = C.find(o.cameraId);
      if (!c) { inner.innerHTML = `<div class="empty">${icon('eye')}<span>Camera nog niet ingesteld.<br><small>Achterkant → Systeem → Camera's, daarna bij Tegel een camera kiezen.</small></span></div>`; return; }
      if (el._camStop) el._camStop();
      inner.innerHTML = `<div class="camview${o.fit === 'contain' ? ' contain' : ''}"><img alt=""><div class="cam-err" hidden></div><div class="cam-name">${esc(c.name)}</div></div>`;
      const img = inner.querySelector('img'); const err = inner.querySelector('.cam-err');
      el._camStop = C.stream(img, c.id, { live: !!o.live, video: C.hasVideo(c) && o.view !== 'foto' ? 'sub' : null, speed: o.speed, onError: m => { err.hidden = false; err.textContent = m; }, onOk: () => { err.hidden = true; } });
      D.pressable(el, { tap: () => C.full(c.id) });
    },
  };

  // ---------- groot beeld (hele scherm) ----------
  let fullStop = null, popTimer = null;
  C.full = (id, opt = {}) => {
    const c = C.find(id); if (!c) return;
    C.close();
    const ov = document.createElement('div'); ov.id = 'camfull'; ov.className = opt.popup ? 'popup' : '';
    ov.innerHTML = `<div class="cf-top"><b>${esc(c.name)}</b>${opt.popup ? `<span class="cf-why">${esc(opt.popup)}</span>` : ''}<span class="cf-sp"></span>
      ${c.source === 'ss' && C.ss && C.ss.url ? `<a class="btn sm" href="${esc(C.ss.url)}" target="_blank" rel="noopener">${icon('play')}Opnames</a>` : ''}
      <button class="xbtn" data-close>${icon('x')}</button></div><div class="cf-img"><img alt=""><div class="cam-err" hidden></div></div>`;
    document.body.appendChild(ov);
    const img = ov.querySelector('img'); const err = ov.querySelector('.cam-err');
    fullStop = C.stream(img, id, { live: false, video: C.hasVideo(c) ? 'main' : null, speed: 'snel', onError: m => { err.hidden = false; err.textContent = m; }, onOk: () => { err.hidden = true; } });
    ov.querySelector('[data-close]').onclick = e => { e.stopPropagation(); C.close(); };
    ov.addEventListener('pointerdown', e => { e.stopPropagation(); if (D.poke) D.poke(); });
    if (opt.seconds) popTimer = setTimeout(C.close, opt.seconds * 1000);
  };
  C.close = () => { clearTimeout(popTimer); if (fullStop) fullStop(); fullStop = null; const ov = $('#camfull'); if (ov) ov.remove(); };

  // ---------- pop-up bij beweging ----------
  const inWindow = (from, to) => {
    if (!from || !to) return true;
    const n = new Date(); const m = n.getHours() * 60 + n.getMinutes();
    const p = s => { const [h, mi] = s.split(':').map(Number); return h * 60 + (mi || 0); };
    const a = p(from), b = p(to); return a <= b ? m >= a && m < b : m >= a || m < b;
  };
  D.capHooks.push(u => {
    const s = D.cfg && D.cfg.settings.cameraPopup;
    if (!s || !s.enabled || !s.camId || !s.trigger || u.deviceId !== s.trigger || !u.value) return;
    if (u.cap !== (s.cap || 'alarm_motion')) return;
    if (D.editing || !inWindow(s.from, s.to)) return;
    if (D.poke) D.poke();
    const run = () => C.full(s.camId, { popup: `Beweging: ${(D.dev(s.trigger) || {}).name || ''}`, seconds: Number(s.seconds) || 30 });
    if (C.list) run(); else C.load().then(run);
  });

  // ---------- Tegel-instellingen (achterkant → Tegel) ----------
  C.tileOptions = (t, P, F) => {
    const list = C.list || []; if (!C.list) C.load().then(() => D.editor.refreshPanel());
    const opts = [['', list.length ? 'Kies een camera…' : 'Nog geen camera\'s (Systeem → Camera\'s)'], ...list.map(c => [c.id, `${c.name} · ${SRC[c.source]}`])];
    const c = C.find(t.opts.cameraId);
    return F.row('Camera', F.select(`${P}.opts.cameraId`, t.opts.cameraId || '', opts, 'tilepanel')) +
      F.row('Beeld vullen', F.seg(`${P}.opts.fit`, t.opts.fit || 'cover', [['cover', 'Vullen'], ['contain', 'Helemaal']], 'tile')) +
      (c && c.source === 'ss' ? F.row('Vloeiend beeld (proef)', F.toggle(`${P}.opts.live`, !!t.opts.live, 'tilepanel'), 'Werkt niet op elke NAS; anders losse beelden') : '') +
      (C.hasVideo(c) ? F.row('Beeld', F.seg(`${P}.opts.view`, t.opts.view || 'video', [['video', 'Video'], ['foto', 'Losse beelden']], 'tilepanel'), 'Video is vloeiend; lukt het niet, dan worden vanzelf losse beelden getoond') : '') +
      (c && !(C.hasVideo(c) && (t.opts.view || 'video') === 'video') && !(c.source === 'ss' && t.opts.live)
        ? F.row('Snelheid', F.seg(`${P}.opts.speed`, t.opts.speed || 'normaal', [['rustig', 'Rustig'], ['normaal', 'Normaal'], ['snel', 'Snel']], 'tile'), c.source === 'homey' ? 'Via Homey hooguit elke 3 seconden' : 'Rustig: elke 3 s · Normaal: elke seconde · Snel: ± 3 per seconde') : '');
  };

  // ---------- Systeem → Camera's ----------
  C.settingsBox = async box => {
    await C.load();
    const E = D.editor; const F = E.F; const s = { enabled: false, seconds: 30, cap: 'alarm_motion', ...(D.cfg.settings.cameraPopup || {}) };
    const motionDevs = D.lib.devices.filter(d => d.caps.alarm_motion || d.caps.alarm_contact || d.class === 'doorbell' || d.caps.alarm_generic);
    box.innerHTML = `<p class="note">Voeg je camera's toe. Het beeld komt via de NAS; wachtwoorden blijven op de NAS. Daarna zet je een tegel <b>Camera</b> op het dashboard (Toevoegen → Overig).</p>
      <div class="cam-list">${C.list.map(c => `<div class="bk"><span>${esc(c.name)}<small>${esc(SRC[c.source])}</small></span><button class="ib sm" data-camtest="${esc(c.id)}" title="Beeld bekijken">${icon('eye')}</button><button class="ib sm" data-camedit="${esc(c.id)}" title="Wijzigen">${icon('sliders')}</button><button class="ib sm" data-camdel="${esc(c.id)}" title="Verwijderen">${icon('trash')}</button></div>`).join('') || '<div class="muted">Nog geen camera\'s</div>'}</div>
      <div class="acts"><button class="btn sm primary" data-camadd>${icon('plus')}Camera toevoegen</button><button class="btn sm" data-camss>${icon('server')}Surveillance Station instellen</button></div>
      <h4 class="h-h">Pop-up bij beweging</h4>` +
      F.row('Aan', F.toggle('settings.cameraPopup.enabled', !!s.enabled, 'panel')) +
      F.row('Camera', F.select('settings.cameraPopup.camId', s.camId || '', [['', 'Kies…'], ...C.list.map(c => [c.id, c.name])], 'none')) +
      F.row('Bij melding van', F.select('settings.cameraPopup.trigger', s.trigger || '', [['', 'Kies…'], ...motionDevs.map(d => [d.id, d.name])], 'none'), 'Bijv. de bewegingsmelder van de camera of een deurbel') +
      F.row('Soort melding', F.select('settings.cameraPopup.cap', s.cap, [['alarm_motion', 'Beweging'], ['alarm_contact', 'Deur/raam open'], ['alarm_generic', 'Alarm (bijv. deurbel)']], 'none')) +
      F.row('Hoe lang', F.select('settings.cameraPopup.seconds', String(s.seconds), [['15', '15 seconden'], ['30', '30 seconden'], ['60', '1 minuut']], 'none')) +
      F.row('Alleen tussen', `<input type="time" data-k="settings.cameraPopup.from" data-fx="none" value="${esc(s.from || '')}"> en <input type="time" data-k="settings.cameraPopup.to" data-fx="none" value="${esc(s.to || '')}">`, 'Leeg laten = altijd') +
      `<div class="acts"><button class="btn sm" data-campoptest>${icon('play')}Pop-up proberen</button></div>`;
    E.bind(box);
    box.querySelector('[data-camadd]').onclick = () => C.editSheet(null);
    box.querySelector('[data-camss]').onclick = () => C.ssSheet();
    box.querySelectorAll('[data-camedit]').forEach(b => b.onclick = () => C.editSheet(C.find(b.dataset.camedit)));
    box.querySelectorAll('[data-camtest]').forEach(b => b.onclick = () => C.full(b.dataset.camtest));
    box.querySelectorAll('[data-camdel]').forEach(b => b.onclick = async () => {
      const c = C.find(b.dataset.camdel);
      if (!(await D.confirm(`Camera "${c.name}" verwijderen? Tegels met deze camera tonen daarna "nog niet ingesteld".`, 'Verwijderen'))) return;
      await D.api('DELETE', '/api/cameras/' + encodeURIComponent(c.id)).catch(e => D.toast(e.message, true)); await C.load(); E.refreshPanel(); D.renderAll();
    });
    box.querySelector('[data-campoptest]').onclick = () => {
      const p = D.cfg.settings.cameraPopup || {};
      if (!p.camId) { D.toast('Kies eerst een camera', true); return; }
      E.close().then(() => C.full(p.camId, { popup: 'Proef: zo ziet de pop-up eruit', seconds: Number(p.seconds) || 30 }));
    };
  };

  C.ssSheet = () => {
    const ss = C.ss || {};
    D.openSheet(`<div class="sheet-hd"><div><h2>Surveillance Station</h2><div class="sub">Gebruik een aparte gebruiker die alleen mag kijken (zie de handleiding, hoofdstuk Camera)</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
      <div class="form"><label>Adres van de NAS<input id="ss-url" value="${esc(ss.url || '')}" placeholder="http://192.168.178.79:5000"></label>
      <label>Gebruiker<input id="ss-user" value="${esc(ss.user || '')}" autocomplete="off"></label>
      <label>Wachtwoord<input id="ss-pass" type="password" placeholder="${ss.hasPass ? '(ongewijzigd laten)' : ''}" autocomplete="new-password"></label></div>
      <div class="msg" id="ss-msg"></div>
      <div class="acts"><button class="btn primary" data-sssave>${icon('check')}Opslaan en testen</button></div>`, 'small');
    const box = $('#sheet');
    box.querySelector('[data-close]').onclick = () => D.closeSheet();
    box.querySelector('[data-sssave]').onclick = async () => {
      const msg = box.querySelector('#ss-msg'); msg.textContent = 'Verbinden…'; msg.className = 'msg';
      try {
        const cams = await D.api('POST', '/api/cameras/ss', { url: box.querySelector('#ss-url').value, user: box.querySelector('#ss-user').value, pass: box.querySelector('#ss-pass').value });
        msg.className = 'msg ok'; msg.textContent = `✓ Gelukt: ${cams.length} ${cams.length === 1 ? 'camera' : 'camera\'s'} gevonden (${cams.map(c => c.name).join(', ')}). Voeg ze toe met "Camera toevoegen".`;
        await C.load(); D.editor.refreshPanel();
      } catch (e) { msg.className = 'msg bad'; msg.textContent = '✗ ' + e.message; }
    };
  };

  C.editSheet = async cam => {
    const c = cam || { source: 'ss', name: '' };
    const homeyCams = D.lib.devices.filter(d => d.class === 'camera' || d.virtualClass === 'camera' || (d.images && d.images.length));
    const draw = async () => {
      let ssList = null;
      if (c.source === 'ss') ssList = await D.api('GET', '/api/cameras/ss').catch(e => ({ error: e.message }));
      const fields = c.source === 'ss'
        ? (ssList && ssList.error ? `<p class="note bad">${esc(ssList.error)}</p><div class="acts"><button class="btn sm" data-gossl>${icon('server')}Surveillance Station instellen</button></div>`
          : `<label>Camera in Surveillance Station<select id="cam-ss">${(ssList || []).map(x => `<option value="${esc(x.id)}"${String(c.ssId) === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`)
        : c.source === 'homey'
          ? `<label>Camera-apparaat in Homey<select id="cam-dev">${homeyCams.map(d => `<option value="${esc(d.id)}"${c.deviceId === d.id ? ' selected' : ''}>${esc(d.name)}</option>`).join('') || '<option value="">Geen camera\'s gevonden in Homey</option>'}</select></label>`
          : `<label>IP-adres van de camera<input id="cam-ip" value="${esc(c.ip || '')}" placeholder="192.168.178.50"></label><label>Gebruiker<input id="cam-user" value="${esc(c.user || 'admin')}"></label><label>Wachtwoord<input id="cam-pass" type="password" placeholder="${c.hasPass ? '(ongewijzigd laten)' : ''}" autocomplete="new-password"></label>`;
      D.openSheet(`<div class="sheet-hd"><div><h2>${cam ? 'Camera wijzigen' : 'Camera toevoegen'}</h2><div class="sub">Het beeld komt via de NAS</div></div><button class="xbtn" data-close>${icon('x')}</button></div>
        <div class="seg">${Object.entries(SRC).map(([k, l]) => `<button data-src="${k}" class="${k === c.source ? 'act' : ''}">${l}</button>`).join('')}</div>
        <div class="form"><label>Naam<input id="cam-name" value="${esc(c.name || '')}" placeholder="Bijv. Balkon"></label>${fields}</div>
        <div class="cam-prev"><img alt="" hidden><div class="msg" id="cam-msg"></div></div>
        <div class="acts"><button class="btn primary" data-camsave>${icon('check')}Opslaan en testen</button></div>`, 'wide');
      const box = $('#sheet');
      box.querySelector('[data-close]').onclick = () => D.closeSheet();
      box.querySelectorAll('[data-src]').forEach(b => b.onclick = () => { collect(); c.source = b.dataset.src; draw(); });
      const g = box.querySelector('[data-gossl]'); if (g) g.onclick = () => C.ssSheet();
      box.querySelector('[data-camsave]').onclick = async () => {
        collect(); const msg = box.querySelector('#cam-msg'); const img = box.querySelector('.cam-prev img');
        if (!c.name) c.name = c.source === 'homey' ? ((D.dev(c.deviceId) || {}).name || 'Camera') : 'Camera';
        msg.className = 'msg'; msg.textContent = 'Opslaan en beeld ophalen…';
        try {
          const r = await D.api('POST', '/api/cameras', c); c.id = r.id; await C.load();
          const res = await fetch(`/api/camera/${encodeURIComponent(c.id)}/snapshot?t=${Date.now()}`);
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Geen beeld');
          img.src = URL.createObjectURL(await res.blob()); img.hidden = false;
          msg.className = 'msg ok'; msg.textContent = '✓ Opgeslagen, beeld werkt. Zet nu een tegel Camera op het dashboard.';
        } catch (e) { msg.className = 'msg bad'; msg.textContent = '✗ Opgeslagen, maar: ' + e.message; }
        D.editor.refreshPanel(); D.renderAll();
      };
    };
    const collect = () => {
      const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
      if (v('cam-name') !== undefined) c.name = v('cam-name').trim();
      if (v('cam-ss') !== undefined) c.ssId = v('cam-ss');
      if (v('cam-dev') !== undefined) c.deviceId = v('cam-dev');
      if (v('cam-ip') !== undefined) { c.ip = v('cam-ip'); c.user = v('cam-user'); c.pass = v('cam-pass'); }
    };
    draw();
  };

  // laden bij het opstarten
  setTimeout(() => C.load().then(() => { if (D.cfg && D.cfg.tabs.some(tab => tab.tiles.some(t => t.type === 'camera'))) D.renderAll(); }), 500);
})();
