// Plan tab: a continuous, horizontally scrolling strip of days (or a month grid, or a list), with goals,
// projects and an inbox beside it. Everything is direct manipulation: drag to move, drag across empty space to select
// several things, right-click for options, click to edit in place, double-click a day (or press N) to add.

import { state, onChange, undo, commit } from '../state.js';
import { esc, isoDate, addDays, parseLocal, weekStartOf, formatTime, formatTimeRange, weekdaysLabel, dayLabel, occurrences, startOfDay, daysBetween } from '../../core/util.js';
import { notesForDay, noteOccurrences, noteLength, goalsForDay, goalsForWeek, isGoalDone, projectProgress, nextProjectTask, byOrder, categoryHue, daysUntil } from '../../core/planning.js';
import { uid } from '../../core/config.js';
import * as M from './model.js';
import { parseQuick } from './parse.js';
import { enableDrag, edgeScroller } from './drag.js';
import { enableMarquee, paintSelection, clearSelection, toggleSelected, isSelected, selectedItems, selectionSize, setSelection, keyOf, onSelectionChange, setSelectFilter, canSelect } from './select.js';
import { openMenu, closeMenu } from './menu.js';
import { closePopover, openPopover } from './popover.js';
import { editTask, editGoal, editProject, editCategory, editNoteDetails, deleteWithUndo, editDueDates, setDueDates, dueChoices } from './editors.js';
import { openQuickAdd, setQuickAddHandler, isQuickAddOpen, resolveLine, createParsed, addLines } from './quickadd.js';
import { cleanLines } from './editors.js';
import { actionFor, openShortcuts, shortcutsOpen, hint } from './keys.js';
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
let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let view = (() => { try { const v = localStorage.getItem('dusk.plan.view'); return ['days', 'month', 'list'].includes(v) ? v : 'days'; } catch { return 'days'; } })();
const monthEl = $('planMonth');
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

const catHue = (c) => categoryHue(c, state.cfg.data.categoryColors);

function edgeHue(t) {
  const p = t.projectId && M.findProject(t.projectId);
  if (p) return p.hue;
  if (t.category) return catHue(t.category);
  return null;
}

function taskCard(t, { day = '', compact = false, showDate = false } = {}) {
  const done = day ? M.isTaskDoneOn(t, day) : !!t.done;
  const repeating = t.repeat && t.repeat !== 'none';
  const overdue = !done && ((day && day < todayKey() && !repeating) || (t.due && t.due < todayKey()));
  const hue = edgeHue(t);
  const proj = t.projectId && M.findProject(t.projectId);
  const meta = [];
  if (t.due) meta.push(dueLabel(t, day, done));
  if (showDate && t.date) meta.push(`<span class="m-date">${esc(dayLabel(parseLocal(t.date)))}</span>`);
  if (t.time) meta.push(`<span class="m-time">${formatTimeRange(t.date || todayKey(), t.time, t.end)}</span>`);
  if (repeating) meta.push(`<span title="${repeatLabel(t)}">↻</span>`);
  if (t.steps?.length) meta.push(`<span class="m-steps${t.steps.every((x) => x.done) ? ' all' : ''}" title="Steps done">☑ ${t.steps.filter((x) => x.done).length}/${t.steps.length}</span>`);
  if (t.category) meta.push(`<span class="m-cat">#${esc(t.category)}</span>`);
  if (proj && !compact) meta.push(`<span class="m-proj">${esc(proj.title)}</span>`);
  if (t.notes) meta.push('<span title="Has notes">¶</span>');
  return `<li class="task${done ? ' done' : ''}${overdue ? ' overdue' : ''}${t.priority ? ` p${t.priority}` : ''}${flash === t.id ? ' flash' : ''}" tabindex="0"
      data-drag="task" data-id="${t.id}" data-day="${day}" data-ordered="${t.time ? 'false' : 'true'}"${t.due ? ` data-due="${t.due}"` : ''}
      ${hue != null ? `style="--h:${hue}"` : ''}>
      <button type="button" class="tick${done ? ' on' : ''}" data-act="tick" aria-label="${done ? 'Mark not done' : 'Mark done'}"></button>
      <div class="task-main">
        <span class="task-title">${t.priority ? `<b class="prio" title="Priority ${t.priority}">${'!'.repeat(t.priority)}</b>` : ''}${esc(t.title)}</span>
        ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
      </div>
    </li>`;
}

// "⚑ Due Fri" — orange when it's due within two days, red when it's past due.
function dueLabel(t, day, done) {
  const today = todayKey();
  const n = daysBetween(parseLocal(today), parseLocal(t.due));
  const when = t.due === day ? 'Due this day' : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : `Due ${dayLabel(parseLocal(t.due))}`;
  const cls = done ? '' : n < 0 ? ' late' : n <= 2 ? ' soon' : '';
  return `<span class="m-due${cls}" title="Due ${parseLocal(t.due).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}">⚑ ${when}</span>`;
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

// A day note: plain text on a day, no checkbox. Click to edit in place; drag the little handle on
// its right across days to stretch it into a multi-day note.
function noteItem(n, day) {
  if (inline?.zone === `editnote:${n.id}`) {
    return `<li class="dnote editing"><input data-inline="editnote:${n.id}" value="${esc(inline.value ?? n.text)}" aria-label="Edit note"></li>`;
  }
  const rep = n.repeat && n.repeat !== 'none';
  const hue = n.category ? catHue(n.category) : null;
  return `<li class="dnote${hue != null ? ' has-cat' : ''}${flash === n.id ? ' flash' : ''}" tabindex="0" data-drag="note" data-id="${n.id}" data-day="${day}"${hue != null ? ` style="--h:${hue}"` : ''} title="Note · click to edit · drag the right edge across days to stretch it · right-click for more">${esc(n.text)}${rep ? ' <span class="n-rep" aria-label="Repeats">↻</span>' : ''}<span class="note-grip" data-grip="end" data-nodrag aria-hidden="true"></span></li>`;
}

// One-day notes for a day (multi-day notes are drawn as bars instead).
function notesBlock(key, { placeholder = 'Note for the day, e.g. Essay due' } = {}) {
  const notes = notesForDay(state.cfg.data.notes, key).filter((n) => !n.len);
  const adding = inline?.zone === `note:${key}`;
  if (!notes.length && !adding) return '';
  return `<ul class="day-notes">${notes.map((n) => noteItem(n, key)).join('')}${adding ? `<li class="dnote editing"><input data-inline="note:${key}" value="${esc(inline.value || '')}" placeholder="${esc(placeholder)}" aria-label="New note"></li>` : ''}</ul>`;
}

// Pack multi-day notes into lanes so overlapping ones stack. items: [{ s, e, ... }] (column indexes)
function packLanes(items) {
  const ends = [];
  for (const it of items) {
    let lane = ends.findIndex((end) => end < it.s);
    if (lane === -1) { lane = ends.length; ends.push(it.e); } else ends[lane] = it.e;
    it.lane = lane;
  }
  return ends.length;
}

const SHORT = (k) => parseLocal(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function spanBar(o, { s, e, lane, contL, contR, style }) {
  const rep = o.note.repeat && o.note.repeat !== 'none';
  const hue = o.note.category ? catHue(o.note.category) : null;
  return `<div class="span-bar${hue != null ? ' has-cat' : ''}${contL ? ' cont-l' : ''}${contR ? ' cont-r' : ''}${flash === o.note.id ? ' flash' : ''}" tabindex="0"
      data-drag="note" data-id="${o.note.id}" data-day="${o.start}" data-span="1" data-lane="${lane}" data-s="${s}" data-e="${e}" style="${style}${hue != null ? `;--h:${hue}` : ''}"
      title="${esc(o.note.text)} · ${SHORT(o.start)} – ${SHORT(o.end)} · drag to move, drag an end to change the dates">
      ${contL ? '' : '<span class="span-h l" data-grip="start" data-nodrag aria-hidden="true"></span>'}
      <span class="span-text">${esc(o.note.text)}</span><span class="span-dates">${SHORT(o.start)} – ${SHORT(o.end)}${rep ? ' ↻' : ''}</span>
      ${contR ? '' : '<span class="span-h r" data-grip="end" data-nodrag aria-hidden="true"></span>'}
    </div>`;
}

const BAR_H = 26;

function inlineBox(zone, placeholder) {
  if (inline?.zone !== zone) return '';
  return `<div class="inline-add"><input data-inline="${zone}" value="${esc(inline.value || '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"></div>`;
}

function addButton(zone, label) {
  if (inline?.zone === zone) return '';
  return `<button type="button" class="add-row" data-act="inline" data-target="${zone}">+ ${label}</button>`;
}

function repeatLabel(t) {
  if (t.repeat === 'weekly' && t.weekdays?.length > 1) return `Every ${weekdaysLabel(t.weekdays)}`.replace('Every Weekdays', 'Every weekday').replace('Every Weekends', 'Every weekend').replace('Every Every day', 'Every day');
  return REPEAT_LABEL[t.repeat] || '';
}

function sortDay(items) {
  return items.sort((a, b) => {
    if (!a.time !== !b.time) return a.time ? 1 : -1; // untimed first
    if (!a.time && (a.priority || 0) !== (b.priority || 0)) return (b.priority || 0) - (a.priority || 0); // then most urgent
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
  let days = '';
  // Multi-day notes become bars across the columns.
  const spans = noteOccurrences(state.cfg.data.notes, rangeStart, n).filter((o) => o.len).map((o) => ({
    o, s: Math.max(0, indexOf(o.start)), e: Math.min(n - 1, indexOf(o.end)),
    contL: indexOf(o.start) < 0, contR: indexOf(o.end) > n - 1,
  }));
  packLanes(spans);
  const laneDepth = new Array(n).fill(0);
  for (const sp of spans) for (let k = sp.s; k <= sp.e; k++) laneDepth[k] = Math.max(laneDepth[k], sp.lane + 1);

  for (let i = 0; i < n; i++) {
    const d = addDays(rangeStart, i);
    const key = isoDate(d);
    const items = sortDay(byDay.get(key) || []);
    const goals = goalsForDay(state.cfg.data.goals, key);
    const gDone = goals.filter(isGoalDone).length;
    const showMonth = i === 0 || d.getDate() === 1;
    days += `<section class="day${key === today ? ' today' : ''}${key < today ? ' past' : ''}${d.getDate() === 1 ? ' mstart' : ''}" style="grid-column:${i + 1}" data-drop data-accept="task day-goal week-goal note" data-zone="day" data-day="${key}">
      <header class="day-head" data-act="day-menu">
        <span class="dow">${d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span class="dnum">${d.getDate()}</span>
        ${showMonth ? `<span class="dmon">${d.toLocaleDateString(undefined, { month: 'short' })}</span>` : ''}
        <span class="dspace"></span>
        ${goals.length ? `<span class="dgoals${gDone === goals.length ? ' all' : ''}" title="Daily goals done">${gDone}/${goals.length}</span>` : ''}
      </header>
      ${laneDepth[i] ? `<div class="span-space" style="height:${laneDepth[i] * BAR_H}px"></div>` : ''}
      ${notesBlock(key)}
      ${goals.length || inline?.zone === `dgoal:${key}` ? `<ul class="goal-list day-goals">${goals.map((g) => goalItem(g, 'day-goal')).join('')}</ul>${inlineBox(`dgoal:${key}`, 'Goal for the day')}` : ''}
      <ol class="tasks">${items.map((t) => taskCard(t, { day: key })).join('')}</ol>
      ${inlineBox(`day:${key}`, 'New task, e.g. Essay 3pm #school')}
      <div class="add-bar">
        ${addButton(`day:${key}`, 'Add')}
        <button type="button" class="add-row add-alt" data-act="inline" data-target="note:${key}" title="A note on this day that isn’t a task, e.g. Essay due">Note</button>
        <button type="button" class="add-row add-alt" data-act="inline" data-target="dgoal:${key}" title="A goal for this day">Goal</button>
      </div>
    </section>`;
  }
  weekEl.style.setProperty('--colw', `${colW}px`);
  weekEl.style.setProperty('--days', n);
  const bars = spans.map((sp) => spanBar(sp.o, { ...sp, style: `left:${sp.s * colW + 6}px;width:${(sp.e - sp.s + 1) * colW - 12}px;top:calc(var(--head-h, 46px) + ${sp.lane * BAR_H}px)` })).join('');
  weekEl.innerHTML = days + (bars ? `<div class="span-layer">${bars}</div>` : '');
  const head = weekEl.querySelector('.day-head');
  if (head) weekEl.style.setProperty('--head-h', `${head.offsetHeight + 4}px`);
}

/* ----------------------------- month view ----------------------------- */

function monthGrid() {
  const first = monthCursor;
  const gridStart = weekStartOf(first, ws());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks = Math.ceil((daysBetween(gridStart, last) + 1) / 7);
  return { first, last, gridStart, weeks };
}

function miniTask(t, day) {
  const done = M.isTaskDoneOn(t, day);
  const hue = edgeHue(t);
  const overdue = !done && ((day < todayKey() && !(t.repeat && t.repeat !== 'none')) || (t.due && t.due < todayKey()));
  const time = t.time ? formatTime(parseLocal(day, t.time)).replace(':00', '').replace(' ', '') : '';
  return `<li class="task mini${done ? ' done' : ''}${overdue ? ' overdue' : ''}${t.priority ? ` p${t.priority}` : ''}${flash === t.id ? ' flash' : ''}" tabindex="0"
      data-drag="task" data-id="${t.id}" data-day="${day}" data-ordered="${t.time ? 'false' : 'true'}"${t.due ? ` data-due="${t.due}"` : ''} ${hue != null ? `style="--h:${hue}"` : ''}>
      <button type="button" class="tick" data-act="tick" aria-label="${done ? 'Mark not done' : 'Mark done'}"></button>
      <span class="task-title">${t.due ? `<b class="m-flag${!done && t.due < todayKey() ? ' late' : ''}" title="Due ${SHORT(t.due)}">⚑</b>` : ''}${esc(t.title)}</span>${time ? `<span class="m-time">${time}</span>` : ''}
    </li>`;
}

function renderMonth() {
  const { first, gridStart, weeks } = monthGrid();
  const today = todayKey();
  const occ = occurrences(ev(), { from: gridStart, days: weeks * 7 });
  const byDay = new Map();
  for (const o of occ) (byDay.get(o.day) || byDay.set(o.day, []).get(o.day)).push(o);

  let head = '';
  for (let i = 0; i < 7; i++) head += `<div class="mhead">${addDays(gridStart, i).toLocaleDateString(undefined, { weekday: 'short' })}</div>`;
  // Multi-day notes: one bar per week row they cross.
  const occs = noteOccurrences(state.cfg.data.notes, gridStart, weeks * 7).filter((o) => o.len);
  const mbars = [];
  const depth = new Array(weeks * 7).fill(0);
  for (let w = 0; w < weeks; w++) {
    const row = [];
    for (const o of occs) {
      const a = daysBetween(gridStart, parseLocal(o.start)), z = daysBetween(gridStart, parseLocal(o.end));
      if (z < w * 7 || a > w * 7 + 6) continue;
      row.push({ o, w, s: Math.max(a, w * 7) - w * 7, e: Math.min(z, w * 7 + 6) - w * 7, contL: a < w * 7, contR: z > w * 7 + 6 });
    }
    packLanes(row);
    for (const sp of row) for (let k = sp.s; k <= sp.e; k++) depth[w * 7 + k] = Math.max(depth[w * 7 + k], sp.lane + 1);
    mbars.push(...row);
  }

  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gridStart, i);
    const key = isoDate(d);
    const items = sortDay(byDay.get(key) || []);
    const goals = goalsForDay(state.cfg.data.goals, key);
    const gDone = goals.filter(isGoalDone).length;
    const out = d.getMonth() !== first.getMonth();
    cells += `<section class="mday${out ? ' out' : ''}${key === today ? ' today' : ''}${key < today ? ' past' : ''}" data-drop data-accept="task day-goal week-goal note" data-zone="day" data-day="${key}">
      <header class="mday-head">
        <button type="button" class="mnum" data-act="open-day" data-day="${key}" title="Open this day">${d.getDate() === 1 ? d.toLocaleDateString(undefined, { month: 'short' }) + ' ' : ''}${d.getDate()}</button>
        ${goals.length ? `<span class="dgoals${gDone === goals.length ? ' all' : ''}" title="Goals for the day">${gDone}/${goals.length}</span>` : ''}
      </header>
      ${depth[i] ? `<div class="span-space" style="height:${depth[i] * 20}px"></div>` : ''}
      ${notesBlock(key, { placeholder: 'Note' })}
      <ol class="tasks">${items.map((t) => miniTask(t, key)).join('')}</ol>
      <button type="button" class="mmore" data-act="open-day" data-day="${key}" hidden></button>
      ${inlineBox(`day:${key}`, 'New task')}
    </section>`;
  }
  monthEl.style.setProperty('--weeks', weeks);
  monthSpans = mbars;
  monthEl.innerHTML = `<div class="mgrid">${head}${cells}<div class="span-layer">${mbars.map((sp) => spanBar(sp.o, { ...sp, style: '' })).join('')}</div></div>`;
  requestAnimationFrame(collapseMonth);
}

let monthSpans = [];
// Place the month's note bars over the cells they cover (needs the laid-out cell positions).
function layoutMonthSpans() {
  const cells = monthEl.querySelectorAll('.mday');
  const bars = monthEl.querySelectorAll('.span-layer .span-bar');
  bars.forEach((bar, k) => {
    const sp = monthSpans[k];
    const a = cells[sp.w * 7 + sp.s], z = cells[sp.w * 7 + sp.e];
    if (!a || !z) return;
    const headH = a.querySelector('.mday-head').offsetHeight + 6;
    Object.assign(bar.style, { left: `${a.offsetLeft + 4}px`, top: `${a.offsetTop + headH + sp.lane * 20}px`, width: `${z.offsetLeft + z.offsetWidth - a.offsetLeft - 8}px` });
  });
}

// Hide what doesn't fit in each day and say how many more there are.
function collapseMonth() {
  layoutMonthSpans();
  for (const cell of monthEl.querySelectorAll('.mday')) {
    const list = cell.querySelector('.tasks');
    const more = cell.querySelector('.mmore');
    const items = [...list.children];
    items.forEach((li) => { li.hidden = false; });
    more.hidden = true;
    if (!items.length) continue;
    const limit = () => (cell.querySelector('.inline-add') || more).getBoundingClientRect().top;
    more.hidden = false;
    more.textContent = '+0 more';
    let hidden = 0;
    for (let i = items.length - 1; i >= 0 && items[i].getBoundingClientRect().bottom > limit() + 1; i--) { items[i].hidden = true; hidden++; }
    if (hidden) more.textContent = `+${hidden} more`;
    else more.hidden = true;
  }
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
function scrollToDay(key, { smooth = false, before = 0 } = {}) {
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
  if (view === 'month') { monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1); render(); return; }
  scrollToDay(todayKey(), { smooth: positioned });
}

function goMonth(delta) {
  closePopover();
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + delta, 1);
  render();
}

// Jump from the month grid (or anywhere) to a day in the Days view.
function openDay(key) {
  setView('days');
  scrollToDay(key, { before: 0 });
  render({ timeline: false });
}

function setView(v) {
  if (v === view) return;
  view = v;
  try { localStorage.setItem('dusk.plan.view', v); } catch { /* storage unavailable */ }
  closePopover();
  clearSelection();
  render();
  if (view === 'days') { positioned = false; sizeColumns(); render({ timeline: false }); }
}

let scrollQueued = false;
function onScroll() {
  if (view !== 'days' || scrollQueued) return;
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
      focusWeek = f;
      firstVisible = firstKey;
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

  // Categories: colors and names. Drop a task on one to set its category.
  const cats = M.allCategories();
  const counts = new Map();
  for (const t of [...ev(), ...(state.cfg.data.notes || [])]) if (t.category) counts.set(t.category, (counts.get(t.category) || 0) + 1);
  const catBlock = `<section class="side-block cats-block">
    <header><h2>Categories</h2></header>
    ${cats.length ? `<ul class="cat-list">${cats.map((c) => `<li><button type="button" class="cat-chip" data-act="cat-edit" data-cat="${esc(c)}" data-drop data-accept="task note" data-zone="category" style="--h:${catHue(c)}" title="Change color or rename · drop tasks here to tag them">
      <i></i><span>${esc(c)}</span><b>${counts.get(c) || 0}</b></button></li>`).join('')}</ul>`
      : '<p class="side-hint">Type #name when adding a task (like #ENG111) to give it a category. Its color shows on the task’s edge, here and on the wall.</p>'}
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

  sideEl.innerHTML = html + catBlock;
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
  $('weekPrev').hidden = $('weekNext').hidden = view === 'list';
  $('weekPrev').title = view === 'month' ? 'Previous month (←)' : 'Back 7 days (Shift+←)';
  $('weekNext').title = view === 'month' ? 'Next month (→)' : 'Forward 7 days (Shift+→)';
  if (view === 'list') { $('weekLabel').textContent = 'Everything'; $('weekRel').textContent = ''; $('weekSummary').textContent = `${ev().length} items`; $('weekThis').hidden = true; return; }

  if (view === 'month') {
    const { first, gridStart, weeks } = monthGrid();
    $('weekLabel').textContent = fmt(first, { month: 'long', year: 'numeric' });
    const now = new Date();
    const diff = (first.getFullYear() - now.getFullYear()) * 12 + first.getMonth() - now.getMonth();
    $('weekThis').hidden = diff === 0;
    $('weekRel').textContent = diff === 0 ? 'This month' : diff === 1 ? 'Next month' : diff === -1 ? 'Last month' : diff > 0 ? `${diff} months ahead` : `${-diff} months back`;
    const occ = occurrences(ev(), { from: gridStart, days: weeks * 7 }).filter((o) => parseLocal(o.day).getMonth() === first.getMonth());
    $('weekSummary').textContent = occ.length ? `${occ.filter((o) => o.done).length} of ${occ.length} tasks done` : '';
    return;
  }

  if (!positioned) return;
  const { first, last } = visibleRange();
  const a = addDays(rangeStart, first), z = addDays(rangeStart, last);
  $('weekLabel').textContent = `${fmt(a, { month: 'short', day: 'numeric' })} – ${a.getMonth() === z.getMonth() ? z.getDate() : fmt(z, { month: 'short', day: 'numeric' })}`;
  const t = indexOf(todayKey());
  $('weekThis').hidden = t === first;
  if (t === first) $('weekRel').textContent = 'Today and the next 6 days'.replace('6', String(last - first));
  else if (t > first && t <= last) $('weekRel').textContent = 'Today is on screen';
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
    const when = at ? `${next ? 'Next: ' : ''}${dayLabel(at)}${t.time ? `, ${formatTimeRange(isoDate(at), t.time, t.end)}` : ''}` : '<span class="muted">No date</span>';
    const dueTxt = t.due ? ` · ⚑ due ${SHORT(t.due)}` : '';
    const proj = M.findProject(t.projectId);
    const done = repeating ? false : !!t.done;
    return `<tr data-row="${t.id}" class="${done ? 'done' : ''}${!done && !repeating && t.date && t.date < today ? ' overdue' : ''}">
      <td class="c-tick"><button type="button" class="tick${done ? ' on' : ''}" data-act="list-tick" ${repeating ? 'disabled title="Tick repeating tasks off on the week board"' : ''} aria-label="Done"></button></td>
      <td class="nowrap">${at ? esc(when) : when}${dueTxt ? `<span class="m-due${!t.done && t.due < today ? ' late' : ''}">${esc(dueTxt)}</span>` : ''}</td>
      <td class="c-title">${esc(t.title)}${t.source ? ` <span class="muted small">from ${esc(t.source)}</span>` : ''}</td>
      <td>${proj ? `<span class="m-proj" style="--h:${proj.hue}">${esc(proj.title)}</span>` : ''}</td>
      <td>${t.category ? `#${esc(t.category)}` : ''}</td>
      <td>${repeating ? `${repeatLabel(t)}${t.until ? ` until ${esc(t.until)}` : ''}` : ''}</td>
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

  weekEl.hidden = view !== 'days';
  monthEl.hidden = view !== 'month';
  listEl.hidden = view !== 'list';
  root.dataset.view = view;
  if (view === 'month') {
    // The sidebar's goals follow the week of today in this month, or the month's first week.
    const now = new Date();
    const thisMonth = now.getFullYear() === monthCursor.getFullYear() && now.getMonth() === monthCursor.getMonth();
    focusWeek = weekStartOf(thisMonth ? now : monthCursor, ws());
    firstVisible = isoDate(monthGrid().gridStart);
  }
  if (timeline) { if (view === 'days') renderTimeline(); else if (view === 'month') renderMonth(); else renderList(); }
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

// Deletes the selection. Selected days of repeating tasks are removed one by one; the rest of the series stays.
function bulkDelete() {
  const sel = selTasks();
  const repeatingDays = sel.filter((x) => x.day && M.findTask(x.id)?.repeat && M.findTask(x.id).repeat !== 'none');
  const whole = [...new Set(sel.filter((x) => !repeatingDays.includes(x)).map((x) => x.id))];
  const goals = selGoals().map((x) => x.id);
  M.batch(() => {
    for (const x of repeatingDays) M.skipOccurrence('task', x.id, x.day);
    for (const id of whole) M.deleteTask(id);
    for (const id of goals) M.deleteGoal(id);
  });
  clearSelection();
  const n = repeatingDays.length + whole.length + goals.length;
  toast(`Deleted ${n} item${n === 1 ? '' : 's'}`, false, { label: 'Undo', fn: undo });
}

// "Due date" submenu: quick picks, a date picker, or none.
function dueItems(ids, anchor, current = null) {
  return [
    ...dueChoices().map((c) => ({ label: `${c.label}  ·  ${c.sub}`, checked: current === c.key, action: () => setDueDates(ids, c.key) })),
    '-',
    { label: 'Pick a date…', hint: hint('due'), action: () => editDueDates(anchor, ids) },
    { label: 'No due date', checked: current === '', disabled: current === null ? false : !current, action: () => setDueDates(ids, '') },
  ];
}

function bulkDue() {
  const ids = selTasks().map((x) => x.id);
  if (!ids.length) { toast('Select some tasks first', true); return; }
  editDueDates($('selBar').querySelector('[data-act="sel-due"]') || $('selBar'), ids);
}

function selectionMenu(e) {
  const today = startOfDay(new Date());
  const cats = [...new Set(ev().map((x) => x.category).filter(Boolean))].sort();
  const n = selectionSize();
  const tasks = selTasks().length;
  openMenu(e, [
    { heading: `${n} selected` },
    { label: 'Mark done / not done', hint: hint('done'), action: bulkDone },
    '-',
    { label: 'Move to', items: [
      { label: 'Today', action: () => bulkMoveTo(isoDate(today)) },
      { label: 'Tomorrow', action: () => bulkMoveTo(isoDate(addDays(today, 1))) },
      { label: 'Next week', action: () => bulkMoveTo(isoDate(weekStartOf(addDays(today, 7), ws()))) },
      '-',
      { label: 'One day later', hint: hint('later'), action: () => bulkShift(1) },
      { label: 'One day earlier', hint: hint('earlier'), action: () => bulkShift(-1) },
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
      ...cats.map((c) => ({ label: c, swatch: catHue(c), action: () => bulkSet({ category: c }) })),
    ] },
    { label: 'Priority', disabled: !tasks, items: [[0, 'None'], [1, '!  Priority'], [2, '!!  High'], [3, '!!!  Urgent']].map(([v, l]) => ({ label: l, action: () => bulkSet({ priority: v }) })) },
    { label: 'Due date', disabled: !tasks, items: dueItems(selTasks().map((x) => x.id), $('selBar')) },
    { label: 'Copy', hint: 'Ctrl+C', disabled: !tasks, action: () => document.execCommand('copy') },
    '-',
    { label: 'Clear selection', hint: 'Esc', action: () => { clearSelection(); } },
    { label: `Duplicate ${n}`, hint: hint('duplicate'), action: duplicateItems },
    { label: `Delete ${n}`, hint: hint('delete'), danger: true, action: bulkDelete },
  ]);
}

function selectVisible() {
  if (view === 'month') {
    setSelection([...monthEl.querySelectorAll('.mday:not(.out) [data-drag="task"]')].filter(canSelect).map(keyOf));
    return;
  }
  const { first, last } = visibleRange();
  const keys = [];
  for (const el of weekEl.querySelectorAll('[data-drag="task"], [data-drag="day-goal"]')) {
    const day = el.dataset.day || el.closest('[data-day]')?.dataset.day;
    const i = day ? indexOf(day) : -1;
    if (i >= first && i <= last && canSelect(el)) keys.push(keyOf(el));
  }
  setSelection(keys);
}

/* ----------------------------- select by category / dates ----------------------------- */
// "Select…": pick categories, a date range and done/not done. Then either select every matching task
// (including ones off screen), or turn it into a filter so box-select, Ctrl+A and Ctrl-click only pick
// up matching tasks while everything else is dimmed.

let selFilter = null; // { cats: [], from: '', to: '', status: 'open'|'done'|'all', text: '' }
let lastPick = null;  // the window reopens with what you chose last time

function taskMatches(t, day, f) {
  if (f.cats.length && !f.cats.some((c) => c.toLowerCase() === (t.category || '').toLowerCase())) return false;
  if (f.text && !t.title.toLowerCase().includes(f.text.toLowerCase())) return false;
  const d = day || t.date || '';
  if ((f.from || f.to) && (!d || (f.from && d < f.from) || (f.to && d > f.to))) return false;
  const done = d ? M.isTaskDoneOn(t, d) : !!t.done;
  return f.status === 'all' || (f.status === 'done') === done;
}

// Every matching task as selection keys. Repeating tasks count once per day in the range; with no
// range, the days currently loaded on the board.
function matchingKeys(f) {
  const keys = [];
  const loadedFrom = isoDate(rangeStart), loadedTo = isoDate(addDays(rangeStart, rangeDays() - 1));
  for (const t of ev()) {
    if (!t.date) { if (!f.from && !f.to && taskMatches(t, '', f)) keys.push(`t:${t.id}:`); continue; }
    if (!t.repeat || t.repeat === 'none') { if (taskMatches(t, t.date, f)) keys.push(`t:${t.id}:${t.date}`); continue; }
    const from = f.from || (f.to && f.to < loadedFrom ? t.date : loadedFrom);
    const to = f.to || (f.from && f.from > loadedTo ? isoDate(addDays(parseLocal(f.from), 60)) : loadedTo);
    if (to < from) continue;
    const days = daysBetween(parseLocal(from), parseLocal(to)) + 1;
    for (const o of occurrences([t], { from: parseLocal(from), days })) {
      if (o.day >= from && o.day <= to && taskMatches(t, o.day, f)) keys.push(`t:${t.id}:${o.day}`);
    }
  }
  return keys;
}

const shortDate = (k) => parseLocal(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function filterLabel(f) {
  const parts = [];
  if (f.cats.length) parts.push(f.cats.map((c) => `#${c}`).join(', '));
  if (f.text) parts.push(`“${f.text}”`);
  if (f.from || f.to) parts.push(f.from && f.to ? `${shortDate(f.from)} – ${shortDate(f.to)}` : f.from ? `from ${shortDate(f.from)}` : `until ${shortDate(f.to)}`);
  if (f.status !== 'all') parts.push(f.status === 'done' ? 'done' : 'not done');
  return parts.join(' · ') || 'all tasks';
}

function applySelectFilter(f) {
  selFilter = f;
  setSelectFilter(f ? (el) => {
    if (el.dataset.drag !== 'task') return false;
    const t = M.findTask(el.dataset.id);
    return !!t && taskMatches(t, el.dataset.day || '', f);
  } : null);
  // Keep only the selected tasks that match.
  if (f && selectionSize()) {
    setSelection(selectedItems().filter((x) => x.kind === 'task' && M.findTask(x.id) && taskMatches(M.findTask(x.id), x.day, f)).map((x) => `t:${x.id}:${x.day}`));
  }
  root.classList.toggle('filtering', !!f);
  paintSelection(root);
  renderFilterButton();
}

function renderFilterButton() {
  const btn = $('planSelect');
  const off = $('planSelectOff');
  if (!btn) return;
  btn.classList.toggle('on', !!selFilter);
  btn.querySelector('span').textContent = selFilter ? `Only ${filterLabel(selFilter)}` : 'Select…';
  btn.title = selFilter ? 'Change what you can select' : 'Select tasks by category, dates or done (S)';
  off.hidden = !selFilter;
}

function selectAllMatching(f) {
  const keys = matchingKeys(f);
  setSelection(keys);
  const onScreen = keys.filter((k) => root.querySelector(`[data-drag="task"][data-id="${k.split(':')[1]}"][data-day="${k.split(':')[2]}"]`)).length;
  const off = keys.length - onScreen;
  toast(keys.length ? `Selected ${keys.length} task${keys.length === 1 ? '' : 's'}${off > 0 && view !== 'list' ? ` (${off} not on screen)` : ''}` : 'Nothing matches', !keys.length);
}

export function openSelectFilter(anchor = $('planSelect'), preset = {}) {
  const today = startOfDay(new Date());
  const f = { cats: [], from: '', to: '', status: 'open', text: '', ...(selFilter || lastPick || {}), ...preset };
  lastPick = f;
  const cats = [...new Set(ev().map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const wk = weekStartOf(today, ws());
  const ranges = [
    ['Any time', '', ''],
    ['This week', isoDate(wk), isoDate(addDays(wk, 6))],
    ['Next 7 days', isoDate(today), isoDate(addDays(today, 6))],
    ['Next 14 days', isoDate(today), isoDate(addDays(today, 13))],
    ['This month', isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0))],
  ];
  openPopover(anchor, (el) => {
    el.classList.add('pop-select');
    const draw = () => {
      const n = matchingKeys(f).length;
      el.innerHTML = `
        <div class="pop-head">Select tasks</div>
        <div class="pf"><span>Category${f.cats.length ? `<button type="button" class="link pf-clear" data-f="anycat">Any</button>` : ''}</span>
          <div class="sf-cats">${cats.length ? cats.map((c) => `<button type="button" class="sf-cat${f.cats.some((x) => x.toLowerCase() === c.toLowerCase()) ? ' on' : ''}" data-cat="${esc(c)}" style="--h:${catHue(c)}">#${esc(c)}</button>`).join('') : '<span class="muted">No categories yet</span>'}</div>
        </div>
        <div class="pf"><span>Dates</span>
          <div class="sf-ranges">${ranges.map(([l, a, b]) => `<button type="button" class="sf-range${f.from === a && f.to === b ? ' on' : ''}" data-from="${a}" data-to="${b}">${l}</button>`).join('')}</div>
          <div class="sf-dates"><input type="date" data-f="from" value="${esc(f.from)}" aria-label="From"><i>to</i><input type="date" data-f="to" value="${esc(f.to)}" aria-label="To"></div>
        </div>
        <div class="pop-grid">
          <div class="pf"><span>Include</span><div class="seg" data-f="status">${[['open', 'Not done'], ['done', 'Done'], ['all', 'Both']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${f.status === v}">${l}</button>`).join('')}</div></div>
          <label class="pf"><span>Title contains</span><input data-f="text" value="${esc(f.text)}" placeholder="anything"></label>
        </div>
        <p class="sf-count"><b>${n}</b> task${n === 1 ? '' : 's'} match: ${esc(filterLabel(f))}</p>
        <div class="sf-actions">
          <button type="button" class="btn primary small" data-f="selectAll" ${n ? '' : 'disabled'}>Select ${n === 1 ? 'it' : `all ${n}`}</button>
          <button type="button" class="btn small" data-f="limit" title="Box-select, Ctrl+A and Ctrl-click only pick up matching tasks; the rest are dimmed">${selFilter ? 'Update the filter' : 'Only let me select these'}</button>
          ${selFilter ? '<button type="button" class="link" data-f="off">Turn the filter off</button>' : ''}
        </div>`;
      const q = (k) => el.querySelector(`[data-f="${k}"]`);
      el.querySelectorAll('.sf-cat').forEach((b) => b.addEventListener('click', () => {
        const c = b.dataset.cat;
        f.cats = f.cats.some((x) => x.toLowerCase() === c.toLowerCase()) ? f.cats.filter((x) => x.toLowerCase() !== c.toLowerCase()) : [...f.cats, c];
        draw();
      }));
      q('anycat')?.addEventListener('click', () => { f.cats = []; draw(); });
      el.querySelectorAll('.sf-range').forEach((b) => b.addEventListener('click', () => { f.from = b.dataset.from; f.to = b.dataset.to; draw(); }));
      for (const k of ['from', 'to']) q(k).addEventListener('change', (e) => {
        f[k] = e.target.value;
        if (f.from && f.to && f.to < f.from) [f.from, f.to] = [f.to, f.from];
        draw();
      });
      q('status').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) { f.status = b.dataset.v; draw(); } });
      q('text').addEventListener('input', (e) => {
        f.text = e.target.value;
        const pos = e.target.selectionStart;
        draw();
        const t = q('text'); t.focus(); t.setSelectionRange(pos, pos);
      });
      q('selectAll').addEventListener('click', () => { closePopover(); selectAllMatching({ ...f }); });
      q('limit').addEventListener('click', () => { closePopover(); applySelectFilter({ ...f }); toast(`Only ${filterLabel(f)} can be selected now. Press Esc twice or click × to turn it off.`); });
      q('off')?.addEventListener('click', () => { closePopover(); applySelectFilter(null); });
    };
    draw();
  }, { key: 'select-filter', width: 380 });
}

/* ====================================================================== */
/* Actions                                                                */
/* ====================================================================== */

function openInline(zone) {
  inline = { zone, value: '', focus: true };
  render();
}

// What an inline box adds to: a day, the inbox, a project, the week's goals or a day's goals.
function inlineContext(zone) {
  const [type, arg] = zone.split(':');
  if (type === 'day') return { kind: 'task', day: arg };
  if (type === 'project') return { kind: 'task', projectId: arg };
  if (type === 'inbox') return { kind: 'task' };
  if (type === 'week') return { kind: 'week-goal', week: isoDate(focusWeek) };
  if (type === 'note') return { kind: 'note', day: arg };
  return { kind: 'day-goal', day: arg };
}

function submitInline(input, pasted = null) {
  const zone = input.dataset.inline;
  // Editing an existing note: save (or delete if emptied) and close.
  if (zone.startsWith('editnote:')) {
    const id = zone.slice(9);
    const text = input.value.trim();
    inline = null;
    if (!text) deleteWithUndo(M.findNote(id)?.text || 'note', () => M.deleteNote(id));
    else if (text !== M.findNote(id)?.text) M.updateNote(id, { text });
    else render();
    return;
  }
  // Notes in a day's box are kept exactly as typed (no date parsing): one note per line.
  if (zone.startsWith('note:')) {
    const lines = pasted || cleanLines(input.value);
    if (!lines.length) { inline = null; render(); return; }
    const day = zone.slice(5);
    let last = null;
    M.batch(() => { for (const l of lines) last = M.addNote({ date: day, text: l }); });
    flash = last?.id || null;
    inline = { zone, value: '', focus: true };
    render();
    return;
  }
  const lines = pasted || cleanLines(input.value);
  if (!lines.length) { inline = null; render(); return; }
  const ctx = inlineContext(zone);
  let made;
  if (lines.length > 1) {
    made = addLines(lines, ctx);
    toast(`Added ${made.length} items`, false, { label: 'Undo', fn: undo });
  } else {
    const p = resolveLine(lines[0], ctx);
    if (!p.title) p.title = lines[0];
    made = [createParsed(p, ctx)];
    const date = made[0].item.date;
    if (ctx.kind === 'task' && date && ctx.day && date !== ctx.day) {
      toast(`Added to ${dayLabel(parseLocal(date))}`, false, { label: 'Show', fn: () => { flash = made[0].item.id; if (view === 'days') scrollToDay(date, { smooth: true }); render(); } });
    }
  }
  flash = made[made.length - 1]?.item.id || null;
  inline = { zone, value: '', focus: true }; // keep it open for the next one
  render();
}

/* ----------------------------- copy and paste ----------------------------- */

let clip = null;          // { text, items: [{ task, day }] } — what Ctrl+C copied
let hoverDay = null;      // the day under the pointer, where Ctrl+V pastes
let hoverZone = null;

function copyItems() {
  if (selectionSize()) return selTasks().map((x) => ({ task: M.findTask(x.id), day: x.day }));
  const el = document.activeElement?.closest?.('[data-drag="task"]');
  if (el && root.contains(el)) return [{ task: M.findTask(el.dataset.id), day: el.dataset.day || '' }];
  return [];
}

function onCopy(e) {
  if (!visible() || e.target.closest?.('input, textarea') || document.querySelector('.pop, .qa-backdrop')) return;
  const items = copyItems().filter((x) => x.task);
  if (!items.length) return;
  const text = items.map(({ task, day }) => [task.title, day ? dayLabel(parseLocal(day)) : '', task.time ? formatTimeRange(day || todayKey(), task.time, task.end) : ''].filter(Boolean).join(' · ')).join('\n');
  e.clipboardData.setData('text/plain', text);
  e.preventDefault();
  clip = { text, items: items.map(({ task, day }) => ({ task: structuredClone(task), day })) };
  toast(`Copied ${items.length}. Point at a day and press Ctrl+V to paste.`);
}

function onPaste(e) {
  if (!visible() || view === 'list' || e.target.closest?.('input, textarea, [contenteditable="true"]') || document.querySelector('.pop, .qa-backdrop, .ctx-root')) return;
  const text = e.clipboardData?.getData('text') || '';
  if (!text.trim()) return;
  e.preventDefault();
  const toInbox = hoverZone === 'inbox';
  const day = toInbox ? '' : hoverDay || document.activeElement?.closest?.('[data-day]')?.dataset.day || todayKey();
  let made;
  if (clip && clip.text === text) {
    // Our own copy: exact duplicates, keeping their spacing across days.
    M.batch(() => { made = M.pasteTasks(clip.items, day); });
    setSelection(made.map((t) => `t:${t.id}:${t.date}`));
  } else {
    // Text from anywhere else: one task per line.
    made = addLines(cleanLines(text), { kind: 'task', day: day || undefined }).map((m) => m.item);
  }
  toast(`Pasted ${made.length} ${toInbox ? 'into the inbox' : `to ${dayLabel(parseLocal(day))}`}`, false, { label: 'Undo', fn: undo });
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
    { label: done ? 'Mark not done' : 'Mark done', hint: hint('done'), action: () => M.toggleTask(id, day || t.date) },
    { label: 'Edit details…', hint: hint('edit'), action: () => editTask(anchor, id, day) },
    '-',
    { label: 'Move to', items: [
      { label: 'Today', action: move(isoDate(today)) },
      { label: 'Tomorrow', action: move(isoDate(addDays(today, 1))) },
      { label: 'Next week', action: move(isoDate(weekStartOf(addDays(today, 7), ws()))) },
      { label: day ? 'One day later' : 'Start of the week on screen', hint: day ? hint('later') : '', action: move(day ? isoDate(addDays(parseLocal(day), 1)) : isoDate(focusWeek)) },
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
      ...cats.map((c) => ({ label: c, swatch: catHue(c), checked: c === t.category, action: () => M.updateTask(id, { category: c }) })),
      ...(cats.length ? [] : [{ label: 'Type #name when adding a task', disabled: true }]),
    ] },
    { label: 'Priority', items: [[0, 'None'], [1, '!  Priority'], [2, '!!  High'], [3, '!!!  Urgent']].map(([v, l]) => ({ label: l, checked: (t.priority || 0) === v, hint: v ? String(v) : '0', action: () => M.updateTask(id, { priority: v }) })) },
    { label: 'Due date', items: dueItems([id], anchor, t.due) },
    { label: 'Duplicate', hint: hint('duplicate'), action: () => { M.duplicateTask(id); toast('Duplicated'); } },
    { label: 'Copy', hint: 'Ctrl+C', action: () => { anchor.focus?.(); document.execCommand('copy'); } },
    '-',
    ...(t.repeat && t.repeat !== 'none' && day ? [{ label: 'Delete just this day', hint: hint('delete'), danger: true, action: () => skipDay('task', id, day) }] : []),
    { label: t.repeat && t.repeat !== 'none' ? 'Delete every repeat' : 'Delete', hint: t.repeat && t.repeat !== 'none' && day ? '' : hint('delete'), danger: true, action: () => deleteWithUndo(t.title, () => M.deleteTask(id)) },
  ]);
}

function goalMenu(e, id) {
  const g = M.findGoal(id);
  if (!g) return;
  const anchor = e.target.closest('[data-id]') || e.target;
  const counter = (g.target || 1) > 1;
  const items = counter
    ? [{ label: 'Add one', action: () => M.bumpGoal(id, 1), disabled: isGoalDone(g) }, { label: 'Remove one', action: () => M.bumpGoal(id, -1), disabled: !g.count }]
    : [{ label: isGoalDone(g) ? 'Mark not done' : 'Mark done', hint: hint('done'), action: () => M.bumpGoal(id) }];
  const moves = g.scope === 'day'
    ? [{ label: 'Tomorrow', action: () => M.moveGoal(id, { date: isoDate(addDays(parseLocal(g.date), 1)) }) },
       { label: 'Make it a week goal', action: () => M.moveGoal(id, { scope: 'week', date: isoDate(weekStartOf(parseLocal(g.date), ws())) }) }]
    : [{ label: 'Next week', action: () => M.moveGoal(id, { date: isoDate(addDays(parseLocal(g.date), 7)) }) },
       { label: 'Make it a goal for today', action: () => M.moveGoal(id, { scope: 'day', date: todayKey() }) }];
  openMenu(e, [
    ...items,
    { label: 'Edit…', hint: hint('edit'), action: () => editGoal(anchor, id) },
    '-',
    { label: 'Move to', items: moves },
    '-',
    { label: 'Delete', hint: hint('delete'), danger: true, action: () => deleteWithUndo(g.title, () => M.deleteGoal(id)) },
  ]);
}

function projectMenu(e, id) {
  const p = M.findProject(id);
  if (!p) return;
  const anchor = e.target.closest('[data-id]') || e.target;
  openMenu(e, [
    { label: 'Add task…', action: () => { expanded.add(id); openInline(`project:${id}`); } },
    { label: expanded.has(id) ? 'Collapse' : 'Show tasks', action: () => { expanded.has(id) ? expanded.delete(id) : expanded.add(id); render(); } },
    { label: 'Edit details…', hint: hint('edit'), action: () => editProject(anchor, id) },
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
    { label: 'Add note', action: () => openInline(`note:${key}`) },
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
  if (a === 'open-day') { openDay(act.dataset.day); return; }
  if (a === 'cat-edit') { editCategory(act, act.dataset.cat, catHue, { onSelect: (c) => openSelectFilter($('planSelect'), { cats: [c] }) }); return; }
  if (a === 'sel-clear') { clearSelection(); return; }
  if (a === 'sel-menu') { const r = act.getBoundingClientRect(); selectionMenu({ preventDefault() {}, target: act, clientX: r.left, clientY: r.bottom + 6, detail: e.detail }); return; }
  if (a === 'sel-done') { bulkDone(); return; }
  if (a === 'sel-due') { bulkDue(); return; }
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
  if (item?.dataset.drag === 'note') { if (item.dataset.span) editNoteDetails(item, item.dataset.id, { day: item.dataset.day }); else editNote(item.dataset.id); return; }
  if (item && /goal$/.test(item.dataset.drag)) { editGoal(item, item.dataset.id); }
}

function editNote(id) {
  const n = M.findNote(id);
  if (!n) return;
  closePopover();
  inline = { zone: `editnote:${id}`, value: n.text, focus: true };
  render();
}

// Remove one appearance of a repeating note or task.
function skipDay(kind, id, day) {
  M.skipOccurrence(kind, id, day);
  toast(`Removed ${parseLocal(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} only`, false, { label: 'Undo', fn: undo });
}

function noteMenu(e, id, occDay) {
  const n = M.findNote(id);
  if (!n) return;
  const anchor = e.target.closest?.('[data-id]') || e.target;
  const from = occDay || n.date;
  const d = parseLocal(from);
  const span = noteLength(n) > 0;
  const rep = n.repeat && n.repeat !== 'none';
  const shift = (days) => () => M.moveNote(id, { toDay: isoDate(addDays(d, days)), fromDay: from });
  openMenu(e, [
    { heading: span ? `Note · ${SHORT(n.date)} – ${SHORT(n.end)}` : rep ? 'Repeating note' : 'Day note' },
    { label: 'Edit text', hint: span ? '' : hint('edit'), action: () => (span ? editNoteDetails(anchor, id, { day: occDay }) : editNote(id)) },
    { label: 'Dates, repeat and category…', hint: span ? hint('edit') : '', action: () => editNoteDetails(anchor, id, { day: occDay }) },
    ...(span ? [] : [{ label: 'Stretch across days…', action: () => { if (!n.end) M.updateNote(id, { end: isoDate(addDays(parseLocal(n.date), 2)) }); editNoteDetails(anchor, id, { focusEnd: true }); } }]),
    { label: 'Make it a task', action: () => { M.batch(() => { M.addTask({ title: n.text, date: from }); M.deleteNote(id); }); toast('Turned into a task', false, { label: 'Undo', fn: undo }); } },
    '-',
    { label: 'Move', items: [
      { label: 'A day earlier', action: shift(-1) },
      { label: 'A day later', action: shift(1) },
      { label: 'A week later', action: shift(7) },
    ] },
    { label: 'Copy to next week', disabled: rep, action: () => { M.batch(() => { const c = M.addNote({ date: n.date, end: n.end, text: n.text }); M.moveNote(c.id, { toDay: isoDate(addDays(parseLocal(n.date), 7)) }); }); } },
    '-',
    ...(rep ? [{ label: 'Delete just this day', hint: hint('delete'), danger: true, action: () => skipDay('note', id, from) }] : []),
    { label: rep ? 'Delete every repeat' : 'Delete', hint: rep ? '' : hint('delete'), danger: true, action: () => deleteWithUndo(n.text, () => M.deleteNote(id)) },
  ]);
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
  if (item?.dataset.drag === 'note') return noteMenu(e, item.dataset.id, item.dataset.day);
  const chip = e.target.closest('.cat-chip');
  if (chip) {
    const c = chip.dataset.cat;
    return openMenu(e, [
      { heading: c },
      { label: 'Color and name…', action: () => editCategory(chip, c, catHue) },
      { label: 'Select its tasks on screen', action: () => setSelection([...root.querySelectorAll('[data-drag="task"]')].filter((x) => (M.findTask(x.dataset.id)?.category || '') === c).map(keyOf)) },
      '-',
      { label: 'Remove category', danger: true, action: () => deleteWithUndo(c, () => M.deleteCategory(c)) },
    ]);
  }
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

function onDrop({ kind, id, src, zone, beforeId, el, copy }) {
  if (kind === 'note' && zone.zone === 'category') {
    M.updateNote(id, { category: zone.cat });
    toast(`Tagged ${zone.cat}`, false, { label: 'Undo', fn: undo });
    return;
  }
  if (kind === 'note') {
    if (zone.zone !== 'day') return;
    // The day you grabbed a bar by lands on the day you drop it on.
    const fromDay = src.grab || src.day || null;
    if (copy) {
      const n = M.findNote(id);
      if (n) M.batch(() => { const c = M.addNote({ date: n.date, end: n.end, text: n.text, repeat: n.repeat, weekdays: n.weekdays, until: n.until }); M.moveNote(c.id, { toDay: zone.day, fromDay: fromDay || n.date }); });
    } else M.moveNote(id, { toDay: zone.day, fromDay, beforeId });
    return;
  }
  // Alt held while dropping: leave the originals and drop copies.
  if (copy && zone.zone === 'day') {
    const multi = selectionSize() > 1 && el && isSelected(el);
    if (kind === 'task') {
      const items = multi ? selTasks().map((x) => ({ task: M.findTask(x.id), day: x.day })) : [{ task: M.findTask(id), day: src.day || '' }];
      const grabbed = src.day || zone.day;
      const days = items.map((x) => x.day).filter(Boolean).sort();
      const base = days[0] || grabbed;
      const newBase = isoDate(addDays(parseLocal(zone.day), daysBetween(parseLocal(grabbed), parseLocal(base))));
      let made;
      M.batch(() => { made = M.pasteTasks(items, newBase); });
      if (multi) setSelection(made.map((t) => `t:${t.id}:${t.date}`));
      toast(`Copied ${made.length}`, false, { label: 'Undo', fn: undo });
      return;
    }
    if (kind === 'day-goal') {
      const g = M.findGoal(id);
      if (g) M.addGoal({ scope: 'day', date: zone.day, title: g.title, target: g.target || 1 });
      return;
    }
  }
  if (selectionSize() > 1 && el && isSelected(el)) {
    if (zone.zone === 'day') bulkMoveTo(zone.day, { anchorDay: src.day || (kind === 'day-goal' ? M.findGoal(id)?.date : null) || null });
    else if (zone.zone === 'inbox') bulkUnschedule('');
    else if (zone.zone === 'project') { bulkSet({ projectId: zone.project }); expanded.add(zone.project); }
    return;
  }
  if (kind === 'task' && zone.zone === 'category') {
    if (selectionSize() > 1 && el && isSelected(el)) bulkSet({ category: zone.cat });
    else M.updateTask(id, { category: zone.cat });
    toast(`Tagged ${zone.cat}`, false, { label: 'Undo', fn: undo });
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

// The focused item (or null) as { el, id, kind, day }.
function focusedItem() {
  const el = document.activeElement?.closest?.('[data-id]');
  return el && root.contains(el) ? { el, id: el.dataset.id, kind: el.dataset.drag, day: el.dataset.day || null } : null;
}

// Copies of the selection (or the focused item) on the same days.
function duplicateItems() {
  const multi = selectionSize() > 1;
  const it = focusedItem();
  M.batch(() => {
    if (multi) {
      const made = M.pasteTasks(selTasks().map((x) => ({ task: M.findTask(x.id), day: x.day })).filter((x) => x.task), null);
      for (const x of selGoals()) { const g = M.findGoal(x.id); M.addGoal({ scope: g.scope, date: g.date, title: g.title, target: g.target || 1 }); }
      setSelection(made.map((t) => `t:${t.id}:${t.date}`));
    } else if (it?.kind === 'task') {
      flash = M.duplicateTask(it.id)?.id || null;
    } else if (it?.kind === 'note') {
      const n = M.findNote(it.id);
      flash = M.addNote({ date: n.date, end: n.end, text: n.text, repeat: n.repeat, weekdays: n.weekdays, until: n.until })?.id || null;
    } else if (it && /goal$/.test(it.kind)) {
      const g = M.findGoal(it.id);
      flash = M.addGoal({ scope: g.scope, date: g.date, title: g.title, target: g.target || 1 })?.id || null;
    }
  });
  toast('Duplicated', false, { label: 'Undo', fn: undo });
}

// Move the selection or focused item by `days` (tasks, notes and day goals).
function shiftItems(days) {
  if (selectionSize() > 1) { bulkShift(days); return; }
  const it = focusedItem();
  if (!it) return;
  if (it.kind === 'task' && it.day) {
    const to = isoDate(addDays(parseLocal(it.day), days));
    M.moveTask(it.id, to, { fromDay: it.day });
    if (view === 'days') { ensureRange(to); if (!isDayVisible(to)) goDays(days > 0 ? Math.min(days, 7) : Math.max(days, -7)); }
    [...root.querySelectorAll(`[data-id="${it.id}"]`)].find((x) => x.dataset.day === to)?.focus({ preventScroll: true });
  } else if (it.kind === 'note') {
    const from = it.day || M.findNote(it.id).date;
    M.moveNote(it.id, { toDay: isoDate(addDays(parseLocal(from), days)), fromDay: from });
  } else if (it.kind === 'day-goal') {
    const g = M.findGoal(it.id);
    M.moveGoal(it.id, { date: isoDate(addDays(parseLocal(g.date), days)) });
  }
}

function moveItemsTo(dayKey) {
  if (selectionSize() > 1) { dayKey ? bulkMoveTo(dayKey) : bulkUnschedule(); return; }
  const it = focusedItem();
  if (it?.kind === 'task') M.moveTask(it.id, dayKey, { fromDay: it.day });
  else if (it?.kind === 'note' && dayKey) M.moveNote(it.id, { toDay: dayKey, fromDay: it.day || M.findNote(it.id).date });
}

const VIEWS = ['days', 'month', 'list'];

// What each bindable action does. Returns false if it didn't apply (so the key does its normal thing).
function runAction(id) {
  const it = focusedItem();
  const multi = selectionSize() > 1;
  const today = startOfDay(new Date());
  switch (id) {
    case 'today': goToday(); return true;
    case 'back': if (view === 'list') return false; view === 'month' ? goMonth(-1) : goDays(-1); return true;
    case 'forward': if (view === 'list') return false; view === 'month' ? goMonth(1) : goDays(1); return true;
    case 'backWeek': if (view !== 'days') return false; goDays(-7); return true;
    case 'forwardWeek': if (view !== 'days') return false; goDays(7); return true;
    case 'cycleView': setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]); return true;
    case 'viewDays': setView('days'); return true;
    case 'viewMonth': setView('month'); return true;
    case 'viewList': setView('list'); return true;
    case 'selectAll': if (view === 'list') return false; selectVisible(); return true;
    case 'selectBy': openSelectFilter(); return true;
    case 'shortcuts': openShortcuts(); return true;
  }
  if (!multi && !it) return false;
  switch (id) {
    case 'done':
      if (multi) bulkDone();
      else if (it.kind === 'task') M.toggleTask(it.id, it.day);
      else if (/goal$/.test(it.kind)) M.bumpGoal(it.id, 1);
      else if (it.kind === 'project') { expanded.has(it.id) ? expanded.delete(it.id) : expanded.add(it.id); render(); }
      else return false;
      return true;
    case 'edit':
      if (multi) return false;
      if (it.kind === 'task') editTask(it.el, it.id, it.day);
      else if (it.kind === 'note') (it.el.dataset.span ? editNoteDetails(it.el, it.id, { day: it.day }) : editNote(it.id));
      else if (/goal$/.test(it.kind)) editGoal(it.el, it.id);
      else if (it.kind === 'project') editProject(it.el, it.id);
      return true;
    case 'duplicate': duplicateItems(); return true;
    case 'due':
      if (multi) bulkDue();
      else if (it.kind === 'task') editDueDates(it.el, [it.id]);
      else return false;
      return true;
    case 'delete':
      if (multi) bulkDelete();
      else if (it.kind === 'task') {
        const t = M.findTask(it.id);
        if (t.repeat && t.repeat !== 'none' && it.day) skipDay('task', it.id, it.day);
        else deleteWithUndo(t.title, () => M.deleteTask(it.id));
      } else if (it.kind === 'note') {
        const n = M.findNote(it.id);
        if (n.repeat && n.repeat !== 'none' && it.day) skipDay('note', it.id, it.day);
        else deleteWithUndo(n.text, () => M.deleteNote(it.id));
      }
      else if (/goal$/.test(it.kind)) deleteWithUndo(M.findGoal(it.id).title, () => M.deleteGoal(it.id));
      else return false;
      return true;
    case 'later': shiftItems(1); return true;
    case 'earlier': shiftItems(-1); return true;
    case 'weekLater': shiftItems(7); return true;
    case 'tomorrow': moveItemsTo(isoDate(addDays(today, 1))); return true;
    case 'inbox': moveItemsTo(''); return true;
    case 'p0': case 'p1': case 'p2': case 'p3': {
      const v = +id[1];
      if (multi) bulkSet({ priority: v });
      else if (it.kind === 'task') M.updateTask(it.id, { priority: v });
      else return false;
      return true;
    }
    case 'menu': {
      if (multi) {
        const r = $('selBar').getBoundingClientRect();
        selectionMenu({ preventDefault() {}, target: $('selBar'), clientX: r.left, clientY: r.top - 8, type: 'keydown' });
      } else {
        const r = it.el.getBoundingClientRect();
        it.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 20, clientY: r.bottom - 4 }));
      }
      return true;
    }
    default: return false;
  }
}

function onKey(e) {
  if (shortcutsOpen()) return;
  const inField = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
  const overlay = document.querySelector('.pop, .ctx-root, .qa-backdrop');
  const mod = e.ctrlKey || e.metaKey;
  const action = inField ? null : actionFor(e);

  // Quick add works from any tab (Ctrl/Cmd+K always does).
  const quick = { quickAdd: {}, quickNote: { kind: 'note' }, quickGoal: { kind: 'day-goal' }, quickProject: { kind: 'project' } }[action]
    || (!inField && mod && e.key.toLowerCase() === 'k' ? {} : null);
  if (quick && !isQuickAddOpen() && !overlay) {
    e.preventDefault();
    const focusedDay = visible() ? document.activeElement?.closest?.('[data-zone="day"]')?.dataset.day : null;
    openQuickAdd({ ...quick, day: focusedDay || undefined, week: visible() ? isoDate(focusWeek) : undefined });
    return;
  }
  if (!visible() || inField || overlay) return;
  if (e.key === 'Escape' && selectionSize()) { clearSelection(); return; }
  if (e.key === 'Escape' && selFilter) { applySelectFilter(null); toast('Selection filter off'); return; }
  if (action && runAction(action)) { e.preventDefault(); }
}

/* ----------------------------- stretching notes ----------------------------- */

const dayUnder = (x, y) => document.elementsFromPoint(x, y).find((el) => el.matches?.('[data-zone="day"]'))?.dataset.day || null;

// Drag a note's end (or a bar's start) across days. `occStart` is the appearance being stretched,
// so repeating notes change for every repeat. Live preview, one undo step, Esc cancels.
function startStretch(e, id, edge, occStart) {
  const n = M.findNote(id);
  if (!n) return;
  e.preventDefault();
  e.stopPropagation();
  const orig = { date: n.date, end: n.end };
  const len0 = noteLength(n);
  const occEnd = isoDate(addDays(parseLocal(occStart), len0));
  const seriesEnd = isoDate(addDays(parseLocal(orig.date), len0));
  let last = null;
  let queued = false;
  document.body.classList.add('is-stretching');
  closePopover();

  const apply = (day) => {
    if (edge === 'end') {
      const to = day < occStart ? occStart : day;
      const len = daysBetween(parseLocal(occStart), parseLocal(to));
      n.date = orig.date;
      n.end = len ? isoDate(addDays(parseLocal(orig.date), len)) : undefined;
    } else {
      const from = day > occEnd ? occEnd : day;
      n.date = isoDate(addDays(parseLocal(orig.date), daysBetween(parseLocal(occStart), parseLocal(from))));
      n.end = seriesEnd > n.date ? seriesEnd : undefined;
    }
    if (!n.end) delete n.end;
  };
  const scroller = edgeScroller(() => { if (last) onMove(last); });
  const onMove = (ev) => {
    last = { clientX: ev.clientX, clientY: ev.clientY };
    scroller.update(ev.clientX, ev.clientY);
    const day = dayUnder(ev.clientX, ev.clientY);
    if (!day) return;
    apply(day);
    if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; render(); }); }
  };
  const finish = (keep) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('keydown', onKey, true);
    scroller.stop();
    document.body.classList.remove('is-stretching');
    const final = { date: n.date, end: n.end || '' };
    n.date = orig.date;
    if (orig.end) n.end = orig.end; else delete n.end;
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (keep && (final.date !== orig.date || final.end !== (orig.end || ''))) {
      M.updateNote(id, final);
      if (final.end) toast(`${n.text}: ${SHORT(final.date)} – ${SHORT(final.end)}`, false, { label: 'Undo', fn: undo });
    } else render();
  };
  const onUp = () => finish(true);
  const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); } };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);
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
      if (prev) {
        Object.assign(prev, { title: item.title, date: item.date, time: item.time, end: item.end || '', repeat: item.repeat, until: item.until });
        if (item.weekdays) prev.weekdays = item.weekdays; else delete prev.weekdays;
        updated++;
      }
      else { ev().push({ id: uid(), source, category: M.canonicalCategory(source.slice(0, 24)), done: false, ...item }); added++; }
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
  // Pasting a list into an inline box adds one item per line.
  root.addEventListener('paste', (e) => {
    const input = e.target.closest?.('[data-inline]');
    if (!input || input.dataset.inline.startsWith('editnote:')) return;
    const lines = cleanLines(e.clipboardData?.getData('text') || '');
    if (lines.length > 1) { e.preventDefault(); submitInline(input, lines); }
  });
  root.addEventListener('pointermove', (e) => {
    hoverDay = e.target.closest?.('[data-zone="day"]')?.dataset.day || null;
    hoverZone = e.target.closest?.('[data-zone]')?.dataset.zone || null;
  }, { passive: true });
  root.addEventListener('pointerleave', () => { hoverDay = null; hoverZone = null; });
  // Note handles: stretch a note across days. And for bars, remember which day was grabbed so a
  // drop lines that day up with the day under the pointer.
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const grip = e.target.closest('[data-grip]');
    const note = e.target.closest('[data-drag="note"]');
    if (grip && note) { startStretch(e, note.dataset.id, grip.dataset.grip, note.dataset.day); return; }
    if (note?.dataset.span) note.dataset.grab = dayUnder(e.clientX, e.clientY) || note.dataset.day;
  }, true);
  // Hold the right mouse button and drag to pan the board. A plain right-click still opens the menu:
  // the menu waits until the button comes back up without having moved.
  let pan = null;
  let skipMenu = false; // the menu event some systems send right after a pan ends
  window.addEventListener('pointerdown', () => { skipMenu = false; }, true);
  scrollEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 2 || e.target.closest('input, textarea')) return;
    pan = { x: e.clientX, y: e.clientY, left: scrollEl.scrollLeft, top: scrollEl.scrollTop, moved: false, menu: null };
  });
  window.addEventListener('pointermove', (e) => {
    if (!pan) return;
    if (!(e.buttons & 2)) { pan = null; document.body.classList.remove('is-panning'); return; }
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) < 6) return;
    if (!pan.moved) { pan.moved = true; closeMenu(); document.body.classList.add('is-panning'); }
    scrollEl.scrollLeft = pan.left - dx;
    scrollEl.scrollTop = pan.top - dy;
  });
  window.addEventListener('pointerup', (e) => {
    if (!pan || e.button !== 2) return;
    const p = pan;
    pan = null;
    document.body.classList.remove('is-panning');
    if (p.moved) skipMenu = true;
    else if (p.menu) onContext(p.menu);
  });
  // Some systems fire the menu event on press, others on release: hold it until we know it wasn't a pan.
  root.addEventListener('contextmenu', (e) => {
    if (skipMenu) { skipMenu = false; e.preventDefault(); e.stopPropagation(); return; }
    if (pan && !pan.moved && !e.target.closest('input, textarea')) {
      e.preventDefault();
      e.stopPropagation();
      pan.menu = { target: e.target, clientX: e.clientX, clientY: e.clientY, detail: 1, type: 'contextmenu', preventDefault() {} };
    }
  }, true);
  $('planKeys').addEventListener('click', openShortcuts);
  $('planSelect').addEventListener('click', () => openSelectFilter());
  $('planSelectOff').addEventListener('click', () => { applySelectFilter(null); toast('Selection filter off'); });

  // Hovering (or focusing) a task with a due date lights up that day and says how far away it is.
  let dueFor = null;
  let dueTip = null;
  const clearDue = () => {
    dueFor = null;
    root.querySelectorAll('.due-hl').forEach((c) => { c.classList.remove('due-hl'); delete c.dataset.dueLabel; });
    dueTip?.remove(); dueTip = null;
  };
  const showDue = (el) => {
    if (el === dueFor) return;
    clearDue();
    if (document.body.matches('.is-dragging, .is-selecting, .is-stretching, .is-panning')) return;
    dueFor = el;
    const due = el.dataset.due;
    const t = M.findTask(el.dataset.id);
    const main = scrollEl.getBoundingClientRect();
    let onScreen = null;
    root.querySelectorAll(`.day[data-day="${due}"], .mday[data-day="${due}"]`).forEach((c) => {
      if (!c.offsetParent) return;
      c.classList.add('due-hl');
      c.dataset.dueLabel = `Due: ${t?.title || ''}`;
      const r = c.getBoundingClientRect();
      if (r.right > main.left + 4 && r.left < main.right - 4) onScreen = c;
    });
    const n = daysBetween(startOfDay(new Date()), parseLocal(due));
    const rel = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n < 0 ? `${-n} days ago` : `in ${n} days`;
    let text = `⚑ Due ${parseLocal(due).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${rel}`;
    if (!onScreen && view !== 'list') text += parseLocal(due) > parseLocal(el.dataset.day || todayKey()) ? '  →' : '  ←';
    dueTip = document.createElement('div');
    dueTip.className = `due-tip${n < 0 ? ' late' : n <= 2 ? ' soon' : ''}`;
    dueTip.textContent = text;
    document.body.appendChild(dueTip);
    const r = el.getBoundingClientRect();
    dueTip.style.left = `${Math.min(window.innerWidth - dueTip.offsetWidth - 8, r.left)}px`;
    dueTip.style.top = `${r.bottom + 6 + dueTip.offsetHeight > window.innerHeight ? r.top - dueTip.offsetHeight - 6 : r.bottom + 6}px`;
  };
  root.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-due]');
    if (el) showDue(el); else if (dueFor) clearDue();
  });
  root.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-due]'); if (el) showDue(el); });
  root.addEventListener('focusout', (e) => { if (e.target === dueFor) clearDue(); });
  root.addEventListener('pointerleave', clearDue);
  root.addEventListener('pointerdown', clearDue, true);
  onChange(() => { if (dueFor && !dueFor.isConnected) clearDue(); });
  document.addEventListener('copy', onCopy);
  document.addEventListener('paste', onPaste);
  // Clicking away from a note being edited saves it.
  root.addEventListener('focusout', (e) => {
    const input = e.target.closest?.('[data-inline^="editnote:"]');
    if (!input) return;
    setTimeout(() => { if (inline?.zone === input.dataset.inline && !root.querySelector(`[data-inline="${inline.zone}"]:focus`)) submitInline(input); }, 120);
  });
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
    canStart: (e) => view !== 'list' && !e.target.closest('[data-drag], button, input, textarea, select, a'),
  });
  onSelectionChange(() => { paintSelection(root); renderSelectionBar(); });

  $('weekPrev').addEventListener('click', () => (view === 'month' ? goMonth(-1) : goDays(-7)));
  $('weekNext').addEventListener('click', () => (view === 'month' ? goMonth(1) : goDays(7)));
  $('weekThis').addEventListener('click', goToday);
  $('planFab').addEventListener('click', () => openQuickAdd({ week: isoDate(focusWeek) }));
  root.querySelectorAll('.view-toggle button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  // When scrolling stops part-way through a day, settle on the nearest whole day.
  let held = false;
  window.addEventListener('pointerdown', () => { held = true; }, true);
  window.addEventListener('pointerup', () => { held = false; settle(); }, true);
  let settleTimer = 0;
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (view !== 'days' || held || document.body.matches('.is-dragging, .is-selecting, .is-stretching, .is-panning')) return;
      const target = Math.round(scrollEl.scrollLeft / colW) * colW;
      if (Math.abs(target - scrollEl.scrollLeft) > 1) scrollEl.scrollTo({ left: target, behavior: 'smooth' });
    }, 160);
  };
  scrollEl.addEventListener('scroll', settle, { passive: true });
  // A plain mouse wheel scrolls the days sideways, unless a day is tall enough to need scrolling down.
  scrollEl.addEventListener('wheel', (e) => {
    if (view !== 'days' || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const overHeader = e.target.closest('.day-head');
    const fitsVertically = scrollEl.scrollHeight <= scrollEl.clientHeight + 1;
    if (overHeader || fitsVertically || e.shiftKey) {
      e.preventDefault();
      scrollEl.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : 1);
    }
  }, { passive: false });
  new ResizeObserver(() => {
    if (!visible()) return;
    if (view === 'days') sizeColumns();
    else if (view === 'month') collapseMonth();
  }).observe(scrollEl);

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
    if (visible() && view === 'days') {
      if (kind === 'task' && item.date) revealDay(item.date);
      if (kind === 'day-goal') revealDay(item.date);
      if (kind === 'week-goal' && isoDate(focusWeek) !== item.date) scrollToDay(item.date, { smooth: true, before: 0 });
    } else if (visible() && view === 'month' && (kind === 'task' || kind === 'day-goal') && item.date) {
      const d = parseLocal(item.date);
      if (d.getMonth() !== monthCursor.getMonth() || d.getFullYear() !== monthCursor.getFullYear()) { monthCursor = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
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
  const onShown = () => {
    if (view === 'days') { sizeColumns(); render({ timeline: false }); }
    else if (view === 'month') collapseMonth();
  };
  new MutationObserver(() => { if (visible()) onShown(); }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  if (visible()) onShown();
}
