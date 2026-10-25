import { registerPanel } from '../core/registry.js';
import { projectProgress, nextProjectTask, daysUntil, byOrder } from '../core/planning.js';

// Progress on your projects from the Plan tab.

registerPanel({
  type: 'projects',
  name: 'Projects',
  description: 'Progress bars for your projects, with due dates and what’s next.',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 2 },
  usesData: true,
  settings: [
    { key: 'title', label: 'Title', type: 'text', default: 'Projects' },
    { key: 'max', label: 'Most projects to show', type: 'number', default: 4, min: 1, max: 12 },
    { key: 'order', label: 'Order', type: 'select', default: 'due', options: [
      { value: 'due', label: 'Soonest due first' }, { value: 'manual', label: 'Same as the Plan tab' }, { value: 'progress', label: 'Least done first' },
    ] },
    { key: 'showNext', label: 'Show the next task', type: 'toggle', default: true },
    { key: 'hideFinished', label: 'Hide finished projects', type: 'toggle', default: true },
  ],

  mount(ctx) {
    const s = ctx.settings;
    const draw = () => {
      const events = ctx.data.events || [];
      let list = (ctx.data.projects || []).filter((p) => !p.archived)
        .map((p) => ({ p, prog: projectProgress(p, events) }))
        .filter((x) => !(s.hideFinished && x.prog.pct >= 100));
      if (s.order === 'due') list.sort((a, b) => (a.p.due || '9999').localeCompare(b.p.due || '9999'));
      else if (s.order === 'progress') list.sort((a, b) => a.prog.pct - b.prog.pct);
      else list.sort((a, b) => byOrder(a.p, b.p));
      list = list.slice(0, s.max);

      if (!list.length) {
        ctx.el.innerHTML = `<div class="pj">${s.title ? `<h3 class="panel-title">${ctx.esc(s.title)}</h3>` : ''}<p class="pj-empty">No active projects. Add one in the Plan tab.</p></div>`;
        return;
      }
      const rows = list.map(({ p, prog }) => {
        const d = p.due ? daysUntil(p.due) : null;
        const due = d == null ? '' : d < 0 ? `<span class="late">${-d}d late</span>` : d === 0 ? '<span class="late">Due today</span>' : `${d}d left`;
        const next = s.showNext ? nextProjectTask(events, p.id) : null;
        return `<li style="--h:${p.hue}">
          <div class="pj-top"><span class="pj-name">${ctx.esc(p.title)}</span><span class="pj-pct">${prog.pct}%</span></div>
          <div class="pj-bar"><i style="width:${prog.pct}%"></i></div>
          <div class="pj-meta">${[prog.manual ? '' : `${prog.done}/${prog.total} tasks`, due].filter(Boolean).join(' · ')}${next ? `<span class="pj-next">Next: ${ctx.esc(next.title)}</span>` : ''}</div>
        </li>`;
      }).join('');
      ctx.el.innerHTML = `<div class="pj">${s.title ? `<h3 class="panel-title">${ctx.esc(s.title)}</h3>` : ''}<ul>${rows}</ul></div>`;
    };
    ctx.every(10 * 60000, draw);
  },

  css: `
    .pj { height: 100%; display: flex; flex-direction: column; gap: 3.5cqh; --fs: min(5.4cqh, 4.4cqw); font-size: var(--fs); }
    .pj ul { flex: 1; list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3.4cqh; min-height: 0; overflow: hidden;
      mask-image: linear-gradient(to bottom, #000 88%, transparent); }
    .pj li { display: flex; flex-direction: column; gap: .45em; }
    .pj-top { display: flex; justify-content: space-between; align-items: baseline; gap: 1em; }
    .pj-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pj-pct { font-family: var(--font-display); font-weight: 400; font-size: 1.25em; color: hsl(var(--h) 55% 76%);
      font-variation-settings: "SOFT" 100, "opsz" 48; font-variant-numeric: lining-nums tabular-nums; }
    .pj-bar { height: max(4px, .32em); border-radius: 99px; background: rgba(160, 175, 220, .1); overflow: hidden; }
    .pj-bar i { display: block; height: 100%; border-radius: 99px; background: hsl(var(--h) 55% 64%); }
    .pj-meta { display: flex; flex-wrap: wrap; gap: .2em 1em; font-size: .78em; color: var(--text-faint); }
    .pj-meta .late { color: var(--ember); }
    .pj-next { color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .pj-empty { margin: 0; color: var(--text-faint); }
  `,
});
