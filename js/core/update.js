// Notices when a new version of the site has been deployed (version.json changes) and reloads cleanly.
// Used by both the display (reloads on its own) and the editor (asks first).

let current = null;

async function fetchBuild() {
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).build || null;
  } catch {
    return null; // offline: try again later
  }
}

/**
 * Calls onUpdate(newBuild) once when version.json changes. Checks every `minutes` and when the tab regains focus.
 */
export function watchForUpdates(onUpdate, { minutes = 10 } = {}) {
  let told = false;
  const check = async () => {
    if (told) return;
    const b = await fetchBuild();
    if (!b) return;
    if (current === null) { current = b; return; }
    if (b !== current) { told = true; onUpdate(b); }
  };
  check();
  setInterval(check, minutes * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
}

// Browsers keep scripts and styles cached for a few minutes, so a plain reload right after a deploy can
// mix old and new files. Refetch everything this page loaded from our own site first, then reload.
export async function refreshAndReload() {
  const own = performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(location.origin) && /\.(js|css|json|svg)(\?|$)/.test(u));
  const unique = [...new Set([location.href.split('#')[0], ...own])];
  try {
    await Promise.race([
      Promise.all(unique.map((u) => fetch(u, { cache: 'reload' }).catch(() => {}))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
  } finally {
    location.reload();
  }
}
