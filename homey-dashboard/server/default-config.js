'use strict';
const NAS = process.env.SPOTIFY_BASE || 'http://192.168.178.79:8090';

function uid(p) { return p + Math.random().toString(36).slice(2, 9); }

function defaultConfig() {
  const grid = () => ({ cols: 12, rows: 8, gap: 12, padding: 16 });
  const home = {
    id: uid('t'), name: 'Thuis', icon: '🏠', hidden: false, grid: grid(), background: null,
    tiles: [
      { id: uid('w'), type: 'clock', x: 0, y: 0, w: 4, h: 3, opts: { date: true, seconds: false }, style: {} },
      { id: uid('w'), type: 'text', x: 4, y: 0, w: 8, h: 3, opts: { text: 'Tik 4× snel op een lege plek of op de balk onderaan om de achterkant te openen.', align: 'left', size: 1.2 }, style: {} },
    ],
  };
  const kamers = { id: uid('t'), name: 'Kamers', icon: '🛋️', hidden: false, grid: grid(), background: null, tiles: [] };
  const sp = (x, file, title) => ({ id: uid('w'), type: 'web', x, y: 0, w: 3, h: 8, opts: { url: `${NAS}/${file}`, title, interactive: true }, style: { frameless: true, hideTitle: true } });
  const spotify = {
    id: uid('t'), name: 'Spotify', icon: '🎵', hidden: false, grid: { cols: 12, rows: 8, gap: 8, padding: 8 }, background: null,
    tiles: [sp(0, 'index.html', 'Nu speelt'), sp(3, 'playlist.html', 'Afspeellijst'), sp(6, 'acc3.html', 'Platenkast'), sp(9, 'acc4.html', 'Aura')],
  };
  return {
    version: 1,
    settings: {
      theme: { preset: 'glas', accent: '#5aa9ff', text: '#ffffff', font: 'Inter', fontScale: 1, tileBg: '#141a24', tileOpacity: 0.5, tileBlur: 16, radius: 20, shadow: 0.35, border: 0.1, onColor: '#ffc34d' },
      background: { type: 'gradient', color: '#0e1117', gradient: ['#1d2b3f', '#07080c'], angle: 160, image: null, blur: 0, dim: 0.2, panorama: false },
      display: { brightness: 210 },
      night: { enabled: false, mode: 'time', from: '22:30', to: '07:00', brightness: 15, dim: 0.35, lat: 52.27, lon: 6.89 },
      screensaver: { enabled: false, after: 10, type: 'clock', interval: 20 },
      returnHome: { enabled: true, after: 3 },
      startTab: home.id,
      tabbar: { height: 46, showIcons: true, showNames: true, opacity: 0.55 },
      unlock: { taps: 4, window: 1500 },
    },
    themes: [],
    tabs: [home, kamers, spotify],
  };
}

module.exports = { defaultConfig, uid };
