# Dusk

A quiet status board for your wall. You arrange panels from your main computer; a spare computer with a monitor shows them full screen.

- **Editor** (`editor.html`): drag panels around a live preview, plan your week (tasks, goals, projects), pick a background.
- **Display** (`display.html`): full screen, very little CPU, nothing to click. It picks up your changes on its own.

It's a plain static site (HTML, CSS and JavaScript modules, no build step), so GitHub Pages can host it for free.

## What's included

**Seven panels**

| Panel | Shows |
|---|---|
| Clock | Time and date, a thin bar for how much of the day has passed. Optional time zone, so you can add a second clock for somewhere else. |
| Weather | Current conditions, high/low, feels-like, wind, rain chance and sunset, plus a 2–8 item daily or hourly forecast. Uses [Open-Meteo](https://open-meteo.com): free, no API key. |
| Upcoming | Tasks and events from the Plan tab. **List** layout groups everything coming up by day (Today, Tomorrow, Wednesday…). **Columns** layout shows today and the next 2–7 days side by side, each with its events; finished and ticked-off items stay dimmed, and a column that overflows says "+3 more". Items within 3 hours turn amber. Filter by category; items take their project's color. |
| Countdown | A big number of days (then hours, then minutes) until a date, or until the next unfinished event matching a category or title. |
| Notes | A message or checklist you write from the editor. Supports `**bold**`, `_italic_`, `- bullets`, `[ ]` / `[x]` checkboxes and `# headings`. |
| Goals | Today's goals and this week's goals with progress bars. Goals you do several times ("Gym 3x") show a row of marks. |
| Projects | A progress bar per project, with days left and the next task. Sort by due date, progress, or your own order. |

**Editor**

- Live, to-scale preview with the real panels and background.
- Drag to move, drag the corner to resize, arrow keys to nudge (Shift + arrows to resize), Delete to remove. Overlapping panels get a red outline.
- Settings forms are generated from each panel's definition, so new panels get an editor for free.
- **Plan tab** for everything you have to do (details below).
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

**Plan tab**

A week board with a column per day, plus your week goals, projects and an inbox beside it.

- **Adding things.** Press <kbd>N</kbd> (or Ctrl/Cmd+K, or the big round + button) from any tab. Type naturally and the preview shows what was understood:
  - `Lab report fri 5pm #school` → Friday at 5pm, category school
  - `Find sources @paper tomorrow` → tomorrow, in the project whose name starts with "paper" (a new project is made if none matches)
  - `Calculus every mon 10am`, `Standup daily 9am` → repeating
  - `Essay due in 2 weeks`, `dentist oct 30 9:30 am`, `pay rent 11/1`
  - Words in "quotes" stay literal, e.g. `Study for "SAT" sat`.

  <kbd>Tab</kbd> switches between task, daily goal, weekly goal (`Gym 3x` sets how many times) and project (`Paper due nov 20`). <kbd>Shift</kbd>+<kbd>Enter</kbd> adds and keeps the box open for the next one.
- **Mouse shortcuts.** Double-click a day to type straight into it (Enter adds and keeps the box open). Middle-click a day for quick add with that day filled in. Hover a day header for "+ goal".
- **Drag** tasks between days, onto a project, into the inbox, or from a project or the overdue list onto a day. Drag goals between days or into the week goals, and drag projects to reorder them.
- **Right-click** anything for options: mark done, move to today/tomorrow/next week, set the project or category, duplicate, delete. Right-click a day header to mark everything done or push unfinished tasks to the next day.
- **Click** a task to edit it in place (date, time, repeat, project, category, notes). Changes save as you type.
- **Keyboard** on a focused task: <kbd>Space</kbd> done, <kbd>Enter</kbd> edit, <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> move a day, <kbd>Delete</kbd> delete. <kbd>←</kbd>/<kbd>→</kbd> change week, <kbd>T</kbd> back to this week.
- **Goals**: daily goals sit at the top of each day; week goals are in the sidebar with a progress bar. Click the marks of a "3x" goal to count one; Shift+click or right-click removes one. When a week ends with goals unfinished, the next week offers to bring them over.
- **Projects** fill their progress bar from their tasks (or a manual slider if they have none) and show days left. Expand one to see and add its tasks.
- **Overdue** tasks from earlier weeks collect in the sidebar so you can drag them onto a day.
- **List view** shows everything in one searchable table, with .ics import (Canvas, Google Calendar, Outlook) and a button to clear out finished items.
- Every change can be undone (Ctrl+Z), and deletes show an Undo button.

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

1. Create a new repository on GitHub and push these files to its `main` branch.
2. In the repository go to **Settings → Pages** and set **Source** to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After a minute your site is at `https://<your-username>.github.io/<repo-name>/`.

The display checks `version.json` every 20 minutes and reloads when it changes, so bump the `build` value in it whenever you push a change you want the wall to pick up.

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
version.json            bump "build" on each release; the display reloads when it changes
css/
  board.css             shared tokens and panel chrome
  display.css           display-only styles
  editor.css            editor-only styles
  plan.css              Plan tab, menus, popovers, quick add
js/
  display.js            display entry point (small on purpose)
  core/
    config.js           config shape and defaults
    sync.js             gist + local transports
    board.js            renders a config onto the stage
    background.js       animated backgrounds
    registry.js         panel registry
    util.js             dates, repeating events, mini markdown
    planning.js         goals and project progress (shared by Plan tab and panels)
  panels/
    index.js            list of panels to load
    _template.js        starting point for new panels
    clock.js weather.js upcoming.js countdown.js notes.js goals.js projects.js
  editor/
    main.js state.js layout.js fields.js ics.js boardtab.js synctab.js ui.js
    plan/
      plan.js           week board, sidebar, list view, menus and shortcuts
      parse.js          natural-language quick add ("fri 5pm #school")
      quickadd.js       the quick add box
      model.js          changes to tasks, goals and projects
      editors.js        in-place editors
      drag.js menu.js popover.js   drag and drop, right-click menus, popovers
docs/
  creating-panels.md
  kiosk-setup.md
```

## Ideas for what's next

- **Month view in the Plan tab.** Tasks already live in `config.data.events`, so a month grid is another view over the same data.
- **Canvas.** Canvas can give you a calendar feed URL (Calendar → Calendar Feed). Browsers can't fetch it directly because Canvas doesn't allow cross-site requests, so there are two good routes:
  - Now: download the `.ics` file from that URL and use **Import .ics** in the Plan tab's List view. Re-importing updates existing events instead of duplicating them.
  - Automatic: a scheduled GitHub Action (or a small Cloudflare Worker) that fetches the feed every hour, converts it with the same logic as `js/editor/ics.js`, and writes the events into the gist. The display already treats imported events like any other. Store the feed URL as a repository secret, since it acts like a password.
- **More panels:** a to-do list you can tick off from your phone, a quote of the day, sunrise/sunset and moon phase, bus or train times, a now-playing panel, a photo frame, room temperature from a sensor.
- **Panel schedules:** show a panel only at certain hours (weather and bus times in the morning, the agenda in the evening).
- **Several boards:** one gist per screen, chosen by the display link.
