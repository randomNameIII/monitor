// Editor entry point: tabs, the publish button and global shortcuts.

import '../panels/index.js';
import { state, prefs, publish, undo, redo, canUndo, canRedo, isDirty, onChange } from './state.js';
import { initLayout } from './layout.js';
import { initPlan } from './plan/plan.js';
import { initBoardTab } from './boardtab.js';
import { initSyncTab } from './synctab.js';
import { toast, relativeTime } from './ui.js';
import { saveLocal } from '../core/sync.js';

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
    el.textContent = `Published ${relativeTime(prefs.publishedAt)}`;
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

/* ---------- start ---------- */
saveLocal(state.cfg); // make sure a local display has something to show straight away
initLayout();
initPlan();
initBoardTab();
initSyncTab();
onChange(renderPubState);
renderPubState();
showTab(location.hash.slice(1) || 'layout');
