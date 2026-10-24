# Dusk

A quiet status board for your wall. You arrange panels from your main computer; a spare computer with a monitor shows them full screen.

- **Editor** (`editor.html`): drag panels around a live preview, change their settings, add events, pick a background.
- **Display** (`display.html`): full screen, very little CPU, nothing to click. It picks up your changes on its own.

It's a plain static site (HTML, CSS and JavaScript modules, no build step), so GitHub Pages can host it for free.

## What's included

**Five panels**

| Panel | Shows |
|---|---|
| Clock | Time and date, a thin bar for how much of the day has passed. Optional time zone, so you can add a second clock for somewhere else. |
| Weather | Current conditions, high/low, feels-like, wind, rain chance and sunset, plus a 2–8 item daily or hourly forecast. Uses [Open-Meteo](https://open-meteo.com): free, no API key. |
| Upcoming | Events from the Events tab. **List** layout groups everything coming up by day (Today, Tomorrow, Wednesday…). **Columns** layout shows today and the next 2–7 days side by side, each with its events; today's finished events stay dimmed, and a column that overflows says "+3 more". Items within 3 hours turn amber. Filter by category. |
| Countdown | A big number of days (then hours, then minutes) until a date, or until the next event matching a category or title. |
| Notes | A message or checklist you write from the editor. Supports `**bold**`, `_italic_`, `- bullets`, `[ ]` / `[x]` checkboxes and `# headings`. |

**Editor**

- Live, to-scale preview with the real panels and background.
- Drag to move, drag the corner to resize, arrow keys to nudge (Shift + arrows to resize), Delete to remove. Overlapping panels get a red outline.
- Settings forms are generated from each panel's definition, so new panels get an editor for free.
- Events tab with repeating events (daily, weekly, monthly, yearly, with an optional end date) and **.ics import**, which works with Canvas, Google Calendar and Outlook exports.
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z), Ctrl+S to publish.
- Backup to a JSON file and restore from one.

**Display**

- Three animated backgrounds (Aurora, Tide, Drift) plus None. They render at very low resolution or with few particles, at a frame rate you choose (default 20 fps), and stop entirely when the screen is hidden.
- Night dimming between hours you choose; the background slows to 6 fps while dimmed.
- Burn-in protection: the layout shifts a few pixels every 4 minutes.
- Keeps working offline: the last board and last weather are cached and shown until the network returns.
- Reloads itself when you deploy a new version of the site, and once a night at about 4am.
- Hides the cursor. Press `f` for full screen, `r` to reload.
- A small dot in the corner shows sync status (green synced, amber stale, red error). You can turn it off.

## How sync works

```
 Your desktop                  GitHub                     Wall computer
 ┌──────────────┐  publish    ┌──────────────────┐  poll  ┌──────────────┐
 │ editor.html  │ ──────────▶ │ private Gist      │ ◀───── │ display.html │
 │ (has token)  │  (token)    │ dusk-board.json   │ (no    │ ?gist=<id>   │
 └──────────────┘             └──────────────────┘ token) └──────────────┘
```

The whole board (panels, events, settings) is one JSON document stored in a **private GitHub Gist**. The editor writes it using a personal access token that never leaves your desktop browser. The display reads it without a token every 90 seconds by default. GitHub allows 60 unauthenticated reads per hour per network, so keep the check interval at 60 seconds or more.

To try things without GitHub, open the display from the editor's Sync tab ("Open local display"). In the same browser, changes show up instantly.

## Setup

### 1. Put it on GitHub Pages

1. Create a new repository on GitHub (for example `dusk-board`) and push these files to its `main` branch.
2. In the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The included workflow deploys on every push. After a minute your site is at `https://<your-username>.github.io/<repo-name>/`.

(If you'd rather use "Deploy from a branch", that works too; you just lose the automatic reload-on-deploy.)

### 2. Set up the editor on your main computer

1. Open `https://<you>.github.io/<repo>/editor.html`.
2. **Board tab**: set your location (city search or "Use my location") and units.
3. **Sync tab**:
   1. Click "Create a token on GitHub". It opens GitHub with only the `gist` scope selected. Create it, copy it, paste it into the editor and save.
   2. Click "Create a private gist".
   3. Copy the display link.

### 3. Set up the wall computer

Open the display link on the wall computer once. It remembers the gist, so after that plain `display.html` works. See [docs/kiosk-setup.md](docs/kiosk-setup.md) for making it boot straight into full screen and keeping the screen awake.

## Adding your own panels

A panel is one JavaScript file that describes its settings and draws into an element. Copy `js/panels/_template.js`, change the `type` and `name`, and add one import line to `js/panels/index.js`. Both the editor and the display pick it up, and the editor builds its settings form automatically. The full guide is in [docs/creating-panels.md](docs/creating-panels.md).

## Project layout

```
index.html              landing page
editor.html             editor (main computer)
display.html            display (wall computer)
version.json            stamped by the deploy workflow; the display reloads when it changes
css/
  board.css             shared tokens and panel chrome
  display.css           display-only styles
  editor.css            editor-only styles
js/
  display.js            display entry point (small on purpose)
  core/
    config.js           config shape and defaults
    sync.js             gist + local transports
    board.js            renders a config onto the stage
    background.js       animated backgrounds
    registry.js         panel registry
    util.js             dates, repeating events, mini markdown
  panels/
    index.js            list of panels to load
    _template.js        starting point for new panels
    clock.js weather.js upcoming.js countdown.js notes.js
  editor/
    main.js state.js layout.js fields.js events.js ics.js boardtab.js synctab.js ui.js
docs/
  creating-panels.md
  kiosk-setup.md
```

## Ideas for what's next

- **Calendar view in the editor.** Events already live in `config.data.events`, so a month grid is a new editor tab over the same data; no panel changes needed.
- **Canvas.** Canvas can give you a calendar feed URL (Calendar → Calendar Feed). Browsers can't fetch it directly because Canvas doesn't allow cross-site requests, so there are two good routes:
  - Now: download the `.ics` file from that URL and use **Import .ics file** on the Events tab. Re-importing updates existing events instead of duplicating them.
  - Automatic: a scheduled GitHub Action (or a small Cloudflare Worker) that fetches the feed every hour, converts it with the same logic as `js/editor/ics.js`, and writes the events into the gist. The display already treats imported events like any other. Store the feed URL as a repository secret, since it acts like a password.
- **More panels:** a to-do list you can tick off from your phone, a quote of the day, sunrise/sunset and moon phase, bus or train times, a now-playing panel, a photo frame, room temperature from a sensor.
- **Panel schedules:** show a panel only at certain hours (weather and bus times in the morning, the agenda in the evening).
- **Several boards:** one gist per screen, chosen by the display link.
