// Editor entry point: tabs, the publish button and global shortcuts.

import '../panels/index.js';
import { state, prefs, publish, undo, redo, canUndo, canRedo, isDirty, onChange, checkRemote, adoptRemote, mergeRemote } from './state.js';
import { initLayout } from './layout.js';
import { initPlan } from './plan/plan.js';
import { initBoardTab } from './boardtab.js';
import { initSyncTab } from './synctab.js';
import { toast, relativeTime } from './ui.js';
import { saveLocal, fetchGist, store } from '../core/sync.js';
import { readConnectLink } from './synctab.js';
import { watchForUpdates, refreshAndReload } from '../core/update.js';

const $ = (id) => document.getElementById(id);

/* ---------- tabs ---------- */
const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
function showTab(name) {
  if (name === 'events') name = 'plan'; // old links
  if (!tabs.some((t) => t.dataset.tab === name)) name = 'layout';
  for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
  for (const p of document.querySelectorAll('.tab-panel')) p.hidden = p.dataset.panel !== name;
  if (location.hash.slice(1) !== name) history.replaceState(null, '', `#${name}`);
}
tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

/* ---------- publish state in the header ---------- */
function renderPubState() {
  const el = $('pubState');
  const btn = $('publishBtn');
  const connected = prefs.token && prefs.gist;
  el.classList.remove('warn', 'error');
  if (!connected) {
    el.textContent = 'Saved in this browser';
    btn.textContent = 'Set up sync';
  } else if (state.publishing) {
    el.textContent = 'Publishing…';
    btn.textContent = 'Publish';
  } else if (state.publishError) {
    el.textContent = 'Publish failed';
    el.title = state.publishError;
    el.classList.add('error');
    btn.textContent = 'Try again';
  } else if (isDirty()) {
    el.textContent = prefs.autopublish ? 'Publishing shortly…' : 'Unpublished changes';
    el.classList.add('warn');
    btn.textContent = 'Publish';
  } else {
    el.textContent = lastCheck ? `In sync · checked ${relativeTime(new Date(lastCheck).toISOString())}` : `Published ${relativeTime(prefs.publishedAt)}`;
    el.title = 'Changes from your other computers are picked up every 30 seconds, and merged with yours.';
    btn.textContent = 'Publish';
  }
  btn.disabled = state.publishing;
  $('undoBtn').disabled = !canUndo();
  $('redoBtn').disabled = !canRedo();
}
setInterval(renderPubState, 30000);

$('publishBtn').addEventListener('click', async () => {
  if (!prefs.token || !prefs.gist) { showTab('sync'); return; }
  try { await publish(); toast('Published. The display will pick it up on its next check.'); }
  catch (e) { toast(e.message, true); }
});

$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const inField = e.target.closest('input, textarea, [contenteditable]');
  if (e.key.toLowerCase() === 'z' && !inField) {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  } else if (e.key.toLowerCase() === 'y' && !inField) {
    e.preventDefault(); redo();
  } else if (e.key.toLowerCase() === 's') {
    e.preventDefault(); $('publishBtn').click();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (prefs.token && prefs.gist && isDirty()) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- changes from other computers ---------- */
// Every 30 seconds (and whenever this tab comes back into view), look at the gist. If another computer
// published, take its changes: straight away if nothing here is unpublished, merged item by item if
// there is. Waits while you're typing or dragging so nothing shifts under you.
let lastCheck = 0;
let checking = false;
let retry = null;
let connecting = false;
let lastTyped = 0;
document.addEventListener('input', () => { lastTyped = Date.now(); }, true);
document.addEventListener('keydown', (e) => { if (e.target.closest?.('input, textarea, [contenteditable]')) lastTyped = Date.now(); }, true);
function busy() {
  return !!(Date.now() - lastTyped < 5000 || document.querySelector('.pop, .qa-backdrop, .ctx-root, .drag-ghost, .keys-backdrop')
    || document.body.matches('.is-dragging, .is-selecting, .is-stretching, .is-panning'));
}
async function pullRemote({ quiet = false } = {}) {
  if (!prefs.token || !prefs.gist || checking || connecting || document.hidden) return;
  if (busy()) {
    if (!retry) retry = setTimeout(() => { retry = null; pullRemote({ quiet }); }, 8000);
    return;
  }
  checking = true;
  try {
    const r = await checkRemote();
    lastCheck = Date.now();
    if (r !== 'none' && !quiet) toast(r === 'merged' ? 'Merged in changes from your other computer' : 'Updated with changes from your other computer');
    renderPubState();
  } catch { /* offline or rate limited: try again next time */ }
  finally { checking = false; }
}
setInterval(() => pullRemote(), 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullRemote(); });
window.addEventListener('focus', () => pullRemote());

/* ---------- new versions ---------- */
// An editor tab can stay open for days; when a new version is deployed, offer to reload.
// Everything is saved in this browser as you go, so reloading never loses work.
watchForUpdates(() => {
  const bar = $('updateBar');
  bar.hidden = false;
  $('updateReload').onclick = async () => {
    $('updateReload').disabled = true;
    $('updateReload').textContent = 'Reloading…';
    if (prefs.token && prefs.gist && isDirty()) { try { await publish(); } catch { /* published again after reload */ } }
    refreshAndReload();
  };
  $('updateLater').onclick = () => { bar.hidden = true; };
}, { minutes: 5 });

/* ---------- start ---------- */
// Opened from a "connect another computer" link: save the sync details here and load the board.
const connect = readConnectLink();
const hadBoardHere = !!store.get('dusk.config');
if (connect) {
  prefs.token = connect.token;
  prefs.gist = connect.gist;
  prefs.autopublish = true;
  history.replaceState(null, '', `${location.pathname}${location.search}#plan`);
  connecting = true;
  fetchGist(connect.gist, connect.token).then((cfg) => {
    if (hadBoardHere && isDirty() && !confirm('Replace the board in this browser with the one from your other computer? (Choose Cancel to merge the two instead.)')) {
      mergeRemote(cfg);
      publish().catch(() => {});
    } else adoptRemote(cfg);
    toast('Connected. This computer now edits the same board.');
  }).catch((e) => toast(`Couldn’t load the board: ${e.message}`, true)).finally(() => { connecting = false; });
}
saveLocal(state.cfg); // make sure a local display has something to show straight away
initLayout();
initPlan();
initBoardTab();
initSyncTab();
onChange(renderPubState);
renderPubState();
showTab(location.hash.slice(1) || 'layout');
// Changes made just before the page was closed or reloaded may not have been published yet;
// otherwise, pick up anything another computer published while this one was closed.
if (!connect) {
  if (prefs.token && prefs.gist && prefs.autopublish && isDirty()) publish().catch(() => {});
  else pullRemote({ quiet: true });
}
