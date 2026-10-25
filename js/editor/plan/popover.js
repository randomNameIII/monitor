// A small card anchored next to an element, for editing details in place.
// Only one is open at a time. Closes on Escape or a click outside.

let current = null;

export function closePopover() {
  if (!current) return;
  const { el, onClose } = current;
  current = null;
  el.remove();
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey, true);
  onClose?.();
}

export function popoverOpenFor(key) { return current?.key === key; }

function onOutside(e) {
  if (!current) return;
  if (current.el.contains(e.target)) return;
  if (e.target.closest('.ctx-root')) return; // a context menu opened from inside the popover
  closePopover();
}
function onKey(e) {
  if (e.key === 'Escape' && current) {
    // Escape inside a field first leaves the field, then closes.
    if (e.target.closest?.('.pop input, .pop textarea, .pop select') && e.target !== current.first) { e.target.blur(); current.first?.focus(); }
    else closePopover();
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * @param {Element|DOMRect} anchor  element or rect to sit next to
 * @param {(el: HTMLElement) => void} build  fills the popover
 * @param {{ key?: string, onClose?: () => void, width?: number }} opts
 */
export function openPopover(anchor, build, { key = '', onClose, width = 320 } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = 'pop';
  el.setAttribute('role', 'dialog');
  el.style.width = `${width}px`;
  document.body.appendChild(el);
  build(el);
  current = { el, onClose, key, first: el.querySelector('input, textarea, select, button') };

  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  const { height } = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = r.right + 10;
  if (left + width > vw - 12) left = r.left - width - 10;
  if (left < 12) left = Math.min(vw - width - 12, Math.max(12, r.left));
  let top = Math.min(Math.max(12, r.top - 8), vh - height - 12);
  el.style.left = `${left}px`;
  el.style.top = `${Math.max(12, top)}px`;

  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
  });
  return el;
}
