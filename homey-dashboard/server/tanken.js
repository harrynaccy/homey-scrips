'use strict';
// Goedkoopst tanken voor de tegel "Goedkoopst tanken": Enschede (ANWB) en Gronau, Ahaus/Alstätte (Tankerkönig).
// - Tankerkönig: officiële Duitse prijzen (MTS-K), gratis persoonlijke sleutel, alleen op de NAS bewaard.
//   Bron CC BY 4.0 "Tankerkönig / MTS-K"; niet vaker dan elke 5 minuten vragen (wij: 10 min).
// - ANWB: prijzen van Nederlandse pompen via hetzelfde adres als de ANWB-website; niet officieel, kan veranderen.
const UA = { 'User-Agent': 'HomeyDashboard/1.0 (eigen dashboard; NAS)' };
const TK = (process.env.TK_BASE || 'https://creativecommons.tankerkoenig.de/json').replace(/\/$/, '');
const ANWB_KEY = process.env.ANWB_KEY || 'QYUEE3fEcFD7SGMJ6E7QBCMzdQGqRkAi';
const ANWB_FUEL = process.env.ANWB_FUEL_URL || 'https://api.anwb.nl/routing/points-of-interest/v3/all';
const EVERY = 10 * 60e3;

const AREAS = {
  gronau: [{ lat: 52.2125, lng: 7.0251, rad: 5 }],
  ahaus: [{ lat: 52.0755, lng: 7.0110, rad: 5 }, { lat: 52.1236, lng: 6.9056, rad: 4 }], // Ahaus en Alstätte
};
const ENSCHEDE_BOX = '52.165,6.770,52.275,7.000';
const TK_TYPE = { e5: 'e5', e10: 'e10', diesel: 'diesel' };

const cache = new Map();
async function cached(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < ms) return c.v;
  try { const v = await fn(); cache.set(key, { at: Date.now(), v }); return v; }
  catch (e) { if (c) return { ...c.v, stale: true, error: String(e.message || e) }; throw e; }
}
async function getJson(url, headers) {
  const r = await fetch(url, { headers: { ...UA, Accept: 'application/json', ...(headers || {}) }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${new URL(url).hostname} gaf ${r.status}`);
  return r.json();
}
const str = v => (v == null ? '' : String(v));
const euro = v => { let n = Number(v); if (!Number.isFinite(n) || n <= 0) return null; if (n > 100) n /= 1000; else if (n > 10) n /= 100; return Math.round(n * 1000) / 1000; };

// ---------- Duitsland ----------
async function tkArea(key, pts, fuel) {
  const got = new Map();
  for (const p of pts) {
    const j = await getJson(`${TK}/list.php?lat=${p.lat}&lng=${p.lng}&rad=${p.rad}&sort=price&type=${TK_TYPE[fuel] || 'e5'}&apikey=${encodeURIComponent(key)}`);
    if (j.ok === false) throw new Error(/apikey|key/i.test(str(j.message)) ? 'Tankerkönig-sleutel klopt niet (nog niet geactiveerd?)' : 'Tankerkönig: ' + str(j.message || 'fout'));
    for (const s of j.stations || []) {
      const price = euro(s.price); if (price == null) continue;
      got.set(s.id, { id: s.id, name: str(s.brand || s.name).trim() || str(s.name), full: str(s.name), street: [s.street, s.houseNumber].filter(Boolean).join(' ').trim(), place: str(s.place), price, open: s.isOpen === true ? true : s.isOpen === false ? false : null });
    }
  }
  return [...got.values()].sort((a, b) => a.price - b.price).slice(0, 15);
}

// ---------- Nederland (ANWB) ----------
const isEuro95 = t => /euro ?95|^e10$|euro95|benzine|petrol_95|^95$/i.test(t) && !/98|plus|super ?plus/i.test(t);
function anwbStations(j, fuel) {
  const out = [];
  const walk = v => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== 'object') return;
    const prices = v.prices || v.fuelPrices;
    if (Array.isArray(prices)) {
      const want = prices.filter(p => { const t = str(p.fuelType || p.type || p.name || p.fuel); return fuel === 'diesel' ? /diesel/i.test(t) && !/plus|premium|hvo/i.test(t) : isEuro95(t); });
      const price = want.map(p => euro(p.value != null ? p.value : p.price)).filter(x => x != null).sort((a, b) => a - b)[0];
      if (price != null) {
        const a = v.address || {}; const c = v.coordinates || v.location || {};
        const open = v.isOpen != null ? !!v.isOpen : v.openingHours && v.openingHours.isOpen != null ? !!v.openingHours.isOpen : v.open != null ? !!v.open : null;
        const upd = want.map(p => p.updatedAt || p.lastUpdated || p.date).find(Boolean) || null;
        out.push({ id: str(v.id || v.title + a.streetAddress), name: str(v.title || v.name || v.brand), street: str(a.streetAddress || a.street || ''), place: str(a.city || a.place || ''), price, open,
          lat: Number(c.latitude != null ? c.latitude : c.lat), lon: Number(c.longitude != null ? c.longitude : c.lon), updated: upd });
      }
      return;
    }
    for (const w of Object.values(v)) if (w && typeof w === 'object') walk(w);
  };
  walk(j);
  return out;
}
async function anwbEnschede(fuel) {
  const sep = ANWB_FUEL.includes('?') ? '&' : '?';
  const j = await getJson(`${ANWB_FUEL}${sep}type-filter=FUEL_STATION&bounding-box-filter=${ENSCHEDE_BOX}&apikey=${ANWB_KEY}`, { 'x-api-key': ANWB_KEY });
  const list = anwbStations(j, fuel).filter(s => !s.place || /enschede|glanerbrug/i.test(s.place));
  const seen = new Set();
  return list.filter(s => (seen.has(s.id) ? false : seen.add(s.id))).sort((a, b) => a.price - b.price).slice(0, 15);
}

class Tanken {
  constructor({ secrets }) { this.secrets = secrets; }
  async prices(fuel) {
    fuel = TK_TYPE[fuel] ? fuel : 'e5';
    const key = str(this.secrets().tankerkoenig).trim();
    const part = async (name, fn) => { try { return { ...(await cached(name + ':' + fuel + (name === 'nl' ? '' : ':' + key.slice(0, 6)), EVERY, async () => ({ at: Date.now(), list: await fn() }))) }; } catch (e) { return { error: String(e.message || e), list: [] }; } };
    const de = async area => (key ? part(area, () => tkArea(key, AREAS[area], fuel)) : { error: 'Vul bij Tegel je Tankerkönig-sleutel in', nokey: true, list: [] });
    const [nl, gronau, ahaus] = await Promise.all([part('nl', () => anwbEnschede(fuel)), de('gronau'), de('ahaus')]);
    if (nl.error && !nl.list.length) nl.error = 'Enschede nu niet beschikbaar (' + nl.error + ')';
    return { at: Date.now(), fuel, nl, gronau, ahaus };
  }
}

module.exports = { Tanken, anwbStations, euro };
