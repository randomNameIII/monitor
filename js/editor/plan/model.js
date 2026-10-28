// Mutations for planner data. Every change ends in commit('events') so it is undoable,
// saved locally, mirrored to a local display, and auto-published to the gist.

import { state, commit } from '../state.js';
import { uid } from '../../core/config.js';
import { isoDate, addDays, parseLocal, daysBetween } from '../../core/util.js';
import { isGoalDone, byOrder } from '../../core/planning.js';

export const data = () => state.cfg.data;
export const findTask = (id) => data().events.find((e) => e.id === id);
export const findGoal = (id) => data().goals.find((g) => g.id === id);
export const findProject = (id) => data().projects.find((p) => p.id === id);

let batching = 0;
const save = (opts) => { if (!batching) commit('events', opts); };

// Run several changes as one undo step (used for actions on a multi-selection).
export function batch(fn) {
  batching++;
  try { fn(); } finally { batching--; }
  if (!batching) commit('events');
}
const nextOrder = (list) => (list.length ? Math.max(...list.map((x) => x.order ?? 0)) + 1 : 0);

/* ---------------- tasks ---------------- */

export function addTask(fields) {
  const t = {
    id: uid(), title: fields.title || 'Untitled', date: fields.date || '', time: fields.time || '',
    category: fields.category || '', repeat: fields.repeat || 'none', until: '',
    projectId: fields.projectId || '', done: false,
  };
  t.order = nextOrder(data().events.filter((e) => e.date === t.date && !e.time));
  data().events.push(t);
  save();
  return t;
}

// opts.group merges rapid edits (typing) into one undo step.
export function updateTask(id, patch, opts) {
  const t = findTask(id);
  if (!t) return;
  Object.assign(t, patch);
  save(opts);
}

// Toggle done. For repeating tasks only the given day is ticked.
export function toggleTask(id, day) {
  const t = findTask(id);
  if (!t) return;
  if (t.repeat && t.repeat !== 'none' && day) {
    const set = new Set(t.doneOn || []);
    set.has(day) ? set.delete(day) : set.add(day);
    t.doneOn = [...set];
  } else {
    t.done = !t.done;
  }
  save();
}

export function isTaskDoneOn(t, day) {
  return t.repeat && t.repeat !== 'none' ? (t.doneOn || []).includes(day) : !!t.done;
}

// Move to another day (or '' to unschedule). `fromDay` is the occurrence being dragged, so a
// repeating series shifts by the same number of days. `beforeId` places it among untimed items.
export function moveTask(id, toDay, { fromDay = null, beforeId = null, projectId } = {}) {
  const t = findTask(id);
  if (!t) return;
  if (projectId !== undefined) t.projectId = projectId;
  const repeating = t.repeat && t.repeat !== 'none';
  if (repeating && toDay && fromDay && t.date) {
    const delta = daysBetween(parseLocal(fromDay), parseLocal(toDay));
    t.date = isoDate(addDays(parseLocal(t.date), delta));
    if (t.until) t.until = isoDate(addDays(parseLocal(t.until), delta));
    t.doneOn = (t.doneOn || []).map((d) => isoDate(addDays(parseLocal(d), delta)));
  } else {
    t.date = toDay || '';
    if (!toDay) { t.time = ''; t.repeat = 'none'; t.until = ''; }
  }
  if (!t.time) {
    // Untimed tasks on a day are ordered together; unscheduled ones are ordered within their project (or the inbox).
    const siblings = data().events.filter((e) => e !== t && !e.time && (e.date || '') === (t.date || '')
      && (t.date || (e.projectId || '') === (t.projectId || '')));
    reorderInto(siblings, t, beforeId);
  }
  save();
}

export function duplicateTask(id) {
  const t = findTask(id);
  if (!t) return null;
  const copy = { ...structuredClone(t), id: uid(), done: false, doneOn: [] };
  data().events.push(copy);
  save();
  return copy;
}

export function deleteTask(id) {
  data().events = data().events.filter((e) => e.id !== id);
  save();
}

/* ---------------- goals ---------------- */

export function addGoal({ scope, date, title, target = 1 }) {
  const g = { id: uid(), scope, date, title: title || 'New goal', target: Math.max(1, target), count: 0 };
  g.order = nextOrder(data().goals.filter((x) => x.scope === scope && x.date === date));
  data().goals.push(g);
  save();
  return g;
}

export function updateGoal(id, patch, opts) {
  const g = findGoal(id);
  if (!g) return;
  Object.assign(g, patch);
  g.target = Math.max(1, Math.round(g.target || 1));
  g.count = Math.max(0, Math.min(g.target, Math.round(g.count || 0)));
  save(opts);
}

// Checkbox goals toggle; counter goals step up (or down with dir = -1).
export function bumpGoal(id, dir = 1) {
  const g = findGoal(id);
  if (!g) return;
  const target = g.target || 1;
  if (target === 1) g.count = isGoalDone(g) ? 0 : 1;
  else g.count = Math.max(0, Math.min(target, (g.count || 0) + dir));
  save();
}

export function moveGoal(id, { scope, date, beforeId = null }) {
  const g = findGoal(id);
  if (!g) return;
  if (scope) g.scope = scope;
  if (date) g.date = date;
  reorderInto(data().goals.filter((x) => x !== g && x.scope === g.scope && x.date === g.date), g, beforeId);
  save();
}

export function deleteGoal(id) {
  data().goals = data().goals.filter((g) => g.id !== id);
  save();
}

/* ---------------- projects ---------------- */

const HUES = [220, 160, 280, 30, 340, 190, 100, 250];

export function addProject({ title, due = '' }) {
  const used = new Set(data().projects.map((p) => p.hue));
  const hue = HUES.find((h) => !used.has(h)) ?? Math.floor(Math.random() * 360);
  const p = { id: uid(), title: title || 'New project', hue, due, archived: false, progress: 0 };
  p.order = nextOrder(data().projects);
  data().projects.push(p);
  save();
  return p;
}

export function updateProject(id, patch, opts) {
  const p = findProject(id);
  if (!p) return;
  Object.assign(p, patch);
  save(opts);
}

export function moveProject(id, beforeId) {
  const p = findProject(id);
  if (!p) return;
  reorderInto(data().projects.filter((x) => x !== p), p, beforeId);
  save();
}

// Removing a project keeps its tasks (they lose the link) unless withTasks is true.
export function deleteProject(id, { withTasks = false } = {}) {
  data().projects = data().projects.filter((p) => p.id !== id);
  if (withTasks) data().events = data().events.filter((e) => e.projectId !== id);
  else for (const e of data().events) if (e.projectId === id) e.projectId = '';
  save();
}

/* ---------------- ordering ---------------- */

// Give `item` an order that places it before `beforeId` among `siblings` (or at the end).
function reorderInto(siblings, item, beforeId) {
  const list = siblings.sort(byOrder);
  const idx = beforeId ? list.findIndex((x) => x.id === beforeId) : -1;
  if (idx === -1) list.push(item); else list.splice(idx, 0, item);
  list.forEach((x, i) => { x.order = i; });
}
