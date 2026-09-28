(async function () {
  const D = window.D;
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest('.list, .p-body, #sheet, #tabs, .frame, textarea')) e.preventDefault(); }, { passive: false });
  const boot = async () => {
    try {
      const [cfg, status] = await Promise.all([D.api('GET', '/api/config'), D.api('GET', '/api/status')]);
      D.cfg = cfg; D.status = status;
      await D.loadLibrary().catch(() => {});
      D.activeTab = null; D.applyAll(); D.connectEvents();
      if (location.hash === '#edit') D.editor.open();
    } catch (e) {
      document.getElementById('stage').innerHTML = `<div class="bootfail">Dashboard-server niet bereikbaar.<br><small>${D.esc(e.message)}</small><br>Opnieuw proberen over 10 s…</div>`;
      setTimeout(boot, 10000);
    }
  };
  boot();
})();
