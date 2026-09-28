'use strict';
// Pictogrammen: Material Design Icons (Apache 2.0, zie mdi-icons.LICENSE)
const path = require('path');
const fs = require('fs');

let DATA = null;
function data() {
  if (!DATA) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'mdi-icons.json'), 'utf8'));
    DATA = { cats: raw.cats, icons: raw.icons.map(([n, p, c, a]) => ({ n, p, c, hay: (n + ' ' + a).toLowerCase() })) };
    DATA.byName = new Map(DATA.icons.map(i => [i.n, i]));
  }
  return DATA;
}

// Nederlandse zoekwoorden → Engelse namen van de pictogrammen
const NL = {
  lamp: 'lightbulb lamp light', lampen: 'lightbulb lamp light', licht: 'light lightbulb lamp', verlichting: 'light lightbulb lamp', peer: 'lightbulb', gloeilamp: 'lightbulb',
  plafondlamp: 'ceiling-light', vloerlamp: 'floor-lamp', bureaulamp: 'desk-lamp', wandlamp: 'wall-sconce', ledstrip: 'led-strip', kroonluchter: 'chandelier', spot: 'spotlight light-recessed',
  schakelaar: 'switch toggle light-switch', knop: 'button gesture-tap power', aan: 'power', uit: 'power-off', stopcontact: 'power-socket power-plug', stekker: 'power-plug', afstandsbediening: 'remote',
  sensor: 'sensor motion-sensor thermometer', beweging: 'motion run walk', bewegingssensor: 'motion-sensor', rook: 'smoke', rookmelder: 'smoke-detector', lek: 'leak water-alert', water: 'water',
  vocht: 'water-percent humidifier', luchtvochtigheid: 'water-percent', temperatuur: 'thermometer temperature', co2: 'molecule-co2', lucht: 'air', helderheid: 'brightness',
  deur: 'door', deuren: 'door', voordeur: 'door', raam: 'window', ramen: 'window', gordijn: 'curtains', gordijnen: 'curtains', rolluik: 'window-shutter roller-shade', zonwering: 'awning blinds roller-shade',
  jaloezie: 'blinds', luik: 'window-shutter', poort: 'gate', hek: 'fence gate', garagedeur: 'garage', slot: 'lock', sleutel: 'key', open: 'open', dicht: 'closed',
  thermostaat: 'thermostat', verwarming: 'radiator heat heating', radiator: 'radiator', vloerverwarming: 'heating-coil', ventilator: 'fan', airco: 'air-conditioner', warmtepomp: 'heat-pump',
  sneeuw: 'snow snowflake', vuur: 'fire', haard: 'fireplace', boiler: 'water-boiler', luchtreiniger: 'air-purifier', ontvochtiger: 'dehumidifier',
  tv: 'television', televisie: 'television', luidspreker: 'speaker', speaker: 'speaker', muziek: 'music', radio: 'radio', koptelefoon: 'headphones', film: 'movie', beamer: 'projector', spelcomputer: 'gamepad controller',
  energie: 'lightning-bolt flash meter-electric', stroom: 'flash lightning-bolt power', zon: 'sun weather-sunny', zonnepaneel: 'solar-panel', zonnepanelen: 'solar-panel solar-power', accu: 'battery', batterij: 'battery',
  laadpaal: 'ev-station ev-plug', meter: 'meter gauge', gas: 'meter-gas gas', verbruik: 'meter-electric chart',
  wasmachine: 'washing-machine', droger: 'tumble-dryer', wasdroger: 'tumble-dryer', vaatwasser: 'dishwasher', koelkast: 'fridge', vriezer: 'fridge freezer', oven: 'oven stove', fornuis: 'stove',
  magnetron: 'microwave', waterkoker: 'kettle', koffie: 'coffee', koffiezetapparaat: 'coffee-maker', broodrooster: 'toaster', stofzuiger: 'vacuum robot-vacuum', robotstofzuiger: 'robot-vacuum',
  strijkijzer: 'iron', grasmaaier: 'mower robot-mower', maaier: 'mower robot-mower', kraan: 'faucet', douche: 'shower', afval: 'trash-can delete', vuilnis: 'trash-can delete',
  alarm: 'alarm alarm-light siren shield', beveiliging: 'shield security', camera: 'cctv camera webcam', bel: 'bell doorbell', deurbel: 'doorbell', sirene: 'siren alarm-light', kluis: 'safe', vingerafdruk: 'fingerprint',
  huis: 'home house', thuis: 'home', woonkamer: 'sofa television', bank: 'sofa', slaapkamer: 'bed', bed: 'bed', keuken: 'countertop stove silverware', badkamer: 'shower bathtub', bad: 'bathtub',
  wc: 'toilet', toilet: 'toilet', trap: 'stairs', zolder: 'home-roof stairs', kantoor: 'desk office', bureau: 'desk', tafel: 'table', stoel: 'chair', kast: 'wardrobe cupboard', kinderkamer: 'baby teddy-bear',
  tuin: 'garden flower tree grass', boom: 'tree', bloem: 'flower', plant: 'flower sprout leaf', planten: 'flower sprout', gras: 'grass', sproeier: 'sprinkler', zwembad: 'pool', vijver: 'pond waves',
  brievenbus: 'mailbox', auto: 'car', fiets: 'bicycle bike', scooter: 'scooter', parkeren: 'parking', schuur: 'warehouse', kas: 'greenhouse', barbecue: 'grill barbecue',
  weer: 'weather', regen: 'rain pouring', wolk: 'cloud', bewolkt: 'weather-cloudy', wind: 'wind', storm: 'thunderstorm lightning', onweer: 'lightning thunderstorm', mist: 'fog', maan: 'moon night', nacht: 'night moon', dag: 'sun day',
  persoon: 'account human', personen: 'account-group', mensen: 'account-group human', familie: 'human-male-female-child', kind: 'baby human-child', hond: 'dog', kat: 'cat', huisdier: 'paw',
  klok: 'clock', tijd: 'clock', wekker: 'alarm clock', timer: 'timer', agenda: 'calendar', slapen: 'sleep bed', kerst: 'pine-tree candle gift', kaars: 'candle', cadeau: 'gift', feest: 'party-popper',
  wifi: 'wifi', internet: 'wifi web', router: 'router', computer: 'monitor desktop laptop', printer: 'printer', telefoon: 'cellphone phone', tablet: 'tablet',
  pijl: 'arrow', omhoog: 'arrow-up chevron-up', omlaag: 'arrow-down chevron-down', links: 'arrow-left', rechts: 'arrow-right', vink: 'check', kruis: 'close', plus: 'plus', min: 'minus',
  scene: 'palette movie-open', sfeer: 'palette candle', paniek: 'alarm-light', noodknop: 'alarm-light', stop: 'stop',
};

// Bovenaan bij "Alle" (zonder zoekwoord): de meest gebruikte pictogrammen voor een smart home
const POPULAR = `lightbulb lightbulb-outline lightbulb-on lightbulb-on-outline lightbulb-off-outline lightbulb-group lightbulb-group-outline ceiling-light ceiling-light-outline
  ceiling-light-multiple floor-lamp floor-lamp-outline desk-lamp lamp lamps wall-sconce wall-sconce-flat chandelier led-strip-variant spotlight light-recessed coach-lamp outdoor-lamp string-lights
  light-switch toggle-switch toggle-switch-off power power-plug power-socket-eu gesture-tap-button remote
  motion-sensor smoke-detector water-alert leak thermometer water-percent molecule-co2 gauge eye run
  door door-open door-closed door-closed-lock window-open window-closed window-open-variant window-closed-variant window-shutter window-shutter-open blinds blinds-open roller-shade roller-shade-closed curtains curtains-closed garage garage-open gate gate-open lock lock-open key
  thermostat radiator radiator-off fan fan-off air-conditioner air-purifier fire fireplace snowflake heat-wave water-boiler heat-pump
  television speaker speaker-wireless cast music play pause volume-high radio projector headphones
  solar-panel solar-power battery lightning-bolt flash meter-electric meter-gas ev-station ev-plug-type2 transmission-tower home-lightning-bolt
  washing-machine tumble-dryer dishwasher fridge stove microwave kettle coffee-maker toaster-oven robot-vacuum vacuum robot-mower iron faucet shower bathtub toilet
  shield-home shield-lock alarm-light bell doorbell cctv cctv-off webcam camera
  home home-outline home-variant sofa bed bed-king table-furniture desk countertop stairs silverware-fork-knife wardrobe
  tree flower sprout grass sprinkler pool grill mailbox car bicycle
  weather-sunny weather-night weather-cloudy weather-rainy weather-snowy weather-windy weather-lightning umbrella
  account account-group human-male-female-child baby-face-outline dog cat paw
  clock-outline alarm timer-outline calendar sleep palette movie-open party-popper candle pine-tree gift`.split(/\s+/);

function search(q, cat, offset = 0, limit = 200) {
  const d = data();
  const words = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  let list = d.icons;
  if (cat) { const ci = d.cats.findIndex(c => c[0] === cat); if (ci >= 0) { const k = ci.toString(36); list = list.filter(i => i.c.includes(k)); } }
  if (words.length) {
    const scored = [];
    for (const i of list) {
      let score = 0; let all = true;
      for (const w of words) {
        const terms = [w, ...(NL[w] ? NL[w].split(' ') : [])];
        let best = 0;
        for (const t of terms) {
          if (i.n === t) best = Math.max(best, 100);
          else if (i.n.startsWith(t + '-') || i.n.startsWith(t)) best = Math.max(best, 60 - Math.min(30, i.n.length - t.length));
          else if (i.n.includes('-' + t)) best = Math.max(best, 35);
          else if (i.hay.includes(t)) best = Math.max(best, 15);
        }
        if (!best) { all = false; break; }
        score += best;
      }
      if (all) scored.push([score - (i.n.includes('outline') ? 3 : 0), i]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].n.localeCompare(b[1].n));
    list = scored.map(s => s[1]);
  } else {
    // zonder zoekwoord: eenvoudige basisvormen eerst (lightbulb vóór lightbulb-on-50-outline);
    // bij "Alle" eerst alles voor in huis (lampen t/m veiligheid), daarna de rest
    const segs = n => n.split('-').length + (n.includes('outline') ? 0.5 : 0);
    if (cat) list = [...list].sort((a, b) => segs(a.n) - segs(b.n) || a.n.localeCompare(b.n));
    else {
      const top = POPULAR.map(n => d.byName.get(n)).filter(Boolean); const seen = new Set(top);
      const home = i => /[0-8]/.test(i.c) ? 0 : 1;
      list = [...top, ...list.filter(i => !seen.has(i)).sort((a, b) => home(a) - home(b) || segs(a.n) - segs(b.n) || a.n.localeCompare(b.n))];
    }
  }
  return { total: list.length, items: list.slice(offset, offset + limit).map(i => ({ n: i.n, p: i.p })) };
}

function get(name) { const i = data().byName.get(name); return i ? { n: i.n, p: i.p } : null; }
function categories() { return data().cats; }

module.exports = { search, get, categories };
