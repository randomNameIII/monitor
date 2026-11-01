// Customisable keyboard shortcuts for the Plan tab.
//
// Every action has default keys; you can rebind them in the Shortcuts window (button in the Plan
// header, or "?"). Your bindings are stored in this browser. Key names look like "D", "Shift+N",
// "Alt+ArrowRight", "Ctrl+A", "Space", "?".

import { store } from '../../core/sync.js';
import { esc } from '../../core/util.js';
import { toast } from '../ui.js';

export const ACTIONS = [
  { id: 'quickAdd', group: 'Adding', label: 'Quick add', keys: ['N'], global: true },
  { id: 'quickNote', group: 'Adding', label: 'Quick add a day note', keys: ['Shift+N'], global: true },
  { id: 'quickGoal', group: 'Adding', label: 'Quick add a goal for the day', keys: [] , global: true },
  { id: 'quickProject', group: 'Adding', label: 'Quick add a project', keys: [], global: true },

  { id: 'today', group: 'Moving around', label: 'Back to today', keys: ['T'] },
  { id: 'back', group: 'Moving around', label: 'Back a day (a month in Month view)', keys: ['ArrowLeft'] },
  { id: 'forward', group: 'Moving around', label: 'Forward a day (a month in Month view)', keys: ['ArrowRight'] },
  { id: 'backWeek', group: 'Moving around', label: 'Back 7 days', keys: ['Shift+ArrowLeft'] },
  { id: 'forwardWeek', group: 'Moving around', label: 'Forward 7 days', keys: ['Shift+ArrowRight'] },
  { id: 'cycleView', group: 'Moving around', label: 'Next view (Days → Month → List)', keys: ['V'] },
  { id: 'viewDays', group: 'Moving around', label: 'Days view', keys: [] },
  { id: 'viewMonth', group: 'Moving around', label: 'Month view', keys: ['M'] },
  { id: 'viewList', group: 'Moving around', label: 'List view', keys: [] },

  { id: 'done', group: 'The selected or focused item', label: 'Mark done / not done', keys: ['Space', 'X'] },
  { id: 'edit', group: 'The selected or focused item', label: 'Edit', keys: ['Enter'] },
  { id: 'duplicate', group: 'The selected or focused item', label: 'Duplicate', keys: ['D'] },
  { id: 'due', group: 'The selected or focused item', label: 'Set the due date', keys: ['Shift+D'] },
  { id: 'delete', group: 'The selected or focused item', label: 'Delete', keys: ['Delete', 'Backspace'] },
  { id: 'later', group: 'The selected or focused item', label: 'Move a day later', keys: ['Alt+ArrowRight'] },
  { id: 'earlier', group: 'The selected or focused item', label: 'Move a day earlier', keys: ['Alt+ArrowLeft'] },
  { id: 'tomorrow', group: 'The selected or focused item', label: 'Move to tomorrow', keys: [] },
  { id: 'weekLater', group: 'The selected or focused item', label: 'Move a week later', keys: [] },
  { id: 'inbox', group: 'The selected or focused item', label: 'Move to the inbox (no date)', keys: [] },
  { id: 'p0', group: 'The selected or focused item', label: 'No priority', keys: ['0'] },
  { id: 'p1', group: 'The selected or focused item', label: 'Priority !', keys: ['1'] },
  { id: 'p2', group: 'The selected or focused item', label: 'Priority !!', keys: ['2'] },
  { id: 'p3', group: 'The selected or focused item', label: 'Priority !!!', keys: ['3'] },
  { id: 'menu', group: 'The selected or focused item', label: 'Open the right-click menu', keys: ['ContextMenu', 'Shift+F10'] },
  { id: 'selectAll', group: 'Selecting', label: 'Select everything on screen', keys: ['Ctrl+A'] },
  { id: 'shortcuts', group: 'Selecting', label: 'Show these shortcuts', keys: ['?'] },
];

// Shortcuts that aren't rebindable (browser or app-wide), listed for reference.
const FIXED = [
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+S', 'Publish'], ['Ctrl+K', 'Quick add'],
  ['Ctrl+C / Ctrl+V', 'Copy tasks / paste onto the day under the pointer'], ['Esc', 'Clear the selection, close boxes'],
  ['Tab (in quick add)', 'Switch between task, note, goal, project'],
];

const KEY = 'dusk.keys';
let custom = {};
try { custom = JSON.parse(store.get(KEY) || '{}') || {}; } catch { custom = {}; }
let map = null;

export const keysFor = (id) => custom[id] ?? ACTIONS.find((a) => a.id === id)?.keys ?? [];

function rebuild() {
  map = new Map();
  for (const a of ACTIONS) for (const k of keysFor(a.id)) map.set(k, a.id);
}
rebuild();

function persist() {
  store.set(KEY, JSON.stringify(custom));
  rebuild();
}

// Turn a keyboard event into a name like "Shift+N". Shift is only written for letters and named keys,
// since symbols like "?" already include it.
export function comboOf(e) {
  let k = e.key;
  if (!k || ['Shift', 'Control', 'Alt', 'Meta', 'Dead', 'Unidentified'].includes(k)) return null;
  if (k === ' ') k = 'Space';
  const printable = k.length === 1;
  if (printable) k = k.toUpperCase();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && (!printable || /[A-Z]/.test(k) || parts.length)) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

export const actionFor = (e) => { const c = comboOf(e); return c ? map.get(c) || null : null; };

const PRETTY = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Delete: 'Del', Backspace: '⌫', ContextMenu: 'Menu', Space: 'Space', Enter: 'Enter' };
export const prettyKey = (combo) => combo.split('+').map((p) => PRETTY[p] || p).join('+');
// The first key bound to an action, for menu hints ('' if none).
export const hint = (id) => (keysFor(id)[0] ? prettyKey(keysFor(id)[0]) : '');

/* ---------------- the Shortcuts window ---------------- */

let el = null;
let capturing = null; // action id waiting for a key

export function closeShortcuts() { el?.remove(); el = null; capturing = null; window.removeEventListener('keydown', onCapture, true); }
export const shortcutsOpen = () => !!el;

function draw() {
  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  el.querySelector('.keys-body').innerHTML = groups.map((g) => `
    <section><h3>${esc(g)}</h3>
      ${ACTIONS.filter((a) => a.group === g).map((a) => `
        <div class="key-row${capturing === a.id ? ' capturing' : ''}" data-action="${a.id}">
          <span class="key-label">${esc(a.label)}</span>
          <span class="key-chips">
            ${keysFor(a.id).map((k) => `<span class="key-chip"><kbd>${esc(prettyKey(k))}</kbd><button type="button" data-remove="${esc(k)}" aria-label="Remove ${esc(k)}">×</button></span>`).join('')}
            ${capturing === a.id ? '<span class="key-wait">Press a key… (Esc to cancel)</span>' : `<button type="button" class="key-add" data-add aria-label="Add a key for ${esc(a.label)}">+ key</button>`}
          </span>
        </div>`).join('')}
    </section>`).join('') + `
    <section class="fixed"><h3>Always</h3>${FIXED.map(([k, l]) => `<div class="key-row"><span class="key-label">${esc(l)}</span><span class="key-chips"><kbd>${esc(k)}</kbd></span></div>`).join('')}</section>`;
}

function onCapture(e) {
  if (!capturing) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { capturing = null; draw(); return; }
  const combo = comboOf(e);
  if (!combo) return; // a lone modifier: keep waiting
  const id = capturing;
  capturing = null;
  window.removeEventListener('keydown', onCapture, true);
  // A key can only do one thing: take it off whatever had it.
  const owner = ACTIONS.find((a) => a.id !== id && keysFor(a.id).includes(combo));
  if (owner) {
    custom[owner.id] = keysFor(owner.id).filter((k) => k !== combo);
    toast(`${prettyKey(combo)} moved from “${owner.label}”`);
  }
  if (!keysFor(id).includes(combo)) custom[id] = [...keysFor(id), combo];
  persist();
  draw();
}

export function openShortcuts() {
  closeShortcuts();
  el = document.createElement('div');
  el.className = 'keys-backdrop';
  el.innerHTML = `
    <div class="keys" role="dialog" aria-label="Keyboard shortcuts">
      <header><h2>Keyboard shortcuts</h2><span class="spacer"></span>
        <button type="button" class="btn ghost small" data-reset>Reset all</button>
        <button type="button" class="icon-btn" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </header>
      <p class="keys-lead">Click “+ key” and press the key you want. Click × to remove one. Saved in this browser.</p>
      <div class="keys-body"></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeShortcuts(); });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeShortcuts();
    if (e.target.closest('[data-reset]')) { custom = {}; persist(); draw(); toast('Shortcuts reset'); return; }
    const row = e.target.closest('[data-action]');
    if (!row) return;
    const id = row.dataset.action;
    const rm = e.target.closest('[data-remove]');
    if (rm) { custom[id] = keysFor(id).filter((k) => k !== rm.dataset.remove); persist(); draw(); return; }
    if (e.target.closest('[data-add]')) {
      capturing = id;
      window.addEventListener('keydown', onCapture, true);
      draw();
    }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !capturing) { e.stopPropagation(); closeShortcuts(); } });
  draw();
  el.querySelector('[data-close]').focus();
}
