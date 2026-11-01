// Read-only helpers for planner data (tasks, goals, projects).
// Shared by the editor's Plan tab and the wall panels.
//
// Data lives in config.data:
//   events   [{ id, title, date?, time?, due?, category?, repeat, until?, skip?[], done?, doneOn?[], projectId?, notes?, order? }]
//            `date` is the day you plan to do it; `due` is when it's due (they can differ).
//            An item without a date is an unscheduled task (inbox, or a project's backlog).
//   goals    [{ id, scope: 'day'|'week', date, title, target, count, order? }]
//            Week goals use the first day of their week as `date`.
//   projects [{ id, title, hue, due?, archived?, progress?, notes?, order? }]
//            `progress` (0–100) is only used for projects that have no tasks.
//   notes    [{ id, date, end?, text, category?, repeat?, until?, skip?[], order? }]   on a day, or across days when `end` is set
//            `skip` lists single days removed from a repeat.
//   categoryColors { [lowercase category]: hue }   colors you picked for categories

import { isoDate, addDays, weekStartOf, parseLocal, daysBetween, occurrences } from './util.js';

export const isGoalDone = (g) => (g.count || 0) >= (g.target || 1);

export function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0);
}

// How many extra days a note covers (0 for a one-day note).
export function noteLength(n) {
  return n.end && n.end > n.date ? daysBetween(parseLocal(n.date), parseLocal(n.end)) : 0;
}

// Every appearance of every note that touches [from, from + days): repeats are expanded and each
// appearance of a multi-day note keeps its length. → [{ note, start, end, len }]
export function noteOccurrences(notes, from, days) {
  const first = isoDate(from);
  const last = isoDate(addDays(from, days - 1));
  const out = [];
  for (const n of notes || []) {
    if (!n || !n.date || !n.text) continue;
    const len = noteLength(n);
    const starts = [];
    if (!n.repeat || n.repeat === 'none') starts.push(n.date);
    else {
      // Reuse the task repeat rules; start early enough to catch a long note already in progress.
      const fake = { id: n.id, title: 'x', date: n.date, repeat: n.repeat, until: n.until || '', weekdays: n.weekdays, skip: n.skip };
      for (const o of occurrences([fake], { from: addDays(from, -len), days: days + len })) starts.push(o.day);
    }
    for (const start of starts) {
      const end = len ? isoDate(addDays(parseLocal(start), len)) : start;
      if (end >= first && start <= last) out.push({ note: n, start, end, len });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start) || b.len - a.len || byOrder(a.note, b.note));
}

// Notes to show on one day, including days inside a multi-day note. Each comes with start/end/len.
export function notesForDay(notes, day) {
  const d = typeof day === 'string' ? parseLocal(day) : day;
  return noteOccurrences(notes, d, 1).map((o) => ({ ...o.note, start: o.start, end: o.end, len: o.len }));
}

export function goalsForDay(goals, day) {
  const key = typeof day === 'string' ? day : isoDate(day);
  return goals.filter((g) => g.scope === 'day' && g.date === key).sort(byOrder);
}

export function goalsForWeek(goals, start) {
  const from = isoDate(start);
  const to = isoDate(addDays(start, 7));
  return goals.filter((g) => g.scope === 'week' && g.date >= from && g.date < to).sort(byOrder);
}

export function currentWeek(weekStart = 'monday', now = new Date()) {
  return weekStartOf(now, weekStart);
}

export function projectTasks(events, projectId) {
  return events.filter((e) => e.projectId === projectId);
}

// { done, total, pct } — counts tasks; falls back to the manual slider if there are none.
export function projectProgress(project, events) {
  const tasks = projectTasks(events, project.id);
  if (!tasks.length) {
    const pct = Math.max(0, Math.min(100, Number(project.progress) || 0));
    return { done: 0, total: 0, pct, manual: true };
  }
  const done = tasks.filter((t) => t.done).length;
  return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100), manual: false };
}

// The next thing to do in a project: earliest scheduled open task, else the first unscheduled one.
export function nextProjectTask(events, projectId) {
  const open = projectTasks(events, projectId).filter((t) => !t.done);
  const dated = open.filter((t) => t.date).sort((a, b) => (parseLocal(a.date, a.time) - parseLocal(b.date, b.time)));
  return dated[0] || open.sort(byOrder)[0] || null;
}

export function daysUntil(date, now = new Date()) {
  const d = parseLocal(date);
  return d ? daysBetween(now, d) : null;
}

// A category's color: the one you picked (data.categoryColors, keyed by lowercase name), otherwise a
// stable soft color worked out from the name, so "school" is always the same tint.
export function categoryHue(name, colors = null) {
  const key = String(name || '').toLowerCase();
  if (colors && colors[key] != null) return colors[key];
  let h = 0;
  for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
