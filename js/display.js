// The wall display. Kept deliberately small: no editor code is loaded here.
//
// URL options:
//   display.html?gist=<id>   read the board from a GitHub Gist (remembered after the first visit)
//   display.html?local       read from an editor open in this same browser
//   display.html?reset       forget the remembered gist and cached board
//   display.html?cursor      keep the mouse cursor visible

import './panels/index.js';
import { createBoard } from './core/board.js';
import { createBackground } from './core/background.js';
import { subscribe, store } from './core/sync.js';
import { defaultConfig } from './core/config.js';
import { inWindow } from './core/util.js';

const params = new URLSearchParams(location.search);
if (params.has('reset')) {
  store.del('dusk.display.gist');
  store.del('dusk.display.cache');
}
if (params.get('gist')) store.set('dusk.display.gist', params.get('gist').trim());
const gistId = params.has('local') ? null : store.get('dusk.display.gist');

const stage = document.getElementById('stage');
const dimEl = document.getElementById('dim');
const statusEl = document.getElementById('status');
const banner = document.getElementById('banner');

const board = createBoard(stage);
const bg = createBackground(document.getElementById('bg'));
let cfg = null;
let shift = { x: 0, y: 0 };
let lastOk = 0;

/* ---------- fit the fixed-size stage to whatever screen this is ---------- */
function fit() {
  if (!cfg) return;
  const { width, height } = cfg.board;
  const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
  const x = (window.innerWidth - width * scale) / 2 + shift.x;
  const y = (window.innerHeight - height * scale) / 2 + shift.y;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}
window.addEventListener('resize', fit);

/* ---------- apply a new config ---------- */
function apply(next, from) {
  cfg = next;
  board.render(cfg);
  bg.configure(cfg.board.background);
  statusEl.hidden = !cfg.board.showStatus;
  fit();
  checkDim();
  if (from !== 'sample') banner.hidden = true;
}

/* ---------- night dimming ---------- */
function checkDim() {
  const d = cfg?.board.dim;
  const on = !!(d && d.enabled && inWindow(d.from, d.to));
  dimEl.style.opacity = on ? String(Math.min(0.9, Math.max(0, d.level))) : '0';
  bg.setDim(on);
}
setInterval(checkDim, 60 * 1000);

/* ---------- burn-in protection: nudge everything a few pixels every 4 minutes ---------- */
setInterval(() => {
  if (!cfg?.board.burnInShift) { shift = { x: 0, y: 0 }; return fit(); }
  shift = { x: Math.round(Math.random() * 8 - 4), y: Math.round(Math.random() * 8 - 4) };
  fit();
}, 4 * 60 * 1000);

/* ---------- sync status ---------- */
function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.querySelector('span').textContent = text || '';
  statusEl.title = text || '';
}
setInterval(() => {
  if (!gistId || !cfg || !lastOk) return;
  const staleAfter = (cfg.board.pollSeconds || 90) * 4 * 1000;
  if (Date.now() - lastOk > staleAfter) setStatus('stale', 'Not updated recently');
}, 30 * 1000);

subscribe({
  gistId,
  onConfig: (c, from) => apply(c, from),
  onStatus: ({ state, detail }) => {
    if (state === 'ok') lastOk = Date.now();
    setStatus(state, detail);
    if (state === 'error' && !banner.hidden && gistId) banner.textContent = `Couldn’t load the board: ${detail}`;
  },
});

// First run with nothing to show: render the sample board and explain how to connect.
if (!cfg) {
  apply(defaultConfig(), 'sample');
  banner.innerHTML = gistId
    ? 'Loading your board from GitHub…'
    : 'This is the sample board. Open <a href="editor.html">the editor</a> on your main computer to set it up, then use the display link it gives you.';
  banner.hidden = false;
}

/* ---------- kiosk niceties ---------- */
// Hide the cursor after a few seconds of no movement.
let cursorTimer;
const showCursor = () => {
  document.body.classList.remove('hide-cursor');
  clearTimeout(cursorTimer);
  if (!params.has('cursor')) cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 3000);
};
window.addEventListener('mousemove', showCursor);
showCursor();

window.addEventListener('keydown', (e) => {
  if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
  if (e.key === 'r') location.reload();
});

// Reload when a new version of the site is deployed (version.json changes), and once a night
// at about 4am so a display that runs for weeks starts fresh.
let version = null;
async function checkVersion() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const v = (await res.json()).build;
    if (version && v && v !== version) location.reload();
    version = version || v;
  } catch { /* offline; try later */ }
}
checkVersion();
setInterval(checkVersion, 20 * 60 * 1000);

const loadedOn = new Date().toDateString();
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 4 && now.toDateString() !== loadedOn) location.reload();
}, 10 * 60 * 1000);
