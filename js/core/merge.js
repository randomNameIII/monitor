// Merging two edited copies of the board, so the editor can be used from more than one computer.
//
// Three-way merge against `base`, the last version both sides had in common (the one last published
// or loaded from the gist). For every piece of the config:
//   - changed on one side only → take that side's version
//   - changed on both sides     → objects and lists of items with ids merge field by field;
//                                  anything else keeps this computer's version
// Items are matched by id, so adding a task here and ticking one off there keeps both. Deleting an item
// on one side while editing it on the other keeps the edited one.
// With no base (first sync on a computer), everything from both sides is kept and this computer
// wins where they differ.

const MISSING = undefined;
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const hasIds = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => isObj(x) && typeof x.id === 'string');

function eq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a == null || b == null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => eq(a[k], b[k]));
}

function mergeValue(base, mine, theirs, hasBase) {
  if (eq(mine, theirs)) return mine;
  if (hasBase) {
    if (eq(mine, base)) return theirs;
    if (eq(theirs, base)) return mine;
  }
  // Changed on both sides (or no base to tell).
  if (mine === MISSING) return theirs; // deleted here, edited there: keep the edit
  if (theirs === MISSING) return mine;
  if (isObj(mine) && isObj(theirs)) return mergeObject(isObj(base) ? base : {}, mine, theirs, hasBase && isObj(base));
  if ((hasIds(mine) || mine?.length === 0) && (hasIds(theirs) || theirs?.length === 0)) {
    return mergeList(Array.isArray(base) ? base : [], mine, theirs, hasBase && Array.isArray(base));
  }
  // Lists of plain values (days ticked off, skipped days, weekdays) merge as sets.
  if (Array.isArray(mine) && Array.isArray(theirs) && [...mine, ...theirs].every((x) => x === null || typeof x !== 'object')) {
    const b = hasBase && Array.isArray(base) ? base : [];
    const removed = new Set([...b.filter((x) => !mine.includes(x)), ...b.filter((x) => !theirs.includes(x))]);
    return [...new Set([...mine, ...theirs])].filter((x) => !removed.has(x));
  }
  return mine;
}

function mergeObject(base, mine, theirs, hasBase) {
  const out = {};
  for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const v = mergeValue(base[k], mine[k], theirs[k], hasBase);
    if (v !== MISSING) out[k] = v;
  }
  return out;
}

function mergeList(base, mine, theirs, hasBase) {
  const b = new Map(base.filter(isObj).map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const t = new Map(theirs.map((x) => [x.id, x]));
  const out = [];
  const add = (id) => {
    // Only in one list: new there (keep), or deleted on the other side (drop unless edited since).
    const v = mergeValue(b.get(id), m.get(id), t.get(id), hasBase);
    if (v !== MISSING) out.push(v);
  };
  // This computer's order first, then anything new from the other side, in its order.
  for (const x of mine) add(x.id);
  for (const x of theirs) if (!m.has(x.id)) add(x.id);
  return out;
}

/**
 * @param {object|null} base    last common version, or null if unknown
 * @param {object} mine         this computer's board
 * @param {object} theirs       the board in the gist
 */
export function mergeBoards(base, mine, theirs) {
  const merged = mergeValue(base || {}, mine, theirs, !!base);
  return merged;
}

export { eq as sameValue };
