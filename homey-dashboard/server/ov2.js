'use strict';
// Reisinformatie voor de tegels "NS reisinformatie" en "Bus reisinformatie".
// - NS: vertrektijden en storingen via de NS API (gratis persoonlijke sleutel, alleen op de NAS bewaard).
// - Bus: live vertrektijden en meldingen van de halte via OVapi (alle vervoerders, ook Arriva/Keolis; geen sleutel).
// De NAS haalt op en bewaart kort (cache), zodat de tablet zelf niets bij andere sites ophaalt.

const NS = (process.env.NS_BASE || 'https://gateway.apiportal.ns.nl').replace(/\/$/, '');
const OVAPI = (process.env.OVAPI_BASE || 'http://v0.ovapi.nl').replace(/\/$/, '');
const UA = { 'User-Agent': 'HomeyDashboard/1.0 (eigen dashboard; NAS)' };

const cache = new Map();
async function cached(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ms) return c.v;
  try { const v = await fn(); cache.set(key, { at: Date.now(), v }); return v; }
  catch (e) { if (c) return { ...c.v, stale: true, staleError: String(e.message || e) }; throw e; }
}
async function getJson(url, headers) {
  const r = await fetch(url, { headers: { ...UA, ...(headers || {}) }, signal: AbortSignal.timeout(12000) });
  if (r.status === 401 || r.status === 403) throw new Error(url.startsWith(NS) ? 'NS-sleutel klopt niet of is verlopen (vul hem opnieuw in bij Tegel)' : `toegang geweigerd (${r.status})`);
  if (!r.ok) throw new Error(`${new URL(url).hostname} gaf ${r.status}`);
  return r.json();
}
const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
const str = v => (v == null ? '' : String(v));

class Reis {
  constructor({ secrets }) { this.secrets = secrets; }
  nsKey() { const k = str(this.secrets().ns).trim(); if (!k) throw new Error('Vul bij Tegel je NS-sleutel in (gratis via apiportal.ns.nl)'); return k; }
  ns(path) { return getJson(NS + path, { 'Ocp-Apim-Subscription-Key': this.nsKey() }); }

  // ---------- NS: stations (lijst 1 week bewaard, zoeken gebeurt hier) ----------
  async nsStations(q) {
    q = str(q).toLowerCase().trim(); if (q.length < 2) return [];
    const all = await cached('ns:stations', 7 * 864e5, async () => {
      const j = await this.ns('/reisinformatie-api/api/v2/stations');
      return { list: arr(j.payload || j).filter(s => !s.land || s.land === 'NL').map(s => ({ code: str(s.code).toUpperCase(), name: str((s.namen && (s.namen.lang || s.namen.middel)) || s.name) })).filter(s => s.code && s.name) };
    });
    const hit = all.list.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q);
    hit.sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || a.name.localeCompare(b.name));
    return hit.slice(0, 15);
  }

  // ---------- NS: vertrektijden ----------
  nsDepartures(station) {
    station = str(station).toUpperCase(); if (!/^[A-Z0-9]{1,8}$/.test(station)) throw new Error('Kies bij Tegel een station');
    return cached('ns:dep:' + station, 30e3, async () => {
      const j = await this.ns(`/reisinformatie-api/api/v2/departures?station=${encodeURIComponent(station)}&maxJourneys=25`);
      const deps = arr((j.payload && j.payload.departures) || j.departures).map(d => {
        const p = d.product || {};
        const planned = d.plannedDateTime, actual = d.actualDateTime || planned;
        const delay = planned && actual ? Math.round((new Date(actual) - new Date(planned)) / 6e4) : 0;
        return {
          planned, actual, delay: delay > 0 ? delay : 0,
          dest: str(d.direction),
          via: arr(d.routeStations).map(s => str(s.mediumName || s.name)).filter(Boolean).slice(0, 3),
          track: str(d.actualTrack || d.plannedTrack), trackChanged: !!(d.actualTrack && d.plannedTrack && d.actualTrack !== d.plannedTrack),
          kind: str(p.longCategoryName || p.categoryCode || d.trainCategory), short: str(p.shortCategoryName || d.trainCategory),
          operator: str(p.operatorName), cancelled: !!d.cancelled || /CANCEL/i.test(str(d.departureStatus)),
          note: arr(d.messages).map(m => str(m.message || m.text)).filter(Boolean).join(' · '),
        };
      });
      return { at: Date.now(), station, departures: deps };
    });
  }

  // ---------- NS: storingen, werkzaamheden en calamiteiten ----------
  nsDisruptions(station) {
    station = str(station).toUpperCase();
    return cached('ns:dis', 5 * 60e3, async () => {
      const j = await this.ns('/disruptions/v3?isActive=true');
      const list = arr(j.payload || j).filter(d => d && d.isActive !== false).map(d => {
        const ts = arr(d.timespans)[0] || {};
        const stations = new Set();
        for (const ps of arr(d.publicationSections)) for (const s of arr(ps.section && ps.section.stations)) stations.add(str(s.stationCode).toUpperCase());
        for (const s of arr(d.affectedStations)) stations.add(str(s.stationCode || s.code).toUpperCase());
        const type = str(d.type).toUpperCase();
        return {
          id: str(d.id), type, label: type === 'MAINTENANCE' ? 'WERK' : type === 'CALAMITY' ? 'LET OP' : 'STORING',
          title: str(d.title || (d.titleSections && arr(d.titleSections).flat().map(x => x.value).join(''))),
          text: str((ts.situation && ts.situation.label) || d.situation || (ts.cause && ts.cause.label) || ''),
          period: str(d.period || (ts.start ? `${ts.start}${ts.end ? ' t/m ' + ts.end : ''}` : '')),
          extra: str(d.expectedDuration && d.expectedDuration.description),
          stations: [...stations],
        };
      });
      return { at: Date.now(), list };
    }).then(r => {
      // eerst wat jouw station raakt, dan calamiteiten/storingen, dan werkzaamheden
      const rank = d => (station && d.stations.includes(station) ? 0 : 10) + (d.type === 'CALAMITY' ? 0 : d.type === 'DISRUPTION' ? 1 : 2);
      return { ...r, station, list: r.list.slice().sort((a, b) => rank(a) - rank(b)).slice(0, 25).map(d => ({ ...d, mine: !!station && d.stations.includes(station) })) };
    });
  }

  // ---------- Bus: vertrektijden en meldingen van een halte (OVapi) ----------
  bus({ code, lines, dest }) {
    code = str(code); if (!/^[\w:-]+$/.test(code)) throw new Error('Kies bij Tegel een bushalte');
    return cached('bus:' + code, 30e3, async () => {
      const j = await getJson(`${OVAPI}/stopareacode/${encodeURIComponent(code)}`);
      const out = []; const msgs = new Map();
      for (const area of Object.values(j || {})) for (const tpc of Object.values(area || {})) {
        if (!tpc || typeof tpc !== 'object') continue;
        for (const p of Object.values(tpc.Passes || {})) {
          out.push({ line: str(p.LinePublicNumber), dest: str(p.DestinationName50), operator: str(p.OperatorCode), planned: p.TargetDepartureTime, expected: p.ExpectedDepartureTime || p.TargetDepartureTime, status: str(p.TripStopStatus), type: str(p.TransportType) });
        }
        for (const m of arr(tpc.GeneralMessages)) {
          const text = str(m.MessageContent || m.Text || m.message).trim(); if (!text) continue;
          msgs.set(text, { text, start: m.MessageStartTime || null, end: m.MessageEndTime || null, type: str(m.MessageType || m.Type) });
        }
      }
      return { at: Date.now(), passes: out, messages: [...msgs.values()] };
    }).then(r => {
      const only = str(lines).split(/[,\s]+/).filter(Boolean);
      const d = str(dest).toLowerCase().trim();
      const now = Date.now();
      const list = r.passes.filter(x => (!only.length || only.includes(x.line)) && (!d || x.dest.toLowerCase().includes(d)) && new Date(x.expected).getTime() > now - 60e3 && x.status !== 'PASSED')
        .sort((a, b) => str(a.expected).localeCompare(str(b.expected))).slice(0, 20)
        .map(x => ({ ...x, delay: Math.max(0, Math.round((new Date(x.expected) - new Date(x.planned)) / 6e4)), cancelled: x.status === 'CANCEL' }));
      return { at: r.at, stale: r.stale, departures: list, messages: r.messages };
    });
  }
}

module.exports = { Reis };
