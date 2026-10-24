// Minimal iCalendar (.ics) reader: enough for Canvas, Google Calendar and Outlook exports.
// Handles SUMMARY, DTSTART (dates, local times, UTC times), UID and simple RRULEs.

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function unescape(v) {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

// "20261030T235900Z" | "20261030T235900" | "20261030"
function parseStamp(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (!hh || params.includes('VALUE=DATE')) return { date: `${y}-${mo}-${d}`, time: '' };
  // UTC times convert to this computer's local time. TZID times are taken as written,
  // which is right whenever the calendar's zone matches yours.
  const dt = z ? new Date(Date.UTC(+y, mo - 1, +d, +hh, +mi)) : new Date(+y, mo - 1, +d, +hh, +mi);
  return { date: isoDate(dt), time: isoTime(dt) };
}

export function parseICS(text) {
  if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('not an iCalendar file');
  // Unfold continuation lines (lines starting with a space or tab continue the previous one).
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev.title && ev.date) out.push(ev);
      ev = null;
      continue;
    }
    if (!ev) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const [name, ...paramParts] = line.slice(0, idx).split(';');
    const params = paramParts.join(';').toUpperCase();
    const value = line.slice(idx + 1);
    switch (name.toUpperCase()) {
      case 'SUMMARY': ev.title = unescape(value); break;
      case 'UID': ev.uid = value.trim(); break;
      case 'DTSTART': { const s = parseStamp(value.trim(), params); if (s) Object.assign(ev, s); break; }
      case 'RRULE': {
        const rule = Object.fromEntries(value.split(';').map((kv) => kv.split('=')));
        const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[rule.FREQ];
        // Only plain repeats map cleanly; INTERVAL>1 or BYDAY lists are imported as a single event.
        if (freq && (!rule.INTERVAL || rule.INTERVAL === '1') && !(rule.BYDAY || '').includes(',')) {
          ev.repeat = freq;
          if (rule.UNTIL) ev.until = parseStamp(rule.UNTIL, '')?.date || '';
        }
        break;
      }
      default: break;
    }
  }
  return out.map((e) => ({ repeat: 'none', until: '', ...e }));
}
