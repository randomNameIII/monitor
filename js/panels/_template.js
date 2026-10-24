// Starter for a new panel. Copy this file (e.g. to quote.js), change `type` and `name`,
// then add `import './quote.js';` to js/panels/index.js. See docs/creating-panels.md.

import { registerPanel } from '../core/registry.js';

registerPanel({
  type: 'example',              // unique id saved in the config; don't change it once panels use it
  name: 'Example',              // shown in the editor's "Add panel" list
  description: 'What this panel shows, in one line.',
  defaultSize: { w: 3, h: 2 },  // grid cells when first added
  minSize: { w: 2, h: 1 },
  // defaultStyle: 'bare',      // card | outline | bare — overrides the board default
  // usesData: true,            // set if you read ctx.data (events etc.) so edits re-render the panel

  // Each entry becomes a form field in the editor. Values arrive in ctx.settings.
  // Types: text, textarea, number, toggle, select, color, date, time, location, heading.
  settings: [
    { key: 'message', label: 'Message', type: 'text', default: 'Hello, room.' },
    { key: 'refresh', label: 'Refresh every (minutes)', type: 'number', default: 10, min: 1, max: 120 },
  ],

  // Called once when the panel appears (and again whenever its settings change).
  // ctx.el        – the element to draw into (a size container: use cqw / cqh units for scaling text)
  // ctx.settings  – this panel's settings merged with defaults
  // ctx.board     – board settings (location, units, accent…)
  // ctx.data      – shared data from the editor (ctx.data.events)
  // ctx.every(ms, fn, { align })  – timer that is cleaned up for you
  // ctx.fetchJSON(url, { maxAge }) – fetch with a localStorage cache (seconds); returns stale data if offline
  // ctx.esc(str)  – HTML-escape user text
  mount(ctx) {
    const s = ctx.settings;
    const draw = () => {
      ctx.el.innerHTML = `<div class="example">${ctx.esc(s.message)}</div>`;
    };
    ctx.every(s.refresh * 60 * 1000, draw);

    // Optionally return { destroy() {} } to clean up anything ctx.every doesn't cover.
  },

  // Optional CSS, injected once. Scope selectors under your own class name.
  css: `
    .example { height: 100%; display: grid; place-items: center; font-size: min(20cqh, 9cqw); }
  `,
});
