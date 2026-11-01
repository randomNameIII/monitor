import { registerPanel } from '../core/registry.js';
import { formatTime } from '../core/util.js';

// Weather from Open-Meteo: free, no API key, and it allows browser requests (CORS).

const ICON = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  moon: '<path d="M19.5 14.8A8 8 0 0 1 9.2 4.5a8 8 0 1 0 10.3 10.3z"/>',
  cloud: '<path d="M7 18.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 18.5z"/>',
  partly: '<path d="M8.6 4.2v1.4M3.4 9.4h1.4M4.9 5.7l1 1M12.3 5.7l-1 1"/><path d="M5.9 11.3a3.4 3.4 0 0 1 6.2-2.6"/><path d="M9 20h8.6a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.6 1.3A3 3 0 0 0 9 20z"/>',
  partlyNight: '<path d="M11.8 7.4A4.3 4.3 0 0 1 6.3 3.6a4.4 4.4 0 0 0 1.2 8.4"/><path d="M9 20h8.6a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.6 1.3A3 3 0 0 0 9 20z"/>',
  fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
  drizzle: '<path d="M7 14.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 14.5z"/><path d="M9 18l-.5 1.5M13 18l-.5 1.5M17 18l-.5 1.5"/>',
  rain: '<path d="M7 14.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1.2 3M12.5 17.5l-1.2 3M16.5 17.5l-1.2 3"/>',
  snow: '<path d="M7 14.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 14.5z"/><path d="M8.5 18.5h.01M12 20.5h.01M15.5 18.5h.01M10.2 21.5h.01M13.8 17.5h.01"/>',
  storm: '<path d="M7 14.5h10.2a4.3 4.3 0 0 0 .4-8.6 6 6 0 0 0-11.5 1.6A3.6 3.6 0 0 0 7 14.5z"/><path d="M12.5 15.5l-2 3.2h3l-2 3.3"/>',
};

function code(c, day = true) {
  if (c === 0) return ['Clear', day ? 'sun' : 'moon'];
  if (c === 1) return ['Mostly clear', day ? 'sun' : 'moon'];
  if (c === 2) return ['Partly cloudy', day ? 'partly' : 'partlyNight'];
  if (c === 3) return ['Overcast', 'cloud'];
  if (c === 45 || c === 48) return ['Fog', 'fog'];
  if (c >= 51 && c <= 57) return ['Drizzle', 'drizzle'];
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return [c >= 65 && c !== 80 && c !== 81 ? 'Heavy rain' : 'Rain', 'rain'];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['Snow', 'snow'];
  if (c >= 95) return ['Thunderstorms', 'storm'];
  return ['—', 'cloud'];
}

const svg = (name, cls = '') =>
  `<svg class="wx-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ICON.cloud}</svg>`;

registerPanel({
  type: 'weather',
  name: 'Weather',
  description: 'Current conditions and a forecast: today and the next few days, or the next few hours.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 2, h: 2 },
  appearance: ['align'],
  settings: [
    { key: 'location', label: 'Location', type: 'location', default: null, help: 'Leave empty to use the board location (Board tab).' },
    { key: 'forecast', label: 'Forecast', type: 'select', default: 'daily', options: [
      { value: 'daily', label: 'Day by day (high and low)' }, { value: 'hourly', label: 'Next few hours' }, { value: 'none', label: 'None' },
    ] },
    { key: 'layout', label: 'Forecast layout', type: 'select', default: 'row', showIf: { forecast: 'daily' }, options: [
      { value: 'row', label: 'A row under the current weather' },
      { value: 'columns', label: 'Columns, one per day' },
      { value: 'list', label: 'List, with high and low in columns' },
    ] },
    { key: 'days', label: 'Days', type: 'number', default: 4, min: 1, max: 8, showIf: { forecast: 'daily' },
      help: 'Today plus the next few days: 4 is today and the next 3.' },
    { key: 'startToday', label: 'Start with today', type: 'toggle', default: true, showIf: { forecast: 'daily' } },
    { key: 'count', label: 'Hours to show', type: 'number', default: 5, min: 2, max: 8, showIf: { forecast: 'hourly' }, help: 'Every two hours.' },
    { key: 'show', label: 'Show', type: 'checks', default: { now: true, condition: true, hilo: true, details: true, rain: true, place: true }, options: [
      { value: 'now', label: 'Current temperature' }, { value: 'condition', label: 'Conditions' }, { value: 'hilo', label: 'Today’s high and low' },
      { value: 'details', label: 'Feels like, wind, sunset' }, { value: 'rain', label: 'Rain chance' }, { value: 'place', label: 'Place name' },
    ], legacy: { details: 'details' } },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const show = s.show;
    const loc = s.location || ctx.board.location;
    const metric = ctx.board.units === 'metric';
    if (!loc) {
      ctx.el.innerHTML = '<div class="panel-msg">Set a location in the editor’s Board tab to see the weather.</div>';
      return;
    }

    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'auto', forecast_days: '9',
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,relative_humidity_2m',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,sunrise',
      temperature_unit: metric ? 'celsius' : 'fahrenheit',
      wind_speed_unit: metric ? 'kmh' : 'mph',
    });

    const deg = (v) => (v == null ? '–' : `${Math.round(v)}°`);
    const pct = (v) => (v == null ? '' : `${Math.round(v)}%`);

    // Days of the forecast as plain objects, starting today (or tomorrow).
    const days = (d) => {
      const first = s.startToday ? 0 : 1;
      const n = Math.max(1, Math.min(8, Math.round(s.days) || 4));
      return d.time.slice(first, first + n).map((t, k) => {
        const i = first + k;
        const date = new Date(`${t}T12:00`);
        const [cond, icon] = code(d.weather_code[i]);
        return {
          i, cond, icon,
          short: i === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }),
          long: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'long' }),
          hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], rain: d.precipitation_probability_max?.[i],
        };
      });
    };

    const rainTag = (v) => (show.rain && v != null && v >= 10 ? `<span class="wx-rain">${pct(v)}</span>` : '');

    const draw = (w) => {
      const c = w.current;
      const [label, icon] = code(c.weather_code, c.is_day === 1);
      const d = w.daily;
      const layout = s.forecast === 'daily' ? s.layout : 'row';
      let fc = '';
      if (s.forecast === 'daily') {
        const list = days(d);
        if (layout === 'columns') {
          fc = `<div class="wx-cols" style="--n:${list.length}">${list.map((x) => `
            <div class="wx-col${x.i === 0 ? ' today' : ''}">
              <span class="wx-c-day">${x.short}</span>
              ${svg(x.icon)}
              ${show.condition ? `<span class="wx-c-cond">${x.cond}</span>` : ''}
              <span class="wx-c-hi">${deg(x.hi)}</span>
              <span class="wx-c-lo">${deg(x.lo)}</span>
              ${show.rain ? `<span class="wx-rain">${x.rain != null ? pct(x.rain) : ''}</span>` : ''}
            </div>`).join('')}</div>`;
        } else if (layout === 'list') {
          fc = `<div class="wx-table${show.condition ? '' : ' no-cond'}${show.rain ? '' : ' no-rain'}" style="--n:${list.length}">
            <div class="wx-l-head"><span></span><span></span>${show.condition ? '<span></span>' : ''}<span>High</span><span>Low</span>${show.rain ? '<span>Rain</span>' : ''}</div>
            ${list.map((x) => `<div class="wx-l-row${x.i === 0 ? ' today' : ''}">
              <span class="wx-l-day"><span class="long">${x.long}</span><span class="short">${x.short}</span></span>${svg(x.icon)}
              ${show.condition ? `<span class="wx-l-cond">${x.cond}</span>` : ''}
              <span class="wx-l-hi">${deg(x.hi)}</span><span class="wx-l-lo">${deg(x.lo)}</span>
              ${show.rain ? `<span class="wx-l-rain">${x.rain != null ? pct(x.rain) : ''}</span>` : ''}
            </div>`).join('')}</div>`;
        } else {
          fc = `<div class="wx-fc">${list.map((x) => `<div class="wx-f"><span class="wx-f-when">${x.short}</span>${svg(x.icon)}
            <span class="wx-f-t">${deg(x.hi)}<em>${deg(x.lo)}</em></span>${rainTag(x.rain)}</div>`).join('')}</div>`;
        }
      } else if (s.forecast === 'hourly') {
        const h = w.hourly;
        const nowIdx = Math.max(0, h.time.findIndex((t) => new Date(t) > new Date()));
        fc = `<div class="wx-fc">${Array.from({ length: s.count }, (_, k) => nowIdx + k * 2).filter((i) => i < h.time.length).map((i) => {
          const when = formatTime(new Date(h.time[i]), false).replace(':00', '');
          return `<div class="wx-f"><span class="wx-f-when">${when}</span>${svg(code(h.weather_code[i], h.is_day[i] === 1)[1])}
            <span class="wx-f-t">${deg(h.temperature_2m[i])}</span>${rainTag(h.precipitation_probability?.[i])}</div>`;
        }).join('')}</div>`;
      }

      const sunset = d.sunset?.[0] ? formatTime(new Date(d.sunset[0])) : '';
      const more = [`Feels like ${deg(c.apparent_temperature)}`, `Wind ${Math.round(c.wind_speed_10m)} ${metric ? 'km/h' : 'mph'}`,
        show.rain && d.precipitation_probability_max?.[0] != null ? `Rain ${pct(d.precipitation_probability_max[0])}` : '', sunset ? `Sunset ${sunset}` : '']
        .filter(Boolean).join(' · ');
      const desc = [
        show.condition ? `<div class="wx-label">${label}</div>` : '',
        show.hilo ? `<div class="wx-hilo">High ${deg(d.temperature_2m_max[0])} · Low ${deg(d.temperature_2m_min[0])}</div>` : '',
        show.details ? `<div class="wx-more">${more}</div>` : '',
      ].join('');
      const now = show.now || desc ? `
          <div class="wx-now">
            ${show.now ? `${svg(icon, 'wx-big')}<div class="wx-temp">${deg(c.temperature_2m)}</div>` : ''}
            ${desc ? `<div class="wx-desc">${desc}</div>` : ''}
          </div>` : '';
      ctx.el.innerHTML = `
        <div class="wx${now ? '' : ' fc-only'}" data-layout="${layout}">
          ${now}
          ${fc}
          ${show.place ? `<div class="wx-place">${ctx.esc(loc.name || '')}</div>` : ''}
        </div>`;
    };

    const load = async () => {
      try {
        draw(await ctx.fetchJSON(url, { maxAge: 900 }));
      } catch (e) {
        if (!ctx.el.querySelector('.wx')) ctx.el.innerHTML = `<div class="panel-msg">Weather is unavailable right now (${ctx.esc(e.message)}). Retrying in 15 minutes.</div>`;
      }
    };
    ctx.every(15 * 60 * 1000, load);
  },

  css: `
    .wx { height: 100%; display: flex; flex-direction: column; gap: 4cqh; position: relative; }
    .wx-now { display: flex; align-items: center; gap: 4cqw; flex: 1; min-height: 0; }
    .panel[data-align="center"] .wx-now { justify-content: center; }
    .panel[data-align="right"] .wx-now { justify-content: flex-end; text-align: right; }
    .wx-big { width: min(30cqh, 18cqw); height: min(30cqh, 18cqw); color: var(--accent); flex: none; }
    .wx-temp {
      font-family: var(--font-display); font-weight: 300; line-height: .9;
      font-variation-settings: "SOFT" 100, "opsz" 144;
      font-size: min(34cqh, 20cqw); letter-spacing: -0.03em;
    }
    .wx-desc { display: flex; flex-direction: column; gap: 1cqh; min-width: 0; }
    .wx-label { font-size: min(8cqh, 5cqw); font-weight: 600; }
    .wx-hilo { font-size: min(6cqh, 3.6cqw); color: var(--text-dim); }
    .wx-more { font-size: min(4.6cqh, 2.8cqw); color: var(--text-faint); line-height: 1.4; }
    .wx-rain { font-size: .8em; color: #8fb8ff; font-weight: 600; }

    /* Row under the current weather (and hourly) */
    .wx-fc { display: flex; justify-content: space-between; gap: 2cqw; border-top: 1px solid var(--line); padding-top: 3cqh; }
    .wx.fc-only .wx-fc { border-top: 0; padding-top: 0; flex: 1; align-items: center; }
    .wx-f { display: flex; flex-direction: column; align-items: center; gap: 1cqh; flex: 1; }
    .wx-f-when { font-size: min(4.8cqh, 3cqw); color: var(--text-dim); }
    .wx-f .wx-icon { width: min(10cqh, 6cqw); height: min(10cqh, 6cqw); color: var(--text-dim); }
    .wx-f-t { font-size: min(5.4cqh, 3.4cqw); font-weight: 600; }
    .wx-f-t em { font-style: normal; color: var(--text-faint); font-weight: 500; margin-left: .4em; }
    .wx-f .wx-rain { font-size: min(4cqh, 2.6cqw); }

    /* With columns or a list the current weather shrinks to a header line. */
    .wx:not([data-layout="row"]) .wx-now { flex: none; gap: 2.4cqw; }
    .wx:not([data-layout="row"]) .wx-big { width: min(16cqh, 10cqw); height: min(16cqh, 10cqw); }
    .wx:not([data-layout="row"]) .wx-temp { font-size: min(18cqh, 12cqw); }
    .wx:not([data-layout="row"]) .wx-label { font-size: min(5.6cqh, 4cqw); }
    .wx:not([data-layout="row"]) .wx-hilo { font-size: min(4.4cqh, 3cqw); }
    .wx:not([data-layout="row"]) .wx-more { font-size: min(3.6cqh, 2.4cqw); }

    /* Columns, one per day */
    .wx-cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--n), 1fr); border-top: 1px solid var(--line); padding-top: 2.4cqh;
      --fs: min(5.4cqh, calc(100cqw / var(--n) * .13)); }
    .wx-cols { align-content: center; }
    .wx.fc-only .wx-cols { border-top: 0; padding-top: 0; --fs: min(7.5cqh, calc(100cqw / var(--n) * .15)); }
    .wx-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding-top: 2cqh; gap: .35em; font-size: var(--fs); min-width: 0; text-align: center; }
    .wx-col + .wx-col { border-left: 1px solid var(--line); }
    .wx-c-day { color: var(--text-dim); font-weight: 600; }
    .wx-col.today .wx-c-day { color: var(--accent); }
    .wx-col .wx-icon { width: 2.4em; height: 2.4em; color: var(--text-dim); }
    .wx-col.today .wx-icon { color: var(--accent); }
    .wx-c-cond { font-size: .78em; color: var(--text-faint); line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .wx-c-hi { font-family: var(--font-display); font-weight: 300; font-size: 2.2em; line-height: 1; font-variation-settings: "SOFT" 100, "opsz" 144; }
    .wx-c-lo { color: var(--text-faint); font-weight: 600; font-size: 1.05em; }

    /* List with high / low columns */
    .wx-table { flex: 1; min-height: 0; display: grid; grid-template-rows: auto repeat(var(--n), minmax(0, 1fr)); align-content: center;
      border-top: 1px solid var(--line); padding-top: 1.6cqh;
      --fs: min(calc(60cqh / (var(--n) + 1) * .5), 4.6cqw); font-size: var(--fs); }
    .wx.fc-only .wx-table { border-top: 0; padding-top: 0; --fs: min(calc(100cqh / (var(--n) + 1) * .48), 5.2cqw); }
    .wx-table { --cols: minmax(0, 1.5fr) 1.6em minmax(0, 2fr) 3em 3em 3em; }
    .wx-table.no-rain { --cols: minmax(0, 1.5fr) 1.6em minmax(0, 2fr) 3em 3em; }
    .wx-table.no-cond { --cols: minmax(0, 1fr) 1.6em 3em 3em 3em; }
    .wx-table.no-cond.no-rain { --cols: minmax(0, 1fr) 1.6em 3em 3em; }
    .wx-l-head, .wx-l-row { display: grid; grid-template-columns: var(--cols); align-items: center; gap: 0 .8em; }
    .wx-l-head { font-size: .62em; color: var(--text-faint); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
    .wx-l-head span, .wx-l-hi, .wx-l-lo, .wx-l-rain { text-align: right; font-variant-numeric: tabular-nums; }
    .wx-l-row + .wx-l-row { border-top: 1px solid var(--line); }
    .wx-l-day { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wx-l-row.today .wx-l-day { color: var(--accent); }
    .wx-l-day .short { display: none; }
    @container (max-width: 560px) { .wx-l-day .long { display: none; } .wx-l-day .short { display: inline; } }
    .wx-l-row .wx-icon { width: 1.4em; height: 1.4em; color: var(--text-dim); }
    .wx-l-cond { color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .9em; }
    .wx-l-hi { font-weight: 700; }
    .wx-l-lo { color: var(--text-faint); font-weight: 600; }
    .wx-l-rain { color: #8fb8ff; font-size: .85em; font-weight: 600; }

    .wx-place { position: absolute; top: 0; right: 0; font-size: min(4.4cqh, 2.6cqw); color: var(--text-faint); }
    .panel[data-align="right"] .wx-place { right: auto; left: 0; }
    @container (max-height: 260px) { .wx[data-layout="row"]:not(.fc-only) .wx-fc { display: none; } .wx-more { display: none; } }
  `,
});
