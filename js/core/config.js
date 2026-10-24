// Board configuration: the single JSON document the editor writes and the display reads.
// Everything the wall shows is described here, so backing up this object backs up the board.

export const CONFIG_VERSION = 1;

export const DEFAULT_BOARD = {
  width: 1920,          // design resolution; the display scales this to fit its screen
  height: 1080,
  cols: 12,
  rows: 8,
  gap: 20,
  padding: 40,
  accent: '#9db4ff',
  panelStyle: 'card',   // default for panels that don't override it: card | outline | bare
  background: {
    style: 'aurora',    // aurora | drift | tide | none
    speed: 1,
    intensity: 0.55,
    fps: 20,
    hue: 230,
  },
  dim: { enabled: true, from: '23:00', to: '07:00', level: 0.55 },
  burnInShift: true,
  showStatus: true,     // tiny sync indicator in the corner of the display
  pollSeconds: 90,      // how often the display checks for a new config
  location: null,       // { name, lat, lon } shared by weather-aware panels
  units: 'imperial',    // imperial | metric
};

export function defaultConfig() {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };
  return {
    version: CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    board: structuredClone(DEFAULT_BOARD),
    panels: [
      { id: uid(), type: 'clock', x: 0, y: 0, w: 6, h: 4, settings: {} },
      { id: uid(), type: 'weather', x: 6, y: 0, w: 6, h: 4, settings: {} },
      { id: uid(), type: 'upcoming', x: 0, y: 4, w: 5, h: 4, settings: {} },
      { id: uid(), type: 'countdown', x: 5, y: 4, w: 3, h: 4, settings: { match: 'break' } },
      { id: uid(), type: 'notes', x: 8, y: 4, w: 4, h: 4, settings: {} },
    ],
    data: {
      events: [
        { id: uid(), title: 'Example: problem set due', date: plus(2), time: '23:59', category: 'school', repeat: 'none' },
        { id: uid(), title: 'Example: weekly lab', date: plus(1), time: '14:00', category: 'class', repeat: 'weekly' },
        { id: uid(), title: 'Example: winter break', date: plus(40), time: '', category: 'personal', repeat: 'none' },
      ],
    },
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// Fill in anything missing so older or hand-edited configs never break the display.
export function normalize(cfg) {
  if (!cfg || typeof cfg !== 'object') return defaultConfig();
  const out = {
    version: CONFIG_VERSION,
    updatedAt: cfg.updatedAt || new Date().toISOString(),
    board: deepMerge(structuredClone(DEFAULT_BOARD), cfg.board || {}),
    panels: Array.isArray(cfg.panels) ? cfg.panels : [],
    data: { events: [], ...(cfg.data || {}) },
  };
  out.panels = out.panels
    .filter((p) => p && p.type)
    .map((p) => ({ id: p.id || uid(), x: 0, y: 0, w: 3, h: 2, settings: {}, ...p }));
  if (!Array.isArray(out.data.events)) out.data.events = [];
  return out;
}

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      base[k] = deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

// Merge a panel's saved settings over the defaults declared by its definition.
export function resolveSettings(def, saved = {}) {
  const out = {};
  for (const field of def.settings || []) {
    if (field.type === 'heading') continue;
    out[field.key] = field.default;
  }
  return { ...out, ...saved };
}
