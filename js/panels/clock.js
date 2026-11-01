import { registerPanel } from '../core/registry.js';
import { pad } from '../core/util.js';

const DATE = {
  long: { weekday: 'long', month: 'long', day: 'numeric' },
  short: { weekday: 'short', month: 'short', day: 'numeric' },
  numeric: { month: 'numeric', day: 'numeric' },
  weekday: { weekday: 'long' },
};

function parts(tz, fmt = 'long') {
  const now = new Date();
  const opts = DATE[fmt] || DATE.long;
  if (!tz) {
    return {
      h: now.getHours(), m: now.getMinutes(), s: now.getSeconds(),
      date: now.toLocaleDateString(undefined, opts),
    };
  }
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    }).formatToParts(now);
    const get = (t) => Number(f.find((p) => p.type === t)?.value);
    return {
      h: get('hour'), m: get('minute'), s: get('second'),
      date: now.toLocaleDateString(undefined, { timeZone: tz, ...opts }),
    };
  } catch {
    return { ...parts('', fmt), bad: true };
  }
}

registerPanel({
  type: 'clock',
  name: 'Clock',
  description: 'Large time and date, with an optional time zone for a second clock.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 2, h: 1 },
  defaultStyle: 'bare',
  appearance: ['align', 'valign'],
  settings: [
    { key: 'hour24', label: '24-hour time', type: 'toggle', default: false },
    { key: 'show', label: 'Show', type: 'checks', default: { seconds: false, ampm: true, date: true, progress: true, label: true }, options: [
      { value: 'seconds', label: 'Seconds' }, { value: 'ampm', label: 'am/pm' }, { value: 'date', label: 'Date' },
      { value: 'progress', label: 'Bar for how much of the day has passed' }, { value: 'label', label: 'Label' },
    ], legacy: { seconds: 'seconds', date: 'showDate', progress: 'dayProgress' } },
    { key: 'dateFormat', label: 'Date style', type: 'select', default: 'long', options: [
      { value: 'long', label: 'Sunday, November 1' }, { value: 'short', label: 'Sun, Nov 1' }, { value: 'numeric', label: '11/1' }, { value: 'weekday', label: 'Sunday' },
    ] },
    { key: 'timezone', label: 'Time zone', type: 'text', default: '', placeholder: 'Leave empty for this device, or e.g. Asia/Tokyo' },
    { key: 'label', label: 'Label', type: 'text', default: '', placeholder: 'e.g. Tokyo' },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const show = s.show;
    ctx.el.innerHTML = `
      <div class="clock">
        <div class="clock-time"><span class="hm"></span><span class="sec"></span><span class="ampm"></span></div>
        ${show.date ? '<div class="clock-date"></div>' : ''}
        ${show.progress ? '<div class="clock-day" aria-hidden="true"><i></i></div>' : ''}
        ${s.label && show.label ? `<div class="clock-label">${ctx.esc(s.label)}</div>` : ''}
      </div>`;
    const $ = (sel) => ctx.el.querySelector(sel);
    const hm = $('.hm'), sec = $('.sec'), ampm = $('.ampm'), date = $('.clock-date'), bar = $('.clock-day i');

    const tick = () => {
      const p = parts(s.timezone, s.dateFormat);
      let h = p.h;
      if (!s.hour24) { if (show.ampm) ampm.textContent = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12; }
      hm.textContent = `${s.hour24 ? pad(h) : h}:${pad(p.m)}`;
      if (show.seconds) sec.textContent = `:${pad(p.s)}`;
      if (date) date.textContent = p.bad ? `Unknown time zone “${s.timezone}”` : p.date;
      if (bar) bar.style.width = `${((p.h * 60 + p.m) / 1440) * 100}%`;
    };
    ctx.every(show.seconds ? 1000 : 60000, tick, { align: true });
  },

  css: `
    .clock { height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 2cqh; }
    .panel[data-align="center"] .clock { align-items: center; text-align: center; }
    .panel[data-align="right"] .clock { align-items: flex-end; text-align: right; }
    .panel[data-valign="top"] .clock { justify-content: flex-start; }
    .panel[data-valign="bottom"] .clock { justify-content: flex-end; }
    .clock-time {
      font-family: var(--font-display); font-weight: 300; line-height: .82;
      font-variation-settings: "SOFT" 100, "opsz" 144;
      font-size: min(52cqh, 30cqw); letter-spacing: -0.03em; color: var(--text);
      font-variant-numeric: lining-nums tabular-nums; white-space: nowrap;
    }
    .clock-time .sec { font-size: .38em; color: var(--text-dim); letter-spacing: 0; }
    .clock-time .ampm { font-family: var(--font-ui); font-size: .2em; font-weight: 500; color: var(--text-dim); margin-left: .35em; letter-spacing: .04em; }
    .clock-date { font-size: min(9cqh, 6cqw); color: var(--text-dim); font-weight: 500; }
    .clock-day { width: min(100%, 60cqw); height: 2px; background: var(--line); border-radius: 2px; overflow: hidden; }
    .clock-day i { display: block; height: 100%; background: var(--accent); opacity: .7; }
    .clock-label { font-size: min(7cqh, 4.5cqw); color: var(--accent); font-weight: 600; }
  `,
});
