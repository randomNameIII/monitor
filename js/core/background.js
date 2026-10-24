// Animated backgrounds drawn on one <canvas>, tuned for weak hardware:
//   - "aurora" and "tide" render at a tiny resolution (about 128×72) and let the browser upscale,
//     which gives a free soft blur. Each frame costs a handful of gradient fills.
//   - "drift" draws a few dozen slow stars at 1× pixel density.
// The loop uses setTimeout at the configured fps (not a 60 Hz rAF loop) and stops when the page is hidden.

const INK = '#070912';

export function createBackground(canvas, { container = null } = {}) {
  const box = () => container
    ? { w: container.clientWidth || 1, h: container.clientHeight || 1 }
    : { w: window.innerWidth, h: window.innerHeight };
  const ctx = canvas.getContext('2d', { alpha: false });
  let opts = { style: 'aurora', speed: 1, intensity: 0.55, fps: 20, hue: 230 };
  let timer = null;
  let stars = [];
  let dimmed = false;
  let sizedFor = null;
  const t0 = performance.now();

  function size() {
    if (opts.style === 'drift') {
      const { w, h } = box();
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
      canvas.style.imageRendering = 'auto';
      seedStars();
    } else {
      canvas.width = opts.style === 'tide' ? 192 : 128;
      const { w, h } = box();
      canvas.height = Math.round(canvas.width * (h / Math.max(1, w)));
    }
  }

  function seedStars() {
    const n = Math.round(40 + 60 * opts.intensity);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.6,
      vx: (Math.random() - 0.5) * 4,
      vy: -Math.random() * 3 - 0.5,
      p: Math.random() * Math.PI * 2,
    }));
  }

  function aurora(t) {
    const { width: W, height: H } = canvas;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const blobs = [
      [0.13, 0.11, 0, 0.62, 0],
      [0.09, 0.15, 2.1, 0.5, 38],
      [0.07, 0.05, 4.2, 0.7, -32],
      [0.05, 0.12, 1.3, 0.45, 70],
    ];
    const a = 0.16 + 0.34 * opts.intensity;
    for (const [fx, fy, ph, rad, hueOff] of blobs) {
      const x = W * (0.5 + 0.42 * Math.sin(t * fx + ph));
      const y = H * (0.5 + 0.38 * Math.cos(t * fy + ph * 1.7));
      const r = W * rad;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `hsla(${opts.hue + hueOff}, 55%, 38%, ${a})`);
      g.addColorStop(1, 'hsla(0,0%,0%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function tide(t) {
    const { width: W, height: H } = canvas;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const base = H * (0.55 + i * 0.1);
      const amp = H * (0.05 + 0.02 * i);
      const k = (Math.PI * 2) / (W * (1.1 - i * 0.15));
      const sp = t * (0.25 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 4) {
        const y = base + Math.sin(x * k + sp + i) * amp + Math.sin(x * k * 2.3 - sp * 0.7) * amp * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = `hsla(${opts.hue + i * 12}, 50%, ${18 + i * 4}%, ${(0.18 + 0.3 * opts.intensity) * (1 - i * 0.12)})`;
      ctx.fill();
    }
  }

  let last = performance.now();
  function drift(t) {
    const now = performance.now();
    const dt = Math.min(0.2, (now - last) / 1000) * opts.speed;
    last = now;
    const { width: W, height: H } = canvas;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.3, H * 1.1, 0, W * 0.3, H * 1.1, W * 0.9);
    g.addColorStop(0, `hsla(${opts.hue}, 50%, 20%, ${0.25 * opts.intensity + 0.1})`);
    g.addColorStop(1, 'hsla(0,0%,0%,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
      if (s.x < -4) s.x = W + 4; else if (s.x > W + 4) s.x = -4;
      const tw = 0.45 + 0.55 * Math.sin(t * 0.8 + s.p);
      ctx.fillStyle = `hsla(${opts.hue}, 40%, 85%, ${(0.15 + 0.5 * opts.intensity) * tw})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame() {
    timer = null;
    if (document.hidden || opts.style === 'none') return;
    const t = ((performance.now() - t0) / 1000) * opts.speed;
    if (opts.style === 'aurora') aurora(t);
    else if (opts.style === 'tide') tide(t);
    else if (opts.style === 'drift') drift(t);
    const fps = dimmed ? Math.min(6, opts.fps) : opts.fps;
    timer = setTimeout(frame, 1000 / Math.max(1, Math.min(60, fps)));
  }

  function restart() {
    clearTimeout(timer);
    timer = null;
    if (opts.style === 'none') {
      canvas.width = 2; canvas.height = 2;
      ctx.fillStyle = INK; ctx.fillRect(0, 0, 2, 2);
      return;
    }
    frame();
  }

  const onVisibility = () => { if (!document.hidden && !timer) restart(); };
  const onResize = () => { size(); };
  const ro = container && 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
  ro?.observe(container);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);

  return {
    configure(next = {}) {
      const reseed = next.style !== sizedFor || next.intensity !== opts.intensity;
      opts = { ...opts, ...next };
      if (reseed) { size(); sizedFor = opts.style; }
      restart();
    },
    setDim(v) { dimmed = !!v; },
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    },
  };
}
