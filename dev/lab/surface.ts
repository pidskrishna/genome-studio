import { Damped, loop, motion } from './motion';

// Behaviours shared by every glass surface in the lab: the light that follows the cursor inside the
// glass, the magnetic reticle cursor, corner-bracket keyboard focus, and linked pulses (every place
// that shows one value lights together). Dev only.

// Cursor light ----------------------------------------------------------------------------------------

/** Every `.glass` element under the pointer gets --lx and --ly (pixels) and the class `lit`. */
export function installCursorLight(): void {
  let lit: HTMLElement[] = [];
  document.addEventListener('pointermove', (e) => {
    const now: HTMLElement[] = [];
    let el = e.target instanceof Element ? e.target.closest<HTMLElement>('.glass') : null;
    while (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--lx', `${e.clientX - r.left}px`);
      el.style.setProperty('--ly', `${e.clientY - r.top}px`);
      now.push(el);
      el = el.parentElement?.closest<HTMLElement>('.glass') ?? null;
    }
    for (const old of lit) if (!now.includes(old)) old.classList.remove('lit');
    for (const n of now) n.classList.add('lit');
    lit = now;
  });
  document.addEventListener('pointerleave', () => {
    for (const old of lit) old.classList.remove('lit');
    lit = [];
  });
}

// Reticle ---------------------------------------------------------------------------------------------

const MAGNETIC = 'button, [role="slider"], [role="switch"], [data-magnet], a[href], select';
const TEXTUAL = 'input[type="text"], input[type="number"], textarea, [contenteditable="true"]';

export interface ReticleTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * A small ring that replaces the pointer. Over a control it grows to frame the control and leans a
 * little towards the pointer (the magnet); free, it is a 12px ring on the pointer. A canvas can claim
 * it with `reticle.claim(target)` (for example to frame a base on the helix).
 */
export class Reticle {
  readonly el = document.createElement('div');
  enabled = true;
  private readonly x = new Damped(0, 30);
  private readonly y = new Damped(0, 30);
  private readonly w = new Damped(12, 260);
  private readonly h = new Damped(12, 260);
  private readonly r = new Damped(6, 260);
  private readonly fade = new Damped(0, 120);
  private px = -100;
  private py = -100;
  private over: Element | null = null;
  private claimed: ReticleTarget | null = null;
  private pressed = false;
  private stopLoop: (() => void) | null = null;

  constructor() {
    this.el.className = 'reticle';
    this.el.setAttribute('aria-hidden', 'true');
    document.body.append(this.el);
    document.addEventListener('pointermove', (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
      const t = e.target instanceof Element ? e.target : null;
      this.over = t?.closest(MAGNETIC) ?? null;
      const textual = t?.closest(TEXTUAL);
      this.fade.target = this.enabled && !textual ? 1 : 0;
      this.wake();
    });
    document.addEventListener('pointerdown', () => ((this.pressed = true), this.wake()));
    document.addEventListener('pointerup', () => ((this.pressed = false), this.wake()));
    document.documentElement.addEventListener('pointerleave', () => ((this.fade.target = 0), this.wake()));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    document.documentElement.classList.toggle('reticle-on', on);
    this.fade.target = on ? 1 : 0;
    this.wake();
  }

  /** Lets a canvas frame something it draws. Pass null to release. */
  claim(target: ReticleTarget | null): void {
    this.claimed = target;
    this.wake();
  }

  private wake(): void {
    if (this.stopLoop) return;
    this.stopLoop = loop((dt) => {
      this.update(dt);
      const busy = [this.x, this.y, this.w, this.h, this.r, this.fade].some((s) => !s.settled);
      if (!busy) this.stopLoop = null;
      return busy;
    });
  }

  private update(dt: number): void {
    const target = this.claimed ?? this.frameOf(this.over);
    const press = this.pressed ? 0.92 : 1;
    if (target) {
      // A gentle pull: the frame settles over the control without snapping, and leans only slightly
      // towards the pointer, so it never feels grabbed.
      const cx = target.x + target.width / 2;
      const cy = target.y + target.height / 2;
      this.x.target = cx + (this.px - cx) * 0.04;
      this.y.target = cy + (this.py - cy) * 0.04;
      this.w.target = target.width * (this.pressed ? 0.97 : 1);
      this.h.target = target.height * (this.pressed ? 0.97 : 1);
      this.r.target = target.radius;
      for (const s of [this.x, this.y]) s.setSettle(240);
    } else {
      this.x.target = this.px;
      this.y.target = this.py;
      this.w.target = 12 * press;
      this.h.target = 12 * press;
      this.r.target = 6;
      // Free, it follows the pointer almost directly, so it never feels laggy.
      for (const s of [this.x, this.y]) s.setSettle(motion.reduced ? 1 : 24);
    }
    if (motion.reduced) for (const s of [this.w, this.h, this.r]) s.snap(s.target);
    for (const s of [this.x, this.y, this.w, this.h, this.r, this.fade]) s.step(dt);
    const st = this.el.style;
    st.width = `${this.w.value}px`;
    st.height = `${this.h.value}px`;
    st.borderRadius = `${this.r.value}px`;
    st.transform = `translate(${this.x.value - this.w.value / 2}px, ${this.y.value - this.h.value / 2}px)`;
    st.opacity = String(this.fade.value);
    this.el.classList.toggle('framing', target !== null);
  }

  private frameOf(el: Element | null): ReticleTarget | null {
    if (!el || (el as HTMLButtonElement).disabled) return null;
    const r = el.getBoundingClientRect();
    if (r.width > 260 || r.height > 120) return null;
    const pad = 2;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return { x: r.left - pad, y: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2, radius: radius + pad };
  }
}

// Focus brackets --------------------------------------------------------------------------------------

/**
 * One set of corner brackets for the whole page. It glides from one focused control to the next, so
 * keyboard focus reads as a single instrument reticle moving, not rings blinking on and off.
 */
export function installFocusBrackets(): void {
  const el = document.createElement('div');
  el.className = 'focus-brackets';
  el.setAttribute('aria-hidden', 'true');
  for (const c of ['tl', 'tr', 'bl', 'br']) {
    const corner = document.createElement('i');
    corner.className = c;
    el.append(corner);
  }
  document.body.append(el);
  const x = new Damped(0, 160), y = new Damped(0, 160), w = new Damped(0, 160), h = new Damped(0, 160);
  const fade = new Damped(0, 120);
  let target: Element | null = null;
  let stop: (() => void) | null = null;
  let fresh = true;

  const run = (): void => {
    if (stop) return;
    stop = loop((dt) => {
      if (target && target.isConnected) {
        const r = target.getBoundingClientRect();
        const pad = 4;
        x.target = r.left - pad;
        y.target = r.top - pad;
        w.target = r.width + pad * 2;
        h.target = r.height + pad * 2;
        if (fresh || motion.reduced) for (const [s, v] of [[x, x.target], [y, y.target], [w, w.target], [h, h.target]] as const) s.snap(v);
        fresh = false;
      }
      for (const s of [x, y, w, h, fade]) s.step(dt);
      el.style.transform = `translate(${x.value}px, ${y.value}px)`;
      el.style.width = `${w.value}px`;
      el.style.height = `${h.value}px`;
      el.style.opacity = String(fade.value);
      // Keep running while something is focused, so it follows scrolling and moving controls.
      const alive = target !== null || !fade.settled;
      if (!alive) stop = null;
      return alive;
    });
  };

  document.addEventListener('focusin', (e) => {
    const t = e.target as Element;
    if (!t.matches(':focus-visible')) return;
    if (fade.value < 0.05) fresh = true;
    target = t;
    fade.target = 1;
    run();
  });
  document.addEventListener('focusout', () => {
    target = null;
    fade.target = 0;
    run();
  });
  document.addEventListener('pointerdown', () => {
    target = null;
    fade.target = 0;
    run();
  });
}

// Linked pulse ----------------------------------------------------------------------------------------

/**
 * Lights every element whose `data-link` names this key, together, so the slider, the number, the
 * bases and the code bar read as one value. While held (during a drag) the light stays on.
 */
export function pulse(key: string, scope: ParentNode = document): void {
  for (const el of scope.querySelectorAll(`[data-link~="${key}"]`)) {
    el.classList.remove('pulse');
    void (el as HTMLElement).offsetWidth;
    el.classList.add('pulse');
  }
}

export function hold(key: string, on: boolean, scope: ParentNode = document): void {
  for (const el of scope.querySelectorAll(`[data-link~="${key}"]`)) el.classList.toggle('held', on);
}
