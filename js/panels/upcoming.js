import { registerPanel } from '../core/registry.js';
import { occurrences, dayLabel, formatTime, formatTimeRange, startOfDay, addDays, isoDate, parseLocal } from '../core/util.js';
import { notesForDay, categoryHue, wallOrder } from '../core/planning.js';

// Project color wins; otherwise a stable soft color per category name, so "school" is always the same tint.
function tint(ev, projects) {
  const p = ev.projectId && (projects || []).find((x) => x.id === ev.projectId);
  if (p && !ev.category) return { hue: p.hue, tag: p.title };
  return { hue: categoryHue(ev.category, colors), tag: ev.category || (p ? p.title : '') };
}
let colors = null; // set from the board's data on each draw

// A note in a category takes its color.
const noteStyle = (n) => (n.category ? ` class="cat" style="--h:${categoryHue(n.category, colors)}"` : '');

// "⚑ due Fri" next to a task that's due on another day; "⚑ due" on the day itself.
function dueTag(ev) {
  if (!ev.due) return '';
  const late = !ev.done && ev.due < isoDate(new Date());
  const ahead = (parseLocal(ev.due) - startOfDay(new Date())) / 864e5;
  const opts = ahead > 0 && ahead < 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' };
  const when = ev.due === ev.day ? 'due' : `due ${parseLocal(ev.due).toLocaleDateString(undefined, opts)}`;
  return `<span class="due-tag${late ? ' late' : ''}">⚑ ${when}</span>`;
}

// "Winter break · until Jan 12" on the first day it's shown (or the day it starts); "· last day" on its last.
function spanSuffix(n, day, first) {
  if (!n.len) return '';
  const short = (k) => parseLocal(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (day === n.end) return '<span class="n-span"> · last day</span>';
  if (first || day === n.start) return `<span class="n-span"> · until ${short(n.end)}</span>`;
  return '';
}

// "+3 more", "+3 more · 2 done" or "+2 done" for what didn't fit.
function moreText(open, done) {
  if (open && done) return `+${open} more · ${done} done`;
  return open ? `+${open} more` : `+${done} done`;
}

const title = (ctx) => (ctx.settings.title ? `<h3 class="panel-title">${ctx.esc(ctx.settings.title)}</h3>` : '');

// Columns layout: one column per day starting today, each listing that day's events in order.
function mountColumns(ctx) {
  const s = ctx.settings;
  const n = Math.max(2, Math.min(7, Math.round(s.columns) || 4));

  const draw = () => {
    colors = ctx.data.categoryColors || null;
    const now = new Date();
    const today = startOfDay(now);
    // Start the window at midnight so today's earlier events are available to show dimmed.
    const all = occurrences(ctx.data.events, {
      from: s.showPast ? today : now, days: n, categories: String(s.categories || '').split(','),
    });

    let cols = '';
    for (let i = 0; i < n; i++) {
      const day = addDays(today, i);
      const next = addDays(day, 1);
      const items = all.filter((ev) => ev.at >= day && ev.at < next && !(ev.done && !s.showPast))
        // Finished (or already over) at the bottom; otherwise highest priority first.
        .map((ev) => ({ ...ev, done: ev.done || (!ev.allDay && ev.at < now) }))
        .sort(wallOrder);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : day.toLocaleDateString(undefined, { weekday: 'long' });
      const date = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const weekend = day.getDay() === 0 || day.getDay() === 6;

      const list = items.map((ev) => {
        const done = ev.done;
        const soon = !done && !ev.allDay && ev.at >= now && ev.at - now < 3 * 3600 * 1000;
        const { hue, tag: label } = tint(ev, ctx.data.projects);
        const tag = s.showCategory && label ? `<span class="upc-cat">${ctx.esc(label)}</span>` : '';
        return `<li class="${done ? 'done' : ''}${soon ? ' soon' : ''}${ev.allDay ? ' allday' : ''}" style="--h:${hue}">
          ${(ev.allDay || !s.show.time) && !tag ? '' : `<span class="upc-time">${ev.allDay || !s.show.time ? '' : formatTimeRange(ev.day, ev.time, ev.end, s.hour24)}${tag}</span>`}
          <span class="upc-title">${ev.priority && s.show.priority ? `<b class="upc-prio">${'!'.repeat(ev.priority)}</b>` : ''}${ctx.esc(ev.title)}</span>
          ${ev.due && s.show.due ? `<span class="upc-due">${dueTag(ev)}</span>` : ''}
        </li>`;
      }).join('');

      const notes = s.showNotes ? notesForDay(ctx.data.notes, isoDate(day)) : [];
      const noteHtml = notes.length ? `<ul class="upc-notes">${notes.map((n) => `<li${noteStyle(n)}>${ctx.esc(n.text)}${spanSuffix(n, isoDate(day), i === 0)}</li>`).join('')}</ul>` : '';
      cols += `<section class="upc-col${i === 0 ? ' today' : ''}${weekend ? ' weekend' : ''}">
        <header><span class="upc-label">${label}</span><span class="upc-date">${date}</span></header>
        ${items.length || notes.length ? `<div class="upc-body">${noteHtml}${items.length ? `<ol>${list}</ol>` : ''}</div>
        <div class="upc-more" hidden></div>` : '<p class="upc-free">Nothing planned</p>'}
      </section>`;
    }
    const html = `<div class="upc" style="--n:${n}">${title(ctx)}<div class="upc-cols">${cols}</div></div>`;
    if (html === lastHtml) return; // nothing changed
    lastHtml = html;
    ctx.el.innerHTML = html;
    fit();
  };
  let lastHtml = '';

  // Most important first, finished last: when a column is full, the rest is hidden behind "+3 more".
  const fit = () => {
    for (const col of ctx.el.querySelectorAll('.upc-col')) {
      const body = col.querySelector('.upc-body');
      const more = col.querySelector('.upc-more');
      const items = [...(body?.querySelectorAll('ol > li') || [])];
      if (!items.length) continue;
      for (const li of items) li.hidden = false;
      more.hidden = true;
      if (items.at(-1).getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1) continue;
      more.hidden = false;
      more.textContent = moreText(88, 8); // reserve the footer's room before measuring
      const limit = body.getBoundingClientRect().bottom + 1;
      const cut = Math.max(0, items.findIndex((li) => li.getBoundingClientRect().bottom > limit));
      const hidden = items.slice(cut);
      for (const li of hidden) li.hidden = true;
      const done = hidden.filter((li) => li.classList.contains('done')).length;
      more.textContent = moreText(hidden.length - done, done);
    }
  };

  ctx.every(60000, draw, { align: true });
  // Re-measure when the panel is resized (in the editor, or if the window changes).
  let size = '';
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => {
    const now = `${ctx.el.clientWidth}x${ctx.el.clientHeight}`;
    if (now !== size) { size = now; lastHtml = ''; draw(); }
  }) : null;
  ro?.observe(ctx.el);
  // Web fonts can arrive after the first draw and change line heights.
  document.fonts?.ready.then(() => { lastHtml = ''; draw(); });
  return { destroy() { ro?.disconnect(); } };
}

registerPanel({
  type: 'upcoming',
  name: 'Upcoming',
  description: 'Events from the editor’s Events tab, as a list or as side-by-side day columns.',
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 2, h: 2 },
  usesData: true,
  settings: [
    { key: 'title', label: 'Title', type: 'text', default: 'Upcoming', help: 'Leave empty to hide the title.' },
    { key: 'layout', label: 'Layout', type: 'select', default: 'list', options: [
      { value: 'list', label: 'List: everything coming up, grouped by day' },
      { value: 'columns', label: 'Columns: today and the next few days side by side' },
    ] },
    { key: 'days', label: 'Days ahead', type: 'number', default: 14, min: 1, max: 365, showIf: { layout: 'list' } },
    { key: 'max', label: 'Most items to show', type: 'number', default: 60, min: 1, max: 200, showIf: { layout: 'list' } },
    { key: 'columns', label: 'Number of days', type: 'number', default: 4, min: 2, max: 7, showIf: { layout: 'columns' },
      help: 'Starts with today. Wider panels fit more days.' },
    { key: 'showPast', label: 'Keep finished and ticked-off items, dimmed', type: 'toggle', default: true, showIf: { layout: 'columns' } },
    { key: 'categories', label: 'Only these categories', type: 'text', default: '', placeholder: 'e.g. school, class (empty shows all)' },
    { key: 'hideDone', label: 'Hide tasks you’ve ticked off', type: 'toggle', default: true, showIf: { layout: 'list' } },
    { key: 'show', label: 'Show', type: 'checks', default: { notes: true, time: true, category: true, due: true, priority: true }, options: [
      { value: 'notes', label: 'Day notes' }, { value: 'time', label: 'Times' }, { value: 'category', label: 'Category tags' },
      { value: 'due', label: 'Due dates' }, { value: 'priority', label: 'Priority marks (!!)' },
    ], legacy: { notes: 'showNotes', category: 'showCategory' } },
    { key: 'hour24', label: '24-hour times', type: 'toggle', default: false },
  ],

  mount(ctx) {
    const s = ctx.settings;
    s.showNotes = s.show.notes;
    s.showCategory = s.show.category;
    if (s.layout === 'columns') return mountColumns(ctx);
    const draw = () => {
      colors = ctx.data.categoryColors || null;
      const now = new Date();
      const everything = occurrences(ctx.data.events, {
        from: now, days: s.days, categories: String(s.categories || '').split(','),
      }).filter((ev) => !(ev.done && s.hideDone))
        .sort((a, b) => a.day.localeCompare(b.day) || wallOrder(a, b)); // day by day, most important first
      const list = everything.slice(0, s.max);
      const beyond = everything.slice(s.max);
      extra = { open: beyond.filter((ev) => !ev.done).length, done: beyond.filter((ev) => ev.done).length };

      // Day notes show under their day, including days that have notes but no tasks.
      const todayKey = isoDate(now);
      const lastKey = list.length >= s.max ? list[list.length - 1].day : isoDate(addDays(now, s.days - 1));
      const noteDays = s.showNotes ? (ctx.data.notes || []).filter((n) => n.date >= todayKey && n.date <= lastKey).map((n) => n.date) : [];
      const dayKeys = [...new Set([...list.map((ev) => ev.day), ...noteDays])].sort();

      if (!dayKeys.length) {
        ctx.el.innerHTML = `<div class="up">${title(ctx)}
          <div class="up-empty">Nothing in the next ${s.days} day${s.days === 1 ? '' : 's'}.</div></div>`;
        return;
      }
      const row = (ev) => {
        const soon = !ev.allDay && ev.at - now < 3 * 3600 * 1000 && ev.at > now;
        const { hue, tag: label } = tint(ev, ctx.data.projects);
        return `<li class="${soon && !ev.done ? 'soon' : ''}${ev.done ? ' done' : ''}">
          ${s.show.time ? `<span class="up-time">${ev.allDay ? '' : formatTime(ev.at, s.hour24)}</span>` : ''}
          <span class="up-title">${ev.priority && s.show.priority ? `<b class="upc-prio">${'!'.repeat(ev.priority)}</b>` : ''}${ctx.esc(ev.title)} ${s.show.due ? dueTag(ev) : ''}</span>
          ${s.showCategory && label ? `<span class="up-cat" style="--h:${hue}">${ctx.esc(label)}</span>` : ''}
        </li>`;
      };
      let html = '';
      for (const key of dayKeys) {
        const notes = s.showNotes ? notesForDay(ctx.data.notes, key) : [];
        html += `<div class="up-day">${dayLabel(parseLocal(key), now)}</div>`;
        if (notes.length) html += `<ul class="up-notes">${notes.map((n) => `<li${noteStyle(n)}>${ctx.esc(n.text)}${spanSuffix(n, key, key === dayKeys[0])}</li>`).join('')}</ul>`;
        const rows = list.filter((x) => x.day === key).sort(wallOrder);
        if (rows.length) html += `<ol>${rows.map(row).join('')}</ol>`;
      }
      const out = `<div class="up${s.show.time ? '' : ' no-time'}">${title(ctx)}<div class="up-list">${html}</div><div class="up-more" hidden></div></div>`;
      if (out === lastHtml) return;
      lastHtml = out;
      ctx.el.innerHTML = out;
      fit();
    };
    let lastHtml = '';
    let extra = { open: 0, done: 0 };
    // Hide what doesn't fit (finished tasks are last in each day, so they go first) and count it.
    const fit = () => {
      const view = ctx.el.querySelector('.up-list');
      const more = ctx.el.querySelector('.up-more');
      if (!view) return;
      const flat = [];
      for (const c of view.children) { c.hidden = false; if (c.tagName === 'OL') flat.push(...c.children); else flat.push(c); }
      for (const e of flat) e.hidden = false;
      more.hidden = true;
      const over = flat.length && flat.at(-1).getBoundingClientRect().bottom > view.getBoundingClientRect().bottom + 1;
      let open = extra.open, done = extra.done;
      if (over || open || done) { more.hidden = false; more.textContent = moreText(88, 8); }
      if (over) {
        const limit = view.getBoundingClientRect().bottom + 1;
        const cut = Math.max(0, flat.findIndex((e) => e.getBoundingClientRect().bottom > limit));
        for (const e of flat.slice(cut)) {
          e.hidden = true;
          if (e.matches('ol > li')) e.classList.contains('done') ? done++ : open++;
        }
        for (const ol of view.querySelectorAll('ol')) if (![...ol.children].some((li) => !li.hidden)) ol.hidden = true;
        // A day heading with nothing left under it goes too.
        const shown = [...view.children].filter((c) => !c.hidden);
        if (shown.at(-1)?.classList.contains('up-day')) shown.at(-1).hidden = true;
      }
      if (open || done) more.textContent = moreText(open, done);
      else more.hidden = true;
    };
    ctx.every(60000, draw, { align: true });
    let size = '';
    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => {
      const now = `${ctx.el.clientWidth}x${ctx.el.clientHeight}`;
      if (now !== size) { size = now; fit(); }
    }) : null;
    ro?.observe(ctx.el);
    document.fonts?.ready.then(fit);
    return { destroy() { ro?.disconnect(); } };
  },

  css: `
    .up { height: 100%; display: flex; flex-direction: column; gap: 3cqh; }
    .up-list { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 1.2cqh; }
    .up [hidden] { display: none !important; }
    .up-more { flex: none; font-size: min(4.2cqh, 3.2cqw); color: var(--text-faint); }
    .up-day { font-size: min(4.6cqh, 3.4cqw); color: var(--accent); font-weight: 600; margin-top: 1.4cqh; }
    .up-day:first-child { margin-top: 0; }
    .up-notes, .upc-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3em; flex: none; }
    .up .up-notes li, .upc .upc-notes li { display: block; color: #f3d6bd; font-style: italic; padding: 0; border: 0;
      line-height: 1.3; opacity: 1; text-decoration: none; }
    .n-span { font-style: normal; color: var(--text-faint); font-size: .85em; }
    .up .up-notes li.cat, .upc .upc-notes li.cat { color: hsl(var(--h) 60% 80%); }
    .due-tag { font-size: .8em; color: var(--ember); font-weight: 600; white-space: nowrap; }
    .due-tag.late { color: #f08a8f; }
    .upc-due { display: block; margin-top: .15em; font-size: .9em; }
    .upc-due .due-tag { white-space: normal; }
    .up .up-notes li { font-size: min(5cqh, 3.6cqw); }
    .upc .upc-notes li { font-size: calc(var(--fs) * .92); }
    .up ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .8cqh; }
    .up li { display: grid; grid-template-columns: 5.2em 1fr auto; align-items: baseline; gap: 1em;
      font-size: min(5.4cqh, 3.9cqw); line-height: 1.3; }
    .up-time { color: var(--text-dim); font-variant-numeric: tabular-nums; }
    .up-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .up-cat { font-size: .72em; padding: .1em .65em; border-radius: 99px; color: hsl(var(--h) 60% 78%);
      background: hsl(var(--h) 40% 50% / .14); }
    .up li.soon .up-time { color: var(--ember); }
    .up li.soon .up-title { color: #fff; }
    .up li.done { opacity: .4; }
    .up li.done .up-title { text-decoration: line-through; }
    .up-empty { color: var(--text-faint); font-size: min(5.4cqh, 3.9cqw); }
    @container (max-width: 380px) { .up li { grid-template-columns: 5.2em 1fr; } .up-cat { display: none; } }
    .up.no-time li { grid-template-columns: 1fr auto; }
    @container (max-width: 380px) { .up.no-time li { grid-template-columns: 1fr; } }

    /* Columns layout. Sizes divide the panel width by the number of days (--n). */
    .upc { height: 100%; display: flex; flex-direction: column; gap: 3cqh;
      --fs: min(5.2cqh, calc(15cqw / var(--n))); }
    .upc-cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
    .upc-col { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: calc(var(--fs) * .8);
      padding: 0 calc(var(--fs) * .9); border-left: 1px solid var(--line); }
    .upc-col:first-child { border-left: 0; padding-left: 0; }
    .upc-col:last-child { padding-right: 0; }
    .upc-col header { display: flex; flex-direction: column; gap: .1em; flex: none; }
    .upc-label { font-size: calc(var(--fs) * 1.12); font-weight: 600; color: var(--text-dim);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .upc-date { font-size: calc(var(--fs) * .78); color: var(--text-faint); }
    .upc-col.today .upc-label { color: var(--accent); }
    .upc-col.weekend .upc-date { color: var(--text-dim); }
    .upc-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: calc(var(--fs) * .8); }
    .upc ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--fs) * .75); }
    .upc li { display: flex; flex-direction: column; gap: .15em; padding-left: .7em;
      border-left: 2px solid hsl(var(--h) 45% 62% / .75); font-size: var(--fs); line-height: 1.25; }
    .upc li[hidden] { display: none; }
    .upc-time { display: flex; align-items: baseline; gap: .6em; font-size: .78em; color: var(--text-dim);
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .upc-cat { color: hsl(var(--h) 55% 74%); overflow: hidden; text-overflow: ellipsis; }
    .upc-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .upc li.allday { border-left-style: dotted; }
    .upc-prio { color: var(--ember); margin-right: .3em; font-weight: 800; }
    .upc li.soon .upc-time { color: var(--ember); }
    .upc li.soon .upc-title { color: #fff; }
    .upc li.done { opacity: .38; }
    .upc li.done .upc-title { text-decoration: line-through; text-decoration-color: var(--line-strong); }
    .upc-more { margin-top: auto; flex: none; font-size: calc(var(--fs) * .8); color: var(--text-faint); }
    .upc-more[hidden] { display: none; }
    .upc-free { margin: 0; font-size: calc(var(--fs) * .85); color: var(--text-faint); }
  `,
});
