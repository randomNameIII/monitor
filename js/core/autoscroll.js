// Slowly scrolls a list that doesn't fit, so everything on it comes past in turn.
//
// Markup: a viewport (overflow hidden) whose only child is the track holding the content:
//   <div class="as-view"><div class="as-track">…</div></div>
// If the track is taller than the viewport, a copy of the content is added below it and the
// track moves up until the copy sits where the original started, then repeats: a seamless loop
// with a pause at the top. It's a transform animation, which the browser runs on the GPU, so it
// costs the display almost nothing. The loop's position is taken from the clock, so redrawing the
// panel (every minute) carries on where it was instead of jumping back to the top.

export const SPEEDS = { slow: 0.45, normal: 0.75, fast: 1.2 }; // in lines (em) per second

/**
 * @param {HTMLElement} view   the viewport
 * @param {{ speed?: number, pause?: number }} opts  speed in em per second, pause in seconds at the top
 * @returns {boolean} whether it's scrolling
 */
export function autoScroll(view, { speed = SPEEDS.slow, pause = 4 } = {}) {
  const track = view.firstElementChild;
  if (!track) return false;
  stopScroll(view);
  const overflow = track.scrollHeight - view.clientHeight;
  if (overflow <= 2 || !view.clientHeight) return false;

  // A gap, then a copy of everything, so the bottom of the list runs straight into its top.
  const em = parseFloat(getComputedStyle(track).fontSize) || 16;
  const gap = document.createElement('div');
  gap.className = 'as-gap';
  gap.dataset.asClone = '';
  gap.setAttribute('aria-hidden', 'true');
  gap.style.cssText = `height:${Math.round(em * 1.6)}px;flex:none;`;
  track.appendChild(gap);
  const originals = [...track.children].filter((c) => !('asClone' in c.dataset));
  for (const c of originals) {
    const copy = c.cloneNode(true);
    copy.dataset.asClone = '';
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
  }
  const firstCopy = gap.nextElementSibling;
  const distance = firstCopy ? firstCopy.offsetTop - originals[0].offsetTop : track.scrollHeight / 2;

  const travel = distance / (em * speed);
  const total = (travel + pause) * 1000;
  view.classList.add('as-on');
  if (typeof track.animate !== 'function') return true;
  const anim = track.animate([
    { transform: 'translateY(0)', offset: 0 },
    { transform: 'translateY(0)', offset: pause * 1000 / total },
    { transform: `translateY(${-distance}px)`, offset: 1 },
  ], { duration: total, iterations: Infinity, easing: 'linear' });
  anim.currentTime = Date.now() % total;
  view._asAnim = anim;
  return true;
}

export function stopScroll(view) {
  view._asAnim?.cancel();
  view._asAnim = null;
  view.classList.remove('as-on');
  view.firstElementChild?.querySelectorAll(':scope > [data-as-clone]').forEach((n) => n.remove());
}
