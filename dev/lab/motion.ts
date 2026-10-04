// Motion for the interaction lab: critically damped springs (no overshoot), eased tweens, one shared
// animation loop, and the lab's speed and reduced-motion settings. Dev only; not part of the build.

export type Speed = 'quick' | 'moderate';
export type MotionPref = 'system' | 'reduced' | 'full';
export type Size = 'small' | 'medium' | 'large';

const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

export const motion = {
  speed: 'quick' as Speed,
  pref: 'system' as MotionPref,
  /** Lab only: slows every motion by this factor so fast moments can be compared. */
  slow: 1,
  get reduced(): boolean {
    return this.pref === 'reduced' || (this.pref === 'system' && systemReduced.matches);
  },
};

const DURATIONS: Record<Speed, Record<Size, number>> = {
  // Quick small, slow large: presses are immediate, travel is unhurried.
  quick: { small: 100, medium: 220, large: 520 },
  moderate: { small: 220, medium: 280, large: 340 },
};

/** Duration in milliseconds for a motion of this size at the current speed. */
export function dur(size: Size): number {
  return DURATIONS[motion.speed][size] * motion.slow;
}

/** Crossfade length used in place of movement when reduced motion is on. */
export const FADE_MS = 160;

/** Writes the duration tokens to CSS so stylesheets follow the speed setting. */
export function applyMotionTokens(root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--t-small', `${dur('small')}ms`);
  root.style.setProperty('--t-medium', `${dur('medium')}ms`);
  root.style.setProperty('--t-large', `${dur('large')}ms`);
  root.style.setProperty('--slow', String(motion.slow));
  root.dataset.reducedMotion = motion.reduced ? 'true' : 'false';
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

/**
 * A critically damped spring: it reaches the target as fast as it can without overshooting, like a
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

/** ωt = 7 leaves under 1% of the distance, which reads as settled. */
function omegaFor(ms: number): number {
  return 7 / Math.max(0.001, ms / 1000);
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

/** Decelerating curve used for things that appear or change state. Matches --ease-out in CSS. */
export const easeOut = bezier(0.2, 0, 0, 1);
export const easeInOut = bezier(0.4, 0, 0.2, 1);
export const linear = (t: number): number => t;

/** Runs a tween over `ms`, calling `update` with eased progress. Resolves when done or stopped. */
export function tween(ms: number, update: (p: number) => void, ease = easeOut): { done: Promise<void>; stop: () => void } {
  ms *= motion.slow;
  let stopped = false;
  let start = -1;
  let resolve = (): void => {};
  const done = new Promise<void>((r) => (resolve = r));
  if (ms <= 0) {
    update(1);
    resolve();
    return { done, stop: () => {} };
  }
  loop((_dt, now) => {
    if (stopped) {
      resolve();
      return false;
    }
    if (start < 0) start = now;
    const p = Math.min(1, (now - start) / ms);
    update(ease(p));
    if (p >= 1) resolve();
    return p < 1;
  });
  return { done, stop: () => (stopped = true) };
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms * motion.slow));
}

/** Restarts a CSS animation class on an element. */
export function restartClass(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
