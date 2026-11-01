// Quick add: one box for tasks, goals and projects, with a live preview of what was understood.
// Opened with N or Ctrl/Cmd+K anywhere in the editor, the big + button, or a middle-click on a day.
// Pasting several lines adds one item per line.

import { parseQuick } from './parse.js';
import * as M from './model.js';
import { state, undo } from '../state.js';
import { esc, isoDate, parseLocal, weekStartOf, formatTimeRange, weekdaysLabel, dayLabel } from '../../core/util.js';
import { toast } from '../ui.js';
import { cleanLines } from './editors.js';

const KINDS = [
  { id: 'task', label: 'Task', hint: 'Lab report fri 5pm #school @project !!' },
  { id: 'note', label: 'Day note', hint: 'Essay due fri · Winter break dec 18 - jan 12 · Trash day every tue' },
  { id: 'day-goal', label: 'Daily goal', hint: 'Read 20 pages tomorrow' },
  { id: 'week-goal', label: 'Weekly goal', hint: 'Go to the gym 3x' },
  { id: 'project', label: 'Project', hint: 'Research paper due nov 20' },
];
const REPEAT_LABEL = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };

let el = null;
let opts = {};
let kind = 'task';
let onAdded = () => {};

export function setQuickAddHandler(fn) { onAdded = fn; }

const weekStart = () => state.cfg.board.weekStart || 'monday';

/**
 * Parse one line in a context. ctx: { kind, day?, week?, projectId? }
 * A day in the context is used when the text doesn't name one.
 */
export function resolveLine(text, ctx = {}) {
  const k = ctx.kind || 'task';
  const p = parseQuick(text, { projects: state.cfg.data.projects.filter((x) => !x.archived), kind: k });
  const ctxDay = ctx.day ? parseLocal(ctx.day) : null;
  if (k === 'task') {
    if (!p.date && (ctxDay || p.repeat !== 'none' || p.time)) p.date = ctxDay || new Date();
  } else if (k === 'day-goal' || k === 'note') {
    p.date = p.date || ctxDay || new Date();
  } else if (k === 'week-goal') {
    p.date = weekStartOf(p.date || (ctx.week ? parseLocal(ctx.week) : new Date()), weekStart());
  }
  if (p.week && k === 'task') p.date = weekStartOf(p.date, weekStart());
  p.dateKey = p.date ? isoDate(p.date) : '';
  return p;
}

// Create the item a parsed line describes. Returns { kind, item, where }.
export function createParsed(p, ctx = {}) {
  const k = ctx.kind || 'task';
  if (k === 'task') {
    let projectId = p.project?.id || ctx.projectId || '';
    if (p.newProject) {
      const name = p.newProject[0].toUpperCase() + p.newProject.slice(1);
      projectId = (state.cfg.data.projects.find((x) => x.title.toLowerCase() === name.toLowerCase()) || M.addProject({ title: name })).id;
    }
    const item = M.addTask({ title: p.title, date: p.dateKey, time: p.time, end: p.end, category: p.category, repeat: p.repeat, weekdays: p.weekdays, priority: p.priority, projectId });
    return { kind: 'task', item, where: p.dateKey ? dayLabel(p.date) : projectId ? M.findProject(projectId).title : 'Inbox' };
  }
  if (k === 'note') {
    const item = M.addNote({ date: p.dateKey, end: p.endKey, text: p.title, repeat: p.repeat, weekdays: p.weekdays, until: p.untilKey });
    return { kind: 'note', item, where: p.endKey ? `notes, ${dayLabel(p.date)} to ${dayLabel(p.endDate)}` : `notes for ${dayLabel(p.date)}` };
  }
  if (k === 'day-goal' || k === 'week-goal') {
    const item = M.addGoal({ scope: k === 'day-goal' ? 'day' : 'week', date: p.dateKey, title: p.title, target: p.target });
    return { kind: k, item, where: k === 'day-goal' ? `goals for ${dayLabel(p.date)}` : 'weekly goals' };
  }
  return { kind: 'project', item: M.addProject({ title: p.title, due: p.dueKey }), where: 'projects' };
}

// Add several lines at once (pasted lists) as one undo step.
export function addLines(lines, ctx = {}) {
  const made = [];
  M.batch(() => {
    for (const line of lines) {
      const p = resolveLine(line, ctx);
      if (!p.title) p.title = line;
      made.push(createParsed(p, ctx));
    }
  });
  return made;
}

function chips(p) {
  const out = [];
  const chip = (icon, text, cls = '') => out.push(`<span class="qa-chip ${cls}"><i>${icon}</i>${esc(text)}</span>`);
  if (kind === 'task') {
    if (p.date) chip('◷', `${dayLabel(p.date)}${p.time ? `, ${formatTimeRange(p.dateKey, p.time, p.end)}` : ''}`);
    else chip('▢', 'No date: goes to the inbox', 'muted');
    if (p.repeat !== 'none') chip('↻', p.weekdays?.length > 1 ? `Every ${weekdaysLabel(p.weekdays).replace('Weekdays', 'weekday').replace('Weekends', 'weekend')}` : REPEAT_LABEL[p.repeat]);
    if (p.priority) chip('!', ['', 'Priority', 'High priority', 'Urgent'][p.priority], 'prio');
    if (p.category) chip('#', p.category);
    if (p.project) chip('◆', p.project.title);
    if (p.newProject) chip('◆', `New project: ${p.newProject}`, 'new');
  } else if (kind === 'note') {
    if (p.endDate) chip('◷', `${dayLabel(p.date)} to ${dayLabel(p.endDate)}`);
    else chip('◷', dayLabel(p.date));
    if (p.repeat !== 'none') chip('↻', `${p.weekdays?.length > 1 ? `Every ${weekdaysLabel(p.weekdays)}` : REPEAT_LABEL[p.repeat]}${p.until ? ` until ${dayLabel(p.until)}` : ''}`);
    chip('✎', p.endDate ? 'One note across those days' : 'A note on the day, not a task', 'muted');
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
  return out.join('');
}

const ctxNow = () => ({ kind, day: opts.day, week: opts.week, projectId: opts.projectId });

function render() {
  const k = KINDS.find((x) => x.id === kind);
  el.querySelectorAll('.qa-kind').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === kind)));
  const input = el.querySelector('.qa-input');
  input.placeholder = k.hint;
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`;
  const lines = cleanLines(input.value);
  const prev = el.querySelector('.qa-preview');
  if (!lines.length) {
    prev.innerHTML = '<span class="qa-chip muted">Type a title. Dates, times, #categories, @projects and ! priority are picked up as you type. Paste a list to add several.</span>';
  } else if (lines.length === 1) {
    prev.innerHTML = chips(resolveLine(lines[0], ctxNow()));
  } else {
    const shown = lines.slice(0, 8).map((l) => {
      const p = resolveLine(l, ctxNow());
      return `<li><b>${esc(p.title || l)}</b>${chips(p)}</li>`;
    }).join('');
    prev.innerHTML = `<div class="qa-multi"><span class="qa-count">${lines.length} ${{ project: 'projects', task: 'tasks', note: 'notes' }[kind] || 'goals'}, one per line</span><ul>${shown}</ul>${lines.length > 8 ? `<span class="qa-count">and ${lines.length - 8} more</span>` : ''}</div>`;
  }
}

function add(keepOpen) {
  const input = el.querySelector('.qa-input');
  const lines = cleanLines(input.value);
  if (!lines.length) return;
  if (lines.length > 1) {
    const made = addLines(lines, ctxNow());
    for (const m of made) onAdded(m);
    toast(`Added ${made.length} items`, false, { label: 'Undo', fn: undo });
  } else {
    const p = resolveLine(lines[0], ctxNow());
    if (!p.title) { toast('Add a title as well as a date', true); return; }
    const made = createParsed(p, ctxNow());
    onAdded(made);
    toast(`Added to ${made.where}`, false, { label: 'Undo', fn: undo });
  }
  input.value = '';
  render();
  if (!keepOpen) closeQuickAdd();
}

export function closeQuickAdd() {
  el?.remove();
  el = null;
  opts.restoreFocus?.focus?.({ preventScroll: true });
}

export function isQuickAddOpen() { return !!el; }

/**
 * @param {{ kind?: string, day?: string, week?: string, projectId?: string, text?: string, fromMiddleClick?: boolean }} o
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
      <textarea class="qa-input" rows="1" autocomplete="off" spellcheck="false" aria-label="Title"></textarea>
      <div class="qa-preview" aria-live="polite"></div>
      <div class="qa-help"><span><kbd>Enter</kbd> add</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> add another</span><span><kbd>Tab</kbd> switch type</span><span><kbd>Esc</kbd> close</span></div>
    </div>`;
  document.body.appendChild(el);
  const input = el.querySelector('.qa-input');
  if (o.text) input.value = o.text;
  if (o.day) el.querySelector('.qa-help').insertAdjacentHTML('afterbegin', `<span>For ${esc(dayLabel(parseLocal(o.day)))} unless you type a date</span>`);
  if (o.projectId) {
    const pr = M.findProject(o.projectId);
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
