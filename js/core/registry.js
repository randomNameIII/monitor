// The panel registry. Each panel file calls registerPanel() with a definition object;
// see docs/creating-panels.md and js/panels/_template.js for the full shape.

const panels = new Map();

export function registerPanel(def) {
  if (!def || !def.type || typeof def.mount !== 'function') {
    throw new Error('registerPanel needs at least { type, mount() }');
  }
  panels.set(def.type, {
    name: def.type,
    description: '',
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 1, h: 1 },
    settings: [],
    usesData: false,
    ...def,
  });
  // Panels may ship their own CSS so a new panel stays a single file.
  if (def.css && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.dataset.panel = def.type;
    style.textContent = def.css;
    document.head.appendChild(style);
  }
}

export function getPanel(type) { return panels.get(type); }
export function listPanels() { return [...panels.values()]; }
