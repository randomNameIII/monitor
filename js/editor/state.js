// Editor state: the working config, selection, undo history and publishing.

import { defaultConfig, normalize } from '../core/config.js';
import { saveLocal, loadLocal, publishGist, store } from '../core/sync.js';

export const prefs = {
  get token() { return store.get('dusk.editor.token') || ''; },
  set token(v) { v ? store.set('dusk.editor.token', v) : store.del('dusk.editor.token'); },
  get gist() { return store.get('dusk.editor.gist') || ''; },
  set gist(v) { v ? store.set('dusk.editor.gist', v) : store.del('dusk.editor.gist'); },
  get autopublish() { return store.get('dusk.editor.autopublish') !== 'off'; },
  set autopublish(v) { store.set('dusk.editor.autopublish', v ? 'on' : 'off'); },
  get publishedAt() { return store.get('dusk.editor.publishedAt') || ''; },
  set publishedAt(v) { store.set('dusk.editor.publishedAt', v); },
};

export const state = {
  cfg: loadLocal() || defaultConfig(),
  selected: null,
  publishing: false,
  publishError: '',
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(reason) { for (const fn of listeners) fn(reason); }

/* ---- undo / redo ---- */
const past = [];
const future = [];
let lastSnap = JSON.stringify(state.cfg);
let lastSnapAt = 0;
let lastReason = '';

// Start a fresh undo step on the next commit (e.g. at the start of a drag).
export function breakUndoGroup() { lastSnapAt = 0; }

function snapshot(reason) {
  const now = Date.now();
  // Typing in a field or dragging produces many commits; group a burst of the same kind into one undo step.
  if (reason !== lastReason || now - lastSnapAt > 1000) {
    past.push(lastSnap);
    if (past.length > 80) past.shift();
    future.length = 0;
  }
  lastSnapAt = now;
  lastReason = reason;
}

// Call after mutating state.cfg.
export function commit(reason = 'edit') {
  snapshot(reason);
  state.cfg.updatedAt = new Date().toISOString();
  lastSnap = JSON.stringify(state.cfg);
  saveLocal(state.cfg);
  emit(reason);
  schedulePublish();
}

export function replaceConfig(cfg, reason = 'replace') {
  past.push(lastSnap);
  future.length = 0;
  state.cfg = normalize(cfg);
  state.cfg.updatedAt = new Date().toISOString();
  lastSnap = JSON.stringify(state.cfg);
  if (!state.cfg.panels.some((p) => p.id === state.selected)) state.selected = null;
  saveLocal(state.cfg);
  emit(reason);
  schedulePublish();
}

function restore(text) {
  state.cfg = normalize(JSON.parse(text));
  state.cfg.updatedAt = new Date().toISOString();
  lastSnap = JSON.stringify(state.cfg);
  lastSnapAt = 0;
  if (!state.cfg.panels.some((p) => p.id === state.selected)) state.selected = null;
  saveLocal(state.cfg);
  emit('history');
  schedulePublish();
}
export function undo() { if (!past.length) return; future.push(lastSnap); restore(past.pop()); }
export function redo() { if (!future.length) return; past.push(lastSnap); restore(future.pop()); }
export function canUndo() { return past.length > 0; }
export function canRedo() { return future.length > 0; }

export function select(id) {
  state.selected = id;
  emit('select');
}

/* ---- publishing to the gist ---- */
let pubTimer = null;
export function isDirty() { return prefs.publishedAt !== state.cfg.updatedAt; }

function schedulePublish() {
  clearTimeout(pubTimer);
  if (prefs.autopublish && prefs.token && prefs.gist) pubTimer = setTimeout(() => publish().catch(() => {}), 4000);
}

export async function publish() {
  clearTimeout(pubTimer);
  if (!prefs.token || !prefs.gist) throw new Error('Set up GitHub sync in the Sync tab first.');
  state.publishing = true; state.publishError = ''; emit('publish');
  const stamp = state.cfg.updatedAt;
  try {
    await publishGist(prefs.token, prefs.gist, state.cfg);
    prefs.publishedAt = stamp;
  } catch (e) {
    state.publishError = e.message;
    throw e;
  } finally {
    state.publishing = false;
    emit('publish');
  }
}
