import { registerPanel } from '../core/registry.js';
import { occurrences, dayLabel, formatTime, startOfDay } from '../core/util.js';

// Stable soft color per category name, so "school" is always the same tint.
export function categoryHue(name) {
  let h = 0;
  for (const ch of String(name || '').toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

registerPanel({
  type: 'upcoming',
  name: 'Upcoming',
  description: 'Events from the editor’s Events tab, grouped by day.',
  defaultSize: { w: 5, h: 4 },
  minSize: { w: 2, h: 2 },
  usesData: true,
  settings: [
    { key: 'title', label: 'Title', type: 'text', default: 'Upcoming' },
    { key: 'days', label: 'Days ahead', type: 'number', default: 14, min: 1, max: 365 },
    { key: 'max', label: 'Most items to show', type: 'number', default: 7, min: 1, max: 30 },
    { key: 'categories', label: 'Only these categories', type: 'text', default: '', placeholder: 'e.g. school, class (empty shows all)' },
    { key: 'showCategory', label: 'Show category tags', type: 'toggle', default: true },
    { key: 'hour24', label: '24-hour times', type: 'toggle', default: false },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const draw = () => {
      const now = new Date();
      const list = occurrences(ctx.data.events, {
        from: now, days: s.days, categories: String(s.categories || '').split(','),
      }).slice(0, s.max);

      if (!list.length) {
        ctx.el.innerHTML = `<div class="up"><h3 class="panel-title">${ctx.esc(s.title)}</h3>
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
      ctx.el.innerHTML = `<div class="up"><h3 class="panel-title">${ctx.esc(s.title)}</h3><div class="up-list">${html}</div></div>`;
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
  `,
});
