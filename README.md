# Dusk

A quiet status board for your wall. You arrange panels from your main computer; a spare computer with a monitor shows them full screen.

- **Every panel can be adjusted**

Select a panel in the Layout tab. Besides its own settings:

- **Show**: click the chips to hide or show each part of the panel (for a countdown: the number, “days until”, the name, the date; for weather: the current temperature, conditions, today's high/low, details, rain chance, place name; and so on for the clock, Upcoming, Goals and Projects).
- **Alignment** (left, center, right) and **Vertical position** (top, middle, bottom) for the Clock, Countdown, Notes and Weather.
- **Text size** from 60% to 160%, for any panel.
- **Panel style**: card, outline or no background.

**Editor** (`editor.html`): drag panels around a live preview, plan your week (tasks, goals, projects), pick a background.
- **Display** (`display.html`): full screen, very little CPU, nothing to click. It picks up your changes on its own.

It's a plain static site (HTML, CSS and JavaScript modules, no build step), so GitHub Pages can host it for free.

## What's included

**Seven panels**

| Panel | Shows |
|---|---|
| Clock | Time and date, a thin bar for how much of the day has passed. Optional time zone, so you can add a second clock for somewhere else. |
| Weather | Current conditions, high/low, feels-like, wind, rain chance and sunset, plus a forecast: day by day (today and the next few days, each with its high and low) or the next few hours. The day-by-day forecast can be a row under the current weather, **columns** (one per day), or a **list** with High, Low and Rain lined up in columns. Hide the current weather to make it a forecast-only panel. Uses [Open-Meteo](https://open-meteo.com): free, no API key. |
| Upcoming | Tasks, events and day notes from the Plan tab. **List** layout groups everything coming up by day (Today, Tomorrow, Wednesday…). **Columns** layout shows today and the next 2–7 days side by side, each with its events; finished and ticked-off items stay dimmed at the bottom. Each day lists the highest priority first, then untimed tasks in your planner order, then timed ones by time. Finished tasks drop to the bottom, so when there's more than fits, those go first and the column ends with "+3 more · 1 done". Items within 3 hours turn amber. Filter by category; items take their project's color. |
| Countdown | A big number of days (then hours, then minutes) until a date, or until the next unfinished event matching a category or title. Count in days only, or weeks and days. |
| Notes | A message or checklist you write from the editor. Supports `**bold**`, `_italic_`, `- bullets`, `[ ]` / `[x]` checkboxes and `# headings`. |
| Goals | Today's goals and this week's goals with progress bars. Goals you do several times ("Gym 3x") show a row of marks. |
| Projects | A progress bar per project, with days left and the next task. Sort by due date, progress, or your own order. |

**Editor**

- Live, to-scale preview with the real panels and background.
- Drag to move, drag the corner to resize, arrow keys to nudge (Shift + arrows to resize), Delete to remove. Overlapping panels get a red outline.
- Settings forms are generated from each panel's definition, so new panels get an editor for free.
- **Plan tab**

Three views, switched with the buttons at the top or <kbd>V</kbd> (next view) and <kbd>M</kbd> (month); the editor remembers the last one you used.

- **Days**: opens on today and the next 6 days, and scrolls sideways as far as you like in either direction. Mouse wheel, trackpad or right-drag, <kbd>←</kbd>/<kbd>→</kbd> for a day, <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> or the arrow buttons for 7 days, <kbd>T</kbd> or **Today** to come back.
- **Month**: the whole month as a calendar grid. Drag tasks between days, double-click a day to add, box-select, right-click. A day with more than fits shows "+3 more"; click it (or the date) to open that day in the Days view. <kbd>←</kbd>/<kbd>→</kbd> change month.
- **List**: everything in one searchable table, with .ics import (Canvas, Google Calendar, Outlook) and a button to clear out finished items.

Your goals, projects and an inbox sit beside every view. The Goals list follows the week on screen.

- **Adding things.** Press <kbd>N</kbd> (or Ctrl/Cmd+K, or the big round + button) from any tab. Type naturally and the preview shows what was understood:
  - `Lab report fri 5pm #ENG111` → Friday at 5pm, category ENG111 (capitals are kept; typing `#eng111` later reuses ENG111)
  - `Essay mon due fri` → planned for Monday, **due** Friday (`by fri` works too; `Essay due fri` on its own plans it for the due day)
  - `Find sources @paper tomorrow` → tomorrow, in the project whose name starts with "paper" (a new project is made if none matches)
  - `Chem lecture mwf 9-9:50am` → every Monday, Wednesday and Friday, 9:00 to 9:50. Also `tth`, `tue thu`, `every mon, wed and fri`, `weekdays`, `daily`, `every month`
  - `Seminar 11-1pm`, `from 2pm to 3:30pm` → a start and end time
  - `Pay rent !!` → priority (`!`, `!!`, `!!!`); urgent tasks sort to the top of their day
  - `Essay due in 2 weeks`, `dentist oct 30 9:30 am`, `pay rent 11/1`
  - Words in "quotes" stay literal, e.g. `Study for "SAT" sat`.

  <kbd>Tab</kbd> switches between task, daily goal, weekly goal (`Gym 3x` sets how many times) and project (`Paper due nov 20`). <kbd>Shift</kbd>+<kbd>Enter</kbd> adds and keeps the box open for the next one.
- **Day notes.** For things you should know about a day that aren't tasks ("Essay due today", "Going to school event"). They're plain italic text, with no checkbox or box. Hover a day and click **Note** at the bottom, right-click the day header and pick **Add note**, or press <kbd>Shift</kbd>+<kbd>N</kbd> (or <kbd>N</kbd> then <kbd>Tab</kbd> to **Day note**). Click a note to edit it (empty it to delete), drag it to another day (hold <kbd>Alt</kbd> to copy), or right-click for more.
  - **Across several days**: type a range, like `Winter break dec 18 - jan 12`, `Thanksgiving nov 23-27`, `Conference from thu to sat` or `Reading week 12/1-12/5`, and it's one note drawn as a bar across those days (in Month view, a bar across each week it touches). Or hover a one-day note and drag the little handle on its right edge across days. Drag either end of a bar to change the dates; drag the middle to move it (the day you grabbed lands where you drop). Click a bar to edit its dates.
  - **Repeating**: `Trash day every tue`, `Club meets every wed until dec 9`, `Mom's birthday nov 20 yearly`, or set **Repeats** in the note's details (right-click → Dates, repeat and category…). To drop a single day, right-click it and pick **Delete just this day** (or focus it and press <kbd>Delete</kbd>); **Delete every repeat** removes the whole series. The note's details show how many days you've skipped, with a link to bring them back. Repeating tasks work the same way.
  - **Categories**: add `#ENG111` (`Midterm thu #ENG111`), set it in the note's details, or drag the note onto a category in the sidebar. The note takes that category's color, in the planner and on the wall.
  - Notes show in the Days and Month views and on the wall's Upcoming panel, even on days with no tasks; a multi-day note says "until Dec 12" and "last day" there.
- **Paste a list.** Paste several lines (from a syllabus, notes, an email) into quick add, a day's add box, or straight onto the board, and each line becomes its own task. Bullets, numbers and checkboxes are stripped, and dates in each line still work. On the board, pasted tasks land on the day under the pointer (or the inbox if you're pointing at it).
- **Copy.** <kbd>Ctrl</kbd>+<kbd>C</kbd> copies the selected or focused tasks; point at a day and <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste copies there, keeping their spacing. Or hold <kbd>Alt</kbd> while dropping a drag to drop a copy and leave the original.
- **Mouse shortcuts.** Double-click a day to type straight into it (Enter adds and keeps the box open). Middle-click a day for quick add with that day filled in. Hover a day for **Note** and **Goal** next to **+ Add**.
- **Drag** tasks between days, onto a project, into the inbox, or from a project or the overdue list onto a day. Drag goals between days or into the week goals, and drag projects to reorder them. Hold a dragged item near the edge to scroll. Dragging a Tue/Thu class a day later makes it Wed/Fri.
- **Select several at once.** Drag across empty space to draw a box around tasks and day goals (hold Shift to add to what's selected), Shift/Ctrl-click to pick individual ones, or Ctrl+A for everything on screen. Then drag any of them to move them all (they keep their spacing), right-click for bulk options, or use <kbd>Space</kbd> (done), <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> (shift a day), <kbd>0</kbd>–<kbd>3</kbd> (priority), <kbd>Delete</kbd>. <kbd>Esc</kbd> clears the selection. Bulk changes undo in one step.
- **Select by category or dates.** Click **Select…** in the Plan header (or press <kbd>S</kbd>; or click a category in the sidebar → **Select these tasks…**). Pick one or more categories, a date range (Nov 1 to Nov 14, this week, next 14 days…), not done / done / both, and optionally words in the title; it shows how many tasks match. Then either:
  - **Select all**: selects every match, including ones that aren't on screen (a repeating task counts once per day in the range), ready for any bulk action, or
  - **Only let me select these**: box-select, Ctrl+A and Ctrl-click only pick up matching tasks, and everything else is dimmed. The header shows the filter; click × or press <kbd>Esc</kbd> twice to turn it off.
- **Right-click** anything for options: mark done, move to today/tomorrow/next week, project, category, priority, copy, duplicate, delete. Right-click a day header to mark everything done or push unfinished tasks to the next day.
- **Due dates.** A task can be planned for one day and due on another. Set **Due** when you click a task, or type `due fri` / `by dec 10`. In quick add, click **⚑ Due date** (or press <kbd>Alt</kbd>+<kbd>D</kbd>) for quick picks and a date picker; it applies to every line if you paste a list. To give several tasks the same due date, select them and click **⚑ Due date** in the selection bar (or press <kbd>Shift</kbd>+<kbd>D</kbd>, or right-click → Due date). Cards show "⚑ Due Friday" (amber when it's close, red with "2 days late" once it's passed). **Hover a task and its due day lights up**, with a label saying how far away it is; if the due day is off screen, the label points the way. The wall shows "⚑ due Fri" under the task.
- **Click** a task to edit it in place: date, start and end time, repeat (with weekday buttons for weekly repeats), priority, project, category, **steps** (a checklist inside the task; paste a list to add several) and notes. Changes save as you type, and cards show steps done ("☑ 2/5").
- **Categories** are listed in the sidebar with their colors. Click one to pick its color (or set it back to automatic) and to rename it everywhere at once (handy for fixing capitals); drop tasks or notes on one to tag them. Renaming keeps the color. The colors show on task edges, notes and on the wall.
- **Keyboard shortcuts** are yours to change: click **Shortcuts** in the Plan header (or press <kbd>?</kbd>), click “+ key” next to an action and press a key. Defaults on a focused or selected item: <kbd>Space</kbd> done, <kbd>Enter</kbd> edit, <kbd>D</kbd> duplicate, <kbd>Shift</kbd>+<kbd>D</kbd> due date, <kbd>Delete</kbd> delete, <kbd>0</kbd>–<kbd>3</kbd> priority, <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> move a day. Elsewhere: <kbd>N</kbd> quick add, <kbd>Shift</kbd>+<kbd>N</kbd> note, <kbd>T</kbd> today, <kbd>←</kbd>/<kbd>→</kbd> a day, <kbd>V</kbd> next view, <kbd>M</kbd> month. Unbound extras you can assign: move to tomorrow, move a week later, move to inbox, Days/List view, add a goal or project. Bindings are saved in the browser you set them in.
- **Right-drag to scroll.** Hold the right mouse button and drag to pan the days (a plain right-click still opens the menu).
- **Goals**: daily goals sit at the top of each day; week goals are in the sidebar with a progress bar. Click the marks of a "3x" goal to count one; Shift+click or right-click removes one. When a week ends with goals unfinished, the next week offers to bring them over.
- **Projects** fill their progress bar from their tasks (or a manual slider if they have none) and show days left. Expand one to see and add its tasks.
- **Overdue** tasks that are off the left of the screen collect in the sidebar so you can drag them onto a day.
- Every change can be undone (Ctrl+Z), and deletes show an Undo button.
- **Updates**: when a new version of the site is published, the editor shows a "Reload" notice (your work is saved in the browser as you go, so reloading is safe).

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

### Using the editor on other computers

Every computer can edit the same board. On the main computer, open **Sync → Edit from other computers → Get a link for another computer** and open that link on the laptop or other desktop: it signs that browser in and loads your board. (Or open `editor.html` there and paste the same token and gist ID into the Sync tab.)

Each editor publishes its changes to the gist and checks for changes from the others every 30 seconds and whenever you switch back to it. If two computers changed things at the same time, the changes are merged item by item: a task added on one and another ticked off on the other both survive. The link contains your token, so only send it to yourself.

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
      select.js         box-select and multi-selection
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
