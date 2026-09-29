/* Achterkant: Claude-assistent. Claude doet een voorstel; pas na "Toepassen" verandert er iets (in één stap ongedaan te maken). */
(function () {
  const D = window.D; const E = D.editor; const esc = D.esc; const F = E.F;
  const A = E.ai = { history: [], busy: false, total: 0, status: null, draft: '' };
  const EXAMPLES = [
    'Maak 3 knoppen voor de ramen die oranje oplichten als ze open staan',
    'Zet alle lampen van de woonkamer als wandschakelaar op een nieuw tabblad Woonkamer',
    'Maak een knop die de flow Alles uit start',
  ];
  const DEFAULT_MODEL = 'claude-opus-5-5';
  const model = () => (D.cfg.settings.assistant && D.cfg.settings.assistant.model) || (A.status && A.status.defaultModel) || DEFAULT_MODEL;
  const usd = n => '$' + n.toFixed(n < 0.01 ? 3 : 2).replace('.', ',');
  const GLOW = { nooit: 'never', aan: 'on', altijd: 'always', alarm: 'alarm' };
  const HEX = /^#[0-9a-f]{6}$/i;

  // ---------- voorstel uitvoeren (op een willekeurige config: echt of een proefkopie) ----------
  const refOf = k => {
    if (!k || !k.soort || k.soort === 'geen') return { target: 'none' };
    if (k.soort === 'apparaat') { const d = D.dev(k.id); if (!d) throw new Error('apparaat niet gevonden'); return { target: 'device', deviceId: d.id }; }
    if (k.soort === 'flow') { const f = [...D.lib.flows, ...D.lib.advancedFlows].find(x => x.id === k.id); if (!f) throw new Error('flow niet gevonden'); return { target: 'flow', id: f.id, flowType: f.type || 'flow' }; }
    if (k.soort === 'mood') { const m = D.lib.moods.find(x => x.id === k.id); if (!m) throw new Error('mood niet gevonden'); return { target: 'mood', id: m.id }; }
    throw new Error('onbekende koppeling');
  };
  const btnSize = kind => ({ cover: [2, 3], dim: [3, 2], toggle: [3, 2] }[kind] || [2, 2]);
  const setStyle = (t, a) => {
    t.style = t.style || {};
    if (a.gloed && GLOW[a.gloed]) t.style.glW = GLOW[a.gloed];
    if (a.gloedKleur && HEX.test(a.gloedKleur)) t.style.glC = a.gloedKleur;
  };
  const setButtonOpts = (t, a, icons, pairs) => {
    const o = t.opts = t.opts || {};
    if (a.stijl && D.BUTTON_KINDS.some(k => k[0] === a.stijl)) o.kind = a.stijl;
    if (a.tekst) o.title = a.tekst;
    if (a.toonNaam === false) o.label = false; else if (a.toonNaam === true) delete o.label;
    if (a.toonStatus === false) o.state = false; else if (a.toonStatus === true) delete o.state;
    if (a.kleurAan && HEX.test(a.kleurAan)) o.colorOn = a.kleurAan;
    if (a.kleurUit && HEX.test(a.kleurUit)) o.colorOff = a.kleurUit;
    const on = a.pictogram && icons[a.pictogram]; const off = a.pictogramUit && icons[a.pictogramUit];
    if (on) { o.mdi = on; delete o.mdiAuto; if (!off && pairs[a.pictogram]) { o.mdiOff = pairs[a.pictogram]; o.mdiOffAuto = true; } }
    if (off) { o.mdiOff = off; delete o.mdiOffAuto; }
  };
  const place = (tab, a, w, h) => {
    const g = tab.grid; w = D.clamp(a.breedte || w, 1, g.cols); h = D.clamp(a.hoogte || h, 1, g.rows);
    if (Number.isInteger(a.x) && Number.isInteger(a.y)) { const r = { x: a.x, y: a.y, w, h }; if (E.fits(tab, r)) return [r, '']; }
    const r = E.firstFree(tab, w, h); if (!r) throw new Error(`geen ruimte meer op "${tab.name}"`);
    return [r, Number.isInteger(a.x) ? 'op een andere vrije plek gezet' : ''];
  };

  const runPlan = (plan, cfg, curTabId, icons = {}, pairs = {}) => {
    const keys = {}; const out = []; const touched = [];
    const tabOf = ref => {
      if (!ref) return cfg.tabs.find(t => t.id === curTabId) || cfg.tabs[0];
      const t = keys[ref] || cfg.tabs.find(x => x.id === ref) || cfg.tabs.find(x => x.name.toLowerCase() === String(ref).toLowerCase());
      if (!t) throw new Error('tabblad niet gevonden'); return t;
    };
    const tileOf = id => { for (const tab of cfg.tabs) { const t = tab.tiles.find(x => x.id === id); if (t) return { tab, t }; } throw new Error('tegel niet gevonden'); };
    const step = a => {
      switch (a.actie) {
        case 'tabblad_maken': {
          if (cfg.tabs.length >= 10) throw new Error('er kunnen maximaal 10 tabbladen zijn');
          const base = tabOf(null); const tab = { id: D.uid('t'), name: String(a.naam || 'Nieuw').slice(0, 30), icon: a.icoon || '⭐', hidden: false, grid: D.clone(base ? base.grid : { cols: 12, rows: 8, gap: 12, padding: 16 }), background: null, tiles: [] };
          cfg.tabs.push(tab); if (a.sleutel) keys[a.sleutel] = tab; keys[tab.name] = keys[tab.name] || tab; touched.push(tab.id); return '';
        }
        case 'tabblad_aanpassen': {
          const tab = tabOf(a.tabblad); if (a.naam) tab.name = String(a.naam).slice(0, 30); if (a.icoon) tab.icon = a.icoon; return '';
        }
        case 'knop_maken': {
          const tab = tabOf(a.tabblad); const kind = D.BUTTON_KINDS.some(k => k[0] === a.stijl) ? a.stijl : 'glow';
          const ref = refOf(a.koppeling);
          if (a.eigenschap && ref.target === 'device' && !D.dev(ref.deviceId).caps[a.eigenschap]) throw new Error('dit apparaat heeft die eigenschap niet');
          const [w, h] = btnSize(kind); const [spot, note] = place(tab, a, w, h);
          const t = { id: D.uid('w'), type: 'button', ref, opts: { kind }, style: kind === 'icon' ? { frameless: true } : {}, ...spot };
          if (a.eigenschap) t.opts.cap = a.eigenschap;
          setButtonOpts(t, a, icons, pairs);
          if (!t.opts.mdi) { const dn = D.defaultMdiName(kind, ref); if (icons['mdi:' + dn]) { t.opts.mdi = icons['mdi:' + dn]; t.opts.mdiAuto = true; } if (pairs['mdi:' + dn]) { t.opts.mdiOff = pairs['mdi:' + dn]; t.opts.mdiOffAuto = true; } }
          setStyle(t, a); tab.tiles.push(t); touched.push(t.id); return note;
        }
        case 'tegel_maken': {
          const tab = tabOf(a.tabblad); let t;
          if (a.tegelsoort === 'apparaat') { const r = refOf({ soort: 'apparaat', id: (a.koppeling || {}).id }); t = { type: 'device', ref: { deviceId: r.deviceId }, opts: {} }; if (a.tekst) t.opts.title = a.tekst; }
          else if (a.tegelsoort === 'flow') { const r = refOf({ soort: 'flow', id: (a.koppeling || {}).id }); t = { type: 'flow', ref: { id: r.id, flowType: r.flowType }, opts: {} }; }
          else if (a.tegelsoort === 'mood') { const r = refOf({ soort: 'mood', id: (a.koppeling || {}).id }); t = { type: 'mood', ref: { id: r.id }, opts: {} }; }
          else if (a.tegelsoort === 'klok') t = { type: 'clock', opts: { date: true } };
          else if (a.tegelsoort === 'tekst') t = { type: 'text', opts: { text: String(a.tekst || ''), size: 1.2 } };
          else throw new Error('onbekende tegelsoort');
          const sz = D.tiles[t.type].size; const [spot, note] = place(tab, a, sz[0], sz[1]);
          Object.assign(t, { id: D.uid('w'), style: {}, ...spot }); setStyle(t, a); tab.tiles.push(t); touched.push(t.id); return note;
        }
        case 'tegel_aanpassen': {
          const { tab, t } = tileOf(a.tegel); t.opts = t.opts || {};
          if (t.type === 'button') { setButtonOpts(t, a, icons, pairs); if (a.koppeling) t.ref = refOf(a.koppeling); }
          else if (a.tekst) { if (t.type === 'text') t.opts.text = a.tekst; else t.opts.title = a.tekst; }
          setStyle(t, a);
          if ([a.x, a.y, a.breedte, a.hoogte].some(v => Number.isInteger(v))) {
            const r = { x: Number.isInteger(a.x) ? a.x : t.x, y: Number.isInteger(a.y) ? a.y : t.y, w: a.breedte || t.w, h: a.hoogte || t.h };
            if (!E.fits(tab, r, t.id)) return 'nieuwe plek was bezet, blijft staan';
            Object.assign(t, r);
          }
          touched.push(t.id); return '';
        }
        case 'tegel_verwijderen': { const { tab, t } = tileOf(a.tegel); tab.tiles.splice(tab.tiles.indexOf(t), 1); return ''; }
        default: throw new Error('onbekende stap');
      }
    };
    for (const a of (plan && plan.acties) || []) {
      try { const note = step(a); out.push({ ok: true, text: a.omschrijving || a.actie, note }); }
      catch (e) { out.push({ ok: false, text: a.omschrijving || a.actie, note: e.message }); }
    }
    return { steps: out, touched };
  };
  A.runPlan = runPlan;

  // pictogrammen alvast ophalen (inclusief het bijpassende uit-pictogram)
  const prefetch = async plan => {
    const icons = {}; const pairs = {}; const want = new Set();
    for (const a of plan.acties || []) {
      if (a.pictogram) want.add(a.pictogram); if (a.pictogramUit) want.add(a.pictogramUit);
      if (a.actie === 'knop_maken' && !a.pictogram) { try { want.add('mdi:' + D.defaultMdiName(a.stijl || 'glow', refOf(a.koppeling))); } catch (e) { /* */ } }
    }
    await Promise.all([...want].map(async key => {
      const i = key.indexOf(':'); const set = i > 0 ? key.slice(0, i) : 'mdi'; const name = i > 0 ? key.slice(i + 1) : key;
      const ic = await E.getIcon(name, set); if (!ic) return; icons[key] = ic;
      const pr = await E.pairFor(ic); if (pr && pr.role === 'on') pairs[key] = pr.other;
    }));
    return { icons, pairs };
  };

  const apply = async msg => {
    const plan = msg.plan; const { icons, pairs } = await prefetch(plan);
    const snaps = [E.snapPath('tabs')]; let res;
    E.commit(null, () => { res = runPlan(plan, D.cfg, D.currentTab().id, icons, pairs); }, () => {
      const first = res.touched.map(id => D.cfg.tabs.find(t => t.id === id) || (D.findTile(id) || {}).tab).find(Boolean);
      if (first && first.id !== D.currentTab().id) D.activeTab = first.id;
      D.applyAll();
      for (const id of res.touched) { const el = D.tileEls.get(id); if (el) el.classList.add('flash-ok'); }
    });
    E.breakMerge();
    const ok = res.steps.filter(s => s.ok).length;
    E.logAction('Assistent: ' + String(plan.samenvatting || 'voorstel').slice(0, 60), snaps, `${ok} van ${res.steps.length} stappen`);
    msg.state = 'applied'; msg.result = res.steps;
    D.toast(ok === res.steps.length ? 'Voorstel toegepast' : `Toegepast: ${ok} van ${res.steps.length} stappen`, ok === 0);
    E.refreshPanel();
  };

  // ---------- vragen ----------
  const toServer = () => A.history.map(m => ({ role: m.role, text: m.role === 'assistant' && m.plan
    ? `${m.text ? m.text + '\n' : ''}[Voorstel: ${m.plan.samenvatting} | ${(m.plan.acties || []).map(a => a.omschrijving).join('; ')} | ${{ applied: 'toegepast door de gebruiker', cancelled: 'geannuleerd door de gebruiker' }[m.state] || 'nog niet toegepast'}]`
    : m.text }));
  const send = async text => {
    text = String(text || '').trim(); if (!text || A.busy) return;
    for (const m of A.history) if (m.plan && m.state === 'open') m.state = 'cancelled';
    A.history.push({ role: 'user', text }); A.draft = ''; A.busy = true; E.refreshPanel();
    try {
      await E.saveNow();
      const r = await D.api('POST', '/api/assistant', { history: toServer(), tabId: D.currentTab().id, model: model() });
      const msg = { role: 'assistant', text: r.text || '', usage: r.usage, model: r.model };
      if (r.plan && Array.isArray(r.plan.acties) && r.plan.acties.length) { msg.plan = r.plan; msg.state = 'open'; msg.check = runPlan(r.plan, D.clone(D.cfg), D.currentTab().id).steps; }
      else if (r.plan && !msg.text) msg.text = r.plan.samenvatting || 'Er hoeft niets te veranderen.';
      if (r.usage) A.total += r.usage.usd || 0;
      A.history.push(msg);
    } catch (e) {
      A.history.push({ role: 'assistant', error: true, text: e.message });
    }
    A.busy = false; E.refreshPanel();
  };
  A.send = send;

  // ---------- paneel ----------
  const bubble = (m, i) => {
    if (m.role === 'user') return `<div class="ai-msg me">${esc(m.text)}</div>`;
    let h = m.text ? `<div class="ai-txt">${esc(m.text).replace(/\n/g, '<br>')}</div>` : '';
    if (m.plan) {
      const steps = m.result || m.check || [];
      h += `<div class="ai-plan"><b>${esc(m.plan.samenvatting || 'Voorstel')}</b><ol>${steps.map(s => `<li class="${s.ok ? '' : 'bad'}">${esc(s.text)}${s.note ? `<small>${s.ok ? '' : 'Lukt niet: '}${esc(s.note)}</small>` : ''}</li>`).join('')}</ol>` +
        (m.state === 'open' ? `<div class="acts"><button class="btn sm primary" data-aiapply="${i}" ${steps.some(s => s.ok) ? '' : 'disabled'}>${icon('check')}Toepassen</button><button class="btn sm" data-aicancel="${i}">${icon('x')}Annuleren</button></div>`
          : m.state === 'applied' ? `<div class="ai-done">${icon('check')}Toegepast. Terugdraaien kan met ${icon('undo')} bovenin of via Laatste wijzigingen.</div>`
          : '<div class="ai-done muted">Niet toegepast</div>') + '</div>';
    }
    const cost = m.usage ? `<div class="ai-cost">≈ ${usd(m.usage.usd || 0)} · ${esc((A.status && (A.status.models.find(x => m.model && m.model.startsWith(x.id)) || {}).name) || m.model || '')}</div>` : '';
    return `<div class="ai-msg claude${m.error ? ' err' : ''}">${h}${cost}</div>`;
  };
  E.render.assistent = () => {
    const st = A.status;
    if (!st) return '<div class="muted pad">Laden…</div>';
    if (!st.enabled) return `<p class="note">Met de assistent vraag je Claude om het dashboard voor je in te richten, bijvoorbeeld: <i>"Maak 3 knoppen voor de ramen die oplichten als ze open staan."</i></p>` +
      F.group('Nog niet ingesteld', `<p class="note">Zet je API-sleutel van Anthropic in <b>docker-compose.yml</b> op de NAS, onder HOMEY_TOKEN:</p><pre class="ai-pre">- ANTHROPIC_API_KEY=sk-ant-…</pre><p class="note">Start daarna het project opnieuw in Container Manager. Zie ook de gebruiksaanwijzing, hoofdstuk <b>Assistent</b>.</p>`);
    const hist = A.history.map(bubble).join('');
    return `<div class="ai-wrap"><div class="ai-log">${hist || `<p class="note">Vertel in gewone woorden wat je wilt. Claude kijkt welke apparaten er zijn en doet een voorstel. Er verandert pas iets als je op <b>Toepassen</b> tikt.</p><div class="ai-ex">${EXAMPLES.map(x => `<button class="chip" data-aiex="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}
      ${A.busy ? `<div class="ai-msg claude busy"><span class="ai-dots"><i></i><i></i><i></i></span>Claude denkt na… (kan een halve minuut duren)</div>` : ''}</div>
      <div class="ai-in"><textarea id="ai-q" rows="3" placeholder="Bijv. maak een knop voor de tuinverlichting" ${A.busy ? 'disabled' : ''}>${esc(A.draft)}</textarea><button class="btn primary" data-aisend ${A.busy ? 'disabled' : ''}>${icon('play')}Vraag</button></div>
      ${F.group('Instellingen', F.row('Model', F.select('settings.assistant.model', model(), st.models.map(x => [x.id, x.name]), 'none'), 'Opus = slimst, Sonnet = ongeveer de helft goedkoper') +
        `<p class="note">Deze sessie: ≈ ${usd(A.total)}${A.history.length ? ` · <button class="linkbtn" data-aiclear>Nieuw gesprek</button>` : ''}</p>`)}</div>`;
  };
  E.wire.assistent = async root => {
    if (!A.status) {
      A.status = await D.api('GET', '/api/assistant').catch(() => ({ enabled: false, models: [] }));
      if (E.section === 'assistent') E.refreshPanel(); return;
    }
    const q = root.querySelector('#ai-q');
    if (q) {
      q.oninput = () => { A.draft = q.value; };
      q.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q.value); } };
      if (!A.busy) q.focus();
    }
    const log = root.querySelector('.ai-log'); if (log) log.scrollTop = log.scrollHeight;
    root.querySelectorAll('[data-aiex]').forEach(b => b.onclick = () => { A.draft = b.dataset.aiex; E.refreshPanel(); });
    const sb = root.querySelector('[data-aisend]'); if (sb) sb.onclick = () => send(q.value);
    root.querySelectorAll('[data-aiapply]').forEach(b => b.onclick = async () => { b.disabled = true; try { await apply(A.history[Number(b.dataset.aiapply)]); } catch (e) { D.toast('Toepassen mislukt: ' + e.message, true); E.refreshPanel(); } });
    root.querySelectorAll('[data-aicancel]').forEach(b => b.onclick = () => { A.history[Number(b.dataset.aicancel)].state = 'cancelled'; E.refreshPanel(); });
    const cl = root.querySelector('[data-aiclear]'); if (cl) cl.onclick = () => { A.history = []; E.refreshPanel(); };
  };
})();
