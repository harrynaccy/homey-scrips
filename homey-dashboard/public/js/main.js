(async function () {
  const D = window.D;
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest('.list, .p-body, #sheet, #tabs, .frame, textarea')) e.preventDefault(); }, { passive: false });
  const boot = async () => {
    try {
      const [cfg, status] = await Promise.all([D.api('GET', '/api/config'), D.api('GET', '/api/status')]);
      D.setCfg(cfg); D.status = status;
      await D.loadLibrary().catch(() => {});
      D.activeTab = null; D.applyAll(); D.connectEvents();
      if (location.hash === '#edit') D.editor.open();
    } catch (e) {
      // NAS onbereikbaar: laatste bekende versie tonen en op de achtergrond blijven proberen
      const c = D.cache('cfg'); const l = D.cache('lib');
      if (c && c.cfg && !D.offline) {
        D.offline = true; D.setCfg(c.cfg); D.status = { mode: 'offline', connected: false };
        D.lib = l || {}; for (const k of ['devices', 'zones', 'flows', 'advancedFlows', 'moods', 'variables', 'insights', 'apps', 'users', 'alarms']) D.lib[k] = D.lib[k] || [];
        D.devById = new Map(D.lib.devices.map(d => [d.id, d]));
        D.activeTab = null; try { D.applyAll(); } catch (err) { console.error(err); }
        const bar = document.createElement('div'); bar.id = 'offbar';
        bar.textContent = 'NAS niet bereikbaar · laatste bekende versie van ' + new Date(c.at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · knoppen werken pas weer als de NAS terug is';
        document.body.appendChild(bar);
      }
      if (D.offline) { setTimeout(async () => { try { await D.api('GET', '/api/config/stamp'); location.reload(); } catch (err) { boot(); } }, 10000); return; }
      document.getElementById('stage').innerHTML = `<div class="bootfail">Dashboard-server niet bereikbaar.<br><small>${D.esc(e.message)}</small><br>Opnieuw proberen over 10 s…</div>`;
      setTimeout(boot, 10000);
    }
  };
  boot();
})();
