// Events tab: add, edit and remove the events that Upcoming and Countdown read.
// Also imports .ics calendar files (e.g. a Canvas or Google Calendar export).

import { state, commit, onChange } from './state.js';
import { uid } from '../core/config.js';
import { esc, parseLocal, startOfDay, formatTime, dayLabel, occurrences } from '../core/util.js';
import { parseICS } from './ics.js';
import { toast } from './ui.js';

const $ = (id) => document.getElementById(id);
const form = $('eventForm');
const F = form.elements;
const list = $('eventList');
let editing = null;

const REPEAT_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

function events() { return state.cfg.data.events; }

function resetForm() {
  editing = null;
  form.reset();
  const d = new Date();
  F.date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  $('eventSubmit').textContent = 'Add event';
  $('eventCancel').hidden = true;
  form.classList.remove('is-editing');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const ev = {
    title: String(fd.get('title')).trim(),
    date: fd.get('date'),
    time: fd.get('time') || '',
    category: String(fd.get('category') || '').trim(),
    repeat: fd.get('repeat') || 'none',
    until: fd.get('until') || '',
  };
  if (!ev.title || !ev.date) return;
  if (editing) {
    Object.assign(events().find((x) => x.id === editing) || {}, ev);
    toast('Event updated');
  } else {
    events().push({ id: uid(), ...ev });
    toast('Event added');
  }
  commit('events');
  resetForm();
  F.title.focus();
});

$('eventCancel').addEventListener('click', resetForm);

function startEdit(id) {
  const ev = events().find((x) => x.id === id);
  if (!ev) return;
  editing = id;
  for (const k of ['title', 'date', 'time', 'category', 'repeat', 'until']) F[k].value = ev[k] || (k === 'repeat' ? 'none' : '');
  $('eventSubmit').textContent = 'Save changes';
  $('eventCancel').hidden = false;
  form.classList.add('is-editing');
  form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  F.title.focus();
}

function isPast(ev, now) {
  if (ev.repeat && ev.repeat !== 'none') return ev.until ? parseLocal(ev.until) < startOfDay(now) : false;
  const at = parseLocal(ev.date, ev.time);
  return ev.time ? at < now : at < startOfDay(now);
}

function render() {
  const now = new Date();
  const showPast = $('showPast').checked;
  const all = [...events()].sort((a, b) => (parseLocal(a.date, a.time) || 0) - (parseLocal(b.date, b.time) || 0));
  const visible = all.filter((ev) => showPast || !isPast(ev, now));
  const cats = [...new Set(all.map((e) => e.category).filter(Boolean))].sort();
  $('categoryList').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');

  if (!visible.length) {
    list.innerHTML = `<p class="muted empty">${all.length ? 'No upcoming events. Turn on “Show past events” to see older ones.' : 'No events yet. Add one above, or import an .ics file.'}</p>`;
    return;
  }
  list.innerHTML = `<table><thead><tr><th>When</th><th>Title</th><th>Category</th><th>Repeats</th><th><span class="sr">Actions</span></th></tr></thead><tbody>${
    visible.map((ev) => {
      // Repeating events show their next occurrence rather than the first one.
      const repeating = ev.repeat && ev.repeat !== 'none';
      const next = repeating ? occurrences([ev], { from: now, days: 400 })[0] : null;
      const at = next ? next.at : parseLocal(ev.date, ev.time);
      const when = `${next ? 'Next: ' : ''}${dayLabel(at, now)}${ev.time ? `, ${formatTime(at)}` : ''}`;
      return `<tr class="${isPast(ev, now) ? 'past' : ''}${ev.id === editing ? ' editing' : ''}">
        <td class="nowrap">${esc(when)}</td>
        <td>${esc(ev.title)}${ev.source ? ` <span class="muted small">from ${esc(ev.source)}</span>` : ''}</td>
        <td>${esc(ev.category || '')}</td>
        <td>${REPEAT_LABEL[ev.repeat] ? `${REPEAT_LABEL[ev.repeat]}${ev.until ? ` until ${esc(ev.until)}` : ''}` : ''}</td>
        <td class="row-actions"><button class="link" data-edit="${ev.id}">Edit</button><button class="link danger" data-del="${ev.id}">Delete</button></td>
      </tr>`;
    }).join('')
  }</tbody></table>`;
}

list.addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) startEdit(edit.dataset.edit);
  if (del) {
    state.cfg.data.events = events().filter((x) => x.id !== del.dataset.del);
    if (editing === del.dataset.del) resetForm();
    commit('events');
    toast('Event deleted');
  }
});

$('showPast').addEventListener('change', render);

$('clearPast').addEventListener('click', () => {
  const now = new Date();
  const before = events().length;
  state.cfg.data.events = events().filter((ev) => !isPast(ev, now));
  const removed = before - events().length;
  if (removed) commit('events');
  toast(removed ? `Removed ${removed} past event${removed === 1 ? '' : 's'}` : 'No past events to remove');
});

$('icsInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = parseICS(await file.text());
    const source = file.name.replace(/\.ics$/i, '');
    const existing = new Map(events().filter((x) => x.uid).map((x) => [x.uid, x]));
    let added = 0, updated = 0;
    for (const ev of imported) {
      const prev = ev.uid && existing.get(ev.uid);
      if (prev) { Object.assign(prev, ev); updated++; }
      else { events().push({ id: uid(), source, category: source.toLowerCase().slice(0, 24), ...ev }); added++; }
    }
    commit('events');
    toast(`Imported ${added} new and updated ${updated} event${added + updated === 1 ? '' : 's'}`);
  } catch (err) {
    toast(`Couldn’t read that file: ${err.message}`, true);
  }
});

export function initEvents() {
  resetForm();
  render();
  onChange((reason) => { if (['events', 'history', 'replace', 'init'].includes(reason)) render(); });
}
