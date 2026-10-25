// Pointer-based drag and drop (smoother than native HTML5 DnD, and it plays well with right-click).
//
// Draggables:  [data-drag="<kind>"][data-id]   (extra data-* are passed through as `src`)
// Drop zones:  [data-drop][data-accept="kind kind…"]   (data-* passed through as `zone`)
// onDrop({ kind, id, src, zone, beforeId }) is called when something is dropped on an accepting zone.
// Items with data-ordered="false" (e.g. timed tasks, which sort by time) don't show an insertion line.

const THRESHOLD = 5;

export function enableDrag(root, { onDrop, onStart, onEnd }) {
  let pending = null;
  let drag = null;

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('input, textarea, select, button:not([data-drag]), [contenteditable="true"], [data-nodrag]')) return;
    const el = e.target.closest('[data-drag]');
    if (!el || !root.contains(el)) return;
    pending = { el, x: e.clientX, y: e.clientY, id: e.pointerId };
  });

  window.addEventListener('pointermove', (e) => {
    if (pending && !drag) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < THRESHOLD) return;
      start(e);
    }
    if (drag) move(e);
  });

  window.addEventListener('pointerup', () => {
    if (drag) finish(true);
    pending = null;
  });
  window.addEventListener('pointercancel', () => { if (drag) finish(false); pending = null; });
  window.addEventListener('keydown', (e) => { if (drag && e.key === 'Escape') { e.preventDefault(); finish(false); } }, true);

  function start(e) {
    const el = pending.el;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-drag');
    Object.assign(ghost.style, { width: `${r.width}px`, left: '0px', top: '0px' });
    document.body.appendChild(ghost);
    const line = document.createElement('div');
    line.className = 'drop-line';
    line.hidden = true;
    document.body.appendChild(line);
    drag = {
      el, ghost, line,
      kind: el.dataset.drag, id: el.dataset.id, src: { ...el.dataset },
      dx: pending.x - r.left, dy: pending.y - r.top,
      zone: null, beforeId: null,
    };
    el.classList.add('drag-src');
    document.body.classList.add('is-dragging');
    window.getSelection()?.removeAllRanges();
    onStart?.(drag);
  }

  function move(e) {
    const { ghost } = drag;
    ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px) rotate(-1.2deg)`;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    // Zones can be nested (a project card inside the project list): use the nearest one that accepts this kind.
    let zone = hit?.closest('[data-drop]');
    while (zone && !(zone.dataset.accept || '').split(/\s+/).includes(drag.kind)) zone = zone.parentElement?.closest('[data-drop]');
    if (zone !== drag.zone) {
      drag.zone?.classList.remove('drop-over');
      zone?.classList.add('drop-over');
      drag.zone = zone;
    }
    drag.beforeId = null;
    drag.line.hidden = true;
    if (zone) {
      const ordered = drag.el.dataset.ordered !== 'false';
      const items = [...zone.querySelectorAll(`[data-drag="${drag.kind}"]`)]
        .filter((x) => x !== drag.el && x.closest('[data-drop]') === zone && x.dataset.ordered !== 'false');
      let before = null;
      for (const it of items) {
        const r = it.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { before = it; break; }
      }
      drag.beforeId = before?.dataset.id || null;
      if (ordered && items.length) {
        const ref = before || items[items.length - 1];
        const r = ref.getBoundingClientRect();
        const y = before ? r.top - 3 : r.bottom + 3;
        Object.assign(drag.line.style, { left: `${r.left}px`, top: `${y - 1}px`, width: `${r.width}px` });
        drag.line.hidden = false;
      }
      autoScroll(zone, e.clientY);
    }
  }

  function autoScroll(zone, y) {
    const sc = zone.closest('.plan-scroll');
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (y < r.top + 40) sc.scrollTop -= 12;
    else if (y > r.bottom - 40) sc.scrollTop += 12;
  }

  function finish(commit) {
    const d = drag;
    drag = null;
    d.ghost.remove();
    d.line.remove();
    d.el.classList.remove('drag-src');
    d.zone?.classList.remove('drop-over');
    document.body.classList.remove('is-dragging');
    // Swallow the click that follows a drag so it doesn't open the editor.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    onEnd?.(d);
    if (commit && d.zone) onDrop({ kind: d.kind, id: d.id, src: d.src, zone: { ...d.zone.dataset }, beforeId: d.beforeId });
  }
}
