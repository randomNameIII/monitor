import { registerPanel } from '../core/registry.js';
import { occurrences, dayLabel, formatTime, startOfDay, addDays } from '../core/util.js';

// Stable soft color per category name, so "school" is always the same tint.
export function categoryHue(name) {
  let h = 0;
  for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const title = (ctx) => (ctx.settings.title ? `<h3 class="panel-title">${ctx.esc(ctx.settings.title)}</h3>` : '');

// Columns layout: one column per day starting today, each listing that day's events in order.
function mountColumns(ctx) {
  const s = ctx.settings;
  const n = Math.max(2, Math.min(7, Math.round(s.columns) || 4));

  const draw = () => {
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
      const items = all.filter((ev) => ev.at >= day && ev.at < next)
        // All-day items first, then by time.
        .sort((a, b) => (b.allDay - a.allDay) || (a.at - b.at));
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : day.toLocaleDateString(undefined, { weekday: 'long' });
      const date = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const weekend = day.getDay() === 0 || day.getDay() === 6;

      const list = items.map((ev) => {
        const done = !ev.allDay && ev.at < now;
        const soon = !ev.allDay && ev.at >= now && ev.at - now < 3 * 3600 * 1000;
        const hue = categoryHue(ev.category);
        const tag = s.showCategory && ev.category ? `<span class="upc-cat">${ctx.esc(ev.category)}</span>` : '';
        return `<li class="${done ? 'done' : ''}${soon ? ' soon' : ''}${ev.allDay ? ' allday' : ''}" style="--h:${hue}">
          <span class="upc-time">${ev.allDay ? 'All day' : formatTime(ev.at, s.hour24)}${tag}</span>
          <span class="upc-title">${ctx.esc(ev.title)}</span>
        </li>`;
      }).join('');

      cols += `<section class="upc-col${i === 0 ? ' today' : ''}${weekend ? ' weekend' : ''}">
        <header><span class="upc-label">${label}</span><span class="upc-date">${date}</span></header>
        ${items.length ? `<ol>${list}</ol><div class="upc-more" hidden></div>` : '<p class="upc-free">Nothing planned</p>'}
      </section>`;
    }
    ctx.el.innerHTML = `<div class="upc" style="--n:${n}">${title(ctx)}<div class="upc-cols">${cols}</div></div>`;
    collapseOverflow();
  };

  // Hide events that don't fit in a column and say how many are hidden.
  const collapseOverflow = () => {
    for (const col of ctx.el.querySelectorAll('.upc-col')) {
      const ol = col.querySelector('ol');
      const more = col.querySelector('.upc-more');
      if (!ol) continue;
      const items = [...ol.children];
      let hidden = 0;
      more.hidden = false;
      more.textContent = '+0 more';
      const limit = more.getBoundingClientRect().top;
      for (const li of items) {
        if (li.getBoundingClientRect().bottom > limit + 1) { li.hidden = true; hidden++; }
      }
      // Once items are hidden the footer moves up; re-check the last visible one still fits.
      while (hidden && hidden < items.length) {
        const visible = items.filter((li) => !li.hidden);
        const last = visible.at(-1);
        if (last && last.getBoundingClientRect().bottom > more.getBoundingClientRect().top + 1) { last.hidden = true; hidden++; }
        else break;
      }
      if (hidden) more.textContent = `+${hidden} more`;
      else more.hidden = true;
    }
  };

  ctx.every(60000, draw, { align: true });
  // Re-measure when the panel is resized (in the editor, or if the window changes).
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => draw()) : null;
  ro?.observe(ctx.el);
  // Web fonts can arrive after the first draw and change line heights.
  document.fonts?.ready.then(() => collapseOverflow());
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
    { key: 'max', label: 'Most items to show', type: 'number', default: 7, min: 1, max: 30, showIf: { layout: 'list' } },
    { key: 'columns', label: 'Number of days', type: 'number', default: 4, min: 2, max: 7, showIf: { layout: 'columns' },
      help: 'Starts with today. Wider panels fit more days.' },
    { key: 'showPast', label: 'Keep today’s finished events, dimmed', type: 'toggle', default: true, showIf: { layout: 'columns' } },
    { key: 'categories', label: 'Only these categories', type: 'text', default: '', placeholder: 'e.g. school, class (empty shows all)' },
    { key: 'showCategory', label: 'Show category tags', type: 'toggle', default: true },
    { key: 'hour24', label: '24-hour times', type: 'toggle', default: false },
  ],

  mount(ctx) {
    if (ctx.settings.layout === 'columns') return mountColumns(ctx);
    const s = ctx.settings;
    const draw = () => {
      const now = new Date();
      const list = occurrences(ctx.data.events, {
        from: now, days: s.days, categories: String(s.categories || '').split(','),
      }).slice(0, s.max);

      if (!list.length) {
        ctx.el.innerHTML = `<div class="up">${title(ctx)}
          <div class="up-empty">Nothing in the next ${s.days} day${s.days === 1 ? '' : 's'}.</div></div>`;
        return;
      }
      let html = '';
      let lastDay = null;
      for (const ev of list) {
        const day = startOfDay(ev.at).getTime();
        if (day !== lastDay) {
          if (lastDay !== null) html += '</ol>';
          html += `<div class="up-day">${dayLabel(ev.at, now)}</div><ol>`;
          lastDay = day;
        }
        const soon = !ev.allDay && ev.at - now < 3 * 3600 * 1000 && ev.at > now;
        const hue = categoryHue(ev.category);
        html += `<li class="${soon ? 'soon' : ''}">
          <span class="up-time">${ev.allDay ? 'All day' : formatTime(ev.at, s.hour24)}</span>
          <span class="up-title">${ctx.esc(ev.title)}</span>
          ${s.showCategory && ev.category ? `<span class="up-cat" style="--h:${hue}">${ctx.esc(ev.category)}</span>` : ''}
        </li>`;
      }
      html += '</ol>';
      ctx.el.innerHTML = `<div class="up">${title(ctx)}<div class="up-list">${html}</div></div>`;
    };
    ctx.every(60000, draw, { align: true });
  },

  css: `
    .up { height: 100%; display: flex; flex-direction: column; gap: 3cqh; }
    .up-list { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 1.2cqh;
      mask-image: linear-gradient(to bottom, #000 85%, transparent); }
    .up-day { font-size: min(4.6cqh, 3.4cqw); color: var(--accent); font-weight: 600; margin-top: 1.4cqh; }
    .up-day:first-child { margin-top: 0; }
    .up ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .8cqh; }
    .up li { display: grid; grid-template-columns: 5.2em 1fr auto; align-items: baseline; gap: 1em;
      font-size: min(5.4cqh, 3.9cqw); line-height: 1.3; }
    .up-time { color: var(--text-dim); font-variant-numeric: tabular-nums; }
    .up-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .up-cat { font-size: .72em; padding: .1em .65em; border-radius: 99px; color: hsl(var(--h) 60% 78%);
      background: hsl(var(--h) 40% 50% / .14); }
    .up li.soon .up-time { color: var(--ember); }
    .up li.soon .up-title { color: #fff; }
    .up-empty { color: var(--text-faint); font-size: min(5.4cqh, 3.9cqw); }
    @container (max-width: 380px) { .up li { grid-template-columns: 5.2em 1fr; } .up-cat { display: none; } }

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
    .upc ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: calc(var(--fs) * .75);
      min-height: 0; overflow: hidden; }
    .upc li { display: flex; flex-direction: column; gap: .15em; padding-left: .7em;
      border-left: 2px solid hsl(var(--h) 45% 62% / .75); font-size: var(--fs); line-height: 1.25; }
    .upc li[hidden] { display: none; }
    .upc-time { display: flex; align-items: baseline; gap: .6em; font-size: .78em; color: var(--text-dim);
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    .upc-cat { color: hsl(var(--h) 55% 74%); overflow: hidden; text-overflow: ellipsis; }
    .upc-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .upc li.allday { border-left-style: dotted; }
    .upc li.soon .upc-time { color: var(--ember); }
    .upc li.soon .upc-title { color: #fff; }
    .upc li.done { opacity: .38; }
    .upc li.done .upc-title { text-decoration: line-through; text-decoration-color: var(--line-strong); }
    .upc-more { margin-top: auto; flex: none; font-size: calc(var(--fs) * .8); color: var(--text-faint); }
    .upc-more[hidden] { display: none; }
    .upc-free { margin: 0; font-size: calc(var(--fs) * .85); color: var(--text-faint); }
  `,
});
