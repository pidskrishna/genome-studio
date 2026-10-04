// Motion for the interface (DESIGN.md section 5): critically damped springs (no overshoot), eased
// tweens, one shared animation loop, and the reduced-motion setting. Interface only: none of this may
// be used in src/sim, and none of it touches simulation state.

export type Size = 'small' | 'medium' | 'large';

/** Durations in milliseconds: quick for small things, slow for large ones. */
export const DURATIONS: Readonly<Record<Size, number>> = { small: 100, medium: 220, large: 520 };

/** Length of the crossfade that replaces movement when reduced motion is on. */
export const FADE_MS = 160;

const query = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export const motion = {
  /** 'system' follows the operating system; the others override it (dev handle for checks). */
  pref: 'system' as 'system' | 'reduced' | 'full',
  get reduced(): boolean {
    return this.pref === 'reduced' || (this.pref === 'system' && (query?.matches ?? false));
  },
};

export function dur(size: Size): number {
  return DURATIONS[size];
}

/** Writes the timing tokens and the reduced-motion flag to the root element, for the stylesheet. */
export function applyMotionTokens(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--t-small', `${dur('small')}ms`);
  root.style.setProperty('--t-medium', `${dur('medium')}ms`);
  root.style.setProperty('--t-large', `${dur('large')}ms`);
  root.dataset.reducedMotion = motion.reduced ? 'true' : 'false';
}

/** Calls `listener` when the system's reduced-motion setting changes. */
export function onReducedMotionChange(listener: () => void): void {
  query?.addEventListener('change', listener);
}

// Shared loop ---------------------------------------------------------------------------------------

type Tick = (dt: number, now: number) => boolean;
const ticks = new Set<Tick>();
let last = 0;
let running = false;

function frame(now: number): void {
  const dt = Math.min(0.05, last === 0 ? 1 / 60 : (now - last) / 1000);
  last = now;
  for (const t of [...ticks]) if (!t(dt, now)) ticks.delete(t);
  if (ticks.size > 0) requestAnimationFrame(frame);
  else {
    running = false;
    last = 0;
  }
}

/** Runs `tick` every frame until it returns false. Returns a function that stops it. */
export function loop(tick: Tick): () => void {
  ticks.add(tick);
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
  return () => ticks.delete(tick);
}

// Springs -------------------------------------------------------------------------------------------

/** ωt = 7 leaves under 1% of the distance at the settle time, which reads as settled. */
export function omegaFor(settleMs: number): number {
  return 7 / Math.max(0.001, settleMs / 1000);
}

/**
 * A critically damped spring: it reaches its target as fast as it can without overshooting, like a
 * well-damped instrument needle. Solved exactly, so it is stable at any frame time.
 */
export class Damped {
  velocity = 0;
  target: number;
  private omega: number;

  constructor(public value: number, settleMs: number) {
    this.target = value;
    this.omega = omegaFor(settleMs);
  }

  setSettle(ms: number): void {
    this.omega = omegaFor(ms);
  }

  /** Jumps to a value with no motion. */
  snap(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  step(dt: number): void {
    const w = this.omega;
    const x0 = this.value - this.target;
    const v0 = this.velocity;
    const e = Math.exp(-w * dt);
    const k = v0 + w * x0;
    this.value = this.target + (x0 + k * dt) * e;
    this.velocity = (v0 - w * k * dt) * e;
    if (Math.abs(this.value - this.target) < 1e-5 && Math.abs(this.velocity) < 1e-4) this.snap(this.target);
  }

  get settled(): boolean {
    return this.value === this.target && this.velocity === 0;
  }
}

// Tweens --------------------------------------------------------------------------------------------

/** Cubic Bézier easing, as CSS defines it. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const x = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const dx = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  const y = (t: number): number => ((ay * t + by) * t + cy) * t;
  return (p: number) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let t = p;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (x(t) - p) / d;
    }
    return y(Math.min(1, Math.max(0, t)));
  };
}

/** The decelerating curve for things that appear or change state; matches --ease-out. */
export const easeOut = bezier(0.2, 0, 0, 1);

/** Runs a tween over `ms`, calling `update` with eased progress. Resolves when done. */
export function tween(ms: number, update: (p: number) => void, ease = easeOut): Promise<void> {
  if (ms <= 0) {
    update(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let start = -1;
    loop((_dt, now) => {
      if (start < 0) start = now;
      const p = Math.min(1, (now - start) / ms);
      update(ease(p));
      if (p >= 1) resolve();
      return p < 1;
    });
  });
}
