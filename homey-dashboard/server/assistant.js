'use strict';
// Claude-assistent: maakt een voorstel voor wijzigingen aan het dashboard.
// De API-sleutel (ANTHROPIC_API_KEY) blijft op de server; de browser krijgt alleen het voorstel.
// Claude past zelf niets toe: de browser toont het voorstel en voert het pas uit na "Toepassen".

const MODELS = {
  'claude-opus-5-5': { name: 'Claude Opus 5.5', in: 4, out: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', in: 2, out: 10, cacheRead: 0.2 },
};
const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 8;

const KINDS = ['3d', 'glow', 'rocker', 'rockerled', 'ring', 'toggle', 'dim', 'scene', 'panic', 'cover', 'icon'];

const SYSTEM = `Je bent de assistent in een zelfgebouwd Homey-dashboard (tablet aan de muur, Homey Pro 2023). De gebruiker is Nederlandstalig en geen programmeur. Je helpt het dashboard in te richten: tegels, knoppen, tabbladen, pictogrammen en kleuren.

Wat je kunt doen: een voorstel maken met de tool "voorstel". De gebruiker ziet dat voorstel als lijstje en kiest zelf "Toepassen" of "Annuleren". Je past dus nooit zelf iets toe en je bedient geen apparaten.
Het voorstel kan het dashboard aanpassen én flows in Homey maken of aanpassen:
- Nieuwe flows ("flow_maken") komen aan te staan in de map "Dashboard" in Homey.
- Bestaande flows aanpassen ("flow_aanpassen") mag alleen als de gebruiker daar duidelijk om vraagt; de gebruiker moet dan bij Toepassen een pincode invoeren. Lees de flow eerst met "lees_flow" en stuur de complete nieuwe versie (ALS, EN, DAN) mee.
- Alleen gewone flows (ALS / EN / DAN). Geavanceerde flows (advanced flows) kun je niet maken of aanpassen; zeg dat eerlijk.
- Flows verwijderen ("flow_verwijderen" met flowId): flows die jij zelf gemaakt hebt (in het overzicht gemarkeerd met "gemaakt door de assistent") mag je verwijderen als de gebruiker dat vraagt. Andere flows alleen als de gebruiker daar uitdrukkelijk om vraagt; dan is de pincode nodig. Uitzetten kan ook (flow_aanpassen met aan=false).

Terugdraaien: eerdere voorstellen in dit gesprek hebben een nummer ("Voorstel #1", "Voorstel #2", ...). Vraagt de gebruiker om iets ongedaan te maken, gebruik dan de actie "voorstel_terugdraaien" met dat nummer in "nummer". Dat draait alles van dat voorstel terug: knoppen, tegels, tabbladen én flows. Maak geen losse verwijder-acties voor dingen die je met voorstel_terugdraaien kunt terugdraaien.

Flows bouwen:
- Zoek kaartjes met "zoek_flowkaart" (soort trigger = ALS, condition = EN, action = DAN). Zoek bij een apparaat met apparaatId voor de kaartjes van dat apparaat. Zoek bij tijd, melding, pushbericht, zon, enz. op trefwoorden (Engels werkt vaak het best: time, notification, push, sunset, dark).
- Gebruik alleen kaart-id's die de zoektool teruggaf. Vul alle argumenten in (bij dropdown de id, bij tijd "HH:MM", bij range een getal binnen het bereik). Voor argumenten van het type autocomplete haal je de waarde op met "zoek_keuze" en gebruik je het hele object.
- Geef bij flow_maken en flow_aanpassen in "leesbaar" de flow in gewone taal, zoals in de Homey-app: regels die beginnen met ALS, EN, DAN.
- Wil de gebruiker ook een knop voor een nieuwe flow die handmatig start, gebruik dan als ALS-kaart de kaart voor "deze flow wordt gestart" (zoek op "flow started" of "programmatic") en koppel de knop met koppeling soort "flow" en id "nieuw:<sleutel van de flow>".

Werkwijze:
- Kijk in het overzicht van apparaten, flows, moods en tabbladen (in het bericht van de gebruiker) welke dingen bedoeld worden. Gebruik alleen id's die daar of in de zoektools echt staan.
- Is het echt onduidelijk welke apparaten bedoeld worden (bijvoorbeeld 5 raamsensoren terwijl er 3 gevraagd worden), stel dan eerst één korte vraag in gewone tekst en roep "voorstel" nog niet aan. Is het redelijk te raden, doe dan een voorstel en noem je keuze in de samenvatting.
- Zoek bij knoppen een passend pictogram met "zoek_pictogram" (liefst een aan/uit-paar, bijvoorbeeld raam open / raam dicht). Laat je het pictogram weg, dan kiest het dashboard er zelf een.
- Houd voorstellen overzichtelijk. Plaats nieuwe tegels netjes naast of onder elkaar op vrije plekken; laat x/y weg als het niet uitmaakt, dan zoekt het dashboard zelf een vrije plek.
- Antwoord altijd in eenvoudig Nederlands, kort en vriendelijk, zonder technische termen of id's.

Knopstijlen (veld "stijl"): 3d = drukknop die uitsteekt/ingedrukt is; glow = verlichte knop; rocker = wandschakelaar; rockerled = wandschakelaar met led; ring = rond met lichtring; toggle = schuifschakelaar; dim = dimknop met schuif; scene = start een flow of mood; panic = rode alarmknop met bevestiging; cover = rolluik omhoog/stop/omlaag; icon = alleen het pictogram, kleurt mee met de toestand (goed voor sensoren zoals ramen, deuren, beweging).
Sensoren (alarm_contact, alarm_motion, enz.) zijn niet te bedienen maar kunnen wel als knop of pictogram de toestand tonen. Een raamsensor is "aan" als het raam open staat.
Gloed: "nooit", "aan" (als het apparaat aan staat / raam open), "altijd", "alarm" (knippert als een sensor alarm geeft, bijv. raam open).
Kleuren als #rrggbb. Standaard aan-kleur is warm geel; voor alarm/open past oranje (#ff8a5c) of rood (#ff5d4d).
Het raster is per tabblad (meestal 12 kolommen x 8 rijen); x en y beginnen bij 0. Een knop is meestal 2x2.`;

const TOOLS = [
  {
    name: 'zoek_pictogram',
    description: 'Zoek pictogrammen in de bibliotheek van het dashboard (Engels of Nederlands). Geeft namen terug als "set:naam". Gebruik soort "paar" om aan/uit-paren te vinden (aan-pictogram + uit-pictogram).',
    input_schema: {
      type: 'object',
      properties: {
        zoekterm: { type: 'string', description: 'bijvoorbeeld "raam", "window", "lamp", "deur"' },
        soort: { type: 'string', enum: ['eenkleurig', 'paar', 'gekleurd', 'merk'], description: 'eenkleurig (standaard), paar (aan/uit), gekleurd (kleurrijke 3D-achtige), merk (logo’s zoals Spotify, Philips Hue)' },
      },
      required: ['zoekterm'],
      additionalProperties: false,
    },
  },
  {
    name: 'zoek_flowkaart',
    description: 'Zoek flowkaartjes in Homey. Geeft per kaart: id | titel | eigenaar | argumenten. Gebruik de id letterlijk in een flow.',
    input_schema: {
      type: 'object',
      properties: {
        soort: { type: 'string', enum: ['trigger', 'condition', 'action'], description: 'trigger = ALS, condition = EN, action = DAN' },
        zoekterm: { type: 'string', description: 'trefwoorden, bijv. "open", "aan", "melding", "tijd", "push"' },
        apparaatId: { type: 'string', description: 'optioneel: alleen kaartjes van dit apparaat' },
      },
      required: ['soort'],
      additionalProperties: false,
    },
  },
  {
    name: 'zoek_keuze',
    description: 'Haal de mogelijke waarden op voor een argument van het type autocomplete (bijv. gebruiker, afspeellijst). Gebruik één van de teruggegeven objecten in zijn geheel als waarde.',
    input_schema: {
      type: 'object',
      properties: {
        soort: { type: 'string', enum: ['trigger', 'condition', 'action'] },
        kaart: { type: 'string', description: 'kaart-id' },
        argument: { type: 'string', description: 'naam van het argument' },
        zoekterm: { type: 'string' },
      },
      required: ['soort', 'kaart', 'argument'],
      additionalProperties: false,
    },
  },
  {
    name: 'lees_flow',
    description: 'Lees een bestaande gewone flow uit Homey (ALS, EN, DAN met kaart-id\'s en argumenten). Nodig voordat je hem aanpast.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'voorstel',
    description: 'Doe een voorstel voor wijzigingen aan het dashboard. De gebruiker ziet het als lijst en kiest zelf Toepassen of Annuleren. Acties worden in volgorde uitgevoerd.',
    input_schema: {
      type: 'object',
      properties: {
        samenvatting: { type: 'string', description: 'Korte uitleg in gewoon Nederlands van wat je voorstelt (1-3 zinnen).' },
        acties: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              actie: { type: 'string', enum: ['tabblad_maken', 'tabblad_aanpassen', 'knop_maken', 'tegel_maken', 'tegel_aanpassen', 'tegel_verwijderen', 'flow_maken', 'flow_aanpassen', 'flow_verwijderen', 'voorstel_terugdraaien'] },
              nummer: { type: 'integer', description: 'Alleen bij voorstel_terugdraaien: het nummer van het eerdere voorstel (Voorstel #n).' },
              omschrijving: { type: 'string', description: 'Korte Nederlandse omschrijving van deze ene stap, zoals de gebruiker hem in het lijstje ziet.' },
              sleutel: { type: 'string', description: 'Bij tabblad_maken of flow_maken: een eigen korte naam (bijv. "nieuw1") waarmee latere acties naar dit nieuwe tabblad verwijzen (tabblad) of een knop naar deze flow (koppeling id "nieuw:<sleutel>").' },
              flowId: { type: 'string', description: 'Bij flow_aanpassen / flow_verwijderen: id van de bestaande flow.' },
              aan: { type: 'boolean', description: 'Alleen bij flow_aanpassen: flow aan- of uitzetten.' },
              leesbaar: { type: 'string', description: 'Bij flow_maken / flow_aanpassen: de flow in gewone taal, regels ALS ..., EN ..., DAN ...' },
              flow: {
                type: 'object',
                description: 'Bij flow_maken / flow_aanpassen: de volledige flow.',
                properties: {
                  trigger: { type: 'object', properties: { id: { type: 'string' }, args: { type: 'object' } }, required: ['id'] },
                  conditions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, args: { type: 'object' }, inverted: { type: 'boolean', description: 'true = "is NIET"' }, group: { type: 'string', enum: ['group1', 'group2', 'group3'], description: 'groepen worden met OF verbonden' } }, required: ['id'] } },
                  actions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, args: { type: 'object' }, group: { type: 'string', enum: ['then', 'else'], description: 'then = DAN, else = ANDERS' }, delay: { type: 'object', properties: { number: { type: 'string' }, multiplier: { type: 'integer', enum: [1, 60], description: '1 = seconden, 60 = minuten' } } } }, required: ['id'] } },
                },
                required: ['trigger', 'actions'],
              },
              tabblad: { type: 'string', description: 'Id van een bestaand tabblad of de sleutel van een nieuw tabblad. Weglaten = het tabblad dat nu open is.' },
              tegel: { type: 'string', description: 'Id van een bestaande tegel (bij tegel_aanpassen / tegel_verwijderen).' },
              naam: { type: 'string', description: 'Naam van een tabblad (tabblad_maken / tabblad_aanpassen) of van een flow (flow_maken / flow_aanpassen).' },
              icoon: { type: 'string', description: 'Eén emoji voor een tabblad.' },
              stijl: { type: 'string', enum: KINDS, description: 'Knopstijl (knop_maken, of tegel_aanpassen bij een knop).' },
              tegelsoort: { type: 'string', enum: ['apparaat', 'tekst', 'klok', 'flow', 'mood'], description: 'Alleen bij tegel_maken: apparaat = standaard apparaattegel met details, tekst = vrije tekst, klok, flow = flow-starter, mood.' },
              koppeling: {
                type: 'object',
                properties: {
                  soort: { type: 'string', enum: ['apparaat', 'flow', 'mood', 'geen'] },
                  id: { type: 'string', description: 'Id van het apparaat, de flow of de mood; voor een flow uit dit voorstel "nieuw:<sleutel>".' },
                },
                required: ['soort'],
                additionalProperties: false,
              },
              eigenschap: { type: 'string', description: 'Optioneel: welke capability van het apparaat de knop toont/bedient (bijv. "onoff", "alarm_contact"). Weglaten = automatisch.' },
              tekst: { type: 'string', description: 'Naam op de knop, of de tekst van een teksttegel.' },
              toonNaam: { type: 'boolean', description: 'Naam op de knop tonen (standaard ja).' },
              toonStatus: { type: 'boolean', description: 'Toestand (Aan/Uit/Open) tonen (standaard ja).' },
              pictogram: { type: 'string', description: '"set:naam" uit zoek_pictogram, het pictogram voor aan (of het enige pictogram).' },
              pictogramUit: { type: 'string', description: '"set:naam" voor de uit-toestand (bij een paar).' },
              kleurAan: { type: 'string', description: '#rrggbb' },
              kleurUit: { type: 'string', description: '#rrggbb' },
              gloed: { type: 'string', enum: ['nooit', 'aan', 'altijd', 'alarm'] },
              gloedKleur: { type: 'string', description: '#rrggbb' },
              x: { type: 'integer' }, y: { type: 'integer' },
              breedte: { type: 'integer' }, hoogte: { type: 'integer' },
            },
            required: ['actie', 'omschrijving'],
            additionalProperties: false,
          },
        },
      },
      required: ['samenvatting', 'acties'],
      additionalProperties: false,
    },
  },
];

// ---------- overzicht voor Claude ----------
const SHOW_CAPS = /^(onoff|dim|alarm_|measure_temperature|measure_humidity|measure_power|meter_power|target_temperature|locked|windowcoverings_|light_hue|light_temperature|volume_set|speaker_playing|button)/;
function capVal(id, c) {
  const v = c.value;
  if (v === null || v === undefined) return '?';
  if (typeof v === 'boolean') return id === 'onoff' ? (v ? 'aan' : 'uit') : id === 'alarm_contact' ? (v ? 'open' : 'dicht') : id === 'locked' ? (v ? 'op slot' : 'open') : (v ? 'ja' : 'nee');
  if (typeof v === 'number') return Math.round(v * 100) / 100 + (c.units ? ' ' + c.units : '');
  return String(v).slice(0, 20);
}
function describeLibrary(lib, own = new Set()) {
  const zones = new Map((lib.zones || []).map(z => [z.id, z.name]));
  const byZone = new Map();
  for (const d of lib.devices || []) {
    const z = zones.get(d.zone) || 'Zonder zone';
    if (!byZone.has(z)) byZone.set(z, []);
    const caps = Object.entries(d.caps || {}).filter(([k]) => SHOW_CAPS.test(k)).slice(0, 8).map(([k, c]) => `${k}=${capVal(k, c)}`).join(', ');
    byZone.get(z).push(`  - ${d.name} | id ${d.id} | ${d.virtualClass || d.class}${caps ? ' | ' + caps : ''}${d.available === false ? ' | offline' : ''}`);
  }
  let s = '## Apparaten (per zone)\n';
  for (const z of [...byZone.keys()].sort()) s += `${z}:\n${byZone.get(z).sort().join('\n')}\n`;
  const flows = [...(lib.flows || []), ...(lib.advancedFlows || [])];
  s += '\n## Flows\n' + (flows.map(f => `  - ${f.name} | id ${f.id} | ${f.type === 'advancedflow' ? 'geavanceerd (niet aan te passen)' : 'gewoon'}${f.triggerable !== false ? ' | kan met een knop gestart worden' : ''}${f.enabled === false ? ' | staat uit' : ''}${own.has(f.id) ? ' | gemaakt door de assistent' : ''}`).join('\n') || '  (geen)') + '\n';
  s += '\n## Moods\n' + ((lib.moods || []).map(m => `  - ${m.name} | id ${m.id} | zone ${zones.get(m.zone) || '-'}`).join('\n') || '  (geen)') + '\n';
  return s;
}
function describeTiles(cfg, lib, currentTabId) {
  const devName = id => ((lib.devices || []).find(d => d.id === id) || {}).name;
  const flowName = id => ([...(lib.flows || []), ...(lib.advancedFlows || [])].find(f => f.id === id) || {}).name;
  let s = '## Tabbladen en tegels\n';
  for (const t of cfg.tabs || []) {
    const g = t.grid || { cols: 12, rows: 8 };
    s += `Tabblad "${t.name}" | id ${t.id} | raster ${g.cols}x${g.rows}${t.id === currentTabId ? ' | NU OPEN' : ''}${t.hidden ? ' | verborgen' : ''}\n`;
    for (const x of t.tiles || []) {
      const r = x.ref || {}; const o = x.opts || {};
      const target = r.deviceId ? `apparaat "${devName(r.deviceId) || r.deviceId}"` : r.target === 'flow' ? `flow "${flowName(r.id) || r.id}"` : r.target === 'mood' ? 'mood' : '';
      const what = x.type === 'button' ? `knop (${o.kind || 'glow'})` : x.type === 'text' ? `tekst "${String(o.text || '').slice(0, 40)}"` : x.type;
      s += `  - tegel ${x.id} | ${what}${target ? ' → ' + target : ''}${o.title ? ` | naam "${o.title}"` : ''} | x${x.x} y${x.y} ${x.w}x${x.h}\n`;
    }
    if (!(t.tiles || []).length) s += '  (leeg)\n';
  }
  return s;
}

// ---------- pictogrammen zoeken (tool) ----------
function iconSearch(icons, input) {
  const set = { paar: 'paar', gekleurd: '3d', merk: 'merk' }[input.soort] || 'mdi';
  const r = icons.search(String(input.zoekterm || ''), '', 0, 15, set);
  if (!r.items.length) return 'Niets gevonden. Probeer een ander (Engels) woord.';
  if (set === 'paar') return r.items.map(i => `aan ${i.on.s}:${i.on.n}  /  uit ${i.off.s}:${i.off.n}`).join('\n');
  return r.items.map(i => `${i.s}:${i.n}${i.t ? ` (${i.t})` : ''}`).join('\n');
}

function cost(model, usage) {
  const p = MODELS[model] || MODELS[DEFAULT_MODEL];
  const inTok = (usage.input_tokens || 0) + 1.25 * (usage.cache_creation_input_tokens || 0);
  return (inTok * p.in + (usage.cache_read_input_tokens || 0) * p.cacheRead + (usage.output_tokens || 0) * p.out) / 1e6;
}

class Assistant {
  constructor({ icons, client, flows }) {
    this.icons = icons; this.flows = flows || null;
    this.client = client || null;
    this.enabled = !!client;
    if (!client && process.env.ANTHROPIC_API_KEY && !/plak-hier|XX/i.test(process.env.ANTHROPIC_API_KEY)) {
      const Anthropic = require('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 180000 });
      this.enabled = true;
    }
  }
  status() {
    return { enabled: this.enabled, models: Object.entries(MODELS).map(([id, m]) => ({ id, name: m.name })), defaultModel: DEFAULT_MODEL };
  }

  // Flows in een voorstel alvast controleren; tekst met fouten of null als alles klopt
  async checkFlows(plan) {
    const fl = ((plan && plan.acties) || []).filter(a => a && (a.actie === 'flow_maken' || a.actie === 'flow_aanpassen'));
    if (!fl.length && !((plan && plan.acties) || []).some(x => x && x.actie === 'flow_verwijderen')) return null;
    if (!this.flows || !this.flows.supported()) return 'flows zijn nu niet beschikbaar (geen verbinding met Homey)';
    const errs = [];
    for (const a of fl) {
      if (a.actie === 'flow_aanpassen' && !a.flowId) errs.push(`"${a.omschrijving}": flowId ontbreekt`);
      const r = await this.flows.check(a.flow); for (const e of r.errs) errs.push(`"${a.omschrijving}": ${e}`);
    }
    for (const a of ((plan && plan.acties) || []).filter(x => x && x.actie === 'flow_verwijderen')) if (!a.flowId) errs.push(`"${a.omschrijving}": flowId ontbreekt`);
    return errs.length ? errs.join('\n') : null;
  }

  // history: [{ role: 'user'|'assistant', text }], laatste is de nieuwe vraag van de gebruiker
  async ask({ history, cfg, lib, currentTabId, model, onProgress }) {
    const progress = t => { try { if (onProgress) onProgress(t); } catch (e) { /* */ } };
    if (!this.enabled) throw new Error('De assistent staat uit: er is nog geen ANTHROPIC_API_KEY ingesteld op de NAS.');
    if (!MODELS[model]) model = DEFAULT_MODEL;
    const turns = (history || []).filter(h => h && h.text && (h.role === 'user' || h.role === 'assistant')).slice(-12);
    if (!turns.length || turns[turns.length - 1].role !== 'user') throw new Error('Geen vraag ontvangen');
    while (turns.length && turns[0].role !== 'user') turns.shift();
    const overview = describeLibrary(lib, this.flows ? this.flows.own() : undefined) + '\n' + describeTiles(cfg, lib, currentTabId);
    const messages = turns.map((h, i) => (i === turns.length - 1
      ? { role: 'user', content: [{ type: 'text', text: `Huidige situatie van het dashboard en de Homey:\n\n${overview}` }, { type: 'text', text: h.text }] }
      : { role: h.role, content: String(h.text) }));

    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    let served = model;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      progress(round === 0 ? 'Claude denkt na…' : 'Claude verwerkt wat hij gevonden heeft…');
      const res = await this.client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        cache_control: { type: 'ephemeral' },
        output_config: { effort: 'medium' },
        system: SYSTEM,
        tools: TOOLS,
        messages,
      });
      for (const k of Object.keys(usage)) usage[k] += (res.usage && res.usage[k]) || 0;
      served = res.model || served;
      const done = extra => ({ ...extra, usage: { ...usage, usd: cost(model, usage) }, model: served });

      if (res.stop_reason === 'refusal') return done({ text: 'Dit verzoek kan ik niet uitvoeren. Probeer het anders te formuleren.' });
      const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      const uses = res.content.filter(b => b.type === 'tool_use');
      const plan = uses.find(b => b.name === 'voorstel');
      let planErr = null;
      if (plan) {
        planErr = await this.checkFlows(plan.input);
        if (!planErr) return done({ text, plan: plan.input });
      }
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
      if (!uses.length) {
        if (res.stop_reason === 'max_tokens') return done({ text: (text ? text + '\n\n' : '') + '(Het antwoord werd te lang en is afgebroken. Probeer een kleinere opdracht.)' });
        return done({ text: text || 'Ik heb geen voorstel kunnen maken. Kun je het anders zeggen?' });
      }
      messages.push({ role: 'assistant', content: res.content });
      messages.push({ role: 'user', content: await Promise.all(uses.map(async u => {
        const inp = u.input || {};
        try {
          if (u.name === 'voorstel') return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'Het voorstel is niet getoond, want er klopt iets niet aan de flows: ' + planErr + '\nVerbeter het en roep voorstel opnieuw aan.' };
          progress({ zoek_pictogram: `Zoekt pictogrammen: ${inp.zoekterm || ''}`, zoek_flowkaart: `Zoekt flowkaartjes: ${inp.zoekterm || inp.soort || ''}`, zoek_keuze: `Zoekt keuzes voor ${inp.argument || ''}`, lees_flow: 'Leest een bestaande flow' }[u.name] || 'Bezig…');
          if (u.name === 'zoek_pictogram') return { type: 'tool_result', tool_use_id: u.id, content: iconSearch(this.icons, inp) };
          if (!this.flows || !this.flows.supported()) throw new Error('Flows zijn nu niet beschikbaar (geen verbinding met Homey).');
          if (u.name === 'zoek_flowkaart') return { type: 'tool_result', tool_use_id: u.id, content: await this.flows.searchCards(inp) };
          if (u.name === 'zoek_keuze') return { type: 'tool_result', tool_use_id: u.id, content: await this.flows.autocomplete(inp) };
          if (u.name === 'lees_flow') return { type: 'tool_result', tool_use_id: u.id, content: await this.flows.readFlow(inp.id) };
          throw new Error('Onbekende tool');
        } catch (e) { return { type: 'tool_result', tool_use_id: u.id, is_error: true, content: String(e.message || e) }; }
      })) });
    }
    return { text: 'Dit werd te ingewikkeld in één keer. Probeer de opdracht in kleinere stappen.', usage: { ...usage, usd: cost(model, usage) }, model: served };
  }
}

// Leesbare foutmelding voor de gebruiker
function friendlyError(err) {
  let Anthropic = null; try { Anthropic = require('@anthropic-ai/sdk'); } catch (e) { /* */ }
  if (Anthropic) {
    if (err instanceof Anthropic.AuthenticationError) return 'De API-sleutel wordt niet geaccepteerd. Controleer ANTHROPIC_API_KEY in docker-compose.yml.';
    if (err instanceof Anthropic.PermissionDeniedError) return 'Deze API-sleutel mag dit model niet gebruiken.';
    if (err instanceof Anthropic.RateLimitError) return 'Even te veel verzoeken. Probeer het over een minuut opnieuw.';
    if (err instanceof Anthropic.BadRequestError) return /credit|balance/i.test(err.message) ? 'Je tegoed bij Anthropic is op. Waardeer het op via platform.claude.com → Billing.' : 'Claude kon dit verzoek niet verwerken: ' + err.message;
    if (err instanceof Anthropic.APIConnectionError) return 'Geen verbinding met Claude. Heeft de NAS internet?';
    if (err instanceof Anthropic.APIError) return `Claude gaf een fout (${err.status || '?'}). Probeer het later opnieuw.`;
  }
  return String(err.message || err);
}

module.exports = { Assistant, friendlyError, MODELS, DEFAULT_MODEL, describeLibrary, describeTiles };
