# Creating a panel

A panel is a single file in `js/panels/`. It registers a definition with a type, some settings, and a `mount` function that draws into an element. The editor reads the settings list to build the form; the display just calls `mount`.

## Quick start

1. Copy `js/panels/_template.js` to `js/panels/quote.js`.
2. Change `type` to `'quote'` and `name` to `'Quote'`.
3. Add `import './quote.js';` to `js/panels/index.js`.
4. Reload the editor. "Quote" now appears under "Add a panel".

## A complete example

A panel that shows a different line each day, from a list you type in the editor:

```js
import { registerPanel } from '../core/registry.js';

registerPanel({
  type: 'quote',
  name: 'Quote',
  description: 'A different line from your list each day.',
  defaultSize: { w: 6, h: 2 },
  minSize: { w: 3, h: 1 },
  defaultStyle: 'bare',

  settings: [
    { key: 'lines', label: 'Lines (one per line)', type: 'textarea',
      default: 'Small steps count.\nDone is better than perfect.\nGo outside today.' },
    { key: 'italic', label: 'Italic', type: 'toggle', default: true },
  ],

  mount(ctx) {
    const lines = ctx.settings.lines.split('\n').map((l) => l.trim()).filter(Boolean);
    const draw = () => {
      const day = Math.floor(Date.now() / 86400000);
      const line = lines.length ? lines[day % lines.length] : 'Add some lines in the editor.';
      ctx.el.innerHTML = `<p class="quote${ctx.settings.italic ? ' it' : ''}">${ctx.esc(line)}</p>`;
    };
    ctx.every(60 * 60 * 1000, draw); // check hourly; the line changes at midnight UTC
  },

  css: `
    .quote { margin: 0; height: 100%; display: flex; align-items: center;
      font-family: var(--font-display); font-weight: 300; font-size: min(28cqh, 6cqw); line-height: 1.2; }
    .quote.it { font-style: italic; }
  `,
});
```

## The definition

| Key | Required | Meaning |
|---|---|---|
| `type` | yes | Unique id saved in the config. Don't rename it once boards use it. |
| `name` | yes | Shown in the editor. |
| `description` | | One line under the name in "Add a panel". |
| `defaultSize` | | `{ w, h }` in grid cells when first added. |
| `minSize` | | Smallest size the editor allows when resizing. |
| `defaultStyle` | | `'card'`, `'outline'` or `'bare'`. Overrides the board default unless the user picks a style for this panel. |
| `usesData` | | Set to `true` if you read `ctx.data` (events). The panel then re-renders when events change. |
| `settings` | | Array of fields; see below. |
| `mount(ctx)` | yes | Draw the panel. Called again whenever its settings change. May return `{ destroy() }`. |
| `css` | | A CSS string injected once. Scope it under a class unique to your panel. |

## Setting field types

Every field has `key`, `label`, `type` and `default`. Optional on all: `help` (small text under the field) and `showIf` (only show when other settings match, e.g. `showIf: { mode: 'date' }`).

| `type` | Value | Extra options |
|---|---|---|
| `text` | string | `placeholder` |
| `textarea` | string | `rows`, `placeholder` |
| `number` | number | `min`, `max`, `step` |
| `range` | number (slider) | `min`, `max`, `step`, `format(v)` |
| `toggle` | boolean | |
| `select` | string | `options`: `['a', 'b']` or `[{ value, label }]` |
| `color` | `'#rrggbb'` | `swatches: ['#…']` |
| `date` | `'YYYY-MM-DD'` | |
| `time` | `'HH:MM'` | |
| `location` | `{ name, lat, lon }` or `null` | City search plus "Use my location" |
| `heading` | none | A sub-heading in the form; no value |

## What `ctx` gives you

| | |
|---|---|
| `ctx.el` | The element to draw into. It is a CSS size container, so `cqw`, `cqh` and `cqmin` units scale with the panel. |
| `ctx.settings` | This panel's settings, merged over the defaults. |
| `ctx.board` | Board settings: `location`, `units` (`'imperial'`/`'metric'`), `accent`, and so on. |
| `ctx.data` | Shared data from the editor. `ctx.data.events` is the events list. |
| `ctx.every(ms, fn, { align, immediate })` | Runs `fn` now and every `ms`. `align: true` fires on clock boundaries (each new second or minute). Cleared automatically when the panel is removed or re-mounted. Errors thrown inside `fn` show in the panel instead of breaking the board. |
| `ctx.fetchJSON(url, { maxAge })` | `fetch` + JSON with a cache in localStorage (`maxAge` in seconds, default 600). If the network is down it returns the last good response. The URL must allow cross-site requests (CORS). |
| `ctx.esc(str)` | HTML-escape text before putting it in `innerHTML`. Always use this for user-entered text. |
| `ctx.editor` | `true` when rendering inside the editor's preview. |

Helpers in `js/core/util.js` you can import: `formatTime`, `dayLabel`, `occurrences` (expands repeating events into dated items), `parseLocal`, `daysBetween`, `miniMarkdown`, `inWindow`.

## Keeping the display light

- Update text with `textContent` on existing elements when you redraw often (see `clock.js`). Rebuilding `innerHTML` once a minute is fine.
- Refresh network data no more than you need: weather every 15 minutes is plenty.
- Avoid CSS `backdrop-filter`, big `filter: blur()` and infinite CSS animations. On a weak GPU they repaint every frame along with the background.
- Use the theme variables so panels match: `--text`, `--text-dim`, `--text-faint`, `--accent`, `--ember` (urgent), `--line`, `--font-display` (large numerals), `--font-ui`.
- Size text with `min(Xcqh, Ycqw)` so it fits both wide and tall panels. Add `@container (max-height: 260px) { … }` rules to hide secondary detail in small panels.

## Panels that need a server

Some data sources block requests from browsers (no CORS) or need a secret key that shouldn't be in a public site. For those, fetch the data somewhere else and put it where the display can read it:

- A scheduled **GitHub Action** that fetches the data and writes it into the gist (for example into `config.data.myThing`). Your panel then reads `ctx.data.myThing` and sets `usesData: true`.
- A small **Cloudflare Worker** that proxies the request, adds CORS headers and keeps the key secret. Your panel calls the Worker URL with `ctx.fetchJSON`.
