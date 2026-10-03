'use strict';
// Volledige back-up: alles wat nodig is om het dashboard op een (nieuwe) NAS weer op te zetten,
// als één zip. Zonder extra onderdelen: een eenvoudige zip-schrijver met zlib.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'data', 'dist', 'reserve']);
const STORE = /\.(png|jpe?g|webp|gif|zip|gz|ico|woff2?)$/i;
const SECRET = /^(\s*-?\s*)(HOMEY_TOKEN|ANTHROPIC_API_KEY)(\s*[=:]\s*)(.*)$/;

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = buf => { if (zlib.crc32) return zlib.crc32(buf) >>> 0; let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(entries) {
  const parts = []; const central = []; let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const store = STORE.test(name) || data.length < 64;
    const body = store ? data : zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(store ? 0 : 8, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.endsWith('.tmp')) continue;
    const full = path.join(dir, e.name); const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(full, rel, out);
    else if (e.isFile()) out.push({ name: rel, data: fs.readFileSync(full) });
  }
}

const redact = text => text.split('\n').map(l => { const m = SECRET.exec(l); return m ? `${m[1]}${m[2]}${m[3]}plak-hier-je-sleutel` : l; }).join('\n');

function composeFromEnv(keys) {
  const e = process.env; const k = v => (keys ? v || 'plak-hier-je-sleutel' : 'plak-hier-je-sleutel');
  return `# Homey Dashboard – project voor Synology Container Manager (gemaakt vanuit de back-up)
services:
  homey-dashboard:
    image: node:22-alpine
    container_name: homey-dashboard
    working_dir: /app
    command: sh -c "npm install --omit=dev --no-audit --no-fund && node server/server.js"
    ports:
      - "${e.PORT || 8095}:${e.PORT || 8095}"
    volumes:
      - ./:/app
    environment:
      - TZ=${e.TZ || 'Europe/Amsterdam'}
      - PORT=${e.PORT || 8095}
      - HOMEY_ADDRESS=${e.HOMEY_ADDRESS || 'http://192.168.178.XX'}
      - HOMEY_TOKEN=${k(e.HOMEY_TOKEN)}
      - ANTHROPIC_API_KEY=${k(e.ANTHROPIC_API_KEY)}
      - SPOTIFY_BASE=${e.SPOTIFY_BASE || 'http://192.168.178.79:8090'}
    restart: unless-stopped
`;
}

function projectInfo(keys) {
  const e = process.env; const port = e.PORT || 8095;
  return `HOMEY DASHBOARD – GEGEVENS OM OPNIEUW OP TE ZETTEN
Back-up gemaakt op: ${new Date().toLocaleString('nl-NL', { timeZone: e.TZ || 'Europe/Amsterdam' })}
Sleutels in docker-compose.yml: ${keys ? 'JA – bewaar deze zip veilig!' : 'nee – vul HOMEY_TOKEN en ANTHROPIC_API_KEY zelf in'}

Container Manager – project
  Projectnaam ........ homey-dashboard
  Map op de NAS ...... docker/Homey Dashboard   (bij jou was dat /volume1/docker/Homey Dashboard)
  Bestand ............ docker-compose.yml (staat in deze zip)
  Container .......... homey-dashboard (image node:22-alpine)
  Poort .............. ${port}  →  open daarna http://<IP-van-de-NAS>:${port}

Instellingen (environment in docker-compose.yml)
  HOMEY_ADDRESS ...... ${e.HOMEY_ADDRESS || '(niet ingesteld)'}
  HOMEY_TOKEN ........ ${e.HOMEY_TOKEN ? (keys ? 'staat in docker-compose.yml' : 'NIET meegenomen') : '(niet ingesteld)'}
  ANTHROPIC_API_KEY .. ${e.ANTHROPIC_API_KEY ? (keys ? 'staat in docker-compose.yml' : 'NIET meegenomen') : '(niet ingesteld)'}
  SPOTIFY_BASE ....... ${e.SPOTIFY_BASE || '(niet ingesteld)'}
  TZ ................. ${e.TZ || 'Europe/Amsterdam'}

OPNIEUW OPZETTEN (kort – de hele uitleg staat in de handleiding, hoofdstuk Voorbereiding)
  1. Installeer Container Manager op de NAS (Pakketcentrum).
  2. Maak in File Station de map docker/Homey Dashboard.
  3. Pak deze zip uit IN die map (docker-compose.yml moet direct in de map staan).
  4. Nieuw IP-adres van de NAS of Homey? Pas HOMEY_ADDRESS en SPOTIFY_BASE aan in docker-compose.yml.
  5. Container Manager → Project → Maken → naam homey-dashboard, pad = de map uit stap 2,
     "Bestaande docker-compose.yml gebruiken" → Klaar. De eerste start duurt een paar minuten.
  6. Open http://<IP-van-de-NAS>:${port}. Je indeling, achtergronden en pincode zijn er weer.
  7. Tablet (Fully Kiosk) en Windows-programma: nieuw adres invullen als het IP veranderd is.
`;
}

function fullEntries({ dataDir, keys }) {
  const entries = [];
  walk(ROOT, '', entries);
  // data (indeling, achtergronden, back-ups, pincode, flow-geschiedenis)
  if (fs.existsSync(dataDir)) { const d = []; walk2(dataDir, 'data', d); entries.push(...d); }
  // docker-compose.yml: het echte bestand als het er is, anders opbouwen uit de instellingen
  // camera-wachtwoorden alleen mee als er "met sleutels" gekozen is
  const cam = entries.find(x => x.name === 'data/cameras.json');
  if (cam && !keys) { try { const j = JSON.parse(cam.data.toString('utf8')); if (j.ss) j.ss.pass = ''; for (const c of j.cams || []) c.pass = ''; cam.data = Buffer.from(JSON.stringify(j, null, 1)); } catch (e) { /* */ } }
  const ci = entries.findIndex(x => x.name === 'docker-compose.yml');
  if (ci >= 0) { if (!keys) entries[ci].data = Buffer.from(redact(entries[ci].data.toString('utf8'))); }
  else entries.push({ name: 'docker-compose.yml', data: Buffer.from(composeFromEnv(keys)) });
  if (!keys) {
    // sleutels en wachtwoorden van NAS, TomTom en tablet (Fully) leeg; sessies niet meenemen
    const sec = entries.find(x => x.name === 'data/extra-geheim.json'); if (sec) sec.data = Buffer.from('{}');
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].name === 'data/sessies.json') entries.splice(i, 1);
  }
  entries.push({ name: 'PROJECT-GEGEVENS.txt', data: Buffer.from(projectInfo(keys)) });
  return entries;
}
function fullBackup({ dataDir, keys }) { return zip(fullEntries({ dataDir, keys })); }
// data-map: alles meenemen (ook submappen), behalve tijdelijke bestanden
function walk2(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.endsWith('.tmp') || e.name.startsWith('voor-update-') || ['update-terug', 'update-proef', 'gtfs'].includes(e.name)) continue; // gtfs = reservebron NS, wordt vanzelf opnieuw opgehaald
    const full = path.join(dir, e.name); const rel = base + '/' + e.name;
    if (e.isDirectory()) walk2(full, rel, out); else if (e.isFile()) out.push({ name: rel, data: fs.readFileSync(full) });
  }
}

module.exports = { fullBackup, fullEntries, zip, redact };
