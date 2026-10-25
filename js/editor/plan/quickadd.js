// Quick add: one input for tasks, goals and projects, with a live preview of what was understood.
// Opened with N or Ctrl/Cmd+K anywhere in the editor, the big + button, or a middle-click on a day.

import { parseQuick } from './parse.js';
import * as M from './model.js';
import { state, undo } from '../state.js';
import { esc, isoDate, parseLocal, weekStartOf, formatTime, dayLabel } from '../../core/util.js';
import { toast } from '../ui.js';

const KINDS = [
  { id: 'task', label: 'Task', hint: 'Lab report fri 5pm #school @project' },
  { id: 'day-goal', label: 'Daily goal', hint: 'Read 20 pages tomorrow' },
  { id: 'week-goal', label: 'Weekly goal', hint: 'Go to the gym 3x' },
  { id: 'project', label: 'Project', hint: 'Research paper due nov 20' },
];

let el = null;
let opts = {};
let kind = 'task';
let onAdded = () => {};

export function setQuickAddHandler(fn) { onAdded = fn; }

const weekStart = () => state.cfg.board.weekStart || 'monday';

function resolve(text) {
  const p = parseQuick(text, { projects: state.cfg.data.projects.filter((x) => !x.archived), kind });
  const ctxDay = opts.day ? parseLocal(opts.day) : null;
  if (kind === 'task') {
    if (!p.date && (ctxDay || p.repeat !== 'none' || p.time)) p.date = ctxDay || new Date();
  } else if (kind === 'day-goal') {
    p.date = p.date || ctxDay || new Date();
  } else if (kind === 'week-goal') {
    p.date = weekStartOf(p.date || (opts.week ? parseLocal(opts.week) : new Date()), weekStart());
  }
  if (p.week && kind === 'task') p.date = weekStartOf(p.date, weekStart());
  p.dateKey = p.date ? isoDate(p.date) : '';
  return p;
}

function preview(p) {
  const chips = [];
  const chip = (icon, text, cls = '') => chips.push(`<span class="qa-chip ${cls}"><i>${icon}</i>${esc(text)}</span>`);
  if (kind === 'task') {
    if (p.date) chip('◷', `${dayLabel(p.date)}${p.time ? `, ${formatTime(parseLocal(p.dateKey, p.time))}` : ''}`);
    else chip('▢', 'No date: goes to the inbox', 'muted');
    if (p.repeat !== 'none') chip('↻', { daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' }[p.repeat]);
    if (p.category) chip('#', p.category);
    if (p.project) chip('◆', p.project.title);
    if (p.newProject) chip('◆', `New project: ${p.newProject}`, 'new');
  } else if (kind === 'day-goal') {
    chip('◷', dayLabel(p.date));
    if (p.target > 1) chip('×', `${p.target} times`);
  } else if (kind === 'week-goal') {
    const label = isoDate(p.date) === isoDate(weekStartOf(new Date(), weekStart())) ? 'This week' : `Week of ${p.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    chip('◷', label);
    chip('×', p.target > 1 ? `${p.target} times` : 'Once');
  } else if (kind === 'project') {
    chip('◷', p.due ? `Due ${dayLabel(p.due)}` : 'No due date', p.due ? '' : 'muted');
  }
  return chips.join('');
}

function render() {
  const k = KINDS.find((x) => x.id === kind);
  el.querySelectorAll('.qa-kind').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  const input = el.querySelector('.qa-input');
  input.placeholder = k.hint;
  const text = input.value.trim();
  el.querySelector('.qa-preview').innerHTML = text ? preview(resolve(text)) : '<span class="qa-chip muted">Type a title. Dates, times, #categories and @projects are picked up as you type.</span>';
}

function add(keepOpen) {
  const input = el.querySelector('.qa-input');
  const text = input.value.trim();
  if (!text) return;
  const p = resolve(text);
  if (!p.title) { toast('Add a title as well as a date', true); return; }
  let created;
  let where = '';
  if (kind === 'task') {
    let projectId = p.project?.id || opts.projectId || '';
    if (p.newProject) projectId = M.addProject({ title: p.newProject[0].toUpperCase() + p.newProject.slice(1) }).id;
    created = { kind: 'task', item: M.addTask({ title: p.title, date: p.dateKey, time: p.time, category: p.category, repeat: p.repeat, projectId }) };
    where = p.dateKey ? dayLabel(p.date) : projectId ? M.findProject(projectId).title : 'Inbox';
  } else if (kind === 'day-goal' || kind === 'week-goal') {
    created = { kind, item: M.addGoal({ scope: kind === 'day-goal' ? 'day' : 'week', date: p.dateKey, title: p.title, target: p.target }) };
    where = kind === 'day-goal' ? `goals for ${dayLabel(p.date)}` : 'weekly goals';
  } else {
    created = { kind: 'project', item: M.addProject({ title: p.title, due: p.dueKey }) };
    where = 'projects';
  }
  onAdded(created);
  toast(`Added to ${where}`, false, { label: 'Undo', fn: undo });
  input.value = '';
  render();
  if (!keepOpen) closeQuickAdd();
}

export function closeQuickAdd() {
  el?.remove();
  el = null;
  opts.restoreFocus?.focus?.();
}

export function isQuickAddOpen() { return !!el; }

/**
 * @param {{ kind?: string, day?: string, week?: string, projectId?: string, text?: string }} o
 */
export function openQuickAdd(o = {}) {
  closeQuickAdd();
  opts = { ...o, restoreFocus: document.activeElement };
  kind = o.kind || 'task';
  el = document.createElement('div');
  el.className = 'qa-backdrop';
  el.innerHTML = `
    <div class="qa" role="dialog" aria-label="Quick add">
      <div class="qa-kinds" role="group" aria-label="What to add">
        ${KINDS.map((k) => `<button type="button" class="qa-kind" data-kind="${k.id}">${k.label}</button>`).join('')}
      </div>
      <input class="qa-input" type="text" autocomplete="off" spellcheck="false" aria-label="Title">
      <div class="qa-preview" aria-live="polite"></div>
      <div class="qa-help"><span><kbd>Enter</kbd> add</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> add another</span><span><kbd>Tab</kbd> switch type</span><span><kbd>Esc</kbd> close</span></div>
    </div>`;
  document.body.appendChild(el);
  const input = el.querySelector('.qa-input');
  if (o.text) input.value = o.text;
  if (o.projectId) {
    const pr = M.findProject(o.projectId);
    if (pr && !o.text) input.value = '';
    el.querySelector('.qa-help').insertAdjacentHTML('afterbegin', `<span>Adding to ${esc(pr?.title || '')}</span>`);
  }
  el.addEventListener('pointerdown', (e) => { if (e.target === el) closeQuickAdd(); });
  el.querySelectorAll('.qa-kind').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; render(); input.focus(); }));
  // On Linux a middle-click also pastes the current selection; ignore that paste when we were opened by one.
  const openedAt = Date.now();
  input.addEventListener('paste', (e) => { if (o.fromMiddleClick && Date.now() - openedAt < 600) e.preventDefault(); });
  window.getSelection()?.removeAllRanges();
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closeQuickAdd(); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const i = KINDS.findIndex((k) => k.id === kind);
      kind = KINDS[(i + (e.shiftKey ? -1 : 1) + KINDS.length) % KINDS.length].id;
      render();
    }
  });
  render();
  input.focus();
}
