'use strict';
// P2000-meldingen uit Twente voor de tegel "P2000 Twente".
// Bron: alarmeringen.nl (rss, CC BY-NC-ND: niet-commercieel, met bronvermelding in de tegel).
// De landelijke feed bevat maar ongeveer het laatste half uur; daarom haalt de NAS hem elke 2 minuten op
// en bewaart de Twentse meldingen zelf (24 uur, data/p2000.json). Alleen actief zolang een scherm de tegel
// toont: een uur na de laatste vraag stopt het ophalen weer.
const fs = require('fs');
const path = require('path');

const FEEDS = process.env.P2000_FEEDS ? process.env.P2000_FEEDS.split(',') : [
  'https://alarmeringen.nl/feeds/all.rss',
  'https://alarmeringen.nl/feeds/region/twente.rss', // stond in sept./okt. 2026 stil; meenemen voor als hij weer werkt
];
const REGION = '/overijssel/twente/';
const EVERY = 2 * 60e3;
const KEEP = 24 * 3600e3;
const IDLE = 60 * 60e3;
const MAX = 600;

const dec = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();
const tag = (xml, name) => { const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml); return m ? dec(m[1]) : ''; };
const nice = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// Welke dienst en welke urgentie? Eerst de omschrijving van alarmeringen.nl, dan de P2000-tekst zelf.
function kindOf(title, desc) {
  const d = desc.toLowerCase(), t = title.toLowerCase();
  if (/^(ambulance|reanimatie)\b|traumaheli|lifeliner|mmt\b/.test(d) || /^(a0|a1|a2|b1|b2)\b|\bambu\b|lifeliner|mmt/.test(t)) return 'ambulance';
  if (/^politie\b/.test(d)) return 'politie';
  if (/^brandweer\b|brand|gaslucht|gasl|stank|liftopsluiting|wateroverlast|nacontrole|dier te water|assistentie ambulance/.test(d) || /^p ?[1-3]\b|\bbrw\b|^p\d? ?b[a-z]{2}-\d/.test(t)) return 'brandweer';
  if (/^prio ?\d/.test(t)) return 'politie';
  return 'overig';
}
function prioOf(title) {
  const t = title.toLowerCase();
  if (/^(a0|a1|p ?1|prio ?1)\b/.test(t)) return 1;
  if (/^(a2|p ?2|prio ?2)\b/.test(t)) return 2;
  if (/^(b\d|p ?3|prio ?3)\b/.test(t)) return 3;
  return 0;
}

function parseRss(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const it = m[1];
    const title = tag(it, 'title'), desc = tag(it, 'description'), link = tag(it, 'link');
    const t = Date.parse(tag(it, 'pubDate'));
    if (!title || !Number.isFinite(t)) continue;
    const id = tag(it, 'guid') || `${t}|${title}`;
    const slug = (/\/overijssel\/twente\/([^/?#]+)/.exec(link) || [])[1] || '';
    const place = (/ in ([A-Z][^,.]*?)\s*$/.exec(desc) || [])[1] || (slug && !/^\d+$/.test(slug) ? nice(slug) : '');
    out.push({ id, t, title, desc, link: link.replace(/\?.*$/, ''), twente: link.includes(REGION), place, kind: kindOf(title, desc), prio: prioOf(title) });
  }
  return out;
}

class P2000 {
  constructor({ dataDir, fetchText }) {
    this.file = path.join(dataDir, 'p2000.json');
    this.fetchText = fetchText;
    this.items = []; try { this.items = JSON.parse(fs.readFileSync(this.file, 'utf8')).items || []; } catch (e) { this.items = []; }
    this.lastAsk = 0; this.timer = null; this.ok = null; this.err = null; this.busy = null;
  }
  save() { try { const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify({ items: this.items })); fs.renameSync(tmp, this.file); } catch (e) { /* volgende keer */ } }

  async poll() {
    if (this.busy) return this.busy;
    this.busy = (async () => {
      const got = []; const errs = [];
      for (const u of FEEDS) {
        try { got.push(...parseRss(await this.fetchText(u))); } catch (e) { errs.push(e.message || String(e)); }
      }
      if (errs.length === FEEDS.length) { this.err = 'alarmeringen.nl is niet bereikbaar'; return; }
      this.err = null; this.ok = Date.now();
      const seen = new Set(this.items.map(x => x.id)); const sig = new Set(this.items.map(x => x.t + '|' + x.title));
      let added = 0;
      for (const x of got) {
        if (!x.twente || seen.has(x.id) || sig.has(x.t + '|' + x.title)) continue;
        const { twente, ...keep } = x; void twente;
        this.items.push(keep); seen.add(x.id); sig.add(x.t + '|' + x.title); added++;
      }
      const from = Date.now() - KEEP;
      const before = this.items.length;
      this.items = this.items.filter(x => x.t >= from).sort((a, b) => b.t - a.t).slice(0, MAX);
      if (added || this.items.length !== before) this.save();
    })().finally(() => { this.busy = null; });
    return this.busy;
  }

  // vraag van een tegel: ophalen starten (en houden zolang er gevraagd wordt)
  async list() {
    this.lastAsk = Date.now();
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (Date.now() - this.lastAsk > IDLE) { clearInterval(this.timer); this.timer = null; return; }
        this.poll().catch(() => {});
      }, EVERY);
      await this.poll().catch(() => {});
    }
    const from = Date.now() - KEEP;
    return { at: Date.now(), ok: this.ok, error: this.err, items: this.items.filter(x => x.t >= from), source: 'alarmeringen.nl' };
  }
}

module.exports = { P2000, parseRss, kindOf, prioOf };
