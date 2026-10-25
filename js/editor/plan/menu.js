// Right-click menus. openMenu(event, items) shows a menu at the pointer.
// item: { label, hint?, action?, danger?, checked?, disabled?, items?: [...] (submenu) } or '-' for a divider.
// Keyboard: arrows move, Right/Left open and close submenus, Enter picks, Escape closes.

let root = null;

export function closeMenu() {
  root?.remove();
  root = null;
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onKey, true);
  window.removeEventListener('blur', closeMenu);
  window.removeEventListener('resize', closeMenu);
}

function onOutside(e) { if (root && !root.contains(e.target)) closeMenu(); }

function build(items, level = 0) {
  const el = document.createElement('div');
  el.className = 'ctx';
  el.setAttribute('role', 'menu');
  el.dataset.level = level;
  for (const it of items) {
    if (it === '-') { el.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' })); continue; }
    if (it.heading) { el.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-head', textContent: it.heading })); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ctx-item${it.danger ? ' danger' : ''}${it.items ? ' has-sub' : ''}`;
    b.setAttribute('role', 'menuitem');
    b.disabled = !!it.disabled;
    b.innerHTML = `<span class="ctx-check">${it.checked ? '✓' : ''}</span>${it.swatch != null ? `<i class="ctx-swatch" style="--h:${it.swatch}"></i>` : ''}<span class="ctx-label"></span><span class="ctx-hint"></span>`;
    b.querySelector('.ctx-label').textContent = it.label;
    b.querySelector('.ctx-hint').textContent = it.items ? '›' : (it.hint || '');
    if (it.items) {
      const open = () => openSub(b, it.items, level + 1);
      b.addEventListener('pointerenter', open);
      b.addEventListener('click', open);
      b._open = open;
    } else {
      b.addEventListener('pointerenter', () => closeSubs(level + 1));
      b.addEventListener('click', () => { closeMenu(); it.action?.(); });
    }
    el.appendChild(b);
  }
  return el;
}

function closeSubs(fromLevel) {
  root?.querySelectorAll('.ctx').forEach((m) => { if (+m.dataset.level >= fromLevel) m.remove(); });
  root?.querySelectorAll('.ctx-item.open').forEach((b) => { if (+b.closest('.ctx').dataset.level >= fromLevel - 1) b.classList.remove('open'); });
}

function openSub(btn, items, level) {
  if (btn.classList.contains('open')) return;
  closeSubs(level);
  btn.classList.add('open');
  const sub = build(items, level);
  root.appendChild(sub);
  const r = btn.getBoundingClientRect();
  place(sub, r.right - 4, r.top - 5, r.left + 4);
  return sub;
}

function place(el, x, y, flipX = null) {
  el.style.left = '0px'; el.style.top = '0px';
  const { width, height } = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  let left = x, top = y;
  if (left + width > vw - 8) left = flipX != null ? flipX - width : vw - width - 8;
  if (top + height > vh - 8) top = Math.max(8, vh - height - 8);
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${top}px`;
}

function onKey(e) {
  if (!root) return;
  const menus = [...root.querySelectorAll('.ctx')];
  const active = document.activeElement?.closest('.ctx') || menus[0];
  const btns = [...active.querySelectorAll(':scope > .ctx-item:not(:disabled)')];
  const i = btns.indexOf(document.activeElement);
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === 'Escape') { stop(); closeMenu(); }
  else if (e.key === 'ArrowDown') { stop(); btns[(i + 1) % btns.length]?.focus(); }
  else if (e.key === 'ArrowUp') { stop(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
  else if (e.key === 'ArrowRight' && document.activeElement?._open) {
    stop(); document.activeElement._open();
    root.querySelector(`.ctx[data-level="${+active.dataset.level + 1}"] .ctx-item`)?.focus();
  } else if (e.key === 'ArrowLeft' && +active.dataset.level > 0) {
    stop();
    const parent = root.querySelector(`.ctx[data-level="${+active.dataset.level - 1}"] .ctx-item.open`);
    closeSubs(+active.dataset.level);
    parent?.focus();
  } else if (e.key === 'Tab') { stop(); }
}

export function openMenu(e, items, { x, y } = {}) {
  e?.preventDefault?.();
  closeMenu();
  root = document.createElement('div');
  root.className = 'ctx-root';
  const menu = build(items, 0);
  root.appendChild(menu);
  document.body.appendChild(root);
  place(menu, x ?? e.clientX, y ?? e.clientY);
  // Opened from the keyboard: focus the first item so arrows work straight away.
  if (!e || e.type === 'keydown' || e.detail === 0) menu.querySelector('.ctx-item')?.focus();
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', closeMenu);
    window.addEventListener('resize', closeMenu);
  });
}
