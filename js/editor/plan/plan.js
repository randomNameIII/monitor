// Plan tab: a continuous, horizontally scrolling strip of days, with weekly goals, projects and an
// inbox beside it. Everything is direct manipulation: drag to move, drag across empty space to select
// several things, right-click for options, click to edit in place, double-click a day (or press N) to add.

import { state, onChange, undo, commit } from '../state.js';
import { esc, isoDate, addDays, parseLocal, weekStartOf, formatTime, dayLabel, occurrences, startOfDay, daysBetween } from '../../core/util.js';
import { goalsForDay, goalsForWeek, isGoalDone, projectProgress, nextProjectTask, byOrder, categoryHue, daysUntil } from '../../core/planning.js';
import { uid } from '../../core/config.js';
import * as M from './model.js';
import { parseQuick } from './parse.js';
import { enableDrag } from './drag.js';
import { enableMarquee, paintSelection, clearSelection, toggleSelected, isSelected, selectedItems, selectionSize, setSelection, keyOf, onSelectionChange } from './select.js';
import { openMenu, closeMenu } from './menu.js';
import { closePopover } from './popover.js';
import { editTask, editGoal, editProject, deleteWithUndo } from './editors.js';
import { openQuickAdd, setQuickAddHandler, isQuickAddOpen } from './quickadd.js';
import { parseICS } from '../ics.js';
import { toast } from '../ui.js';

const $ = (id) => document.getElementById(id);
const root = document.querySelector('[data-panel="plan"]');
const weekEl = $('planWeek'); // the timeline
const listEl = $('planList');
const sideEl = $('planSide');
const scrollEl = $('planMain');

const ws = () => state.cfg.board.weekStart || 'monday';

// The timeline renders whole weeks from rangeStart and grows in either direction as you scroll.
let rangeStart = addDays(weekStartOf(new Date(), ws()), -14);
let rangeWeeks = 10;
let colW = 200;
// The week the sidebar's goals belong to: the week of today when today is on screen, otherwise the
// week in the middle of the screen.
let focusWeek = weekStartOf(new Date(), ws());
let firstVisible = '';
let positioned = false;
let view = 'week';
let inline = null;          // { zone, value } — which inline add box is open
let flash = null;           // id of an item to highlight after it's added
const expanded = new Set(); // project ids open in the sidebar
let showArchived = false;
let listFilter = { q: '', done: false, past: false };

const ev = () => state.cfg.data.events;
const todayKey = () => isoDate(new Date());
const visible = () => !root.hidden;
const REPEAT_LABEL = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' };

/* ====================================================================== */
/* Rendering                                                              */
/* ====================================================================== */

function edgeHue(t) {
  const p = t.projectId && M.findProject(t.projectId);
  if (p) return p.hue;
  if (t.category) return categoryHue(t.category);
  return null;
}

function taskCard(t, { day = '', compact = false, showDate = false } = {}) {
  const done = day ? M.isTaskDoneOn(t, day) : !!t.done;
  const repeating = t.repeat && t.repeat !== 'none';
  const overdue = !done && day && day < todayKey() && !repeating;
  const hue = edgeHue(t);
  const proj = t.projectId && M.findProject(t.projectId);
  const meta = [];
  if (showDate && t.date) meta.push(`<span class="m-date">${esc(dayLabel(parseLocal(t.date)))}</span>`);
  if (t.time) meta.push(`<span class="m-time">${formatTime(parseLocal(t.date || todayKey(), t.time))}</span>`);
  if (repeating) meta.push(`<span title="${REPEAT_LABEL[t.repeat]}">↻</span>`);
  if (t.category) meta.push(`<span class="m-cat">#${esc(t.category)}</span>`);
  if (proj && !compact) meta.push(`<span class="m-proj">${esc(proj.title)}</span>`);
  if (t.notes) meta.push('<span title="Has notes">¶</span>');
  return `<li class="task${done ? ' done' : ''}${overdue ? ' overdue' : ''}${flash === t.id ? ' flash' : ''}" tabindex="0"
      data-drag="task" data-id="${t.id}" data-day="${day}" data-ordered="${t.time ? 'false' : 'true'}"
      ${hue != null ? `style="--h:${hue}"` : ''}>
      <button type="button" class="tick${done ? ' on' : ''}" data-act="tick" aria-label="${done ? 'Mark not done' : 'Mark done'}"></button>
      <div class="task-main">
        <span class="task-title">${esc(t.title)}</span>
        ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
      </div>
    </li>`;
}

function pips(g) {
  const target = g.target || 1;
  if (target === 1) return `<button type="button" class="tick${isGoalDone(g) ? ' on' : ''}" data-act="goal-bump" aria-label="Toggle done"></button>`;
  const shown = Math.min(target, 10);
  const filled = Math.round(((g.count || 0) / target) * shown);
  return `<button type="button" class="pips" data-act="goal-bump" title="Click to add one · Shift+click or right-click to undo one" aria-label="${g.count || 0} of ${target}">
    ${Array.from({ length: shown }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')}</button>`;
}

function goalItem(g, kind) {
  const target = g.target || 1;
  return `<li class="goal${isGoalDone(g) ? ' done' : ''}${flash === g.id ? ' flash' : ''}" tabindex="0" data-drag="${kind}" data-id="${g.id}">
    ${pips(g)}
    <span class="goal-title" data-act="goal-edit">${esc(g.title)}</span>
    ${target > 1 ? `<span class="goal-count">${g.count || 0}/${target}</span>` : ''}
  </li>`;
}

function inlineBox(zone, placeholder) {
  if (inline?.zone !== zone) return '';
  return `<div class="inline-add"><input data-inline="${zone}" value="${esc(inline.value || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div>`;
}

function addButton(zone, label) {
  if (inline?.zone === zone) return '';
  return `<button type="button" class="add-row" data-act="inline" data-target="${zone}">+ ${label}</button>`;
}

function sortDay(items) {
  return items.sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? 1 : -1; // untimed first
    if (!a.time) return (a.order ?? 0) - (b.order ?? 0);
    return a.time.localeCompare(b.time);
  });
}

const rangeDays = () => rangeWeeks * 7;
const indexOf = (key) => daysBetween(rangeStart, parseLocal(key));
const keyAt = (i) => isoDate(addDays(rangeStart, i));

function weekName(start) {
  const diff = Math.round(daysBetween(weekStartOf(new Date(), ws()), start) / 7);
  if (diff === 0) return 'This week';
  if (diff === 1) return 'Next week';
  if (diff === -1) return 'Last week';
  return `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function renderTimeline() {
  const today = todayKey();
  const n = rangeDays();
  const occ = occurrences(ev(), { from: rangeStart, days: n });
  const byDay = new Map();
  for (const o of occ) (byDay.get(o.day) || byDay.set(o.day, []).get(o.day)).push(o);
  const thisWeek = isoDate(weekStartOf(new Date(), ws()));

  let bands = '';
  for (let w = 0; w < rangeWeeks; w++) {
    const start = addDays(rangeStart, w * 7);
    const key = isoDate(start);
    const goals = goalsForWeek(state.cfg.data.goals, start);
    const done = goals.filter(isGoalDone).length;
    const end = addDays(start, 6);
    const range = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, start.getMonth() === end.getMonth() ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
    bands += `<div class="wband${key === thisWeek ? ' this' : ''}${key === isoDate(focusWeek) ? ' focus' : ''}" style="grid-column:${w * 7 + 1} / span 7" data-week="${key}" data-act="week-band">
      <span class="wband-label"><b>${weekName(start)}</b><span>${range}</span>${goals.length ? `<span class="wband-goals${done === goals.length ? ' all' : ''}">${done}/${goals.length} goals</span>` : ''}</span>
    </div>`;
  }

  let days = '';
  for (let i = 0; i < n; i++) {
    const d = addDays(rangeStart, i);
    const key = isoDate(d);
    const items = sortDay(byDay.get(key) || []);
    const goals = goalsForDay(state.cfg.data.goals, key);
    const gDone = goals.filter(isGoalDone).length;
    const showMonth = i === 0 || d.getDate() === 1;
    days += `<section class="day${key === today ? ' today' : ''}${key < today ? ' past' : ''}${i % 7 === 0 ? ' wstart' : ''}" style="grid-column:${i + 1}" data-drop data-accept="task day-goal week-goal" data-zone="day" data-day="${key}">
      <header class="day-head" data-act="day-menu">
        <span class="dow">${d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span class="dnum">${d.getDate()}</span>
        ${showMonth ? `<span class="dmon">${d.toLocaleDateString(undefined, { month: 'short' })}</span>` : ''}
        <span class="dspace"></span>
        ${goals.length ? `<span class="dgoals${gDone === goals.length ? ' all' : ''}" title="Daily goals done">${gDone}/${goals.length}</span>` : ''}
        <button type="button" class="dg-add" data-act="inline" data-target="dgoal:${key}" title="Add a goal for this day">+ goal</button>
      </header>
      ${goals.length || inline?.zone === `dgoal:${key}` ? `<ul class="goal-list day-goals">${goals.map((g) => goalItem(g, 'day-goal')).join('')}</ul>${inlineBox(`dgoal:${key}`, 'Goal for the day')}` : ''}
      <ol class="tasks">${items.map((t) => taskCard(t, { day: key })).join('')}</ol>
      ${inlineBox(`day:${key}`, 'New task, e.g. Essay 3pm #school')}
      ${addButton(`day:${key}`, 'Add')}
    </section>`;
  }
  weekEl.style.setProperty('--colw', `${colW}px`);
  weekEl.style.setProperty('--days', n);
  weekEl.innerHTML = bands + days;
}

/* ----------------------------- scrolling ----------------------------- */

function visibleRange() {
  const first = Math.max(0, Math.floor((scrollEl.scrollLeft + 2) / colW));
  const last = Math.min(rangeDays() - 1, Math.floor((scrollEl.scrollLeft + scrollEl.clientWidth - 2) / colW));
  return { first, last };
}

function computeFocus() {
  const { first, last } = visibleRange();
  const t = indexOf(todayKey());
  const anchor = t >= first && t <= last ? t : Math.floor((first + last) / 2);
  return weekStartOf(addDays(rangeStart, anchor), ws());
}

// Grow the rendered range so `key` has at least a week of room on both sides.
function ensureRange(key) {
  const i = indexOf(key);
  let grew = false;
  if (i < 7) {
    const weeks = Math.ceil((7 - i) / 7) + 3;
    rangeStart = addDays(rangeStart, -weeks * 7);
    rangeWeeks += weeks;
    renderTimeline();
    scrollEl.scrollLeft += weeks * 7 * colW;
    grew = true;
  }
  if (indexOf(key) > rangeDays() - 8) {
    rangeWeeks += Math.ceil((indexOf(key) - rangeDays() + 8) / 7) + 3;
    renderTimeline();
    grew = true;
  }
  if (grew) paintSelection(root);
  return grew;
}

// Put `key` at the left edge, with `before` days of context to its left.
function scrollToDay(key, { smooth = false, before = 1 } = {}) {
  ensureRange(isoDate(addDays(parseLocal(key), -before - 7)));
  ensureRange(isoDate(addDays(parseLocal(key), 14)));
  const left = Math.max(0, (indexOf(key) - before) * colW);
  // Long trips jump; short ones glide.
  const far = Math.abs(left - scrollEl.scrollLeft) > scrollEl.clientWidth * 2;
  scrollEl.scrollTo({ left, behavior: smooth && !far ? 'smooth' : 'auto' });
}

function isDayVisible(key) {
  const { first, last } = visibleRange();
  const i = indexOf(key);
  return i >= first && i <= last;
}

function revealDay(key) {
  if (!isDayVisible(key)) scrollToDay(key, { smooth: true });
}

function goDays(delta) {
  closePopover();
  const { first } = visibleRange();
  const target = keyAt(first + delta);
  ensureRange(isoDate(addDays(parseLocal(target), -7)));
  ensureRange(isoDate(addDays(parseLocal(target), 21)));
  scrollEl.scrollTo({ left: indexOf(target) * colW, behavior: 'smooth' });
}

function goToday() {
  closePopover();
  scrollToDay(todayKey(), { smooth: positioned });
}

let scrollQueued = false;
function onScroll() {
  if (view !== 'week' || scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const { first, last } = visibleRange();
    // Load more weeks before the edge comes into view.
    if (first < 7) ensureRange(keyAt(first));
    else if (last > rangeDays() - 8) ensureRange(keyAt(last));
    const f = computeFocus();
    const firstKey = keyAt(visibleRange().first);
    if (isoDate(f) !== isoDate(focusWeek) || firstKey !== firstVisible) {
      const weekChanged = isoDate(f) !== isoDate(focusWeek);
      focusWeek = f;
      firstVisible = firstKey;
      if (weekChanged) weekEl.querySelectorAll('.wband').forEach((b) => b.classList.toggle('focus', b.dataset.week === isoDate(focusWeek)));
      render({ timeline: false });
    } else {
      renderBar();
    }
  });
}

// Columns fill the screen 7 at a time on wide screens, and never get narrower than 168px.
function sizeColumns() {
  const w = scrollEl.clientWidth;
  if (!w) return;
  const next = Math.max(168, Math.floor(w / 7));
  if (next === colW && positioned) return;
  const anchor = positioned ? visibleRange().first : null;
  colW = next;
  weekEl.style.setProperty('--colw', `${colW}px`);
  if (!positioned) { positioned = true; scrollToDay(todayKey()); }
  else if (anchor != null) scrollEl.scrollLeft = anchor * colW;
}

function renderSide() {
  const d = state.cfg.data;
  const today = todayKey();
  const start = isoDate(focusWeek);
  const leftEdge = firstVisible || today;
  let html = '';

  // Overdue: unfinished one-off tasks from before today that are off the left of the screen.
  const overdue = ev().filter((t) => t.date && (!t.repeat || t.repeat === 'none') && !t.done && t.date < today && t.date < leftEdge)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (overdue.length) {
    html += `<section class="side-block overdue-block">
      <header><h2>Overdue</h2><span class="count">${overdue.length}</span></header>
      <p class="side-hint">Drag onto a day to reschedule.</p>
      <ol class="tasks compact">${overdue.map((t) => taskCard(t, { day: t.date, showDate: true })).join('')}</ol>
    </section>`;
  }

  // Week goals
  const goals = goalsForWeek(d.goals, focusWeek);
  const done = goals.filter(isGoalDone).length;
  const prevGoals = goalsForWeek(d.goals, addDays(focusWeek, -7)).filter((g) => !isGoalDone(g) && g.carriedTo !== start);
  html += `<section class="side-block" data-drop data-accept="week-goal day-goal" data-zone="week">
    <header><h2>Goals</h2><span class="week-pill" title="Follows the week you’re looking at">${weekName(focusWeek)}</span>${goals.length ? `<span class="count">${done} of ${goals.length}</span>` : ''}
      <button type="button" class="icon-add" data-act="inline" data-target="week" aria-label="Add a week goal">+</button></header>
    ${goals.length ? `<div class="week-bar"><i style="width:${(done / goals.length) * 100}%"></i></div>` : ''}
    <ul class="goal-list">${goals.map((g) => goalItem(g, 'week-goal')).join('')}</ul>
    ${inlineBox('week', 'Goal for the week, e.g. Gym 3x')}
    ${!goals.length && inline?.zone !== 'week' ? `<p class="side-hint">What do you want to get done ${weekName(focusWeek) === 'This week' ? 'this week' : 'that week'}? Add “3x” for things you’ll do several times.</p>` : ''}
    ${prevGoals.length ? `<button type="button" class="carry" data-act="carry">Bring ${prevGoals.length} unfinished goal${prevGoals.length === 1 ? '' : 's'} from last week</button>` : ''}
  </section>`;

  // Projects
  const projects = d.projects.filter((p) => showArchived || !p.archived).sort(byOrder);
  const archivedCount = d.projects.filter((p) => p.archived).length;
  html += `<section class="side-block" data-drop data-accept="project" data-zone="projects">
    <header><h2>Projects</h2><button type="button" class="icon-add" data-act="new-project" aria-label="New project">+</button></header>
    ${projects.map(projectCard).join('') || '<p class="side-hint">Projects collect tasks toward something bigger. Their progress fills in as tasks get done.</p>'}
    ${archivedCount ? `<button type="button" class="link small-link" data-act="toggle-archived">${showArchived ? 'Hide' : 'Show'} archived (${archivedCount})</button>` : ''}
  </section>`;

  // Inbox
  const inbox = ev().filter((t) => !t.date && !t.projectId).sort(byOrder);
  html += `<section class="side-block inbox" data-drop data-accept="task" data-zone="inbox">
    <header><h2>Inbox</h2>${inbox.length ? `<span class="count">${inbox.length}</span>` : ''}</header>
    <ol class="tasks compact">${inbox.map((t) => taskCard(t)).join('')}</ol>
    ${inlineBox('inbox', 'Something to do, no date yet')}
    ${addButton('inbox', 'Add')}
    ${!inbox.length && inline?.zone !== 'inbox' ? '<p class="side-hint">Tasks without a date land here. Drag them onto a day when you know when.</p>' : ''}
  </section>`;

  sideEl.innerHTML = html;
}

function projectCard(p) {
  const prog = projectProgress(p, ev());
  const open = expanded.has(p.id);
  const next = nextProjectTask(ev(), p.id);
  const dueIn = p.due ? daysUntil(p.due) : null;
  const due = p.due ? (dueIn < 0 ? `<span class="late">${-dueIn} day${dueIn === -1 ? '' : 's'} late</span>` : dueIn === 0 ? 'due today' : `due in ${dueIn} day${dueIn === 1 ? '' : 's'}`) : '';
  const meta = [prog.manual ? '' : `${prog.done} of ${prog.total} tasks`, due].filter(Boolean).join(' · ');
  let body = '';
  if (open) {
    const tasks = ev().filter((t) => t.projectId === p.id);
    const unscheduled = tasks.filter((t) => !t.date && !t.done).sort(byOrder);
    const scheduled = tasks.filter((t) => t.date && !t.done).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
    const doneTasks = tasks.filter((t) => t.done);
    body = `<ol class="tasks compact">${[...unscheduled.map((t) => taskCard(t, { compact: true })), ...scheduled.map((t) => taskCard(t, { compact: true, showDate: true, day: t.date }))].join('')}</ol>
      ${doneTasks.length ? `<details class="done-tasks"><summary>${doneTasks.length} done</summary><ol class="tasks compact">${doneTasks.map((t) => taskCard(t, { compact: true, showDate: !!t.date })).join('')}</ol></details>` : ''}
      ${inlineBox(`project:${p.id}`, 'Task for this project')}
      ${addButton(`project:${p.id}`, 'Add task')}`;
  }
  return `<div class="proj${open ? ' open' : ''}${p.archived ? ' archived' : ''}${flash === p.id ? ' flash' : ''}" style="--h:${p.hue}" tabindex="0"
      data-drag="project" data-id="${p.id}" data-drop data-accept="task" data-zone="project" data-project="${p.id}">
    <div class="proj-head" data-act="proj-toggle">
      <span class="chev" aria-hidden="true"></span>
      <span class="proj-name">${esc(p.title)}</span>
      <span class="proj-pct">${prog.pct}%</span>
      <button type="button" class="more" data-act="proj-menu" aria-label="Project options">⋯</button>
    </div>
    <div class="bar"><i style="width:${prog.pct}%"></i></div>
    ${meta || next ? `<div class="proj-meta">${meta}${next && !open ? `${meta ? '<br>' : ''}Next: ${esc(next.title)}` : ''}</div>` : ''}
    ${body}
  </div>`;
}

function renderBar() {
  const fmt = (d, opts) => d.toLocaleDateString(undefined, opts);
  root.querySelectorAll('.view-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  if (view !== 'week' || !positioned) { $('weekLabel').textContent = view === 'list' ? 'Everything' : ''; $('weekRel').textContent = ''; $('weekSummary').textContent = ''; return; }
  const { first, last } = visibleRange();
  const a = addDays(rangeStart, first), z = addDays(rangeStart, last);
  $('weekLabel').textContent = `${fmt(a, { month: 'short', day: 'numeric' })} – ${a.getMonth() === z.getMonth() ? z.getDate() : fmt(z, { month: 'short', day: 'numeric' })}`;
  const t = indexOf(todayKey());
  const todayOn = t >= first && t <= last;
  $('weekThis').hidden = todayOn;
  if (todayOn) $('weekRel').textContent = 'Today is on screen';
  else {
    const off = t < first ? first - t : last - t;
    const n = Math.abs(off);
    const unit = n >= 14 ? `${Math.round(n / 7)} weeks` : `${n} day${n === 1 ? '' : 's'}`;
    $('weekRel').textContent = off > 0 ? `${unit} ahead` : `${unit} back`;
  }
  const occ = occurrences(ev(), { from: a, days: last - first + 1 });
  $('weekSummary').textContent = occ.length ? `${occ.filter((o) => o.done).length} of ${occ.length} tasks done` : '';
}

/* ----------------------------- list view ----------------------------- */

function renderList() {
  const q = listFilter.q.toLowerCase();
  const today = todayKey();
  const rows = ev().filter((t) => {
    if (q && !`${t.title} ${t.category || ''} ${M.findProject(t.projectId)?.title || ''}`.toLowerCase().includes(q)) return false;
    const repeating = t.repeat && t.repeat !== 'none';
    if (!listFilter.done && !repeating && t.done) return false;
    const past = repeating ? (t.until && t.until < today) : (t.date && t.date < today);
    if (!listFilter.past && past && !(!t.done && !repeating)) return false;
    return true;
  }).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '').localeCompare(b.time || ''));

  const body = rows.map((t) => {
    const repeating = t.repeat && t.repeat !== 'none';
    const next = repeating ? occurrences([t], { from: new Date(), days: 400 })[0] : null;
    const at = next ? next.at : t.date ? parseLocal(t.date, t.time) : null;
    const when = at ? `${next ? 'Next: ' : ''}${dayLabel(at)}${t.time ? `, ${formatTime(at)}` : ''}` : '<span class="muted">No date</span>';
    const proj = M.findProject(t.projectId);
    const done = repeating ? false : !!t.done;
    return `<tr data-row="${t.id}" class="${done ? 'done' : ''}${!done && !repeating && t.date && t.date < today ? ' overdue' : ''}">
      <td class="c-tick"><button type="button" class="tick${done ? ' on' : ''}" data-act="list-tick" ${repeating ? 'disabled title="Tick repeating tasks off on the week board"' : ''} aria-label="Done"></button></td>
      <td class="nowrap">${at ? esc(when) : when}</td>
      <td class="c-title">${esc(t.title)}${t.source ? ` <span class="muted small">from ${esc(t.source)}</span>` : ''}</td>
      <td>${proj ? `<span class="m-proj" style="--h:${proj.hue}">${esc(proj.title)}</span>` : ''}</td>
      <td>${t.category ? `#${esc(t.category)}` : ''}</td>
      <td>${repeating ? `${REPEAT_LABEL[t.repeat]}${t.until ? ` until ${esc(t.until)}` : ''}` : ''}</td>
    </tr>`;
  }).join('');

  const tbody = listEl.querySelector('tbody');
  tbody.innerHTML = body || '<tr><td colspan="6" class="muted empty">Nothing matches. Press N to add something.</td></tr>';
}

/* ----------------------------- render all ----------------------------- */

export function render({ timeline = true } = {}) {
  if (!root) return;
  const focusId = root.contains(document.activeElement) ? document.activeElement.closest('[data-id]')?.dataset.id : null;
  const focusDay = root.contains(document.activeElement) ? document.activeElement.closest('[data-id]')?.dataset.day : null;
  const inlineFocused = document.activeElement?.dataset?.inline;
  const scroll = [scrollEl.scrollTop, scrollEl.scrollLeft, sideEl.scrollTop];

  weekEl.hidden = view !== 'week';
  listEl.hidden = view !== 'list';
  if (timeline) { if (view === 'week') renderTimeline(); else renderList(); }
  renderSide();
  renderBar();

  // Only touch scroll positions that changed: setting them cancels a smooth scroll in progress.
  if (scrollEl.scrollTop !== scroll[0]) scrollEl.scrollTop = scroll[0];
  if (scrollEl.scrollLeft !== scroll[1]) scrollEl.scrollLeft = scroll[1];
  if (sideEl.scrollTop !== scroll[2]) sideEl.scrollTop = scroll[2];
  paintSelection(root);
  renderSelectionBar();
  if (inlineFocused || (inline && inline.focus)) {
    const input = root.querySelector(`[data-inline="${inline?.zone}"]`);
    if (input) { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); }
    if (inline) inline.focus = false;
  } else if (focusId) {
    const els = [...root.querySelectorAll(`[data-id="${focusId}"]`)];
    (els.find((x) => (x.dataset.day || null) === (focusDay || null)) || els[0])?.focus({ preventScroll: true });
  }
  if (flash) {
    const id = flash;
    flash = null;
    const el = root.querySelector(`[data-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}

/* ----------------------------- selection ----------------------------- */

function renderSelectionBar() {
  const bar = $('selBar');
  const n = selectionSize();
  bar.hidden = n < 2;
  document.body.classList.toggle('has-selbar', n >= 2 && visible());
  if (n >= 2) $('selCount').textContent = `${n} selected`;
}

const selTasks = () => selectedItems().filter((x) => x.kind === 'task' && M.findTask(x.id));
const selGoals = () => selectedItems().filter((x) => x.kind === 'goal' && M.findGoal(x.id));

function bulkDone() {
  const tasks = selTasks(), goals = selGoals();
  const anyOpen = tasks.some((x) => !M.isTaskDoneOn(M.findTask(x.id), x.day || M.findTask(x.id).date)) || goals.some((x) => !isGoalDone(M.findGoal(x.id)));
  M.batch(() => {
    for (const x of tasks) { const t = M.findTask(x.id); if (M.isTaskDoneOn(t, x.day || t.date) !== anyOpen) M.toggleTask(x.id, x.day || t.date); }
    for (const x of goals) { const g = M.findGoal(x.id); M.updateGoal(x.id, { count: anyOpen ? g.target || 1 : 0 }); }
  });
  toast(anyOpen ? `Marked ${tasks.length + goals.length} done` : `Marked ${tasks.length + goals.length} not done`, false, { label: 'Undo', fn: undo });
}

// Shift everything by `delta` days. A repeating series moves once even if several of its days are selected.
function bulkShift(delta) {
  const seen = new Set();
  const newKeys = [];
  M.batch(() => {
    for (const x of selTasks()) {
      const t = M.findTask(x.id);
      const day = x.day || t.date;
      if (!day || seen.has(x.id)) { newKeys.push(`t:${x.id}:${x.day}`); continue; }
      seen.add(x.id);
      const to = isoDate(addDays(parseLocal(day), delta));
      M.moveTask(x.id, to, { fromDay: day });
      newKeys.push(`t:${x.id}:${x.day ? to : ''}`);
    }
    for (const x of selGoals()) {
      const g = M.findGoal(x.id);
      if (g.scope === 'day') M.moveGoal(x.id, { date: isoDate(addDays(parseLocal(g.date), delta)) });
      newKeys.push(`g:${x.id}`);
    }
  });
  setSelection(newKeys);
}

// Move everything onto one day (undated tasks get that date).
function bulkMoveTo(dayKey, { anchorDay = null } = {}) {
  // Dropping a multi-selection keeps the gaps between days: shift by how far the grabbed item moved.
  if (anchorDay) return bulkShift(daysBetween(parseLocal(anchorDay), parseLocal(dayKey)));
  const seen = new Set();
  const newKeys = [];
  M.batch(() => {
    for (const x of selTasks()) {
      if (seen.has(x.id)) continue;
      seen.add(x.id);
      M.moveTask(x.id, dayKey, { fromDay: x.day || null });
      newKeys.push(`t:${x.id}:${dayKey}`);
    }
    for (const x of selGoals()) { M.moveGoal(x.id, { scope: 'day', date: dayKey }); newKeys.push(`g:${x.id}`); }
  });
  setSelection(newKeys);
}

function bulkUnschedule(projectId) {
  const ids = [...new Set(selTasks().map((x) => x.id))];
  M.batch(() => { for (const id of ids) M.moveTask(id, '', projectId !== undefined ? { projectId } : {}); });
  setSelection(ids.map((id) => `t:${id}:`));
}

function bulkSet(patch) {
  const ids = [...new Set(selTasks().map((x) => x.id))];
  M.batch(() => { for (const id of ids) M.updateTask(id, patch); });
}

function bulkDelete() {
  const tasks = [...new Set(selTasks().map((x) => x.id))];
  const goals = selGoals().map((x) => x.id);
  M.batch(() => { for (const id of tasks) M.deleteTask(id); for (const id of goals) M.deleteGoal(id); });
  clearSelection();
  toast(`Deleted ${tasks.length + goals.length} item${tasks.length + goals.length === 1 ? '' : 's'}`, false, { label: 'Undo', fn: undo });
}

function selectionMenu(e) {
  const today = startOfDay(new Date());
  const cats = [...new Set(ev().map((x) => x.category).filter(Boolean))].sort();
  const n = selectionSize();
  const tasks = selTasks().length;
  openMenu(e, [
    { heading: `${n} selected` },
    { label: 'Mark done / not done', hint: 'Space', action: bulkDone },
    '-',
    { label: 'Move to', items: [
      { label: 'Today', action: () => bulkMoveTo(isoDate(today)) },
      { label: 'Tomorrow', action: () => bulkMoveTo(isoDate(addDays(today, 1))) },
      { label: 'Next week', action: () => bulkMoveTo(isoDate(weekStartOf(addDays(today, 7), ws()))) },
      '-',
      { label: 'One day later', hint: 'Alt+→', action: () => bulkShift(1) },
      { label: 'One day earlier', hint: 'Alt+←', action: () => bulkShift(-1) },
      { label: 'One week later', action: () => bulkShift(7) },
      '-',
      { label: 'Inbox (no date)', disabled: !tasks, action: () => bulkUnschedule() },
    ] },
    { label: 'Project', disabled: !tasks, items: [
      { label: 'None', action: () => bulkSet({ projectId: '' }) },
      ...state.cfg.data.projects.filter((p) => !p.archived).map((p) => ({ label: p.title, swatch: p.hue, action: () => bulkSet({ projectId: p.id }) })),
    ] },
    { label: 'Category', disabled: !tasks, items: [
      { label: 'None', action: () => bulkSet({ category: '' }) },
      ...cats.map((c) => ({ label: c, swatch: categoryHue(c), action: () => bulkSet({ category: c }) })),
    ] },
    '-',
    { label: 'Clear selection', hint: 'Esc', action: () => { clearSelection(); } },
    { label: `Delete ${n}`, hint: 'Del', danger: true, action: bulkDelete },
  ]);
}

function selectVisible() {
  const { first, last } = visibleRange();
  const keys = [];
  for (const el of weekEl.querySelectorAll('[data-drag="task"], [data-drag="day-goal"]')) {
    const day = el.dataset.day || el.closest('[data-day]')?.dataset.day;
    const i = day ? indexOf(day) : -1;
    if (i >= first && i <= last) keys.push(keyOf(el));
  }
  setSelection(keys);
}

/* ====================================================================== */
/* Actions                                                                */
/* ====================================================================== */

function openInline(zone) {
  inline = { zone, value: '', focus: true };
  render();
}

function submitInline(input) {
  const zone = input.dataset.inline;
  const text = input.value.trim();
  if (!text) { inline = null; render(); return; }
  const [type, arg] = zone.split(':');
  let item;
  if (type === 'day' || type === 'inbox' || type === 'project') {
    const p = parseQuick(text, { projects: state.cfg.data.projects, kind: 'task' });
    let projectId = type === 'project' ? arg : p.project?.id || '';
    if (p.newProject) projectId = M.addProject({ title: p.newProject[0].toUpperCase() + p.newProject.slice(1) }).id;
    let date = p.dateKey || (type === 'day' ? arg : '');
    if (!date && (p.time || p.repeat !== 'none')) date = todayKey();
    item = M.addTask({ title: p.title || text, date, time: p.time, category: p.category, repeat: p.repeat, projectId });
    if (date && type === 'day' && date !== arg) toast(`Added to ${dayLabel(parseLocal(date))}`, false, { label: 'Show', fn: () => { flash = item.id; scrollToDay(date, { smooth: true }); render(); } });
  } else if (type === 'week' || type === 'dgoal') {
    const p = parseQuick(text, { kind: type === 'week' ? 'week-goal' : 'day-goal' });
    item = M.addGoal({ scope: type === 'week' ? 'week' : 'day', date: type === 'week' ? isoDate(focusWeek) : arg, title: p.title || text, target: p.target });
  }
  flash = item?.id || null;
  inline = { zone, value: '', focus: true }; // keep it open for the next one
  render();
}

function carryOver() {
  const start = isoDate(focusWeek);
  const prev = goalsForWeek(state.cfg.data.goals, addDays(focusWeek, -7)).filter((g) => !isGoalDone(g) && g.carriedTo !== start);
  for (const g of prev) {
    g.carriedTo = start;
    state.cfg.data.goals.push({ id: uid(), scope: 'week', date: start, title: g.title, target: g.target || 1, count: 0, order: g.order });
  }
  commit('events'); // one undo step for the batch
  toast(`Brought over ${prev.length} goal${prev.length === 1 ? '' : 's'}`, false, { label: 'Undo', fn: undo });
}

function newProject() {
  openQuickAdd({ kind: 'project' });
}

/* ----------------------------- context menus ----------------------------- */

function taskMenu(e, id, day) {
  const t = M.findTask(id);
  if (!t) return;
  const done = M.isTaskDoneOn(t, day || t.date);
  const today = startOfDay(new Date());
  const anchor = e.target.closest('[data-id]') || e.target;
  const move = (dk) => () => { M.moveTask(id, dk, { fromDay: day || t.date || null }); if (dk) toast(`Moved to ${dayLabel(parseLocal(dk))}`, false, { label: 'Undo', fn: undo }); };
  const cats = [...new Set(ev().map((x) => x.category).filter(Boolean))].sort();
  openMenu(e, [
    { label: done ? 'Mark not done' : 'Mark done', hint: 'Space', action: () => M.toggleTask(id, day || t.date) },
    { label: 'Edit details…', hint: 'Enter', action: () => editTask(anchor, id, day) },
    '-',
    { label: 'Move to', items: [
      { label: 'Today', action: move(isoDate(today)) },
      { label: 'Tomorrow', action: move(isoDate(addDays(today, 1))) },
      { label: 'Next week', action: move(isoDate(weekStartOf(addDays(today, 7), ws()))) },
      { label: day ? 'One day later' : 'Start of the week on screen', hint: day ? 'Alt+→' : '', action: move(day ? isoDate(addDays(parseLocal(day), 1)) : isoDate(focusWeek)) },
      '-',
      { label: 'Inbox (no date)', action: () => M.moveTask(id, ''), disabled: !t.date },
    ] },
    { label: 'Project', items: [
      { label: 'None', checked: !t.projectId, action: () => M.updateTask(id, { projectId: '' }) },
      ...state.cfg.data.projects.filter((p) => !p.archived).map((p) => ({ label: p.title, swatch: p.hue, checked: p.id === t.projectId, action: () => M.updateTask(id, { projectId: p.id }) })),
      '-',
      { label: 'New project…', action: () => openQuickAdd({ kind: 'project' }) },
    ] },
    { label: 'Category', items: [
      { label: 'None', checked: !t.category, action: () => M.updateTask(id, { category: '' }) },
      ...cats.map((c) => ({ label: c, swatch: categoryHue(c), checked: c === t.category, action: () => M.updateTask(id, { category: c }) })),
      ...(cats.length ? [] : [{ label: 'Type #name when adding a task', disabled: true }]),
    ] },
    { label: 'Duplicate', action: () => { M.duplicateTask(id); toast('Duplicated'); } },
    '-',
    { label: 'Delete', hint: 'Del', danger: true, action: () => deleteWithUndo(t.title, () => M.deleteTask(id)) },
  ]);
}

function goalMenu(e, id) {
  const g = M.findGoal(id);
  if (!g) return;
  const anchor = e.target.closest('[data-id]') || e.target;
  const counter = (g.target || 1) > 1;
  const items = counter
    ? [{ label: 'Add one', action: () => M.bumpGoal(id, 1), disabled: isGoalDone(g) }, { label: 'Remove one', action: () => M.bumpGoal(id, -1), disabled: !g.count }]
    : [{ label: isGoalDone(g) ? 'Mark not done' : 'Mark done', hint: 'Space', action: () => M.bumpGoal(id) }];
  const moves = g.scope === 'day'
    ? [{ label: 'Tomorrow', action: () => M.moveGoal(id, { date: isoDate(addDays(parseLocal(g.date), 1)) }) },
       { label: 'Make it a week goal', action: () => M.moveGoal(id, { scope: 'week', date: isoDate(weekStartOf(parseLocal(g.date), ws())) }) }]
    : [{ label: 'Next week', action: () => M.moveGoal(id, { date: isoDate(addDays(parseLocal(g.date), 7)) }) },
       { label: 'Make it a goal for today', action: () => M.moveGoal(id, { scope: 'day', date: todayKey() }) }];
  openMenu(e, [
    ...items,
    { label: 'Edit…', hint: 'Enter', action: () => editGoal(anchor, id) },
    '-',
    { label: 'Move to', items: moves },
    '-',
    { label: 'Delete', hint: 'Del', danger: true, action: () => deleteWithUndo(g.title, () => M.deleteGoal(id)) },
  ]);
}

function projectMenu(e, id) {
  const p = M.findProject(id);
  if (!p) return;
  const anchor = e.target.closest('[data-id]') || e.target;
  openMenu(e, [
    { label: 'Add task…', action: () => { expanded.add(id); openInline(`project:${id}`); } },
    { label: expanded.has(id) ? 'Collapse' : 'Show tasks', action: () => { expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); } },
    { label: 'Edit details…', hint: 'Enter', action: () => editProject(anchor, id) },
    { label: 'Color', items: [220, 190, 160, 100, 45, 25, 340, 280].map((h) => ({ label: ' ', swatch: h, checked: p.hue === h, action: () => M.updateProject(id, { hue: h }) })) },
    '-',
    { label: p.archived ? 'Unarchive' : 'Archive', action: () => M.updateProject(id, { archived: !p.archived }) },
    { label: 'Delete project', danger: true, action: () => deleteWithUndo(p.title, () => M.deleteProject(id)) },
  ]);
}

function dayMenu(e, key) {
  const occ = occurrences(ev(), { from: parseLocal(key), days: 1 });
  const open = occ.filter((o) => !o.done);
  openMenu(e, [
    { heading: dayLabel(parseLocal(key)) },
    { label: 'Add task', hint: 'Double-click', action: () => openInline(`day:${key}`) },
    { label: 'Add goal for the day', action: () => openInline(`dgoal:${key}`) },
    { label: 'Quick add…', hint: 'N', action: () => openQuickAdd({ day: key }) },
    { label: 'Select everything on this day', action: () => setSelection([...weekEl.querySelectorAll(`.day[data-day="${key}"] [data-drag="task"], .day[data-day="${key}"] [data-drag="day-goal"]`)].map(keyOf)) },
    '-',
    { label: `Mark all done (${open.length})`, disabled: !open.length, action: () => { for (const o of open) M.toggleTask(o.id, key); } },
    { label: 'Move unfinished to the next day', disabled: !open.some((o) => o.repeat === 'none' || !o.repeat), action: () => {
      const next = isoDate(addDays(parseLocal(key), 1));
      for (const o of open) if (!o.repeat || o.repeat === 'none') M.moveTask(o.id, next);
      toast('Moved unfinished tasks', false, { label: 'Undo', fn: undo });
    } },
  ]);
}

/* ====================================================================== */
/* Wiring                                                                 */
/* ====================================================================== */

function onClick(e) {
  const act = e.target.closest('[data-act]');
  const item = e.target.closest('[data-id]');
  const a = act?.dataset.act;

  // Shift/Ctrl/Cmd-click adds or removes a task or day goal from the selection.
  if ((e.shiftKey || e.ctrlKey || e.metaKey) && item && /^(task|day-goal)$/.test(item.dataset.drag) && a !== 'tick' && a !== 'goal-bump') {
    toggleSelected(item);
    return;
  }
  if (a === 'week-band') { scrollToDay(act.dataset.week, { smooth: true, before: 0 }); return; }
  if (a === 'sel-clear') { clearSelection(); return; }
  if (a === 'sel-menu') { const r = act.getBoundingClientRect(); selectionMenu({ preventDefault() {}, target: act, clientX: r.left, clientY: r.bottom + 6, detail: e.detail }); return; }
  if (a === 'sel-done') { bulkDone(); return; }
  if (a === 'sel-delete') { bulkDelete(); return; }
  if (!item && !act && selectionSize()) { clearSelection(); return; }
  if (item && selectionSize() && !isSelected(item) && a !== 'tick' && a !== 'goal-bump') clearSelection();

  if (a === 'tick' && item) { M.toggleTask(item.dataset.id, item.dataset.day || null); return; }
  if (a === 'goal-bump' && item) { M.bumpGoal(item.dataset.id, e.shiftKey ? -1 : 1); return; }
  if (a === 'goal-edit' && item) { editGoal(item, item.dataset.id); return; }
  if (a === 'inline') { const z = act.dataset.target; if (z.startsWith('project:')) expanded.add(z.slice(8)); openInline(z); return; }
  if (a === 'proj-toggle' && item) { const id = item.dataset.id; expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); return; }
  if (a === 'proj-menu' && item) { const r = act.getBoundingClientRect(); projectMenu({ preventDefault() {}, target: act, clientX: r.left, clientY: r.bottom + 4, detail: e.detail }, item.dataset.id); return; }
  if (a === 'new-project') { newProject(); return; }
  if (a === 'carry') { carryOver(); return; }
  if (a === 'toggle-archived') { showArchived = !showArchived; render(); return; }
  if (a === 'day-menu') { dayMenu(e, act.closest('[data-day]').dataset.day); return; }

  if (item && selectionSize() > 1 && isSelected(item)) { clearSelection(); }
  if (item?.dataset.drag === 'task') { editTask(item, item.dataset.id, item.dataset.day || null); return; }
  if (item && /goal$/.test(item.dataset.drag)) { editGoal(item, item.dataset.id); }
}

function onContext(e) {
  if (e.target.closest('input, textarea')) return;
  const item = e.target.closest('[data-id]');
  const day = e.target.closest('[data-zone="day"]');
  if (item && selectionSize() > 1 && isSelected(item)) return selectionMenu(e);
  if (item && selectionSize() && !isSelected(item)) clearSelection();
  if (item?.dataset.drag === 'task') return taskMenu(e, item.dataset.id, item.dataset.day || null);
  if (item && /goal$/.test(item.dataset.drag)) {
    // Right-click on the pips removes one, like the shift-click hint says.
    if (e.target.closest('.pips')) { e.preventDefault(); M.bumpGoal(item.dataset.id, -1); return; }
    return goalMenu(e, item.dataset.id);
  }
  if (item?.dataset.drag === 'project') return projectMenu(e, item.dataset.id);
  if (day) return dayMenu(e, day.dataset.day);
  const zone = e.target.closest('[data-zone]')?.dataset.zone;
  if (zone === 'inbox') return openMenu(e, [{ label: 'Add task to inbox', action: () => openInline('inbox') }]);
  if (zone === 'week') return openMenu(e, [{ label: 'Add week goal', action: () => openInline('week') }]);
  if (zone === 'projects') return openMenu(e, [{ label: 'New project…', action: newProject }]);
}

function onDblClick(e) {
  if (e.target.closest('[data-id], button, input, textarea')) return;
  window.getSelection()?.removeAllRanges();
  const day = e.target.closest('[data-zone="day"]');
  if (day) { openInline(`day:${day.dataset.day}`); return; }
  const zone = e.target.closest('[data-zone]')?.dataset.zone;
  if (zone === 'inbox') openInline('inbox');
  else if (zone === 'week') openInline('week');
  else if (zone === 'projects') newProject();
}

function onDrop({ kind, id, src, zone, beforeId, el }) {
  if (selectionSize() > 1 && el && isSelected(el)) {
    if (zone.zone === 'day') bulkMoveTo(zone.day, { anchorDay: src.day || (kind === 'day-goal' ? M.findGoal(id)?.date : null) || null });
    else if (zone.zone === 'inbox') bulkUnschedule('');
    else if (zone.zone === 'project') { bulkSet({ projectId: zone.project }); expanded.add(zone.project); }
    return;
  }
  if (kind === 'task') {
    const t = M.findTask(id);
    if (zone.zone === 'day') {
      const from = src.day || null;
      if (from === zone.day && t.time) return;
      M.moveTask(id, zone.day, { fromDay: from, beforeId });
      if (t.repeat && t.repeat !== 'none' && from && from !== zone.day) toast('Moved the whole repeating series', false, { label: 'Undo', fn: undo });
    } else if (zone.zone === 'inbox') {
      M.moveTask(id, '', { projectId: '', beforeId });
    } else if (zone.zone === 'project') {
      if (t.date) M.updateTask(id, { projectId: zone.project });
      else M.moveTask(id, '', { projectId: zone.project, beforeId });
      expanded.add(zone.project);
      if (src.day === '' && t.projectId !== zone.project) toast(`Added to ${M.findProject(zone.project)?.title}`);
    }
  } else if (kind === 'day-goal' || kind === 'week-goal') {
    if (zone.zone === 'day') M.moveGoal(id, { scope: 'day', date: zone.day, beforeId });
    else if (zone.zone === 'week') M.moveGoal(id, { scope: 'week', date: isoDate(focusWeek), beforeId });
  } else if (kind === 'project' && zone.zone === 'projects') {
    M.moveProject(id, beforeId);
  }
}

function onKey(e) {
  const inField = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const mod = e.ctrlKey || e.metaKey;

  // Quick add works from any tab.
  if (!inField && !isQuickAddOpen() && ((e.key === 'n' || e.key === 'N') && !mod && !e.altKey || (mod && e.key.toLowerCase() === 'k'))) {
    if (document.querySelector('.pop, .ctx-root')) return;
    e.preventDefault();
    const focusedDay = visible() ? document.activeElement?.closest?.('[data-zone="day"]')?.dataset.day : null;
    openQuickAdd({ day: focusedDay || undefined, week: visible() ? isoDate(focusWeek) : undefined });
    return;
  }
  if (!visible() || inField || document.querySelector('.pop, .ctx-root, .qa-backdrop')) return;
  if (mod && e.key.toLowerCase() === 'a' && view === 'week') { e.preventDefault(); selectVisible(); return; }
  if (mod) return;

  // Keys for a multi-selection.
  if (selectionSize() > 1) {
    if (e.key === 'Escape') { e.preventDefault(); clearSelection(); return; }
    if (e.key === ' ' || e.key === 'x') { e.preventDefault(); bulkDone(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); bulkDelete(); return; }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); bulkShift(e.key === 'ArrowRight' ? 1 : -1); return; }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = $('selBar').getBoundingClientRect();
      selectionMenu({ preventDefault() {}, target: $('selBar'), clientX: r.left, clientY: r.top - 8, type: 'keydown' });
      return;
    }
  }
  if (e.key === 'Escape' && selectionSize()) { clearSelection(); return; }

  const item = document.activeElement?.closest?.('[data-id]');
  if (item && root.contains(item)) {
    const id = item.dataset.id;
    const kind = item.dataset.drag;
    if (e.key === ' ' || e.key === 'x') {
      e.preventDefault();
      if (kind === 'task') M.toggleTask(id, item.dataset.day || null);
      else if (/goal$/.test(kind)) M.bumpGoal(id, 1);
      else if (kind === 'project') { expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (kind === 'task') editTask(item, id, item.dataset.day || null);
      else if (/goal$/.test(kind)) editGoal(item, id);
      else if (kind === 'project') editProject(item, id);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (kind === 'task') deleteWithUndo(M.findTask(id).title, () => M.deleteTask(id));
      else if (/goal$/.test(kind)) deleteWithUndo(M.findGoal(id).title, () => M.deleteGoal(id));
      return;
    }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && kind === 'task' && item.dataset.day) {
      e.preventDefault();
      const to = isoDate(addDays(parseLocal(item.dataset.day), e.key === 'ArrowRight' ? 1 : -1));
      M.moveTask(id, to, { fromDay: item.dataset.day });
      // Follow the task if it moved off screen.
      ensureRange(to);
      if (!isDayVisible(to)) goDays(e.key === 'ArrowRight' ? 1 : -1);
      const moved = [...root.querySelectorAll(`[data-id="${id}"]`)].find((x) => x.dataset.day === to);
      moved?.focus({ preventScroll: true });
      return;
    }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = item.getBoundingClientRect();
      item.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 20, clientY: r.bottom - 4 }));
      return;
    }
  }
  if (e.altKey || view !== 'week') return;
  if (e.key === 'ArrowLeft' && !item) { e.preventDefault(); goDays(e.shiftKey ? -7 : -1); }
  else if (e.key === 'ArrowRight' && !item) { e.preventDefault(); goDays(e.shiftKey ? 7 : 1); }
  else if (e.key === 't' || e.key === 'T') { goToday(); }
}

async function importICS(file) {
  try {
    const imported = parseICS(await file.text());
    const source = file.name.replace(/\.ics$/i, '');
    const existing = new Map(ev().filter((x) => x.uid).map((x) => [x.uid, x]));
    let added = 0, updated = 0;
    for (const item of imported) {
      const prev = item.uid && existing.get(item.uid);
      // Keep whatever you've ticked off or attached locally when re-importing.
      if (prev) { Object.assign(prev, { title: item.title, date: item.date, time: item.time, repeat: item.repeat, until: item.until }); updated++; }
      else { ev().push({ id: uid(), source, category: source.toLowerCase().slice(0, 24), done: false, ...item }); added++; }
    }
    commit('events');
    toast(`Imported ${added} new and updated ${updated} item${added + updated === 1 ? '' : 's'}`, false, { label: 'Undo', fn: undo });
  } catch (err) {
    toast(`Couldn’t read that file: ${err.message}`, true);
  }
}

export function initPlan() {
  root.addEventListener('click', onClick);
  root.addEventListener('contextmenu', onContext);
  root.addEventListener('dblclick', onDblClick);
  // Middle-click a day for quick add with that day filled in.
  root.addEventListener('pointerdown', (e) => { if (e.button === 1 && e.target.closest('[data-zone="day"]')) e.preventDefault(); });
  root.addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const day = e.target.closest('[data-zone="day"]');
    if (day) { e.preventDefault(); openQuickAdd({ day: day.dataset.day, fromMiddleClick: true }); }
  });
  root.addEventListener('keydown', (e) => {
    const input = e.target.closest?.('[data-inline]');
    if (!input) return;
    if (e.key === 'Enter') { e.preventDefault(); submitInline(input); }
    else if (e.key === 'Escape') { e.preventDefault(); inline = null; render(); }
  });
  root.addEventListener('input', (e) => { const input = e.target.closest?.('[data-inline]'); if (input && inline) inline.value = input.value; });
  root.addEventListener('focusout', (e) => {
    const input = e.target.closest?.('[data-inline]');
    if (!input || input.value.trim()) return;
    // Close an empty inline box when focus leaves it (but not when we're re-rendering it).
    setTimeout(() => { if (inline?.zone === input.dataset.inline && !root.querySelector(`[data-inline="${inline.zone}"]:focus`)) { inline = null; render(); } }, 120);
  });
  document.addEventListener('keydown', onKey);

  enableDrag(root, {
    onDrop,
    onStart: (d) => {
      closePopover(); closeMenu();
      if (selectionSize() && !isSelected(d.el)) clearSelection();
      // Dragging one of several selected items carries them all.
      if (selectionSize() > 1) {
        d.multi = true;
        root.querySelectorAll('.selected').forEach((x) => x.classList.add('drag-src'));
      }
    },
    onEnd: () => root.querySelectorAll('.drag-src').forEach((x) => x.classList.remove('drag-src')),
    decorate: (ghost, el) => {
      if (selectionSize() > 1 && isSelected(el)) {
        ghost.classList.add('multi');
        ghost.insertAdjacentHTML('beforeend', `<span class="ghost-count">${selectionSize()}</span>`);
      }
    },
  });

  // Drag across empty space on the board to select several items.
  enableMarquee(scrollEl, {
    canStart: (e) => view === 'week' && !e.target.closest('[data-drag], button, input, textarea, select, a, .wband'),
  });
  onSelectionChange(() => { paintSelection(root); renderSelectionBar(); });

  $('weekPrev').addEventListener('click', () => goDays(-7));
  $('weekNext').addEventListener('click', () => goDays(7));
  $('weekThis').addEventListener('click', goToday);
  $('planFab').addEventListener('click', () => openQuickAdd({ week: isoDate(focusWeek) }));
  root.querySelectorAll('.view-toggle button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view; closePopover(); clearSelection(); render();
    if (view === 'week') { positioned = false; sizeColumns(); }
  }));

  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  // A plain mouse wheel scrolls the days sideways, unless a day is tall enough to need scrolling down.
  scrollEl.addEventListener('wheel', (e) => {
    if (view !== 'week' || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const overHeader = e.target.closest('.day-head, .wband');
    const fitsVertically = scrollEl.scrollHeight <= scrollEl.clientHeight + 1;
    if (overHeader || fitsVertically || e.shiftKey) {
      e.preventDefault();
      scrollEl.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
    }
  }, { passive: false });
  new ResizeObserver(() => { if (visible() && view === 'week') sizeColumns(); }).observe(scrollEl);

  // List view controls
  $('listSearch').addEventListener('input', (e) => { listFilter.q = e.target.value; renderList(); });
  $('listDone').addEventListener('change', (e) => { listFilter.done = e.target.checked; renderList(); });
  $('listPast').addEventListener('change', (e) => { listFilter.past = e.target.checked; renderList(); });
  $('icsInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importICS(f); });
  $('clearDone').addEventListener('click', () => {
    const before = ev().length;
    const today = todayKey();
    state.cfg.data.events = ev().filter((t) => {
      const repeating = t.repeat && t.repeat !== 'none';
      if (repeating) return !(t.until && t.until < today);
      return !(t.done && (!t.date || t.date < today));
    });
    const n = before - ev().length;
    if (n) { commit('events'); toast(`Removed ${n} finished item${n === 1 ? '' : 's'}`, false, { label: 'Undo', fn: undo }); }
    else toast('Nothing finished to remove');
  });
  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('[data-row]');
    if (!row) return;
    const id = row.dataset.row;
    if (e.target.closest('[data-act="list-tick"]')) { M.toggleTask(id); return; }
    editTask(row, id);
  });
  listEl.addEventListener('contextmenu', (e) => { const row = e.target.closest('[data-row]'); if (row) taskMenu(e, row.dataset.row, null); });

  setQuickAddHandler(({ kind, item }) => {
    flash = item.id;
    if (kind === 'task' && item.projectId) expanded.add(item.projectId);
    render();
    if (visible() && view === 'week') {
      if (kind === 'task' && item.date) revealDay(item.date);
      if (kind === 'day-goal') revealDay(item.date);
      if (kind === 'week-goal' && isoDate(focusWeek) !== item.date) scrollToDay(item.date, { smooth: true, before: 0 });
    }
  });

  onChange((reason) => {
    if (reason === 'board') {
      // Week start changed: realign the range to whole weeks without moving what's on screen.
      const keep = positioned ? keyAt(visibleRange().first) : todayKey();
      rangeStart = weekStartOf(rangeStart, ws());
      focusWeek = weekStartOf(focusWeek, ws());
      render();
      if (positioned) scrollEl.scrollLeft = indexOf(keep) * colW;
      return;
    }
    render();
  });
  // Roll over to a new day at midnight.
  let day = todayKey();
  setInterval(() => { if (todayKey() !== day) { day = todayKey(); render(); } }, 60000);
  render();
  // The tab starts hidden, so columns are sized (and scrolled to today) the first time it's shown.
  new MutationObserver(() => { if (visible() && view === 'week') { sizeColumns(); render({ timeline: false }); } }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  if (visible()) { sizeColumns(); render({ timeline: false }); }
}
