'use strict';
// Pictogrammen: Material Design Icons (zie mdi-icons.LICENSE) en extra sets in iconsets/ (zie iconsets/LICENTIES.md)
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
  hue: 'hue philips bulb', philips: 'philips hue', lichtstrip: 'lightstrip strip', strip: 'strip lightstrip', buitenlamp: 'outdoor lantern', hanglamp: 'pendant ceiling', tafellamp: 'table lamp', kaarslamp: 'candle', dimmer: 'dimmer', bewegingsmelder: 'motion sensor',
  muziekspeler: 'speaker music', film: 'movie film', eten: 'food', drinken: 'drink', fruit: 'fruit', groente: 'vegetable', vogel: 'bird', vis: 'fish', hart: 'heart', ster: 'star', vlag: 'flag', feestje: 'party', verjaardag: 'birthday cake',
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


const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'iconsets', f), 'utf8'));

// ---------- rangschikken op zoekwoorden (Nederlands of Engels) ----------
function rank(list, words, nameOf, hayOf) {
  const scored = [];
  for (const i of list) {
    const n = nameOf(i), hay = hayOf(i); let score = 0, all = true;
    for (const w of words) {
      const terms = [w, ...(NL[w] ? NL[w].split(' ') : [])]; let best = 0;
      for (const t of terms) {
        const tt = t.replace(/-/g, ' '), nn = n.replace(/-/g, ' ');
        if (nn === tt) best = Math.max(best, 100);
        else if (nn.startsWith(tt)) best = Math.max(best, 60 - Math.min(30, nn.length - tt.length));
        else if (nn.includes(' ' + tt)) best = Math.max(best, 35);
        else if (hay.includes(t) || hay.includes(tt)) best = Math.max(best, 15);
      }
      if (!best) { all = false; break; }
      score += best;
    }
    if (all) scored.push([score - (n.includes('outline') ? 3 : 0), i]);
  }
  scored.sort((a, b) => b[0] - a[0] || nameOf(a[1]).localeCompare(nameOf(b[1])));
  return scored.map(x => x[1]);
}
const splitQ = q => String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);

// ---------- Material Design Icons (eenkleurig) ----------
function searchMdi(q, cat) {
  const d = data(); const words = splitQ(q);
  let list = d.icons;
  if (cat) { const ci = d.cats.findIndex(c => c[0] === cat); if (ci >= 0) { const k = ci.toString(36); list = list.filter(i => i.c.includes(k)); } }
  const segs = n => n.split('-').length + (n.includes('outline') ? 0.5 : 0);
  if (words.length) list = rank(list, words, i => i.n, i => i.hay);
  else if (cat) list = [...list].sort((a, b) => segs(a.n) - segs(b.n) || a.n.localeCompare(b.n));
  else {
    const top = POPULAR.map(n => d.byName.get(n)).filter(Boolean); const seen = new Set(top);
    const home = i => /[0-8]/.test(i.c) ? 0 : 1;
    list = [...top, ...list.filter(i => !seen.has(i)).sort((a, b) => home(a) - home(b) || segs(a.n) - segs(b.n) || a.n.localeCompare(b.n))];
  }
  return list.map(i => ({ s: 'mdi', n: i.n, p: i.p }));
}

// ---------- Fluent Emoji (gekleurd plat en 3D) ----------
let EMO = null;
const EMO_CATS = [['huis', 'Voor in huis'], ['0', 'Smileys'], ['1', 'Mensen'], ['2', 'Dieren en natuur'], ['3', 'Eten en drinken'], ['4', 'Reizen en plaatsen'], ['5', 'Activiteiten'], ['6', 'Voorwerpen'], ['7', 'Symbolen'], ['8', 'Vlaggen']];
const EMO_HOME = `light-bulb flashlight candle electric-plug battery low-battery door window bed couch-and-lamp chair toilet bathtub shower potted-plant house house-with-garden houses television radio speaker-high-volume speaker-low-volume muted-speaker loudspeaker bell bell-with-slash mobile-phone laptop desktop-computer printer keyboard video-game joystick movie-camera film-projector camera camera-with-flash video-camera satellite-antenna
  thermometer fire snowflake droplet sun-with-face sun cloud sun-behind-cloud cloud-with-rain cloud-with-lightning-and-rain tornado fog wind-face umbrella high-voltage
  alarm-clock stopwatch timer-clock mantelpiece-clock hourglass-done calendar spiral-calendar key old-key locked unlocked locked-with-key shield bellhop-bell police-car-light
  broom basket soap sponge toothbrush roll-of-paper plunger bucket fire-extinguisher test-tube magnet hammer wrench toolbox gear hammer-and-wrench screwdriver
  automobile oncoming-automobile electric-scooter bicycle motor-scooter fuel-pump sport-utility-vehicle recreational-vehicle
  hot-beverage teacup-without-handle beer-mug wine-glass fork-and-knife-with-plate cooking bread cake birthday-cake pizza
  dog guide-dog service-dog cat black-cat bird fish tropical-fish rabbit hamster turtle
  baby child boy girl man woman older-man older-woman family person-in-bed person-taking-bath sleeping-face
  musical-note musical-notes headphone saxophone guitar radio-button party-popper christmas-tree jack-o-lantern gift balloon wrapped-gift
  sunflower tulip seedling evergreen-tree deciduous-tree herb four-leaf-clover cactus
  check-mark-button cross-mark warning no-entry red-circle green-circle yellow-circle orange-circle blue-circle purple-circle`.split(/\s+/);
function emo() {
  if (!EMO) {
    const raw = load('emoji.json');
    EMO = raw.icons.map(([n, t, kw, g, f, d, glyph]) => ({ n, t, hay: (n + ' ' + kw).toLowerCase(), g: String(g), f, d, glyph }));
    EMO.byName = new Map(EMO.map(i => [i.n, i]));
  }
  return EMO;
}
function searchEmoji(set, q, cat) {
  const all = emo().filter(i => (set === 'flat' ? i.f : i.d)); const words = splitQ(q);
  let list = all;
  if (cat === 'huis') { const hs = new Set(EMO_HOME); list = EMO_HOME.map(n => emo().byName.get(n)).filter(i => i && (set === 'flat' ? i.f : i.d)); void hs; }
  else if (cat) list = all.filter(i => i.g === cat);
  if (words.length) list = rank(list, words, i => i.n, i => i.hay);
  else if (!cat) { const top = EMO_HOME.map(n => emo().byName.get(n)).filter(i => i && (set === 'flat' ? i.f : i.d)); const seen = new Set(top); list = [...top, ...list.filter(i => !seen.has(i))]; }
  return list.map(i => ({ s: set, n: i.n, t: i.t, u: `/iconsets/${set}/${i.n}.${set === 'flat' ? 'svg' : 'webp'}` }));
}

// ---------- merken (Simple Icons) ----------
let MERK = null;
const MERK_TOP = `spotify philipshue sonos ikea googlehome google apple samsung sony lg netflix youtube plex synology homeassistant tado shelly ring googlenest xiaomi tesla bosch zigbee
  amazonalexa amazon applemusic appletv chromecast disneyplus hbo primevideo videoland twitch soundcloud tidal deezer bose jbl bangolufsen denon yamaha marantz philips panasonic
  miele siemens aeg whirlpool dyson irobot roborock ecovacs nuki netatmo eufy arlo reolink hikvision ubiquiti tplink netgear asus fritz ziggo kpn tmobile vodafone
  windows microsoft android linux raspberrypi docker github whatsapp telegram signal instagram facebook buienradar knmi`.split(/\s+/);
const MERK_CATS = [['populair', 'Smart home en media']];
function merk() {
  if (!MERK) { MERK = load('merk.json').map(([n, t, c, p]) => ({ n, t, c: '#' + c, p, hay: (n + ' ' + t).toLowerCase() })); MERK.byName = new Map(MERK.map(i => [i.n, i])); }
  return MERK;
}
function searchMerk(q, cat) {
  const words = splitQ(q); const top = MERK_TOP.map(n => merk().byName.get(n)).filter(Boolean);
  let list = cat === 'populair' ? top : merk();
  if (words.length) list = rank(list, words, i => i.n, i => i.hay);
  else if (cat !== 'populair') { const seen = new Set(top); list = [...top, ...[...merk()].filter(i => !seen.has(i)).sort((a, b) => a.t.localeCompare(b.t))]; }
  return list.map(i => ({ s: 'merk', n: i.n, t: i.t, p: i.p, c: i.c }));
}

// ---------- Philips Hue (hass-hue-icons) ----------
let HUE = null;
const HUE_CATS = [['lampen', 'Lampen en armaturen'], ['kamers', 'Kamers en zones'], ['bediening', 'Schakelaars, sensoren, bridge'], ['aanuit', 'Met uit-versie']];
function hue() {
  if (!HUE) {
    HUE = load('hue.json').map(([n, p, kw]) => ({ n, p, hay: (n + ' ' + kw).toLowerCase() }));
    HUE.byName = new Map(HUE.map(i => [i.n, i]));
    for (const i of HUE) i.cat = /^room-|^zone|^home|^house/.test(i.n) ? 'kamers' : /switch|dimmer|motion|sensor|tap|button|bridge|remote|smart-plug|plug|hub|secure|contact/.test(i.n) ? 'bediening' : 'lampen';
  }
  return HUE;
}
function searchHue(q, cat) {
  const words = splitQ(q); let list = hue();
  if (cat === 'aanuit') list = list.filter(i => !i.n.endsWith('-off') && hue().byName.has(i.n + '-off'));
  else if (cat) list = list.filter(i => i.cat === cat);
  if (words.length) list = rank(list, words, i => i.n, i => i.hay);
  return list.map(i => ({ s: 'hue', n: i.n, p: i.p }));
}

// ---------- aan/uit-paren ----------
function offFor(set, n) {
  const has = set === 'hue' ? (x => hue().byName.has(x)) : (x => data().byName.has(x));
  const get = set === 'hue' ? (x => { const i = hue().byName.get(x); return { s: 'hue', n: i.n, p: i.p }; }) : (x => { const i = data().byName.get(x); return { s: 'mdi', n: i.n, p: i.p }; });
  const c = [];
  if (/-off(-outline)?$/.test(n)) return null;
  const o = n.replace(/-outline$/, ''), suf = n.endsWith('-outline') ? '-outline' : '';
  c.push(o + '-off' + suf, o + '-off', n.replace(/-on(-|$)/, '-off$1'), n.replace(/-on(-outline)?$/, '$1'),
    n.replace(/-open(-|$)/, '-closed$1'), n.replace(/-open(-|$)/, '$1'), n.replace(/lock-open/, 'lock'), n.replace(/-alert(-|$)/, '$1'));
  const hit = c.find(x => x && x !== n && has(x));
  return hit ? get(hit) : null;
}
function onFor(set, n) {
  const has = set === 'hue' ? (x => hue().byName.has(x)) : (x => data().byName.has(x));
  const get = set === 'hue' ? (x => { const i = hue().byName.get(x); return { s: 'hue', n: i.n, p: i.p }; }) : (x => { const i = data().byName.get(x); return { s: 'mdi', n: i.n, p: i.p }; });
  const c = [n.replace(/-off(-|$)/, '-on$1'), n.replace(/-off(-|$)/, '$1'), n.replace(/-closed(-|$)/, '-open$1')];
  const hit = c.find(x => x && x !== n && has(x));
  return hit ? get(hit) : null;
}
function pair(set, n) {
  if (set !== 'mdi' && set !== 'hue') return null;
  const off = offFor(set, n); if (off) return { role: 'on', other: off };
  const on = onFor(set, n); if (on) return { role: 'off', other: on };
  return null;
}
let PAIRS = null;
const PAIR_TOP = 'lightbulb lightbulb-on ceiling-light floor-lamp desk-lamp lamp led-strip-variant power power-plug power-socket-eu toggle-switch fan television speaker music volume-high water radiator fire air-conditioner thermostat door-open window-open garage-open lock-open gate-open blinds-open window-shutter-open curtains motion-sensor bell wifi bluetooth robot-vacuum washing-machine'.split(' ');
function pairs() {
  if (!PAIRS) {
    const out = []; const seen = new Set();
    const add = (set, n) => { const off = offFor(set, n); if (!off) return; const k = set + n + off.n; if (seen.has(k)) return; seen.add(k);
      const src = set === 'hue' ? hue().byName.get(n) : data().byName.get(n); out.push({ s: 'paar', n: n + '|' + off.n, set, hay: src.hay + ' ' + off.n, on: { s: set, n, p: src.p }, off }); };
    for (const n of PAIR_TOP) if (data().byName.has(n)) add('mdi', n);
    for (const i of hue()) if (!i.n.endsWith('-off')) add('hue', i.n);
    for (const i of data().icons) if (!/-off/.test(i.n)) add('mdi', i.n);
    PAIRS = out;
  }
  return PAIRS;
}
const PAIR_CATS = [['mdi', 'Eenkleurig'], ['hue', 'Hue']];
function searchPairs(q, cat) {
  const words = splitQ(q); let list = pairs();
  if (cat) list = list.filter(i => i.set === cat);
  if (words.length) list = rank(list, words, i => i.on.n, i => i.hay);
  return list.map(({ s, n, on, off }) => ({ s, n, on, off }));
}

// ---------- algemeen ----------
const SETS = [['mdi', 'Eenkleurig'], ['flat', 'Gekleurd plat'], ['3d', 'Gekleurd 3D'], ['merk', 'Merken'], ['hue', 'Hue'], ['paar', 'Aan/uit-paren']];
function list(set, q, cat) {
  if (set === 'flat' || set === '3d') return searchEmoji(set, q, cat);
  if (set === 'merk') return searchMerk(q, cat);
  if (set === 'hue') return searchHue(q, cat);
  if (set === 'paar') return searchPairs(q, cat);
  return searchMdi(q, cat);
}
function categories(set) {
  if (set === 'flat' || set === '3d') return EMO_CATS;
  if (set === 'merk') return MERK_CATS;
  if (set === 'hue') return HUE_CATS;
  if (set === 'paar') return PAIR_CATS;
  return data().cats;
}
function search(q, cat, offset = 0, limit = 200, set = 'mdi') {
  if (cat === 'alle') cat = '';
  const all = list(set, q, cat);
  const counts = splitQ(q).length ? Object.fromEntries(SETS.map(([k]) => [k, k === set ? all.length : list(k, q, '').length])) : null;
  return { total: all.length, items: all.slice(offset, offset + limit), cats: categories(set), sets: SETS, counts };
}
function get(name, set = 'mdi') {
  if (set === 'hue') { const i = hue().byName.get(name); return i ? { s: 'hue', n: i.n, p: i.p } : null; }
  if (set === 'merk') { const i = merk().byName.get(name); return i ? { s: 'merk', n: i.n, t: i.t, p: i.p, c: i.c } : null; }
  if (set === 'flat' || set === '3d') { const i = emo().byName.get(name); return i ? { s: set, n: i.n, t: i.t, u: `/iconsets/${set}/${i.n}.${set === 'flat' ? 'svg' : 'webp'}` } : null; }
  const i = data().byName.get(name); return i ? { s: 'mdi', n: i.n, p: i.p } : null;
}

module.exports = { search, get, categories, pair };
