// Popover contents for editing a task, goal or project. Every field saves as you type.

import { openPopover, closePopover } from './popover.js';
import * as M from './model.js';
import { state, undo } from '../state.js';
import { esc, isoDate, parseLocal, weekStartOf } from '../../core/util.js';
import { projectProgress } from '../../core/planning.js';
import { toast } from '../ui.js';

const REPEATS = [['none', 'Doesn’t repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']];
const HUES = [220, 190, 160, 100, 45, 25, 340, 280];

function categories() {
  return [...new Set(state.cfg.data.events.map((e) => e.category).filter(Boolean))].sort();
}

function field(label, control, cls = '') {
  return `<label class="pf ${cls}"><span>${label}</span>${control}</label>`;
}

export function deleteWithUndo(label, fn) {
  fn();
  closePopover();
  toast(`Deleted “${label}”`, false, { label: 'Undo', fn: undo });
}

/* ---------------- task ---------------- */

export function editTask(anchor, id, day = null) {
  const t = M.findTask(id);
  if (!t) return;
  openPopover(anchor, (el) => {
    const repeating = t.repeat && t.repeat !== 'none';
    const done = M.isTaskDoneOn(t, day || t.date);
    el.innerHTML = `
      <div class="pop-title-row">
        <button type="button" class="tick${done ? ' on' : ''}" data-f="done" aria-label="Done" aria-pressed="${done}"></button>
        <textarea class="pop-title" rows="1" data-f="title" aria-label="Title">${esc(t.title)}</textarea>
      </div>
      ${repeating && day ? `<p class="pop-note">Repeats. Ticking off marks only ${esc(parseLocal(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }))}.</p>` : ''}
      <div class="pop-grid">
        <label class="pf"><span>Date<button type="button" class="link pf-clear" data-f="unschedule" ${t.date ? '' : 'hidden'}>No date</button></span><input type="date" data-f="date" value="${esc(t.date || '')}"></label>
        ${field('Time', `<input type="time" data-f="time" value="${esc(t.time || '')}">`)}
        ${field('Repeats', `<select data-f="repeat">${REPEATS.map(([v, l]) => `<option value="${v}" ${v === (t.repeat || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${field('Until', `<input type="date" data-f="until" value="${esc(t.until || '')}">`, `pf-until${repeating ? '' : ' hidden'}`)}
        ${field('Project', `<select data-f="projectId"><option value="">None</option>${state.cfg.data.projects.filter((p) => !p.archived || p.id === t.projectId).map((p) => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select>`)}
        ${field('Category', `<input data-f="category" list="popCats" value="${esc(t.category || '')}" placeholder="none"><datalist id="popCats">${categories().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      </div>
      ${field('Notes', `<textarea data-f="notes" rows="2" placeholder="Details, links…">${esc(t.notes || '')}</textarea>`, 'pf-wide')}
      <div class="pop-actions">
        <button type="button" class="btn ghost small" data-f="duplicate">Duplicate</button>
        <span class="spacer"></span>
        <button type="button" class="btn danger small" data-f="delete">Delete</button>
      </div>`;

    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const title = q('title');
    const grow = () => { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; };
    requestAnimationFrame(grow);
    title.addEventListener('input', () => { grow(); M.updateTask(id, { title: title.value.replace(/\n/g, ' ').trim() || 'Untitled' }, { group: `title:${id}` }); });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });

    q('done').addEventListener('click', (e) => {
      M.toggleTask(id, day || t.date);
      const on = M.isTaskDoneOn(M.findTask(id), day || t.date);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.setAttribute('aria-pressed', on);
    });
    q('date').addEventListener('change', (e) => { M.updateTask(id, { date: e.target.value }); q('unschedule').hidden = !e.target.value; });
    q('unschedule').addEventListener('click', () => { M.moveTask(id, ''); q('date').value = ''; q('time').value = ''; q('unschedule').hidden = true; });
    q('time').addEventListener('change', (e) => M.updateTask(id, { time: e.target.value }));
    q('repeat').addEventListener('change', (e) => {
      const patch = { repeat: e.target.value };
      if (e.target.value !== 'none' && !M.findTask(id).date) { patch.date = isoDate(new Date()); q('date').value = patch.date; }
      M.updateTask(id, patch);
      el.querySelector('.pf-until').classList.toggle('hidden', e.target.value === 'none');
    });
    q('until').addEventListener('change', (e) => M.updateTask(id, { until: e.target.value }));
    q('projectId').addEventListener('change', (e) => M.updateTask(id, { projectId: e.target.value }));
    q('category').addEventListener('input', (e) => M.updateTask(id, { category: e.target.value.trim().toLowerCase() }, { group: `cat:${id}` }));
    q('notes').addEventListener('input', (e) => M.updateTask(id, { notes: e.target.value }, { group: `notes:${id}` }));
    q('duplicate').addEventListener('click', () => { M.duplicateTask(id); closePopover(); toast('Duplicated'); });
    q('delete').addEventListener('click', () => deleteWithUndo(t.title, () => M.deleteTask(id)));
  }, { key: `task:${id}` });
}

/* ---------------- goal ---------------- */

export function editGoal(anchor, id) {
  const g = M.findGoal(id);
  if (!g) return;
  openPopover(anchor, (el) => {
    el.innerHTML = `
      <textarea class="pop-title" rows="1" data-f="title" aria-label="Goal">${esc(g.title)}</textarea>
      <div class="pop-grid">
        ${field('Goal for', `<select data-f="scope"><option value="day" ${g.scope === 'day' ? 'selected' : ''}>One day</option><option value="week" ${g.scope === 'week' ? 'selected' : ''}>The week</option></select>`)}
        ${field(g.scope === 'week' ? 'Week of' : 'Day', `<input type="date" data-f="date" value="${esc(g.date)}">`)}
        ${field('Times to do it', `<input type="number" min="1" max="99" data-f="target" value="${g.target || 1}">`)}
        ${field('Done so far', `<div class="stepper"><button type="button" data-f="minus" aria-label="One less">−</button><output data-f="count">${g.count || 0}</output><button type="button" data-f="plus" aria-label="One more">+</button></div>`)}
      </div>
      <div class="pop-actions">
        <span class="spacer"></span>
        <button type="button" class="btn danger small" data-f="delete">Delete</button>
      </div>`;
    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const title = q('title');
    title.addEventListener('input', () => M.updateGoal(id, { title: title.value.replace(/\n/g, ' ').trim() || 'Goal' }, { group: `title:${id}` }));
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });
    q('scope').addEventListener('change', (e) => {
      const scope = e.target.value;
      const start = weekStartOf(parseLocal(M.findGoal(id).date), state.cfg.board.weekStart);
      M.moveGoal(id, { scope, date: scope === 'week' ? isoDate(start) : M.findGoal(id).date });
      editGoal(anchor, id);
    });
    q('date').addEventListener('change', (e) => {
      if (!e.target.value) return;
      const scope = M.findGoal(id).scope;
      const start = weekStartOf(parseLocal(e.target.value), state.cfg.board.weekStart);
      M.moveGoal(id, { date: scope === 'week' ? isoDate(start) : e.target.value });
    });
    q('target').addEventListener('input', (e) => { const v = parseInt(e.target.value, 10); if (v > 0) { M.updateGoal(id, { target: v }, { group: `target:${id}` }); q('count').textContent = M.findGoal(id).count; } });
    q('minus').addEventListener('click', () => { M.bumpGoal(id, -1); q('count').textContent = M.findGoal(id).count; });
    q('plus').addEventListener('click', () => {
      const cur = M.findGoal(id);
      if ((cur.target || 1) === 1) M.updateGoal(id, { count: 1 }); else M.bumpGoal(id, 1);
      q('count').textContent = M.findGoal(id).count;
    });
    q('delete').addEventListener('click', () => deleteWithUndo(g.title, () => M.deleteGoal(id)));
  }, { key: `goal:${id}`, width: 300 });
}

/* ---------------- project ---------------- */

export function editProject(anchor, id) {
  const p = M.findProject(id);
  if (!p) return;
  openPopover(anchor, (el) => {
    const prog = projectProgress(p, state.cfg.data.events);
    el.innerHTML = `
      <textarea class="pop-title" rows="1" data-f="title" aria-label="Project name">${esc(p.title)}</textarea>
      <div class="pop-grid">
        ${field('Due', `<input type="date" data-f="due" value="${esc(p.due || '')}">`)}
        ${field('Color', `<div class="hues">${HUES.map((h) => `<button type="button" class="hue${h === p.hue ? ' on' : ''}" style="--h:${h}" data-hue="${h}" aria-label="Color ${h}"></button>`).join('')}</div>`)}
      </div>
      ${prog.manual
        ? field(`Progress <output data-f="pctOut">${prog.pct}%</output>`, `<input type="range" min="0" max="100" step="5" data-f="progress" value="${prog.pct}">`, 'pf-wide')
        : `<p class="pop-note">${prog.done} of ${prog.total} tasks done (${prog.pct}%). Progress follows the project’s tasks.</p>`}
      ${field('Notes', `<textarea data-f="notes" rows="2">${esc(p.notes || '')}</textarea>`, 'pf-wide')}
      <label class="check pf-wide"><input type="checkbox" data-f="archived" ${p.archived ? 'checked' : ''}> Archived (hidden from the board and sidebar)</label>
      <div class="pop-actions">
        <span class="spacer"></span>
        <button type="button" class="btn danger small" data-f="delete">Delete project</button>
      </div>`;
    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const title = q('title');
    title.addEventListener('input', () => M.updateProject(id, { title: title.value.replace(/\n/g, ' ').trim() || 'Project' }, { group: `title:${id}` }));
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });
    q('due').addEventListener('change', (e) => M.updateProject(id, { due: e.target.value }));
    el.querySelectorAll('.hue').forEach((b) => b.addEventListener('click', () => {
      M.updateProject(id, { hue: +b.dataset.hue });
      el.querySelectorAll('.hue').forEach((x) => x.classList.toggle('on', x === b));
    }));
    q('progress')?.addEventListener('input', (e) => { M.updateProject(id, { progress: +e.target.value }, { group: `progress:${id}` }); q('pctOut').textContent = `${e.target.value}%`; });
    q('notes').addEventListener('input', (e) => M.updateProject(id, { notes: e.target.value }, { group: `notes:${id}` }));
    q('archived').addEventListener('change', (e) => M.updateProject(id, { archived: e.target.checked }));
    q('delete').addEventListener('click', () => {
      const n = state.cfg.data.events.filter((e) => e.projectId === id).length;
      deleteWithUndo(p.title, () => M.deleteProject(id));
      if (n) toast(`Deleted “${p.title}”. Its ${n} task${n === 1 ? '' : 's'} moved to the inbox.`, false, { label: 'Undo', fn: undo });
    });
  }, { key: `project:${id}`, width: 320 });
}

