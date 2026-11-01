// Turns a quick-add line into structured fields.
//
//   "Lab report fri 5pm #school"        → task, Friday 17:00, category school
//   "Thesis outline @thesis tomorrow"   → task in project "thesis", tomorrow
//   "Gym 3x"                            → (as a goal) target 3
//   "Calculus every mon 10am"           → weekly from next Monday at 10:00
//   "Chem lecture mwf 9-9:50am"         → every Mon, Wed and Fri, 9:00 to 9:50
//   "Office hours tue thu 2-4pm"        → two weekdays in a row also mean "repeats"
//   "Pay rent !!"                       → priority (! · !! · !!!)
//   "Research paper due nov 20"         → (as a project) due date
//   'Study for "SAT" sat'               → quotes keep a word literal; the second "sat" is Saturday
//
// Recognised words are removed from the title. Anything unrecognised stays in the title.

import { isoDate, addDays, startOfDay } from '../../core/util.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function weekdayIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  const special = { tues: 2, weds: 3, thur: 4, thurs: 4 };
  if (special[w] != null) return special[w];
  return WEEKDAYS.findIndex((d) => d.startsWith(w) && (w.length >= 3));
}
function monthIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w));
}

// Next date (today or later) falling on weekday `idx`. `next` pushes it a week further.
function upcomingWeekday(now, idx, next = false) {
  const today = startOfDay(now);
  let diff = (idx - today.getDay() + 7) % 7;
  if (next) diff += diff === 0 ? 7 : 7;
  return addDays(today, diff);
}

// Pick the year that puts month/day nearest in the future (or today).
function futureDate(now, month, day) {
  const today = startOfDay(now);
  let d = new Date(today.getFullYear(), month, day);
  if (d < today && daysAgo(d, today) > 30) d = new Date(today.getFullYear() + 1, month, day);
  return d.getMonth() === month ? d : null;
}
const daysAgo = (d, today) => Math.round((today - d) / 86400000);

// "2pm", "2", "14:30" → { h, m, ap: 'a'|'p'|null, colon }
function clock(str) {
  const m = String(str || '').toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
  return { h: +m[1], m: +(m[2] || 0), ap: m[3] ? m[3][0] : null, colon: !!m[2] };
}
const mins = (c) => c.h * 60 + c.m;
function to24c(c) {
  let h = c.h;
  if (c.ap === 'p' && h < 12) h += 12;
  if (c.ap === 'a' && h === 12) h = 0;
  return { ...c, h, ap: null };
}

// Two clock readings → { time, end }, filling in a missing am/pm from the other side ("11-1pm", "2-3:30pm").
function rangeOf(a, b) {
  if (!a || !b) return null;
  if (!a.ap && !b.ap) {
    // "2-3" alone is too ambiguous (chapters 2-3); "10:00-11:15" or "14-16" is clearly a time.
    if (!(a.colon || b.colon || a.h > 12 || b.h > 12)) return null;
  } else if (!a.ap) {
    a = { ...a, ap: b.ap };
    if (a.h <= 12 && b.h <= 12 && mins(to24c(a)) >= mins(to24c(b))) a.ap = b.ap === 'p' ? 'a' : 'p';
  } else if (!b.ap) {
    b = { ...b, ap: a.ap };
    if (mins(to24c(b)) <= mins(to24c(a))) b.ap = a.ap === 'a' ? 'p' : 'a';
  }
  if ((a.ap && a.h > 12) || (b.ap && b.h > 12)) return null;
  const x = to24c(a), y = to24c(b);
  if (mins(y) <= mins(x)) return null;
  return { time: `${pad(x.h)}:${pad(x.m)}`, end: `${pad(y.h)}:${pad(y.m)}` };
}

function parseRange(tokens, i) {
  const t = tokens[i];
  // single token: 2-3pm · 2pm–3:30pm · 10:00-11:15
  const one = t.match(/^([^-–]+)[-–]([^-–]+)$/);
  if (one) { const r = rangeOf(clock(one[1]), clock(one[2])); if (r) return { ...r, used: 1 }; }
  // three tokens: 2pm - 4pm · 2 to 4pm · 9am until 11
  const sep = (tokens[i + 1] || '').toLowerCase();
  if (['-', '–', 'to', 'until', 'till'].includes(sep) && tokens[i + 2]) {
    const r = rangeOf(clock(t), clock(tokens[i + 2]));
    if (r && (clock(t)?.ap || clock(tokens[i + 2])?.ap || r)) return { ...r, used: 3 };
  }
  return null;
}

function parseTime(tokens, i) {
  const t = tokens[i].toLowerCase();
  const next = (tokens[i + 1] || '').toLowerCase();
  if (t === 'noon') return { time: '12:00', used: 1 };
  if (t === 'midnight') return { time: '23:59', used: 1 };
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)$/);
  if (m) return { time: to24(+m[1], +(m[2] || 0), m[3][0]), used: 1 };
  m = t.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (m && /^(am|pm|a\.m\.|p\.m\.)$/.test(next)) return { time: to24(+m[1], +(m[2] || 0), next[0]), used: 2 };
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m && +m[1] < 24 && +m[2] < 60) return { time: `${pad(+m[1])}:${m[2]}`, used: 1 };
  return null;
}
function to24(h, m, ap) {
  if (h > 12 || m > 59) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return `${pad(h)}:${pad(m)}`;
}
const pad = (n) => String(n).padStart(2, '0');

// Returns { date: Date, used: n } or null.
function parseDate(tokens, i, now) {
  const t = tokens[i].toLowerCase().replace(/[,.]$/, '');
  const n1 = (tokens[i + 1] || '').toLowerCase().replace(/[,.]$/, '');
  const n2 = (tokens[i + 2] || '').toLowerCase().replace(/[,.]$/, '');
  const today = startOfDay(now);

  if (t === 'today' || t === 'tod' || t === 'tonight') return { date: today, used: 1 };
  if (['tomorrow', 'tmr', 'tmrw', 'tom'].includes(t)) return { date: addDays(today, 1), used: 1 };
  if (t === 'yesterday') return { date: addDays(today, -1), used: 1 };

  if (t === 'next' && n1 === 'week') return { date: upcomingWeekday(now, 1, true), used: 2, week: true };
  if (t === 'this' && n1 === 'week') return { date: today, used: 2, week: true };
  if ((t === 'next' || t === 'this') && weekdayIndex(n1) >= 0) {
    return { date: upcomingWeekday(now, weekdayIndex(n1), t === 'next'), used: 2 };
  }
  if (t === 'in' && /^\d+$/.test(n1) && /^(day|days|week|weeks|wk|wks)$/.test(n2)) {
    const mult = n2.startsWith('w') ? 7 : 1;
    return { date: addDays(today, +n1 * mult), used: 3 };
  }
  if (weekdayIndex(t) >= 0) return { date: upcomingWeekday(now, weekdayIndex(t)), used: 1 };

  // oct 30 · october 30th
  if (monthIndex(t) >= 0) {
    const m = n1.match(/^(\d{1,2})(st|nd|rd|th)?$/);
    if (m) { const d = futureDate(now, monthIndex(t), +m[1]); if (d) return { date: d, used: 2 }; }
  }
  // 30 oct · 30th october
  let m = t.match(/^(\d{1,2})(st|nd|rd|th)?$/);
  // "ch 4 nov 12": when the month is followed by a day number too, that one wins.
  if (m && monthIndex(n1) >= 0 && !/^\d{1,2}(st|nd|rd|th)?$/.test(n2)) { const d = futureDate(now, monthIndex(n1), +m[1]); if (d) return { date: d, used: 2 }; }
  // 10/30 · 10/30/2026
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null;
    const d = y ? new Date(y, +m[1] - 1, +m[2]) : futureDate(now, +m[1] - 1, +m[2]);
    if (d && !isNaN(d)) return { date: d, used: 1 };
  }
  // 2026-10-30
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { date: new Date(+m[1], +m[2] - 1, +m[3]), used: 1 };
  return null;
}

// Compact class-schedule codes: mwf, tth, tr, mw …
const CODES = new Set(['mwf', 'mw', 'mf', 'wf', 'tth', 'tuth', 'tr', 'mtwrf', 'mtwthf', 'mtw', 'twr', 'mwr']);
function codeDays(code) {
  const out = [];
  for (let k = 0; k < code.length;) {
    const two = code.slice(k, k + 2);
    if (two === 'th') { out.push(4); k += 2; } else if (two === 'tu') { out.push(2); k += 2; } else if (two === 'sa') { out.push(6); k += 2; } else if (two === 'su') { out.push(0); k += 2; } else {
      const d = { m: 1, t: 2, w: 3, r: 4, f: 5 }[code[k]];
      if (d == null) return null;
      out.push(d); k += 1;
    }
  }
  return out;
}

// Reads a run of weekday names starting at i: "mon wed fri", "mon, wed and fri", "mon/wed/fri", "tuesdays".
function weekdayRun(tokens, i) {
  const days = [];
  let j = i;
  while (j < tokens.length) {
    const raw = tokens[j].toLowerCase().replace(/[,.]$/, '');
    if (['and', '&', ',', '+'].includes(raw) && days.length) { j++; continue; }
    const parts = raw.split('/');
    const idx = parts.map((p) => weekdayIndex(p.replace(/s$/, '').length >= 3 ? p.replace(/(day)s$/, '$1') : p));
    if (idx.some((x) => x < 0)) break;
    days.push(...idx);
    j++;
  }
  // don't swallow a trailing "and"
  while (j > i && ['and', '&', ',', '+'].includes(tokens[j - 1].toLowerCase())) j--;
  return { days: [...new Set(days)], used: j - i };
}

function repeatOn(days, now, used) {
  if (days.length === 1) return { repeat: 'weekly', date: upcomingWeekday(now, days[0]), used };
  const first = days.map((d) => upcomingWeekday(now, d)).sort((a, b) => a - b)[0];
  return { repeat: 'weekly', weekdays: days, date: first, used };
}

function parseRepeat(tokens, i, now) {
  const t = tokens[i].toLowerCase();
  const n1 = (tokens[i + 1] || '').toLowerCase().replace(/[,.]$/, '');
  const simple = { daily: 'daily', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly', annually: 'yearly' };
  if (simple[t]) return { repeat: simple[t], used: 1 };
  if (t === 'weekdays' || ((t === 'every' || t === 'each') && n1 === 'weekday')) return repeatOn([1, 2, 3, 4, 5], now, t === 'weekdays' ? 1 : 2);
  if (t === 'weekends' || ((t === 'every' || t === 'each') && n1 === 'weekend')) return repeatOn([6, 0], now, t === 'weekends' ? 1 : 2);
  if (CODES.has(t)) { const d = codeDays(t); if (d) return repeatOn(d, now, 1); }
  // Two or more weekdays in a row ("tue thu") mean a weekly repeat on those days.
  if (weekdayIndex(t.split('/')[0]) >= 0) {
    const run = weekdayRun(tokens, i);
    if (run.days.length >= 2) return repeatOn(run.days, now, run.used);
  }
  if (t === 'every' || t === 'each') {
    if (CODES.has(n1)) { const d = codeDays(n1); if (d) return repeatOn(d, now, 2); }
    const run = weekdayRun(tokens, i + 1);
    if (run.days.length) return repeatOn(run.days, now, 1 + run.used);
    if (n1 === 'day') return { repeat: 'daily', used: 2 };
    if (n1 === 'week') return { repeat: 'weekly', used: 2 };
    if (n1 === 'month') return { repeat: 'monthly', used: 2 };
    if (n1 === 'year') return { repeat: 'yearly', used: 2 };
    const wd = weekdayIndex(n1.replace(/s$/, ''));
    if (wd >= 0) return { repeat: 'weekly', date: upcomingWeekday(now, wd), used: 2 };
  }
  const plural = t.match(/^(mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|sundays)$/);
  if (plural) return { repeat: 'weekly', date: upcomingWeekday(now, weekdayIndex(t.slice(0, -1))), used: 1 };
  return null;
}

/**
 * @param {string} text
 * @param {object} opts { now, projects: [{id,title}], kind: 'task'|'day-goal'|'week-goal'|'project' }
 */
export function parseQuick(text, { now = new Date(), projects = [], kind = 'task' } = {}) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const out = { title: '', date: null, time: '', end: '', category: '', repeat: 'none', weekdays: null, priority: 0, project: null, newProject: '', target: 1, due: null, week: false };
  const keep = [];

  for (let i = 0; i < tokens.length; ) {
    const tok = tokens[i];
    const low = tok.toLowerCase();

    // "quoted" words are always kept as typed, e.g. Study for "SAT"
    if (/^".+"$/.test(tok)) { keep.push(tok.slice(1, -1)); i++; continue; }

    // Notes keep their wording; only a date (today, fri, nov 12…) is taken out to say which day.
    if (kind === 'note') {
      const nd = parseDate(tokens, i, now);
      if (nd && !out.date) { out.date = nd.date; i += nd.used; continue; }
      keep.push(tok); i++; continue;
    }

    // #category
    if (/^#[\w-]+$/.test(tok)) { out.category = tok.slice(1).toLowerCase(); i++; continue; }

    // ! · !! · !!! priority (also !low, !med, !high, !1–!3)
    if (/^!{1,3}$/.test(tok)) { out.priority = tok.length; i++; continue; }
    const pr = low.match(/^!(1|2|3|low|med|medium|high|urgent)$/);
    if (pr) { out.priority = { 1: 1, 2: 2, 3: 3, low: 1, med: 2, medium: 2, high: 3, urgent: 3 }[pr[1]]; i++; continue; }

    // @project (matches existing projects by prefix; otherwise proposes a new one)
    if (/^@[\w-]+$/.test(tok) && kind === 'task') {
      const q = tok.slice(1).toLowerCase().replace(/[-_]/g, ' ');
      const match = projects.find((p) => p.title.toLowerCase() === q)
        || projects.find((p) => p.title.toLowerCase().startsWith(q))
        || projects.find((p) => p.title.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
      if (match) out.project = match; else out.newProject = tok.slice(1).replace(/[-_]/g, ' ');
      i++; continue;
    }

    // 3x · x3 · 3 times (goals)
    if (kind.endsWith('goal')) {
      let m = low.match(/^(\d{1,3})x$|^x(\d{1,3})$/);
      if (m) { out.target = Math.max(1, +(m[1] || m[2])); i++; continue; }
      if (/^\d{1,3}$/.test(low) && /^times?$/.test((tokens[i + 1] || '').toLowerCase())) { out.target = Math.max(1, +low); i += 2; continue; }
    }

    // due <date> (projects, and tasks too)
    if (low === 'due' || low === 'by') {
      const d = tokens[i + 1] ? parseDate(tokens, i + 1, now) : null;
      if (d) {
        if (kind === 'project') out.due = d.date; else out.date = d.date;
        i += 1 + d.used; continue;
      }
    }

    // repeats
    const r = kind === 'task' ? parseRepeat(tokens, i, now) : null;
    if (r) { out.repeat = r.repeat; if (r.weekdays) out.weekdays = r.weekdays; if (r.date && !out.date) out.date = r.date; i += r.used; continue; }

    // time ranges: 2-3pm · from 2pm to 4pm
    if (low === 'from' && tokens[i + 1]) {
      const rr = parseRange(tokens, i + 1);
      if (rr) { out.time = rr.time; out.end = rr.end; i += 1 + rr.used; continue; }
    }
    const rg = parseRange(tokens, i);
    if (rg) { out.time = rg.time; out.end = rg.end; i += rg.used; continue; }

    // "at 5pm" / "@ 5pm"
    if ((low === 'at' || low === '@') && tokens[i + 1]) {
      const t = parseTime(tokens, i + 1);
      if (t && t.time) { out.time = t.time; i += 1 + t.used; continue; }
      // "at 5" → assume afternoon for 1–7, morning for 8–11
      const bare = (tokens[i + 1] || '').match(/^(\d{1,2})$/);
      if (bare && +bare[1] >= 1 && +bare[1] <= 12) {
        const h = +bare[1];
        out.time = `${pad(h <= 7 ? h + 12 : h)}:00`;
        i += 2; continue;
      }
    }
    const t = parseTime(tokens, i);
    if (t && t.time) { out.time = t.time; i += t.used; continue; }

    const d = parseDate(tokens, i, now);
    if (d) {
      if (kind === 'project') out.due = d.date; else out.date = d.date;
      if (d.week) out.week = true;
      i += d.used; continue;
    }

    keep.push(tok);
    i++;
  }

  // Drop dangling connector words left at the end, e.g. "Call mom on" after removing "friday".
  while (kind !== 'note' && keep.length && /^(on|at|by|for|due|every|in|from|and)$/i.test(keep[keep.length - 1])) keep.pop();
  out.title = keep.join(' ');
  if (out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);
  out.dateKey = out.date ? isoDate(out.date) : '';
  out.dueKey = out.due ? isoDate(out.due) : '';
  return out;
}
