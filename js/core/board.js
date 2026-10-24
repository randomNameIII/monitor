// Renders a config onto a fixed-size "stage" element. Shared by the display and the editor preview.
// Panels are only re-mounted when something they depend on changes; moving one just repositions it.

import { getPanel } from './registry.js';
import { resolveSettings } from './config.js';
import { esc } from './util.js';
import { store } from './sync.js';

export function geometry(board) {
  const { width, height, cols, rows, gap, padding } = board;
  const cw = (width - padding * 2 - gap * (cols - 1)) / cols;
  const ch = (height - padding * 2 - gap * (rows - 1)) / rows;
  return {
    cw, ch, gap, padding, cols, rows,
    rect(p) {
      return {
        left: padding + p.x * (cw + gap),
        top: padding + p.y * (ch + gap),
        width: p.w * cw + (p.w - 1) * gap,
        height: p.h * ch + (p.h - 1) * gap,
      };
    },
    cellAt(px, py) {
      return {
        x: Math.round((px - padding) / (cw + gap)),
        y: Math.round((py - padding) / (ch + gap)),
      };
    },
  };
}

async function fetchJSON(url, { maxAge = 600 } = {}) {
  const key = `dusk.fetch:${url}`;
  let cached = null;
  try { cached = JSON.parse(store.get(key)); } catch { /* none */ }
  if (cached && Date.now() - cached.t < maxAge * 1000) return cached.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    store.set(key, JSON.stringify({ t: Date.now(), data }));
    return data;
  } catch (e) {
    if (cached) return cached.data; // stale beats empty on a wall display
    throw e;
  }
}

export function createBoard(stage, { editor = false } = {}) {
  const mounted = new Map();
  let cfg = null;

  function makeCtx(p, def, body) {
    const timers = new Set();
    const ctx = {
      el: body,
      panel: p,
      settings: resolveSettings(def, p.settings),
      board: cfg.board,
      data: cfg.data,
      editor,
      esc,
      fetchJSON,
      // Run fn every `ms`. With align:true it fires on wall-clock boundaries (e.g. each new minute).
      every(ms, fn, { align = false, immediate = true } = {}) {
        let handle;
        const schedule = () => {
          const delay = align ? ms - (Date.now() % ms) + 5 : ms;
          handle = setTimeout(() => { timers.delete(handle); safe(fn); schedule(); }, delay);
          timers.add(handle);
        };
        if (immediate) safe(fn);
        schedule();
      },
      _clear() { for (const t of timers) clearTimeout(t); timers.clear(); },
    };
    function safe(fn) {
      try { const r = fn(); if (r && r.catch) r.catch((e) => showError(body, e)); }
      catch (e) { showError(body, e); }
    }
    return ctx;
  }

  function showError(body, e) {
    console.error(e);
    body.innerHTML = `<div class="panel-msg">Panel error: ${esc(e.message || e)}</div>`;
  }

  function dependencyKey(p, def) {
    const b = cfg.board;
    return JSON.stringify([
      p.type, p.settings, b.location, b.units, b.accent,
      def.usesData ? cfg.data : null,
    ]);
  }

  function unmount(m) {
    try { m.inst?.destroy?.(); } catch (e) { console.error(e); }
    m.ctx?._clear();
    m.el.remove();
  }

  function mount(p, def) {
    const el = document.createElement('section');
    el.className = 'panel';
    el.dataset.id = p.id;
    el.dataset.type = p.type;
    const body = document.createElement('div');
    body.className = 'panel-body';
    el.appendChild(body);
    stage.appendChild(el);
    const m = { el, body, def, key: null, inst: null, ctx: null };
    if (!def) {
      body.innerHTML = `<div class="panel-msg">Unknown panel type “${esc(p.type)}”. Is its file listed in js/panels/index.js?</div>`;
      return m;
    }
    m.ctx = makeCtx(p, def, body);
    try { m.inst = def.mount(m.ctx) || null; }
    catch (e) { showError(body, e); }
    return m;
  }

  function render(next) {
    cfg = next;
    const b = cfg.board;
    stage.style.width = `${b.width}px`;
    stage.style.height = `${b.height}px`;
    stage.style.setProperty('--accent', b.accent);
    const g = geometry(b);

    const ids = new Set(cfg.panels.map((p) => p.id));
    for (const [id, m] of mounted) if (!ids.has(id)) { unmount(m); mounted.delete(id); }

    for (const p of cfg.panels) {
      const def = getPanel(p.type);
      const key = def ? dependencyKey(p, def) : p.type;
      let m = mounted.get(p.id);
      if (!m || m.key !== key) {
        if (m) unmount(m);
        m = mount(p, def);
        m.key = key;
        mounted.set(p.id, m);
      }
      const r = g.rect(p);
      Object.assign(m.el.style, {
        left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      });
      const style = p.style && p.style !== 'default' ? p.style : (def?.defaultStyle || b.panelStyle);
      m.el.dataset.style = style;
    }
  }

  return {
    render,
    element(id) { return mounted.get(id)?.el; },
    destroy() { for (const m of mounted.values()) unmount(m); mounted.clear(); },
  };
}
