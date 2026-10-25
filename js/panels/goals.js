import { registerPanel } from '../core/registry.js';
import { weekStartOf, isoDate } from '../core/util.js';
import { goalsForDay, goalsForWeek, isGoalDone } from '../core/planning.js';

// Today's goals and this week's goals from the Plan tab, with progress.

function row(g, esc) {
  const target = g.target || 1;
  const count = Math.min(g.count || 0, target);
  const done = isGoalDone(g);
  const marks = target === 1
    ? `<span class="gl-box${done ? ' on' : ''}"></span>`
    : `<span class="gl-pips">${Array.from({ length: Math.min(target, 10) }, (_, i) => `<i class="${i < Math.round((count / target) * Math.min(target, 10)) ? 'on' : ''}"></i>`).join('')}</span>`;
  return `<li class="${done ? 'done' : ''}">${marks}<span class="gl-title">${esc(g.title)}</span>${target > 1 ? `<span class="gl-n">${count}/${target}</span>` : ''}</li>`;
}

registerPanel({
  type: 'goals',
  name: 'Goals',
  description: 'Today’s and this week’s goals from the Plan tab, with progress.',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 2 },
  usesData: true,
  settings: [
    { key: 'title', label: 'Title', type: 'text', default: '', placeholder: 'Leave empty for no title' },
    { key: 'showDay', label: 'Show today’s goals', type: 'toggle', default: true },
    { key: 'showWeek', label: 'Show this week’s goals', type: 'toggle', default: true },
    { key: 'hideDone', label: 'Hide goals that are done', type: 'toggle', default: false },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const draw = () => {
      const now = new Date();
      const filt = (list) => (s.hideDone ? list.filter((g) => !isGoalDone(g)) : list);
      const day = goalsForDay(ctx.data.goals || [], isoDate(now));
      const week = goalsForWeek(ctx.data.goals || [], weekStartOf(now, ctx.board.weekStart));
      const section = (label, list) => {
        const done = list.filter(isGoalDone).length;
        const shown = filt(list);
        return `<section class="gl-sec">
          <header><span>${label}</span>${list.length ? `<span class="gl-sum${done === list.length ? ' all' : ''}">${done} of ${list.length}</span>` : ''}</header>
          ${list.length ? `<div class="gl-bar"><i style="width:${(done / list.length) * 100}%"></i></div>` : ''}
          ${shown.length ? `<ul>${shown.map((g) => row(g, ctx.esc)).join('')}</ul>`
            : `<p class="gl-empty">${list.length ? 'All done.' : 'No goals set.'}</p>`}
        </section>`;
      };
      ctx.el.innerHTML = `<div class="gl">
        ${s.title ? `<h3 class="panel-title">${ctx.esc(s.title)}</h3>` : ''}
        ${s.showDay ? section('Today', day) : ''}
        ${s.showWeek ? section('This week', week) : ''}
      </div>`;
    };
    ctx.every(60000, draw, { align: true });
  },

  css: `
    .gl { height: 100%; display: flex; flex-direction: column; gap: 4.5cqh; overflow: hidden;
      --fs: min(5.6cqh, 4.6cqw); font-size: var(--fs); mask-image: linear-gradient(to bottom, #000 88%, transparent); }
    .gl-sec { display: flex; flex-direction: column; gap: 1.6cqh; min-height: 0; }
    .gl-sec header { display: flex; justify-content: space-between; align-items: baseline; }
    .gl-sec header span:first-child { font-weight: 600; color: var(--accent); }
    .gl-sum { font-size: .82em; color: var(--text-faint); font-variant-numeric: tabular-nums; }
    .gl-sum.all { color: #7fd6a4; }
    .gl-bar { height: max(3px, .6cqh); border-radius: 9px; background: var(--line); overflow: hidden; }
    .gl-bar i { display: block; height: 100%; background: var(--accent); opacity: .8; border-radius: 9px; }
    .gl ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1.2cqh; }
    .gl li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: .7em; align-items: center; line-height: 1.3; }
    .gl-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .gl-n { font-size: .8em; color: var(--text-faint); font-variant-numeric: tabular-nums; }
    .gl-box { width: .8em; height: .8em; border-radius: .2em; border: 1.5px solid var(--text-faint); position: relative; }
    .gl-box.on { background: var(--accent); border-color: var(--accent); }
    .gl-box.on::after { content: ""; position: absolute; left: .22em; top: .04em; width: .2em; height: .42em;
      border: solid var(--ink); border-width: 0 .12em .12em 0; transform: rotate(45deg); }
    .gl-pips { display: inline-flex; gap: .18em; }
    .gl-pips i { width: .34em; height: .8em; border-radius: .14em; border: 1.5px solid var(--text-faint); }
    .gl-pips i.on { background: var(--accent); border-color: var(--accent); }
    .gl li.done .gl-title { color: var(--text-faint); text-decoration: line-through; text-decoration-color: var(--line-strong); }
    .gl li.done .gl-pips i.on { background: #7fd6a4; border-color: #7fd6a4; }
    .gl-empty { margin: 0; color: var(--text-faint); font-size: .9em; }
  `,
});
