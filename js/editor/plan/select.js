// Multi-select for the Plan tab.
//
// - Drag across empty space on the board to draw a selection box (Shift or Ctrl/Cmd adds to the selection).
// - Shift/Ctrl/Cmd-click an item to add or remove it.
// - Escape or a click on empty space clears the selection.
//
// Items are identified by keys: tasks "t:<id>:<day>" (day is '' for undated), day goals "g:<id>".

import { edgeScroller } from './drag.js';

const selected = new Set();
let listeners = [];

export const keyOf = (el) => (el.dataset.drag === 'task' ? `t:${el.dataset.id}:${el.dataset.day || ''}` : `g:${el.dataset.id}`);
export const isSelected = (el) => selected.has(keyOf(el));
export const selectionSize = () => selected.size;
export const onSelectionChange = (fn) => listeners.push(fn);

// Parsed selection: [{ kind: 'task'|'goal', id, day }]
export function selectedItems() {
  return [...selected].map((k) => {
    const [t, id, day = ''] = k.split(':');
    return { kind: t === 't' ? 'task' : 'goal', id, day };
  });
}

function changed() { for (const fn of listeners) fn(selected.size); }

export function clearSelection() {
  if (!selected.size) return;
  selected.clear();
  changed();
}
export function setSelection(keys) {
  selected.clear();
  for (const k of keys) selected.add(k);
  changed();
}
export function toggleSelected(el) {
  const k = keyOf(el);
  selected.has(k) ? selected.delete(k) : selected.add(k);
  changed();
}

// Re-apply .selected after a re-render, and drop keys whose items no longer exist on screen
// only if the caller asks (items scrolled out of the rendered range keep their selection).
export function paintSelection(root) {
  for (const el of root.querySelectorAll('[data-drag="task"], [data-drag="day-goal"]')) {
    el.classList.toggle('selected', selected.has(keyOf(el)));
  }
}

const SELECTABLE = '[data-drag="task"], [data-drag="day-goal"]';

/**
 * Draw a selection box over `area` (the scrolling board).
 * @param {HTMLElement} area
 * @param {{ canStart: (e: PointerEvent) => boolean }} opts
 */
export function enableMarquee(area, { canStart }) {
  let start = null;   // in content coordinates (accounts for scrolling)
  let box = null;
  let base = null;    // selection to add to (Shift/Ctrl held)
  let pointer = null;
  const scroller = edgeScroller(() => update());

  const toContent = (x, y) => {
    const r = area.getBoundingClientRect();
    return { x: x - r.left + area.scrollLeft, y: y - r.top + area.scrollTop };
  };

  area.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !canStart(e)) return;
    start = { ...toContent(e.clientX, e.clientY), cx: e.clientX, cy: e.clientY, moved: false, additive: e.shiftKey || e.ctrlKey || e.metaKey };
    pointer = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('pointermove', (e) => {
    if (!start) return;
    pointer = { x: e.clientX, y: e.clientY };
    if (!start.moved) {
      if (Math.hypot(e.clientX - start.cx, e.clientY - start.cy) < 6) return;
      start.moved = true;
      base = start.additive ? new Set(selected) : new Set();
      box = document.createElement('div');
      box.className = 'marquee';
      document.body.appendChild(box);
      document.body.classList.add('is-selecting');
      window.getSelection()?.removeAllRanges();
    }
    update();
    scroller.update(e.clientX, e.clientY);
  });

  function update() {
    if (!box || !pointer) return;
    const r = area.getBoundingClientRect();
    const cur = toContent(pointer.x, pointer.y);
    const x1 = Math.min(start.x, cur.x), x2 = Math.max(start.x, cur.x);
    const y1 = Math.min(start.y, cur.y), y2 = Math.max(start.y, cur.y);
    // Draw in viewport coordinates, clipped to the board.
    const vx1 = Math.max(r.left, x1 - area.scrollLeft + r.left), vx2 = Math.min(r.right, x2 - area.scrollLeft + r.left);
    const vy1 = Math.max(r.top, y1 - area.scrollTop + r.top), vy2 = Math.min(r.bottom, y2 - area.scrollTop + r.top);
    Object.assign(box.style, { left: `${vx1}px`, top: `${vy1}px`, width: `${Math.max(0, vx2 - vx1)}px`, height: `${Math.max(0, vy2 - vy1)}px` });

    const keys = new Set(base);
    for (const el of area.querySelectorAll(SELECTABLE)) {
      const er = el.getBoundingClientRect();
      const ex1 = er.left - r.left + area.scrollLeft, ex2 = er.right - r.left + area.scrollLeft;
      const ey1 = er.top - r.top + area.scrollTop, ey2 = er.bottom - r.top + area.scrollTop;
      const hit = ex1 < x2 && ex2 > x1 && ey1 < y2 && ey2 > y1;
      const k = keyOf(el);
      if (hit) keys.add(k);
      el.classList.toggle('selected', keys.has(k));
    }
    selected.clear();
    for (const k of keys) selected.add(k);
  }

  window.addEventListener('pointerup', () => {
    if (!start) return;
    const wasDrag = start.moved;
    start = null;
    scroller.stop();
    if (wasDrag) {
      box?.remove();
      box = null;
      document.body.classList.remove('is-selecting');
      // The click that follows a box-select shouldn't clear it or open anything.
      const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      changed();
    }
  });
}
