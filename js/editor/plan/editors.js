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
        <label class="pf"><span>Do it on<button type="button" class="link pf-clear" data-f="unschedule" ${t.date ? '' : 'hidden'}>No date</button></span><input type="date" data-f="date" value="${esc(t.date || '')}"></label>
        <label class="pf"><span>Due<button type="button" class="link pf-clear" data-f="nodue" ${t.due ? '' : 'hidden'}>Clear</button></span><input type="date" data-f="due" value="${esc(t.due || '')}"></label>
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
        ${repeating && day ? '<button type="button" class="btn ghost small" data-f="skip">Skip this day</button>' : ''}
        <button type="button" class="btn danger small" data-f="delete">${repeating ? 'Delete all' : 'Delete'}</button>
      </div>`;

    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const cur = () => M.findTask(id);
    q('skip')?.addEventListener('click', () => {
      M.skipOccurrence('task', id, day);
      closePopover();
      toast(`Skipped ${parseLocal(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`, false, { label: 'Undo', fn: undo });
    });
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
    q('due').addEventListener('change', (e) => {
      const patch = { due: e.target.value };
      // A task with no day yet is planned for its due day.
      if (e.target.value && !cur().date) { patch.date = e.target.value; q('date').value = e.target.value; q('unschedule').hidden = false; }
      M.updateTask(id, patch);
      q('nodue').hidden = !e.target.value;
    });
    q('nodue').addEventListener('click', () => { M.updateTask(id, { due: '' }); q('due').value = ''; q('nodue').hidden = true; });

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
    q('category').addEventListener('input', (e) => M.updateTask(id, { category: e.target.value.trim() }, { group: `cat:${id}` }));
    // When you leave the box, match an existing category's spelling (eng111 → ENG111).
    q('category').addEventListener('change', (e) => { const c = M.canonicalCategory(e.target.value); if (c !== cur().category) { M.updateTask(id, { category: c }, { group: `cat:${id}` }); } e.target.value = c; });
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

/* ---------------- day note ---------------- */

const NOTE_REPEATS = [['none', 'Doesn’t repeat'], ['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year'], ['daily', 'Every day']];

export function editNoteDetails(anchor, id, { focusEnd = false, day = null } = {}) {
  const n = M.findNote(id);
  if (!n) return;
  openPopover(anchor, (el) => {
    const repeating = n.repeat && n.repeat !== 'none';
    el.innerHTML = `
      <textarea class="pop-title note-title" rows="1" data-f="text" aria-label="Note">${esc(n.text)}</textarea>
      <p class="pop-note">A note shows on the day (or across the days) without being a task.</p>
      <div class="pop-grid">
        ${field('From', `<input type="date" data-f="date" value="${esc(n.date)}">`)}
        <label class="pf"><span>To<button type="button" class="link pf-clear" data-f="oneday" ${n.end ? '' : 'hidden'}>One day</button></span><input type="date" data-f="end" value="${esc(n.end || '')}" min="${esc(n.date)}"></label>
        ${field('Repeats', `<select data-f="repeat">${NOTE_REPEATS.map(([v, l]) => `<option value="${v}" ${v === (n.repeat || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
        ${field('Until', `<input type="date" data-f="until" value="${esc(n.until || '')}">`, `pf-until${repeating ? '' : ' hidden'}`)}
        ${field('Category', `<input data-f="category" list="popNoteCats" value="${esc(n.category || '')}" placeholder="none"><datalist id="popNoteCats">${M.allCategories().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`, 'pf-wide')}
      </div>
      ${n.skip?.length ? `<p class="pop-note small">${n.skip.length} day${n.skip.length === 1 ? '' : 's'} skipped. <button type="button" class="link" data-f="unskip">Bring them back</button></p>` : ''}
      <p class="pop-note small">Tip: drag a note’s right edge across days on the board to stretch it, or its ends to change the dates.</p>
      <div class="pop-actions">
        <button type="button" class="btn ghost small" data-f="task">Make it a task</button>
        <span class="spacer"></span>
        ${repeating && day ? '<button type="button" class="btn ghost small" data-f="skip">Skip this day</button>' : ''}
        <button type="button" class="btn danger small" data-f="delete">${repeating ? 'Delete all' : 'Delete'}</button>
      </div>`;
    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const cur = () => M.findNote(id);
    const text = q('text');
    const grow = () => { text.style.height = 'auto'; text.style.height = `${text.scrollHeight}px`; };
    requestAnimationFrame(grow);
    text.addEventListener('input', grow);
    text.addEventListener('change', () => { if (text.value.trim()) M.updateNote(id, { text: text.value.replace(/\n/g, ' ').trim() }); });
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); text.dispatchEvent(new Event('change')); closePopover(); } });
    q('date').addEventListener('change', (e) => {
      if (!e.target.value) return;
      // Moving the start keeps the length.
      const c = cur();
      const len = c.end ? (parseLocal(c.end) - parseLocal(c.date)) / 86400000 : 0;
      const end = len ? isoDate(new Date(parseLocal(e.target.value).getTime() + len * 86400000)) : '';
      M.updateNote(id, { date: e.target.value, end });
      q('end').value = end; q('end').min = e.target.value;
    });
    q('end').addEventListener('change', (e) => {
      const v = e.target.value && e.target.value > cur().date ? e.target.value : '';
      M.updateNote(id, { end: v });
      e.target.value = v;
      q('oneday').hidden = !v;
    });
    q('oneday').addEventListener('click', () => { M.updateNote(id, { end: '' }); q('end').value = ''; q('oneday').hidden = true; });
    q('repeat').addEventListener('change', (e) => {
      M.updateNote(id, { repeat: e.target.value });
      el.querySelector('.pf-until').classList.toggle('hidden', e.target.value === 'none');
    });
    q('until').addEventListener('change', (e) => M.updateNote(id, { until: e.target.value }));
    q('category').addEventListener('change', (e) => { const c = M.canonicalCategory(e.target.value); M.updateNote(id, { category: c }); e.target.value = c; });
    q('skip')?.addEventListener('click', () => {
      M.skipOccurrence('note', id, day);
      closePopover();
      toast('Skipped that day', false, { label: 'Undo', fn: undo });
    });
    q('unskip')?.addEventListener('click', (e) => { M.updateNote(id, { skip: [] }); e.target.closest('p').remove(); });
    q('task').addEventListener('click', () => {
      const c = cur();
      M.batch(() => { M.addTask({ title: c.text, date: c.date }); M.deleteNote(id); });
      closePopover();
      toast('Turned into a task', false, { label: 'Undo', fn: undo });
    });
    q('delete').addEventListener('click', () => deleteWithUndo(n.text, () => M.deleteNote(id)));
    if (focusEnd) requestAnimationFrame(() => q('end').focus());
  }, { key: `note:${id}`, width: 330 });
}

/* ---------------- category ---------------- */

const CAT_HUES = [0, 20, 38, 55, 90, 140, 170, 195, 215, 240, 270, 300, 330];

export function editCategory(anchor, name, hueOf) {
  let current = name;
  openPopover(anchor, (el) => {
    const count = [...state.cfg.data.events, ...(state.cfg.data.notes || [])].filter((e) => (e.category || '').toLowerCase() === name.toLowerCase()).length;
    const custom = state.cfg.data.categoryColors?.[name.toLowerCase()] != null;
    el.innerHTML = `
      <input class="pop-title cat-name" data-f="name" value="${esc(name)}" aria-label="Category name" spellcheck="false">
      <p class="pop-note">Used by ${count} task${count === 1 ? '' : 's'} and notes. Renaming changes all of them; you can fix capitals here too.</p>
      <div class="pf pf-wide"><span>Color</span>
        <div class="hues cat-hues">
          <button type="button" class="hue auto${custom ? '' : ' on'}" data-hue="" title="Automatic color" aria-label="Automatic color">A</button>
          ${CAT_HUES.map((h) => `<button type="button" class="hue" style="--h:${h}" data-hue="${h}" aria-label="Hue ${h}"></button>`).join('')}
        </div>
        <div class="range-row"><input type="range" min="0" max="359" step="1" data-f="hue" value="${hueOf(name)}" aria-label="Exact color"><i class="cat-swatch" style="--h:${hueOf(name)}"></i></div>
      </div>
      <div class="pop-actions">
        <span class="spacer"></span>
        <button type="button" class="btn danger small" data-f="delete">Remove category</button>
      </div>`;
    const q = (f) => el.querySelector(`[data-f="${f}"]`);
    const paint = () => {
      const isCustom = state.cfg.data.categoryColors?.[current.toLowerCase()] != null;
      const h = hueOf(current);
      el.querySelectorAll('.cat-hues .hue').forEach((b) => b.classList.toggle('on', b.dataset.hue === '' ? !isCustom : isCustom && +b.dataset.hue === h));
      q('hue').value = h;
      el.querySelector('.cat-swatch').style.setProperty('--h', h);
    };
    el.querySelector('.cat-hues').addEventListener('click', (e) => {
      const b = e.target.closest('[data-hue]');
      if (!b) return;
      M.setCategoryColor(current, b.dataset.hue === '' ? null : +b.dataset.hue);
      paint();
    });
    q('hue').addEventListener('input', (e) => { M.setCategoryColor(current, +e.target.value); paint(); });
    const rename = () => {
      const v = q('name').value.trim();
      if (!v || v === current) return;
      M.renameCategory(current, v);
      current = v;
    };
    q('name').addEventListener('change', rename);
    q('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rename(); closePopover(); } });
    q('delete').addEventListener('click', () => deleteWithUndo(current, () => M.deleteCategory(current)));
    paint();
  }, { key: `cat:${name}`, width: 320 });
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


// Handy due dates: Today, Tomorrow, the coming Friday, next Monday, a week from today.
export function dueChoices(from = new Date()) {
  const d0 = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const plus = (n) => new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + n);
  const dow = d0.getDay();
  const short = (d) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fri = plus((5 - dow + 7) % 7 || 7), mon = plus((1 - dow + 7) % 7 || 7);
  const out = [
    { label: 'Today', key: isoDate(d0), sub: short(d0) },
    { label: 'Tomorrow', key: isoDate(plus(1)), sub: short(plus(1)) },
    { label: 'Friday', key: isoDate(fri), sub: short(fri) },
    { label: 'Next Monday', key: isoDate(mon), sub: short(mon) },
    { label: 'In a week', key: isoDate(plus(7)), sub: short(plus(7)) },
  ];
  // Drop repeats (e.g. tomorrow is Friday).
  return out.filter((c, i) => out.findIndex((x) => x.key === c.key) === i);
}

const longDay = (key) => parseLocal(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Give several tasks the same due date at once. Tasks with no day yet are planned for the due day.
export function setDueDates(ids, key) {
  const tasks = [...new Set(ids)].map((id) => M.findTask(id)).filter(Boolean);
  if (!tasks.length) return;
  M.batch(() => {
    for (const t of tasks) {
      const patch = { due: key || '' };
      if (key && !t.date) patch.date = key;
      M.updateTask(t.id, patch);
    }
  });
  const n = tasks.length;
  toast(key ? `${n === 1 ? `“${tasks[0].title}” is` : `${n} tasks are`} due ${longDay(key)}` : `Cleared the due date${n === 1 ? '' : `s on ${n} tasks`}`, false, { label: 'Undo', fn: undo });
}

export function editDueDates(anchor, ids) {
  ids = [...new Set(ids)];
  const tasks = ids.map((id) => M.findTask(id)).filter(Boolean);
  if (!tasks.length) return;
  const same = tasks.every((t) => (t.due || '') === (tasks[0].due || '')) ? tasks[0].due || '' : '';
  const anyDue = tasks.some((t) => t.due);
  const undated = tasks.filter((t) => !t.date).length;
  openPopover(anchor, (el) => {
    el.classList.add('pop-due');
    el.innerHTML = `
      <div class="pop-head">⚑ Due date${tasks.length > 1 ? ` for ${tasks.length} tasks` : ''}</div>
      ${tasks.length === 1 ? `<p class="pop-note">${esc(tasks[0].title)}</p>` : ''}
      <div class="due-quick">${dueChoices().map((c) => `<button type="button" class="due-q${c.key === same ? ' on' : ''}" data-key="${c.key}"><b>${c.label}</b><span>${esc(c.sub)}</span></button>`).join('')}</div>
      <label class="pf"><span>Or pick a date</span><input type="date" data-f="due" value="${esc(same)}"></label>
      ${undated ? `<p class="pop-note">${undated === tasks.length ? (tasks.length === 1 ? 'It has' : 'They have') : `${undated} of them have`} no day yet, so ${undated === 1 ? 'it’s' : 'they’re'} planned for the due day too.</p>` : ''}
      ${anyDue ? '<div class="pop-actions"><button type="button" class="link" data-f="clear">Remove the due date' + (tasks.length > 1 ? 's' : '') + '</button></div>' : ''}`;
    const pick = (key) => { closePopover(); setDueDates(ids, key); };
    el.querySelectorAll('.due-q').forEach((b) => b.addEventListener('click', () => pick(b.dataset.key)));
    const inp = el.querySelector('[data-f="due"]');
    inp.addEventListener('change', () => { if (inp.value) pick(inp.value); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && inp.value) { e.preventDefault(); pick(inp.value); } });
    el.querySelector('[data-f="clear"]')?.addEventListener('click', () => pick(''));
  }, { key: `due:${ids.join(',')}`, width: 330 });
}
