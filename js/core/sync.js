// Moving the config between the editor (your desktop) and the display (the wall).
//
// Two transports:
//   - Gist:  the editor writes a private GitHub Gist with your token; the display reads it
//            without any token, polling every `board.pollSeconds`. Works across machines.
//   - Local: localStorage + BroadcastChannel. Editor and display open in the same browser
//            update instantly. Handy for trying things out before setting up a gist.

import { normalize } from './config.js';

export const GIST_FILE = 'dusk-board.json';
const LOCAL_KEY = 'dusk.config';
const CACHE_KEY = 'dusk.display.cache';
const CHANNEL = 'dusk';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};
export { store };

function parse(text) {
  try { return normalize(JSON.parse(text)); } catch { return null; }
}

/* ---------------- editor side ---------------- */

let channel = null;
function getChannel() {
  if (!channel && 'BroadcastChannel' in window) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function saveLocal(cfg) {
  const text = JSON.stringify(cfg);
  store.set(LOCAL_KEY, text);
  getChannel()?.postMessage({ type: 'config', text });
}

export function loadLocal() {
  const text = store.get(LOCAL_KEY);
  return text ? parse(text) : null;
}

async function gh(path, token, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    let msg = `GitHub returned ${res.status}`;
    try { const j = await res.json(); if (j.message) msg += `: ${j.message}`; } catch { /* no body */ }
    if (res.status === 401) msg = 'GitHub rejected the token. Check that it is correct and has the "gist" scope.';
    if (res.status === 404) msg = 'Gist not found. Check the gist ID, or that this token owns it.';
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return res.json();
}

export async function createGist(token, cfg) {
  const body = {
    description: 'Dusk status board config',
    public: false,
    files: { [GIST_FILE]: { content: JSON.stringify(cfg, null, 2) } },
  };
  const j = await gh('/gists', token, { method: 'POST', body: JSON.stringify(body) });
  return j.id;
}

export async function publishGist(token, gistId, cfg) {
  const body = { files: { [GIST_FILE]: { content: JSON.stringify(cfg, null, 2) } } };
  await gh(`/gists/${gistId}`, token, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function fetchGist(gistId, token) {
  const j = await gh(`/gists/${gistId}`, token, { cache: 'no-cache' });
  const file = j.files?.[GIST_FILE] || Object.values(j.files || {})[0];
  if (!file) throw new Error('That gist has no files.');
  let text = file.content;
  if (file.truncated && file.raw_url) text = await (await fetch(file.raw_url)).text();
  const cfg = parse(text);
  if (!cfg) throw new Error('The gist does not contain valid board JSON.');
  return cfg;
}

/* ---------------- display side ---------------- */

// Calls onConfig(cfg) whenever a new config arrives and onStatus({state, detail}) on changes.
// Returns a stop() function.
export function subscribe({ gistId, onConfig, onStatus }) {
  let lastStamp = null;
  let timer = null;
  let stopped = false;

  const deliver = (cfg, from) => {
    if (!cfg) return;
    const stamp = cfg.updatedAt + JSON.stringify(cfg).length;
    if (stamp === lastStamp) return;
    lastStamp = stamp;
    store.set(CACHE_KEY, JSON.stringify(cfg));
    onConfig(cfg, from);
  };

  // Paint immediately from the last config we saw, so a reboot with no network still shows the board.
  const cached = store.get(CACHE_KEY);
  if (cached) deliver(parse(cached), 'cache');

  if (gistId) {
    let interval = 90;
    const poll = async () => {
      if (stopped) return;
      try {
        const cfg = await fetchGist(gistId);
        interval = Math.max(30, Number(cfg.board.pollSeconds) || 90);
        deliver(cfg, 'gist');
        onStatus?.({ state: 'ok', detail: 'Synced', at: Date.now() });
      } catch (e) {
        // Unauthenticated GitHub reads allow 60/hour per IP; back off hard if we hit the limit.
        if (e.status === 403 || e.status === 429) interval = 300;
        onStatus?.({ state: 'error', detail: e.message, at: Date.now() });
      }
      timer = setTimeout(poll, interval * 1000);
    };
    poll();
  } else {
    // Local mode: same-browser editor.
    const fromLocal = () => {
      const cfg = loadLocal();
      if (cfg) { deliver(cfg, 'local'); onStatus?.({ state: 'ok', detail: 'Local', at: Date.now() }); }
      else onStatus?.({ state: 'idle', detail: 'Waiting for the editor', at: Date.now() });
    };
    fromLocal();
    getChannel()?.addEventListener('message', (ev) => {
      if (ev.data?.type === 'config') { deliver(parse(ev.data.text), 'local'); onStatus?.({ state: 'ok', detail: 'Local', at: Date.now() }); }
    });
    window.addEventListener('storage', (ev) => { if (ev.key === LOCAL_KEY) fromLocal(); });
  }

  return () => { stopped = true; clearTimeout(timer); };
}
