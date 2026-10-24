// Small helpers shared by panels. Nothing here touches the DOM beyond string building.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pad(n) { return String(n).padStart(2, '0'); }

export function formatTime(d, h24 = false, withSeconds = false) {
  let h = d.getHours();
  const m = pad(d.getMinutes());
  const s = withSeconds ? `:${pad(d.getSeconds())}` : '';
  if (h24) return `${pad(h)}:${m}${s}`;
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${s} ${ampm}`;
}

export function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }

// "Today", "Tomorrow", "Wednesday" (within a week) or "Mon, Nov 9"
export function dayLabel(d, now = new Date()) {
  const diff = daysBetween(now, d);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function parseLocal(date, time) {
  if (!date) return null;
  const [y, mo, da] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  const d = new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
  return isNaN(d) ? null : d;
}

// Expand events (including repeating ones) into dated occurrences inside [from, from + days).
// An all-day event (no time) stays "upcoming" until the end of its day.
export function occurrences(events, { from = new Date(), days = 30, categories = [] } = {}) {
  const windowStart = startOfDay(from);
  const windowEnd = addDays(windowStart, days);
  const cats = categories.map((c) => c.trim().toLowerCase()).filter(Boolean);
  const out = [];

  for (const ev of events || []) {
    if (!ev || !ev.date || !ev.title) continue;
    if (cats.length && !cats.includes(String(ev.category || '').toLowerCase())) continue;
    const first = parseLocal(ev.date, ev.time);
    if (!first) continue;
    const until = ev.until ? addDays(parseLocal(ev.until), 1) : null;
    const allDay = !ev.time;
    const ends = (d) => (allDay ? addDays(startOfDay(d), 1) : d);

    const push = (d) => {
      if (until && d >= until) return false;
      if (d >= windowEnd) return false;
      if (ends(d) > from && d >= windowStart - 86400000) out.push({ ...ev, at: d, allDay });
      return true;
    };

    const repeat = ev.repeat || 'none';
    if (repeat === 'none') { push(first); continue; }

    let d = new Date(first);
    // Jump close to the window so long-running repeats stay cheap.
    if (repeat === 'daily' || repeat === 'weekly') {
      const step = repeat === 'daily' ? 1 : 7;
      const behind = daysBetween(d, windowStart);
      if (behind > step) d = addDays(d, Math.floor(behind / step) * step - step);
    }
    for (let i = 0; i < 400; i++) {
      if (!push(d)) break;
      if (repeat === 'daily') d = addDays(d, 1);
      else if (repeat === 'weekly') d = addDays(d, 7);
      else if (repeat === 'monthly') { d = new Date(d); d.setMonth(d.getMonth() + 1); }
      else if (repeat === 'yearly') { d = new Date(d); d.setFullYear(d.getFullYear() + 1); }
      else break;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Very small markdown subset for notes: **bold**, _italic_, "- " bullets, "[ ] / [x]" checkboxes.
export function miniMarkdown(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<em>$2</em>');
  const lines = String(text || '').split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const box = line.match(/^\s*[-*]?\s*\[( |x|X)\]\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (box || bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      if (box) {
        const done = box[1].toLowerCase() === 'x';
        html += `<li class="check${done ? ' done' : ''}"><span class="box" aria-hidden="true"></span>${inline(box[2])}</li>`;
      } else {
        html += `<li>${inline(bullet[1])}</li>`;
      }
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (!line.trim()) { html += '<div class="gap"></div>'; continue; }
    const head = line.match(/^#+\s+(.*)$/);
    html += head ? `<h4>${inline(head[1])}</h4>` : `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}

// Is the current time inside an "HH:MM"–"HH:MM" window that may wrap past midnight?
export function inWindow(from, to, now = new Date()) {
  const mins = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const n = now.getHours() * 60 + now.getMinutes();
  const a = mins(from), b = mins(to);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}
