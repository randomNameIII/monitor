import { registerPanel } from '../core/registry.js';
import { occurrences, parseLocal, daysBetween } from '../core/util.js';

registerPanel({
  type: 'countdown',
  name: 'Countdown',
  description: 'Days until a date, or until the next matching event.',
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 2 },
  usesData: true,
  appearance: ['align', 'valign'],
  settings: [
    { key: 'mode', label: 'Count down to', type: 'select', default: 'next-event', options: [
      { value: 'next-event', label: 'The next matching event' }, { value: 'date', label: 'A specific date' },
    ] },
    { key: 'category', label: 'Event category', type: 'text', default: '', placeholder: 'e.g. exam (empty matches any)', showIf: { mode: 'next-event' } },
    { key: 'match', label: 'Event title contains', type: 'text', default: '', placeholder: 'e.g. break', showIf: { mode: 'next-event' } },
    { key: 'label', label: 'Label', type: 'text', default: '', placeholder: 'Defaults to the event name', },
    { key: 'date', label: 'Date', type: 'date', default: '', showIf: { mode: 'date' } },
    { key: 'time', label: 'Time (optional)', type: 'time', default: '', showIf: { mode: 'date' } },
    { key: 'count', label: 'Count in', type: 'select', default: 'auto', options: [
      { value: 'auto', label: 'Days, then hours on the last day' },
      { value: 'days', label: 'Days only' },
      { value: 'weeks', label: 'Weeks and days' },
    ] },
    { key: 'show', label: 'Show', type: 'checks', default: { number: true, unit: true, title: true, date: true }, options: [
      { value: 'number', label: 'Number' }, { value: 'unit', label: '“days until”' }, { value: 'title', label: 'Name' }, { value: 'date', label: 'Date' },
    ] },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const show = s.show;

    const target = () => {
      if (s.mode === 'date') {
        const at = parseLocal(s.date, s.time);
        return at ? { at, title: s.label || 'Countdown', allDay: !s.time } : null;
      }
      const match = String(s.match || '').toLowerCase();
      const ev = occurrences(ctx.data.events, { days: 400, categories: s.category ? [s.category] : [] })
        .find((e) => !e.done && (!match || e.title.toLowerCase().includes(match)));
      return ev ? { at: ev.at, title: s.label || ev.title, allDay: ev.allDay } : null;
    };

    const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

    const draw = () => {
      const t = target();
      if (!t) {
        ctx.el.innerHTML = `<div class="panel-msg">${s.mode === 'date' ? 'Pick a date for this countdown in the editor.' : 'No matching upcoming event. Add one in the Plan tab.'}</div>`;
        return;
      }
      const now = new Date();
      const ms = t.at - now;
      const days = daysBetween(now, t.at);
      let big, unit;
      if (ms <= 0 && !(t.allDay && days === 0)) { big = 'Now'; unit = ''; }
      else if (s.count === 'weeks' && days >= 7) {
        const w = Math.floor(days / 7), d = days % 7;
        big = w; unit = `${w === 1 ? 'week' : 'weeks'}${d ? `, ${plural(d, 'day')}` : ''}`;
      } else if (days >= 2 || (days >= 1 && (t.allDay || s.count !== 'auto'))) { big = days; unit = days === 1 ? 'day' : 'days'; }
      else if (days === 0 && (t.allDay || s.count !== 'auto')) { big = 'Today'; unit = ''; }
      else if (ms > 3600000) { big = Math.floor(ms / 3600000); unit = big === 1 ? 'hour' : 'hours'; }
      else { big = Math.max(1, Math.ceil(ms / 60000)); unit = big === 1 ? 'minute' : 'minutes'; }
      const when = t.at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const urgent = ms > 0 && ms < 86400000 * 2;
      // With the number hidden, the unit line carries it: "12 days until".
      const unitText = unit ? `${show.number ? '' : `${big} `}${unit} until` : (show.number ? '' : big);
      ctx.el.innerHTML = `
        <div class="cd${urgent ? ' urgent' : ''}${typeof big === 'string' ? ' word' : ''}${show.number ? '' : ' no-num'}">
          ${show.number ? `<div class="cd-num">${big}</div>` : ''}
          ${(show.unit || !show.number) && unitText ? `<div class="cd-unit">${unitText}</div>` : ''}
          ${show.title ? `<div class="cd-title">${ctx.esc(t.title)}</div>` : ''}
          ${show.date ? `<div class="cd-when">${when}</div>` : ''}
        </div>`;
    };
    ctx.every(60000, draw, { align: true });
  },

  css: `
    .cd { height: 100%; display: flex; flex-direction: column; justify-content: center; }
    .panel[data-align="center"] .cd { align-items: center; text-align: center; }
    .panel[data-align="right"] .cd { align-items: flex-end; text-align: right; }
    .panel[data-valign="top"] .cd { justify-content: flex-start; }
    .panel[data-valign="bottom"] .cd { justify-content: flex-end; }
    .cd-num {
      font-family: var(--font-display); font-weight: 300; line-height: .85;
      font-variation-settings: "SOFT" 100, "opsz" 144;
      font-size: min(46cqh, 60cqw); letter-spacing: -0.04em; color: var(--text);
      font-variant-numeric: lining-nums;
    }
    .cd.word .cd-num { font-size: min(30cqh, 34cqw); }
    .cd.urgent .cd-num { color: var(--ember); }
    .cd-unit { font-size: min(6.5cqh, 8cqw); color: var(--text-dim); margin-top: 3cqh; }
    .cd.no-num .cd-unit { margin-top: 0; font-size: min(11cqh, 12cqw); color: var(--text); font-weight: 600; }
    .cd.no-num.urgent .cd-unit { color: var(--ember); }
    .cd-title { font-size: min(8.5cqh, 10cqw); font-weight: 600; line-height: 1.15; margin-top: .6cqh;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .cd.no-num .cd-title { font-weight: 500; color: var(--text-dim); }
    .cd-when { font-size: min(5.5cqh, 7cqw); color: var(--text-faint); margin-top: 1.4cqh; }
  `,
});
