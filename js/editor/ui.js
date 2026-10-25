// Small UI helpers shared by editor modules.

let toastTimer;
// action: optional { label, fn } shown as a button, e.g. Undo.
export function toast(message, isError = false, action = null) {
  const el = document.getElementById('toast');
  el.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { el.hidden = true; action.fn(); });
    el.append(b);
  }
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 6000 : action ? 5000 : 2600);
}

export function relativeTime(iso) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
