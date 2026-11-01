// Mutations for planner data. Every change ends in commit('events') so it is undoable,
// saved locally, mirrored to a local display, and auto-published to the gist.

import { state, commit } from '../state.js';
import { uid } from '../../core/config.js';
import { isoDate, addDays, parseLocal, daysBetween } from '../../core/util.js';
import { isGoalDone, byOrder, categoryHue } from '../../core/planning.js';

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
    category: canonicalCategory(fields.category), repeat: fields.repeat || 'none', until: '',
    projectId: fields.projectId || '', done: false,
  };
  if (fields.end && t.time) t.end = fields.end;
  if (fields.due) t.due = fields.due;
  if (fields.priority) t.priority = fields.priority;
  if (fields.weekdays?.length > 1 && t.repeat === 'weekly') t.weekdays = [...fields.weekdays];
  if (fields.steps?.length) t.steps = fields.steps.map((x) => ({ id: uid(), title: x.title, done: !!x.done }));
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
    // A Mon/Wed/Fri class dragged a day later becomes Tue/Thu/Sat.
    if (t.weekdays?.length) t.weekdays = t.weekdays.map((w) => (((w + delta) % 7) + 7) % 7);
    if (t.skip?.length) t.skip = t.skip.map((d) => isoDate(addDays(parseLocal(d), delta)));
  } else {
    t.date = toDay || '';
    if (!toDay) { t.time = ''; t.end = ''; t.repeat = 'none'; t.until = ''; delete t.weekdays; }
  }
  if (!t.time) {
    // Untimed tasks on a day are ordered together; unscheduled ones are ordered within their project (or the inbox).
    const siblings = data().events.filter((e) => e !== t && !e.time && (e.date || '') === (t.date || '')
      && (t.date || (e.projectId || '') === (t.projectId || '')));
    reorderInto(siblings, t, beforeId);
  }
  save();
}

// Copies of tasks placed relative to a new day: each keeps its offset from the earliest one copied.
// items: [{ task, day }] (day = the occurrence copied, '' for undated)
export function pasteTasks(items, toDay) {
  const dated = items.filter((x) => x.day);
  const base = dated.length ? dated.map((x) => x.day).sort()[0] : null;
  const made = [];
  for (const { task, day } of items) {
    const copy = { ...structuredClone(task), id: uid(), done: false, doneOn: [] };
    delete copy.uid; delete copy.source;
    if (copy.steps) copy.steps = copy.steps.map((x) => ({ ...x, id: uid(), done: false }));
    if (toDay) {
      const off = day && base ? daysBetween(parseLocal(base), parseLocal(day)) : 0;
      const target = isoDate(addDays(parseLocal(toDay), off));
      // A pasted repeating occurrence becomes a one-off on the new day.
      copy.date = target;
      copy.repeat = 'none'; copy.until = ''; delete copy.weekdays;
    }
    data().events.push(copy);
    made.push(copy);
  }
  save();
  return made;
}

/* ---------------- steps (a checklist inside a task) ---------------- */

export function addStep(taskId, title) {
  const t = findTask(taskId);
  if (!t || !title.trim()) return null;
  t.steps = t.steps || [];
  const st = { id: uid(), title: title.trim(), done: false };
  t.steps.push(st);
  save();
  return st;
}
export function updateStep(taskId, stepId, patch, opts) {
  const st = findTask(taskId)?.steps?.find((x) => x.id === stepId);
  if (!st) return;
  Object.assign(st, patch);
  save(opts);
}
export function deleteStep(taskId, stepId) {
  const t = findTask(taskId);
  if (!t?.steps) return;
  t.steps = t.steps.filter((x) => x.id !== stepId);
  save();
}
export function moveStep(taskId, stepId, toIndex) {
  const t = findTask(taskId);
  const i = t?.steps?.findIndex((x) => x.id === stepId);
  if (i == null || i < 0) return;
  const [st] = t.steps.splice(i, 1);
  t.steps.splice(Math.max(0, Math.min(toIndex, t.steps.length)), 0, st);
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

/* ---------------- categories ---------------- */

export const allCategories = () => [...new Set([...data().events, ...(data().notes || [])].map((e) => e.category).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

// "eng111" typed when "ENG111" already exists → "ENG111", so one category doesn't split in two.
export function canonicalCategory(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return allCategories().find((c) => c.toLowerCase() === n.toLowerCase()) || n;
}

const colorsMap = () => (data().categoryColors ||= {});

export function setCategoryColor(name, hue) {
  const key = name.toLowerCase();
  if (hue == null) delete colorsMap()[key]; else colorsMap()[key] = Math.round(hue) % 360;
  save();
}

// Rename everywhere (any capitalisation of the old name). Renaming onto an existing name merges them.
export function renameCategory(from, to) {
  const target = String(to || '').trim();
  if (!target) return;
  const lo = from.toLowerCase();
  for (const e of [...data().events, ...(data().notes || [])]) if ((e.category || '').toLowerCase() === lo) e.category = target;
  const map = colorsMap();
  // Keep the color it had (custom or automatic), unless the new name already has one of its own.
  if (target.toLowerCase() !== lo) {
    if (map[target.toLowerCase()] == null) map[target.toLowerCase()] = categoryHue(from, map);
    delete map[lo];
  }
  save();
}

export function deleteCategory(name) {
  const lo = name.toLowerCase();
  for (const e of [...data().events, ...(data().notes || [])]) if ((e.category || '').toLowerCase() === lo) e.category = '';
  delete colorsMap()[lo];
  save();
}

/* ---------------- day notes ---------------- */

const notesList = () => (data().notes ||= []);
export const findNote = (id) => notesList().find((n) => n.id === id);

// A note on one day, or across days when `end` is set; it can repeat like a task.
export function addNote({ date, end = '', text, repeat = 'none', weekdays = null, until = '', category = '' }) {
  const n = { id: uid(), date, text: String(text || '').trim() };
  if (!n.text || !date) return null;
  if (category) n.category = canonicalCategory(category);
  if (end && end > date) n.end = end;
  if (repeat && repeat !== 'none') { n.repeat = repeat; if (until) n.until = until; if (weekdays?.length > 1) n.weekdays = [...weekdays]; }
  n.order = nextOrder(notesList().filter((x) => x.date === date));
  notesList().push(n);
  save();
  return n;
}

export function updateNote(id, patch) {
  const n = findNote(id);
  if (!n) return;
  Object.assign(n, patch);
  if (!n.end || n.end <= n.date) delete n.end;
  if (!n.repeat || n.repeat === 'none') { delete n.repeat; delete n.until; delete n.weekdays; }
  save();
}

// Move a note so the appearance that started on `fromDay` starts on `toDay` instead. Multi-day and
// repeating notes shift as a whole, keeping their length and pattern.
export function moveNote(id, { toDay, fromDay = null, beforeId = null }) {
  const n = findNote(id);
  if (!n || !toDay) return;
  const delta = daysBetween(parseLocal(fromDay || n.date), parseLocal(toDay));
  const shift = (d) => (d ? isoDate(addDays(parseLocal(d), delta)) : d);
  n.date = shift(n.date);
  if (n.end) n.end = shift(n.end);
  if (n.until) n.until = shift(n.until);
  if (n.weekdays?.length) n.weekdays = n.weekdays.map((w) => (((w + delta) % 7) + 7) % 7);
  if (n.skip?.length) n.skip = n.skip.map(shift);
  reorderInto(notesList().filter((x) => x !== n && x.date === n.date), n, beforeId);
  save();
}

// Remove one day from a repeating note or task, leaving the rest of the series.
export function skipOccurrence(kind, id, day) {
  const x = kind === 'note' ? findNote(id) : findTask(id);
  if (!x || !day) return;
  x.skip = [...new Set([...(x.skip || []), day])];
  save();
}

export function deleteNote(id) {
  data().notes = notesList().filter((n) => n.id !== id);
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
