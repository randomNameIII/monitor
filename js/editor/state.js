// Editor state: the working config, selection, undo history and publishing.

import { defaultConfig, normalize } from '../core/config.js';
import { saveLocal, loadLocal, publishGist, fetchGist, store } from '../core/sync.js';
import { mergeBoards } from '../core/merge.js';

export const prefs = {
  get token() { return store.get('dusk.editor.token') || ''; },
  set token(v) { v ? store.set('dusk.editor.token', v) : store.del('dusk.editor.token'); },
  get gist() { return store.get('dusk.editor.gist') || ''; },
  set gist(v) { v ? store.set('dusk.editor.gist', v) : store.del('dusk.editor.gist'); },
  get autopublish() { return store.get('dusk.editor.autopublish') !== 'off'; },
  set autopublish(v) { store.set('dusk.editor.autopublish', v ? 'on' : 'off'); },
  get publishedAt() { return store.get('dusk.editor.publishedAt') || ''; },
  set publishedAt(v) { store.set('dusk.editor.publishedAt', v); },
  // The last version this browser and the gist had in common, for merging changes from other computers.
  get base() { try { return JSON.parse(store.get('dusk.editor.base')) || null; } catch { return null; } },
  set base(v) { v ? store.set('dusk.editor.base', JSON.stringify(v)) : store.del('dusk.editor.base'); },
};

export const state = {
  cfg: loadLocal() || normalize(defaultConfig()),
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
let lastGroup = null;

// Start a fresh undo step on the next commit (e.g. at the start of a drag).
export function breakUndoGroup() { lastSnapAt = 0; lastGroup = null; }

// Continuous edits (typing in a field, dragging a panel) arrive as many commits; they merge into one
// undo step when they share a group key and come within 1.5s of each other. Discrete actions never merge.
const CONTINUOUS = new Set(['move', 'settings', 'board', 'style']);

function snapshot(group) {
  const now = Date.now();
  if (!group || group !== lastGroup || now - lastSnapAt > 1500) {
    past.push(lastSnap);
    if (past.length > 100) past.shift();
    future.length = 0;
  }
  lastSnapAt = now;
  lastGroup = group;
}

// Call after mutating state.cfg. opts.group: merge with the previous commit of the same group.
export function commit(reason = 'edit', opts = {}) {
  snapshot(opts.group ?? (CONTINUOUS.has(reason) ? reason : null));
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
  lastGroup = null;
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

/* ---- publishing to the gist, and changes from other computers ---- */
let pubTimer = null;
export function isDirty() { return prefs.publishedAt !== state.cfg.updatedAt; }

function schedulePublish() {
  clearTimeout(pubTimer);
  if (prefs.autopublish && prefs.token && prefs.gist) pubTimer = setTimeout(() => publish().catch(() => {}), 4000);
}

// Take the gist's board as it is (nothing unpublished here to keep). One undo step.
export function adoptRemote(cfg) {
  past.push(lastSnap);
  future.length = 0;
  state.cfg = normalize(cfg);
  lastSnap = JSON.stringify(state.cfg);
  if (!state.cfg.panels.some((p) => p.id === state.selected)) state.selected = null;
  saveLocal(state.cfg);
  prefs.publishedAt = state.cfg.updatedAt;
  prefs.base = state.cfg;
  emit('remote');
}

// Fold another computer's changes into the board here. Returns true if anything changed.
export function mergeRemote(remote) {
  const merged = normalize(mergeBoards(prefs.base, state.cfg, remote));
  prefs.base = remote; // from now on, both sides share the gist's version
  if (JSON.stringify(merged) === JSON.stringify(remote)) { adoptRemote(remote); return true; }
  past.push(lastSnap);
  future.length = 0;
  state.cfg = merged;
  state.cfg.updatedAt = new Date().toISOString();
  lastSnap = JSON.stringify(state.cfg);
  if (!state.cfg.panels.some((p) => p.id === state.selected)) state.selected = null;
  saveLocal(state.cfg);
  emit('remote');
  return true;
}

/**
 * Look for changes another computer published.
 * @returns {Promise<'none'|'adopted'|'merged'>}
 */
export async function checkRemote() {
  // Never synced in this browser yet (the board here may be the sample): loading or connecting decides.
  if (!prefs.token || !prefs.gist || state.publishing || !prefs.publishedAt) return 'none';
  const remote = await fetchGist(prefs.gist, prefs.token);
  if (state.publishing) return 'none';
  if (remote.updatedAt === prefs.publishedAt) {
    if (!prefs.base) prefs.base = remote;
    return 'none';
  }
  if (!isDirty()) { adoptRemote(remote); return 'adopted'; }
  mergeRemote(remote);
  schedulePublish();
  return 'merged';
}

export async function publish() {
  clearTimeout(pubTimer);
  if (!prefs.token || !prefs.gist) throw new Error('Set up GitHub sync in the Sync tab first.');
  state.publishing = true; state.publishError = ''; emit('publish');
  try {
    // Someone may have published from another computer since we last looked: bring that in first.
    const remote = await fetchGist(prefs.gist, prefs.token);
    if (remote.updatedAt !== prefs.publishedAt) mergeRemote(remote);
    if (prefs.publishedAt === state.cfg.updatedAt) return; // the gist already has exactly this
    const stamp = state.cfg.updatedAt;
    const sent = JSON.parse(JSON.stringify(state.cfg));
    await publishGist(prefs.token, prefs.gist, sent);
    prefs.publishedAt = stamp;
    prefs.base = sent;
  } catch (e) {
    state.publishError = e.message;
    throw e;
  } finally {
    state.publishing = false;
    emit('publish');
  }
}
