// Read-only helpers for planner data (tasks, goals, projects).
// Shared by the editor's Plan tab and the wall panels.
//
// Data lives in config.data:
//   events   [{ id, title, date?, time?, category?, repeat, until?, done?, doneOn?[], projectId?, notes?, order? }]
//            An item without a date is an unscheduled task (inbox, or a project's backlog).
//   goals    [{ id, scope: 'day'|'week', date, title, target, count, order? }]
//            Week goals use the first day of their week as `date`.
//   projects [{ id, title, hue, due?, archived?, progress?, notes?, order? }]
//            `progress` (0–100) is only used for projects that have no tasks.

import { isoDate, addDays, weekStartOf, parseLocal, daysBetween } from './util.js';

export const isGoalDone = (g) => (g.count || 0) >= (g.target || 1);

export function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0);
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

// Stable soft color per category name, so "school" is always the same tint.
export function categoryHue(name) {
  let h = 0;
  for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
