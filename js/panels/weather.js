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
  description: 'Current conditions with a short daily or hourly forecast.',
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 2, h: 2 },
  settings: [
    { key: 'location', label: 'Location', type: 'location', default: null, help: 'Leave empty to use the board location (Board tab).' },
    { key: 'forecast', label: 'Forecast', type: 'select', default: 'daily', options: [
      { value: 'daily', label: 'Next few days' }, { value: 'hourly', label: 'Next few hours' }, { value: 'none', label: 'None' },
    ] },
    { key: 'count', label: 'Forecast items', type: 'number', default: 5, min: 2, max: 8 },
    { key: 'details', label: 'Show feels-like, wind and rain chance', type: 'toggle', default: true },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const loc = s.location || ctx.board.location;
    const metric = ctx.board.units === 'metric';
    if (!loc) {
      ctx.el.innerHTML = '<div class="panel-msg">Set a location in the editor’s Board tab to see the weather.</div>';
      return;
    }

    const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
      latitude: loc.lat, longitude: loc.lon, timezone: 'auto', forecast_days: '8',
      current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,relative_humidity_2m',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,sunrise',
      temperature_unit: metric ? 'celsius' : 'fahrenheit',
      wind_speed_unit: metric ? 'kmh' : 'mph',
    });

    const deg = (v) => `${Math.round(v)}°`;

    const draw = (w) => {
      const c = w.current;
      const [label, icon] = code(c.weather_code, c.is_day === 1);
      const d = w.daily;
      const rain = d.precipitation_probability_max?.[0];
      let fc = '';
      if (s.forecast === 'daily') {
        fc = d.time.slice(1, 1 + s.count).map((t, i) => {
          const day = new Date(`${t}T12:00`).toLocaleDateString(undefined, { weekday: 'short' });
          return `<div class="wx-f"><span class="wx-f-when">${day}</span>${svg(code(d.weather_code[i + 1])[1])}
            <span class="wx-f-t">${deg(d.temperature_2m_max[i + 1])}<em>${deg(d.temperature_2m_min[i + 1])}</em></span></div>`;
        }).join('');
      } else if (s.forecast === 'hourly') {
        const h = w.hourly;
        const nowIdx = Math.max(0, h.time.findIndex((t) => new Date(t) > new Date()));
        fc = Array.from({ length: s.count }, (_, k) => nowIdx + k * 2).filter((i) => i < h.time.length).map((i) => {
          const when = formatTime(new Date(h.time[i]), false).replace(':00', '');
          return `<div class="wx-f"><span class="wx-f-when">${when}</span>${svg(code(h.weather_code[i], h.is_day[i] === 1)[1])}
            <span class="wx-f-t">${deg(h.temperature_2m[i])}</span></div>`;
        }).join('');
      }
      const sunset = d.sunset?.[0] ? formatTime(new Date(d.sunset[0])) : '';
      ctx.el.innerHTML = `
        <div class="wx">
          <div class="wx-now">
            ${svg(icon, 'wx-big')}
            <div class="wx-temp">${deg(c.temperature_2m)}</div>
            <div class="wx-desc">
              <div class="wx-label">${label}</div>
              <div class="wx-hilo">High ${deg(d.temperature_2m_max[0])} · Low ${deg(d.temperature_2m_min[0])}</div>
              ${s.details ? `<div class="wx-more">Feels like ${deg(c.apparent_temperature)} · Wind ${Math.round(c.wind_speed_10m)} ${metric ? 'km/h' : 'mph'}${rain != null ? ` · Rain ${rain}%` : ''}${sunset ? ` · Sunset ${sunset}` : ''}</div>` : ''}
            </div>
          </div>
          ${fc ? `<div class="wx-fc">${fc}</div>` : ''}
          <div class="wx-place">${ctx.esc(loc.name || '')}</div>
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
    .wx-fc { display: flex; justify-content: space-between; gap: 2cqw; border-top: 1px solid var(--line); padding-top: 3cqh; }
    .wx-f { display: flex; flex-direction: column; align-items: center; gap: 1cqh; flex: 1; }
    .wx-f-when { font-size: min(4.8cqh, 3cqw); color: var(--text-dim); }
    .wx-f .wx-icon { width: min(10cqh, 6cqw); height: min(10cqh, 6cqw); color: var(--text-dim); }
    .wx-f-t { font-size: min(5.4cqh, 3.4cqw); font-weight: 600; }
    .wx-f-t em { font-style: normal; color: var(--text-faint); font-weight: 500; margin-left: .4em; }
    .wx-place { position: absolute; top: 0; right: 0; font-size: min(4.4cqh, 2.6cqw); color: var(--text-faint); }
    @container (max-height: 260px) { .wx-fc { display: none; } .wx-more { display: none; } }
  `,
});
