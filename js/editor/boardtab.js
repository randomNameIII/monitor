// Board tab: settings for the whole display, generated from a schema like panel settings.

import { state, commit, onChange } from './state.js';
import { renderField, h } from './fields.js';

const RESOLUTIONS = [
  { value: '1920x1080', label: '1920 × 1080 (1080p)' },
  { value: '2560x1440', label: '2560 × 1440 (1440p)' },
  { value: '3840x2160', label: '3840 × 2160 (4K)' },
  { value: '1280x720', label: '1280 × 720 (720p)' },
  { value: '1080x1920', label: '1080 × 1920 (portrait)' },
  { value: '1440x900', label: '1440 × 900 (16:10)' },
];

const get = (path) => path.split('.').reduce((o, k) => o?.[k], state.cfg.board);
function set(path, v) {
  const keys = path.split('.');
  let o = state.cfg.board;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = v;
}

const SECTIONS = [
  ['Location and units', [
    { key: 'location', label: 'Location', type: 'location', help: 'Used by the weather panel.' },
    { key: 'units', label: 'Units', type: 'select', options: [{ value: 'imperial', label: 'Fahrenheit, mph' }, { value: 'metric', label: 'Celsius, km/h' }] },
  ]],
  ['Look', [
    { key: 'accent', label: 'Accent color', type: 'color', swatches: ['#9db4ff', '#8fd3c7', '#c7a8ff', '#f2c48d', '#f29fb5', '#b8c4d6'] },
    { key: 'panelStyle', label: 'Default panel style', type: 'select', options: [{ value: 'card', label: 'Card' }, { value: 'outline', label: 'Outline' }, { value: 'bare', label: 'No background' }] },
    { key: 'background.style', label: 'Background', type: 'select', options: [
      { value: 'aurora', label: 'Aurora: slow drifting color' }, { value: 'tide', label: 'Tide: layered waves' },
      { value: 'drift', label: 'Drift: rising specks of light' }, { value: 'none', label: 'None: solid dark' },
    ] },
    { key: 'background.hue', label: 'Background hue', type: 'range', min: 0, max: 359, step: 1, format: (v) => `${v}°` },
    { key: 'background.intensity', label: 'Background brightness', type: 'range', min: 0.1, max: 1, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'background.speed', label: 'Animation speed', type: 'range', min: 0.2, max: 3, step: 0.1, format: (v) => `${v}×` },
    { key: 'background.fps', label: 'Frames per second', type: 'range', min: 5, max: 30, step: 1, help: 'Lower is easier on a slow computer. 15–20 looks smooth for slow motion.' },
  ]],
  ['Grid', [
    { key: '_resolution', label: 'Display resolution', type: 'select', options: RESOLUTIONS, help: 'Match your monitor. The board scales to fit any screen, but this sets the shape.' },
    { key: 'cols', label: 'Columns', type: 'number', min: 2, max: 24 },
    { key: 'rows', label: 'Rows', type: 'number', min: 2, max: 16 },
    { key: 'gap', label: 'Gap between panels (px)', type: 'number', min: 0, max: 80 },
    { key: 'padding', label: 'Edge padding (px)', type: 'number', min: 0, max: 160 },
  ]],
  ['Night and screen care', [
    { key: 'dim.enabled', label: 'Dim the display at night', type: 'toggle' },
    { key: 'dim.from', label: 'Dim from', type: 'time' },
    { key: 'dim.to', label: 'Until', type: 'time' },
    { key: 'dim.level', label: 'How much to dim', type: 'range', min: 0.1, max: 0.9, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
    { key: 'burnInShift', label: 'Shift the layout a few pixels every few minutes', type: 'toggle', help: 'Helps prevent burn-in on screens that show the same thing all day.' },
    { key: 'showStatus', label: 'Show a small sync dot in the corner', type: 'toggle' },
    { key: 'pollSeconds', label: 'Check for changes every (seconds)', type: 'number', min: 30, max: 3600, help: 'GitHub allows about 60 checks an hour without a token, so stay at 60 or above.' },
  ]],
];

function render() {
  const root = document.getElementById('boardForm');
  root.innerHTML = '';
  for (const [title, fields] of SECTIONS) {
    const sec = h('section', { class: 'card form-section' }, h('h2', {}, title));
    const grid = h('div', { class: 'fields two-col' });
    for (const f of fields) {
      const value = f.key === '_resolution' ? `${state.cfg.board.width}x${state.cfg.board.height}` : get(f.key);
      grid.append(renderField(f, value, (v) => {
        if (f.key === '_resolution') {
          const [w, hh] = v.split('x').map(Number);
          state.cfg.board.width = w; state.cfg.board.height = hh;
        } else {
          set(f.key, v);
        }
        if (f.key === 'cols' || f.key === 'rows') clampPanels();
        commit('board');
      }));
    }
    sec.append(grid);
    root.append(sec);
  }
}

// Keep panels inside the grid when it shrinks.
function clampPanels() {
  const { cols, rows } = state.cfg.board;
  for (const p of state.cfg.panels) {
    p.w = Math.min(p.w, cols); p.h = Math.min(p.h, rows);
    p.x = Math.min(p.x, cols - p.w); p.y = Math.min(p.y, rows - p.h);
  }
}

export function initBoardTab() {
  render();
  onChange((reason) => { if (['history', 'replace'].includes(reason)) render(); });
}
