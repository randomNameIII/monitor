// Turns a settings schema (from a panel definition or the board form) into form controls.

import { esc } from '../core/util.js';

let n = 0;
const nextId = () => `f${++n}`;

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

function optionList(field) {
  return (field.options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o[0].toUpperCase() + o.slice(1) }));
}

export function isVisible(field, values) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([k, v]) => (Array.isArray(v) ? v.includes(values[k]) : values[k] === v));
}

// Build one field. onInput(value) is called on every change.
export function renderField(field, value, onInput) {
  const id = nextId();
  if (field.type === 'heading') return h('h3', { class: 'field-heading' }, field.label);

  const wrap = h('div', { class: `field field-${field.type}` });
  const help = field.help ? h('small', { class: 'help' }, field.help) : null;

  if (field.type === 'toggle') {
    const input = h('input', { type: 'checkbox', id, role: 'switch', checked: !!value, onChange: (e) => onInput(e.target.checked) });
    wrap.append(h('label', { class: 'toggle', for: id }, input, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', {}, field.label)));
    if (help) wrap.append(help);
    return wrap;
  }

  wrap.append(h('label', { for: id }, field.label));
  let input;
  switch (field.type) {
    case 'textarea':
      input = h('textarea', { id, rows: field.rows || 7, placeholder: field.placeholder, onInput: (e) => onInput(e.target.value) });
      input.value = value ?? '';
      break;
    case 'number':
      input = h('input', {
        id, type: 'number', min: field.min, max: field.max, step: field.step || 1,
        onInput: (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onInput(clamp(v, field.min, field.max)); },
      });
      input.value = value ?? '';
      break;
    case 'range': {
      const out = h('output', {}, fmt(value, field));
      input = h('input', {
        id, type: 'range', min: field.min, max: field.max, step: field.step || 1,
        onInput: (e) => { const v = parseFloat(e.target.value); out.textContent = fmt(v, field); onInput(v); },
      });
      input.value = value;
      wrap.append(h('div', { class: 'range-row' }, input, out));
      if (help) wrap.append(help);
      return wrap;
    }
    case 'select':
      input = h('select', { id, onChange: (e) => onInput(e.target.value) },
        optionList(field).map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
      break;
    case 'color': {
      input = h('input', { id, type: 'color', onInput: (e) => onInput(e.target.value) });
      input.value = value || '#9db4ff';
      const row = h('div', { class: 'color-row' }, input);
      for (const sw of field.swatches || []) {
        row.append(h('button', {
          type: 'button', class: 'swatch', title: sw, style: `--c:${sw}`, 'aria-label': `Use ${sw}`,
          onClick: () => { input.value = sw; onInput(sw); },
        }));
      }
      wrap.append(row);
      if (help) wrap.append(help);
      return wrap;
    }
    case 'date':
    case 'time':
      input = h('input', { id, type: field.type, onInput: (e) => onInput(e.target.value) });
      input.value = value || '';
      break;
    case 'location':
      wrap.append(locationPicker(id, value, onInput));
      if (help) wrap.append(help);
      return wrap;
    default:
      input = h('input', { id, type: 'text', placeholder: field.placeholder, onInput: (e) => onInput(e.target.value) });
      input.value = value ?? '';
  }
  wrap.append(input);
  if (help) wrap.append(help);
  return wrap;
}

function clamp(v, min, max) {
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}
function fmt(v, field) { return field.format ? field.format(v) : String(v); }

// City search through Open-Meteo's free geocoder, plus "use my location".
function locationPicker(id, value, onInput) {
  const current = h('div', { class: 'loc-current' });
  const results = h('ul', { class: 'loc-results' });
  const input = h('input', { id, type: 'search', placeholder: 'Search for a city' });
  const showCurrent = (v) => {
    current.innerHTML = v
      ? `<span>${esc(v.name)}</span><button type="button" class="link" data-clear>Clear</button>`
      : '<span class="muted">Not set</span>';
    current.querySelector('[data-clear]')?.addEventListener('click', () => { onInput(null); showCurrent(null); });
  };
  showCurrent(value);

  const choose = (loc) => { onInput(loc); showCurrent(loc); results.innerHTML = ''; input.value = ''; };

  const search = async () => {
    const q = input.value.trim();
    if (!q) return;
    results.innerHTML = '<li class="muted">Searching…</li>';
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`);
      const j = await res.json();
      results.innerHTML = '';
      if (!j.results?.length) { results.innerHTML = '<li class="muted">No matches. Try a nearby larger city.</li>'; return; }
      for (const r of j.results) {
        const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
        results.append(h('li', {}, h('button', { type: 'button', onClick: () => choose({ name: r.name, label, lat: r.latitude, lon: r.longitude }) }, label)));
      }
    } catch {
      results.innerHTML = '<li class="muted">Search failed. Check your connection.</li>';
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

  const geo = h('button', {
    type: 'button', class: 'btn ghost small',
    onClick: () => {
      if (!navigator.geolocation) return;
      geo.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(
        (p) => { geo.textContent = 'Use my location'; choose({ name: 'My location', lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) }); },
        () => { geo.textContent = 'Location blocked'; },
        { timeout: 10000 },
      );
    },
  }, 'Use my location');

  return h('div', { class: 'loc' }, current,
    h('div', { class: 'loc-row' }, input, h('button', { type: 'button', class: 'btn small', onClick: search }, 'Search')),
    geo, results);
}
