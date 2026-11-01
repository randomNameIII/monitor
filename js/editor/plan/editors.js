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

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PRIORITIES = [[0, 'None'], [1, '!'], [2, '!!'], [3, '!!!']];

// Lines pasted or typed into a list box: strip bullets, numbers and checkboxes.
export function cleanLines(text) {
  return String(text || '').split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)]|\[[ xX]?\])\s*/, '').replace(/^\[[ xX]?\]\s*/, '').trim())
    .filter(Boolean);
}

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
        ${field('Repeats', `<select data-f="repeat">${REPEATS.map(([v, l]) => `<option value="${v}" ${v === (t.repeat || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        <div class="pf pf-wide"><span>Time</span><div class="pf-time"><input type="time" data-f="time" value="${esc(t.time || '')}" aria-label="Start"><i>to</i><input type="time" data-f="end" value="${esc(t.end || '')}" aria-label="End" ${t.time ? '' : 'disabled'}></div></div>
        ${field('Until', `<input type="date" data-f="until" value="${esc(t.until || '')}">`, `pf-wide pf-until${repeating ? '' : ' hidden'}`)}
        <div class="pf pf-wide pf-days${t.repeat === 'weekly' ? '' : ' hidden'}"><span>On</span><div class="wd-row" data-f="days"></div></div>
        <div class="pf"><span>Priority</span><div class="seg" data-f="priority">${PRIORITIES.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${(t.priority || 0) === v}" title="${v ? `Priority ${v}` : 'No priority'}">${l}</button>`).join('')}</div></div>
        ${field('Project', `<select data-f="projectId"><option value="">None</option>${state.cfg.data.projects.filter((p) => !p.archived || p.id === t.projectId).map((p) => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select>`)}
        ${field('Category', `<input data-f="category" list="popCats" value="${esc(t.category || '')}" placeholder="none"><datalist id="popCats">${categories().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`)}
      </div>
      <div class="pf pf-wide"><span>Steps <output data-f="stepCount"></output></span>
        <ul class="substeps" data-f="steps"></ul>
        <input class="step-add" data-f="stepAdd" placeholder="Add a step (paste a list to add several)">
      </div>
      ${field('Notes', `<textarea data-f="notes" rows="2" placeholder="Details, links…">${esc(t.notes || '')}</textarea>`, 'pf-wide')}
      <div class="pop-actions">
        <button type="button" class="btn ghost small" data-f="duplicate">Duplicate</button>
        <span class="spacer"></span>
        <button type="button" class="btn danger small" data-f="delete">Delete</button>
      </div>`;

    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const cur = () => M.findTask(id);
    const title = q('title');
    const grow = () => { title.style.height = 'auto'; title.style.height = `${title.scrollHeight}px`; };
    requestAnimationFrame(grow);
    title.addEventListener('input', () => { grow(); M.updateTask(id, { title: title.value.replace(/\n/g, ' ').trim() || 'Untitled' }, { group: `title:${id}` }); });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closePopover(); } });

    q('done').addEventListener('click', (e) => {
      M.toggleTask(id, day || t.date);
      const on = M.isTaskDoneOn(cur(), day || t.date);
      e.currentTarget.classList.toggle('on', on);
      e.currentTarget.setAttribute('aria-pressed', on);
    });
    q('date').addEventListener('change', (e) => { M.updateTask(id, { date: e.target.value }); q('unschedule').hidden = !e.target.value; drawDays(); });
    q('unschedule').addEventListener('click', () => { M.moveTask(id, ''); q('date').value = ''; q('time').value = ''; q('end').value = ''; q('unschedule').hidden = true; });
    q('time').addEventListener('change', (e) => {
      const patch = { time: e.target.value };
      if (!e.target.value) patch.end = '';
      // Keep the same length when the start moves.
      const c = cur();
      if (e.target.value && c.time && c.end) {
        const toMin = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5);
        const len = toMin(c.end) - toMin(c.time);
        const endMin = Math.min(23 * 60 + 59, toMin(e.target.value) + len);
        patch.end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
        q('end').value = patch.end;
      }
      M.updateTask(id, patch);
      q('end').disabled = !e.target.value;
      if (!e.target.value) q('end').value = '';
    });
    q('end').addEventListener('change', (e) => M.updateTask(id, { end: e.target.value > cur().time ? e.target.value : '' }));
    q('repeat').addEventListener('change', (e) => {
      const patch = { repeat: e.target.value };
      if (e.target.value !== 'none' && !cur().date) { patch.date = isoDate(new Date()); q('date').value = patch.date; }
      if (e.target.value !== 'weekly') delete cur().weekdays;
      M.updateTask(id, patch);
      el.querySelector('.pf-until').classList.toggle('hidden', e.target.value === 'none');
      el.querySelector('.pf-days').classList.toggle('hidden', e.target.value !== 'weekly');
      drawDays();
    });
    q('until').addEventListener('change', (e) => M.updateTask(id, { until: e.target.value }));

    // Weekday chips for weekly repeats: pick several for a Mon/Wed/Fri class.
    function drawDays() {
      const c = cur();
      if (!c || c.repeat !== 'weekly' || !c.date) { q('days').innerHTML = ''; return; }
      const on = new Set(c.weekdays?.length ? c.weekdays : [parseLocal(c.date).getDay()]);
      const order = state.cfg.board.weekStart === 'sunday' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
      q('days').innerHTML = order.map((d) => `<button type="button" class="wd" data-d="${d}" aria-pressed="${on.has(d)}" title="${WD_LONG[d]}">${WD[d]}</button>`).join('');
    }
    q('days').addEventListener('click', (e) => {
      const b = e.target.closest('[data-d]');
      if (!b) return;
      const c = cur();
      const d = +b.dataset.d;
      const set = new Set(c.weekdays?.length ? c.weekdays : [parseLocal(c.date).getDay()]);
      if (set.has(d)) { if (set.size === 1) return; set.delete(d); } else set.add(d);
      const list = [...set];
      if (list.length === 1) {
        // Back to a plain weekly repeat: move the start onto that weekday.
        const start = parseLocal(c.date);
        const shift = (list[0] - start.getDay() + 7) % 7;
        delete c.weekdays;
        M.updateTask(id, { date: isoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + shift)) });
        q('date').value = cur().date;
      } else {
        M.updateTask(id, { weekdays: list });
      }
      drawDays();
    });
    drawDays();

    q('priority').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      M.updateTask(id, { priority: +b.dataset.v || 0 });
      q('priority').querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    q('projectId').addEventListener('change', (e) => M.updateTask(id, { projectId: e.target.value }));
    q('category').addEventListener('input', (e) => M.updateTask(id, { category: e.target.value.trim().toLowerCase() }, { group: `cat:${id}` }));
    q('notes').addEventListener('input', (e) => M.updateTask(id, { notes: e.target.value }, { group: `notes:${id}` }));

    // Steps: a small checklist inside the task.
    function drawSteps() {
      const steps = cur()?.steps || [];
      q('stepCount').textContent = steps.length ? `${steps.filter((x) => x.done).length}/${steps.length}` : '';
      q('steps').innerHTML = steps.map((st) => `<li data-step="${st.id}" class="${st.done ? 'done' : ''}">
        <button type="button" class="tick small${st.done ? ' on' : ''}" data-s="tick" aria-label="Step done"></button>
        <input value="${esc(st.title)}" data-s="title" aria-label="Step">
        <button type="button" class="step-x" data-s="del" aria-label="Remove step">×</button>
      </li>`).join('');
    }
    q('steps').addEventListener('click', (e) => {
      const li = e.target.closest('[data-step]');
      if (!li) return;
      const sid = li.dataset.step;
      if (e.target.closest('[data-s="tick"]')) { const st = cur().steps.find((x) => x.id === sid); M.updateStep(id, sid, { done: !st.done }); drawSteps(); }
      if (e.target.closest('[data-s="del"]')) { M.deleteStep(id, sid); drawSteps(); }
    });
    q('steps').addEventListener('input', (e) => {
      const li = e.target.closest('[data-step]');
      if (li && e.target.dataset.s === 'title') M.updateStep(id, li.dataset.step, { title: e.target.value }, { group: `step:${li.dataset.step}` });
    });
    q('steps').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.dataset.s === 'title') { e.preventDefault(); q('stepAdd').focus(); }
    });
    const addSteps = (lines) => { for (const l of lines) M.addStep(id, l); drawSteps(); };
    q('stepAdd').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addSteps(cleanLines(e.target.value)); e.target.value = ''; }
    });
    q('stepAdd').addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') || '';
      const lines = cleanLines(text);
      if (lines.length > 1) { e.preventDefault(); M.batch(() => addSteps(lines)); toast(`Added ${lines.length} steps`); }
    });
    drawSteps();

    q('duplicate').addEventListener('click', () => { M.duplicateTask(id); closePopover(); toast('Duplicated'); });
    q('delete').addEventListener('click', () => deleteWithUndo(t.title, () => M.deleteTask(id)));
  }, { key: `task:${id}`, width: 352 });
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

