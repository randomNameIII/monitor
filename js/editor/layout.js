// Layout tab: live preview with drag/resize, the panel palette and the settings inspector.

import { state, commit, select, onChange, breakUndoGroup } from './state.js';
import { createBoard, geometry } from '../core/board.js';
import { createBackground } from '../core/background.js';
import { listPanels, getPanel } from '../core/registry.js';
import { resolveSettings, uid } from '../core/config.js';
import { renderField, isVisible, h } from './fields.js';

const $ = (id) => document.getElementById(id);
const wrap = $('canvasWrap');
const viewport = $('viewport');
const frame = $('frame');
const stage = $('stage');
const overlay = $('overlay');
const inspector = $('inspector');

const board = createBoard(stage, { editor: true });
const bg = createBackground($('previewBg'), { container: viewport });
let scale = 1;
let dragging = false;

/* ---------- preview sizing ---------- */
function fit() {
  const b = state.cfg.board;
  const availW = wrap.clientWidth - 48;
  const availH = wrap.clientHeight - 70;
  scale = Math.max(0.1, Math.min(availW / b.width, availH / b.height));
  viewport.style.width = `${b.width * scale}px`;
  viewport.style.height = `${b.height * scale}px`;
  frame.style.width = `${b.width}px`;
  frame.style.height = `${b.height}px`;
  frame.style.transform = `scale(${scale})`;
}
new ResizeObserver(fit).observe(wrap);

/* ---------- overlay: grid cells + one handle box per panel ---------- */
function renderOverlay() {
  const b = state.cfg.board;
  const g = geometry(b);
  overlay.innerHTML = '';
  overlay.style.width = `${b.width}px`;
  overlay.style.height = `${b.height}px`;

  const grid = h('div', { class: 'grid-cells' });
  for (let y = 0; y < b.rows; y++) {
    for (let x = 0; x < b.cols; x++) {
      const r = g.rect({ x, y, w: 1, h: 1 });
      grid.append(h('i', { style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` }));
    }
  }
  overlay.append(grid);

  const overlaps = findOverlaps(state.cfg.panels);
  for (const p of state.cfg.panels) {
    const def = getPanel(p.type);
    const r = g.rect(p);
    const box = h('div', {
      class: `hbox${p.id === state.selected ? ' selected' : ''}${overlaps.has(p.id) ? ' overlap' : ''}`,
      style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`,
      'data-id': p.id,
    },
    h('span', { class: 'hbox-label' }, def?.name || p.type),
    h('span', { class: 'hbox-grip', 'data-grip': '1', title: 'Drag to resize' }));
    box.addEventListener('pointerdown', (e) => startDrag(e, p));
    overlay.append(box);
  }
}

// While dragging, move the existing boxes instead of rebuilding them (rebuilding drops pointer capture).
function updateBoxes() {
  const g = geometry(state.cfg.board);
  for (const p of state.cfg.panels) {
    const box = overlay.querySelector(`.hbox[data-id="${p.id}"]`);
    if (!box) continue;
    box.classList.toggle('selected', p.id === state.selected);
    const r = g.rect(p);
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  }
}

function findOverlaps(panels) {
  const out = new Set();
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i], b = panels[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) { out.add(a.id); out.add(b.id); }
    }
  }
  return out;
}

overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay || e.target.closest('.grid-cells')) select(null); });

/* ---------- dragging ---------- */
function startDrag(e, p) {
  e.preventDefault();
  e.stopPropagation();
  const target = e.currentTarget;
  target.setPointerCapture(e.pointerId);
  overlay.classList.add('dragging');
  dragging = true;
  breakUndoGroup();
  if (state.selected !== p.id) select(p.id);
  const resizing = !!e.target.dataset.grip;
  const b = state.cfg.board;
  const g = geometry(b);
  const def = getPanel(p.type);
  const min = def?.minSize || { w: 1, h: 1 };
  const start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y, pw: p.w, ph: p.h };

  const move = (ev) => {
    const dx = (ev.clientX - start.x) / scale / (g.cw + g.gap);
    const dy = (ev.clientY - start.y) / scale / (g.ch + g.gap);
    let changed = false;
    if (resizing) {
      const w = clamp(Math.round(start.pw + dx), min.w, b.cols - p.x);
      const hh = clamp(Math.round(start.ph + dy), min.h, b.rows - p.y);
      if (w !== p.w || hh !== p.h) { p.w = w; p.h = hh; changed = true; }
    } else {
      const x = clamp(Math.round(start.px + dx), 0, b.cols - p.w);
      const y = clamp(Math.round(start.py + dy), 0, b.rows - p.h);
      if (x !== p.x || y !== p.y) { p.x = x; p.y = y; changed = true; }
    }
    if (changed) commit('move');
  };
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
    overlay.classList.remove('dragging');
    dragging = false;
    renderOverlay();
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------- adding panels ---------- */
// Find the first free spot that fits w×h, scanning row by row; fall back to the top-left.
function freeSpot(w, hgt) {
  const b = state.cfg.board;
  const taken = (x, y) => state.cfg.panels.some((p) => x < p.x + p.w && p.x < x + w && y < p.y + p.h && p.y < y + hgt);
  for (let y = 0; y + hgt <= b.rows; y++) for (let x = 0; x + w <= b.cols; x++) if (!taken(x, y)) return { x, y };
  return { x: 0, y: 0 };
}

export function addPanel(type) {
  const def = getPanel(type);
  const b = state.cfg.board;
  const w = Math.min(def.defaultSize.w, b.cols), hh = Math.min(def.defaultSize.h, b.rows);
  const p = { id: uid(), type, ...freeSpot(w, hh), w, h: hh, settings: {} };
  state.cfg.panels.push(p);
  state.selected = p.id;
  commit('add');
}

function renderPalette() {
  const list = $('typeList');
  list.innerHTML = '';
  for (const def of listPanels()) {
    list.append(h('li', {}, h('button', { type: 'button', class: 'type-btn', onClick: () => addPanel(def.type) },
      h('strong', {}, def.name), h('span', {}, def.description))));
  }
}

function renderPanelList() {
  const list = $('panelList');
  list.innerHTML = '';
  if (!state.cfg.panels.length) { list.append(h('li', { class: 'muted' }, 'The board is empty. Add a panel above.')); return; }
  for (const p of state.cfg.panels) {
    const def = getPanel(p.type);
    const s = p.settings || {};
    const sub = s.title || s.label || '';
    list.append(h('li', {}, h('button', {
      type: 'button', class: `panel-btn${p.id === state.selected ? ' active' : ''}`, onClick: () => select(p.id),
    }, h('span', {}, def?.name || p.type), sub ? h('small', {}, sub) : null)));
  }
}

/* ---------- inspector ---------- */
function renderInspector() {
  inspector.innerHTML = '';
  const p = state.cfg.panels.find((x) => x.id === state.selected);
  if (!p) {
    inspector.append(h('div', { class: 'empty-inspector' },
      h('h2', {}, 'Panel settings'),
      h('p', {}, 'Select a panel on the board to change what it shows.')));
    return;
  }
  const def = getPanel(p.type);
  if (!def) {
    inspector.append(h('h2', {}, p.type), h('p', { class: 'muted' }, 'This panel type isn’t installed.'), deleteBtn(p));
    return;
  }
  const values = resolveSettings(def, p.settings);
  inspector.append(h('div', { class: 'insp-head' }, h('h2', {}, def.name), h('p', {}, def.description)));

  const form = h('div', { class: 'fields' });
  const dependents = new Set((def.settings || []).flatMap((f) => Object.keys(f.showIf || {})));
  for (const field of def.settings || []) {
    if (!isVisible(field, values)) continue;
    form.append(renderField(field, values[field.key], (v) => {
      p.settings = { ...p.settings, [field.key]: v };
      commit('settings');
      if (dependents.has(field.key)) renderInspector();
    }));
  }
  inspector.append(form);

  // Appearance and placement are the same for every panel.
  const b = state.cfg.board;
  const pos = h('div', { class: 'fields' }, h('h3', { class: 'field-heading' }, 'Appearance'));
  pos.append(renderField({ type: 'select', label: 'Panel style', options: [
    { value: 'default', label: `Board default (${def.defaultStyle || b.panelStyle})` },
    { value: 'card', label: 'Card' }, { value: 'outline', label: 'Outline' }, { value: 'bare', label: 'No background' },
  ] }, p.style || 'default', (v) => { p.style = v; commit('style'); }));

  const grid = h('div', { class: 'pos-grid' });
  for (const [k, label, max] of [['x', 'Column', b.cols], ['y', 'Row', b.rows], ['w', 'Width', b.cols], ['h', 'Height', b.rows]]) {
    grid.append(renderField({ type: 'number', label, min: 1, max }, k === 'x' || k === 'y' ? p[k] + 1 : p[k], (v) => {
      p[k] = k === 'x' || k === 'y' ? v - 1 : v;
      p.x = clamp(p.x, 0, b.cols - 1); p.y = clamp(p.y, 0, b.rows - 1);
      p.w = clamp(p.w, 1, b.cols - p.x); p.h = clamp(p.h, 1, b.rows - p.y);
      commit('move');
    }));
  }
  pos.append(grid);
  inspector.append(pos);

  inspector.append(h('div', { class: 'insp-actions' },
    h('button', { type: 'button', class: 'btn ghost', onClick: () => duplicate(p) }, 'Duplicate'),
    deleteBtn(p)));
}

function deleteBtn(p) {
  return h('button', { type: 'button', class: 'btn danger', onClick: () => removePanel(p.id) }, 'Delete panel');
}

function duplicate(p) {
  const copy = structuredClone(p);
  copy.id = uid();
  Object.assign(copy, freeSpot(p.w, p.h));
  state.cfg.panels.push(copy);
  state.selected = copy.id;
  commit('add');
}

export function removePanel(id) {
  state.cfg.panels = state.cfg.panels.filter((p) => p.id !== id);
  if (state.selected === id) state.selected = null;
  commit('remove');
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown', (e) => {
  if (document.querySelector('[data-panel="layout"]').hidden) return;
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  const p = state.cfg.panels.find((x) => x.id === state.selected);
  if (!p) return;
  const b = state.cfg.board;
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (step) {
    e.preventDefault();
    const min = getPanel(p.type)?.minSize || { w: 1, h: 1 };
    if (e.shiftKey) { p.w = clamp(p.w + step[0], min.w, b.cols - p.x); p.h = clamp(p.h + step[1], min.h, b.rows - p.y); }
    else { p.x = clamp(p.x + step[0], 0, b.cols - p.w); p.y = clamp(p.y + step[1], 0, b.rows - p.h); }
    commit('move');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    removePanel(p.id);
  } else if (e.key === 'Escape') {
    select(null);
  }
});

/* ---------- wiring ---------- */
function renderAll(reason) {
  board.render(state.cfg);
  bg.configure(state.cfg.board.background);
  fit();
  if (dragging) updateBoxes(); else renderOverlay();
  renderPanelList();
  // Rebuilding the inspector while typing would steal focus, so only do it when structure changes.
  if (!['settings', 'move', 'style', 'events', 'board'].includes(reason)) renderInspector();
  else if (reason === 'move') syncPositionFields();
}

function syncPositionFields() {
  const p = state.cfg.panels.find((x) => x.id === state.selected);
  if (!p) return;
  const inputs = inspector.querySelectorAll('.pos-grid input');
  ['x', 'y', 'w', 'h'].forEach((k, i) => { if (inputs[i] && document.activeElement !== inputs[i]) inputs[i].value = k === 'x' || k === 'y' ? p[k] + 1 : p[k]; });
}

export function initLayout() {
  renderPalette();
  renderAll('init');
  onChange(renderAll);
}
