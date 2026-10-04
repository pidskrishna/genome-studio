import { Damped, dur, FADE_MS, loop, motion, tween } from './motion';

// Behaviours shared by every glass surface (DESIGN.md sections 3 and 7): the light that follows the
// pointer inside the glass, the reticle cursor, corner-bracket keyboard focus, the button press, the
// sliding indicator of segmented controls, and the exposure change when the look switches.

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
  document.documentElement.addEventListener('pointerleave', () => {
    for (const old of lit) old.classList.remove('lit');
    lit = [];
  });
}

// Reticle ---------------------------------------------------------------------------------------------

const MAGNETIC = 'button, [role="slider"], [role="switch"], [data-magnet], a[href], select, input[type="range"]';
const TEXTUAL = 'input[type="text"], input[type="number"], textarea, [contenteditable="true"]';

export interface ReticleTarget {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * A small ring in place of the pointer, on fine pointers only. Over a control it settles calmly
 * round the control, leaning only slightly towards the pointer; free, it follows the pointer almost
 * directly. A canvas can claim it to frame something it draws.
 */
export class Reticle {
  readonly el = document.createElement('div');
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
  private stop: (() => void) | null = null;
  private readonly enabled = window.matchMedia('(pointer: fine)').matches;

  constructor() {
    this.el.className = 'reticle';
    this.el.setAttribute('aria-hidden', 'true');
    if (!this.enabled) return;
    document.body.append(this.el);
    document.documentElement.classList.add('reticle-on');
    document.addEventListener('pointermove', (e) => {
      this.px = e.clientX;
      this.py = e.clientY;
      const t = e.target instanceof Element ? e.target : null;
      this.over = t?.closest(MAGNETIC) ?? null;
      this.fade.target = t?.closest(TEXTUAL) ? 0 : 1;
      this.wake();
    });
    document.addEventListener('pointerdown', () => ((this.pressed = true), this.wake()));
    document.addEventListener('pointerup', () => ((this.pressed = false), this.wake()));
    document.documentElement.addEventListener('pointerleave', () => ((this.fade.target = 0), this.wake()));
  }

  /** Lets a canvas frame something it draws; null releases it. */
  claim(target: ReticleTarget | null): void {
    this.claimed = target;
    this.wake();
  }

  private wake(): void {
    if (this.stop || !this.enabled) return;
    this.stop = loop((dt) => {
      this.update(dt);
      const busy = [this.x, this.y, this.w, this.h, this.r, this.fade].some((s) => !s.settled);
      if (!busy) this.stop = null;
      return busy;
    });
  }

  private update(dt: number): void {
    const target = this.claimed ?? this.frameOf(this.over);
    if (target) {
      // A gentle pull: the frame settles over the control and leans only 4% towards the pointer.
      const cx = target.x + target.width / 2;
      const cy = target.y + target.height / 2;
      this.x.target = cx + (this.px - cx) * 0.04;
      this.y.target = cy + (this.py - cy) * 0.04;
      this.w.target = target.width * (this.pressed ? 0.97 : 1);
      this.h.target = target.height * (this.pressed ? 0.97 : 1);
      this.r.target = target.radius;
      for (const s of [this.x, this.y]) s.setSettle(240);
    } else {
      const press = this.pressed ? 0.92 : 1;
      this.x.target = this.px;
      this.y.target = this.py;
      this.w.target = 12 * press;
      this.h.target = 12 * press;
      this.r.target = 6;
      for (const s of [this.x, this.y]) s.setSettle(24);
    }
    if (motion.reduced) for (const s of [this.x, this.y, this.w, this.h, this.r]) s.snap(s.target);
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

/** One set of fine corner brackets that glides from one keyboard-focused control to the next. */
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
  const box = [new Damped(0, 160), new Damped(0, 160), new Damped(0, 160), new Damped(0, 160)] as const;
  const fade = new Damped(0, 120);
  let target: Element | null = null;
  let fresh = true;
  let stop: (() => void) | null = null;

  const run = (): void => {
    if (stop) return;
    stop = loop((dt) => {
      if (target?.isConnected) {
        const r = target.getBoundingClientRect();
        const pad = 4;
        const goal = [r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2];
        box.forEach((s, i) => {
          s.target = goal[i]!;
          if (fresh || motion.reduced) s.snap(s.target);
        });
        fresh = false;
      }
      for (const s of [...box, fade]) s.step(dt);
      const [x, y, w, h] = box;
      el.style.transform = `translate(${x.value}px, ${y.value}px)`;
      el.style.width = `${w.value}px`;
      el.style.height = `${h.value}px`;
      el.style.opacity = String(fade.value);
      // Keeps running while something is focused, so it follows scrolling and moving controls.
      const alive = target !== null || !fade.settled;
      if (!alive) stop = null;
      return alive;
    });
  };
  const release = (): void => {
    target = null;
    fade.target = 0;
    run();
  };
  document.addEventListener('focusin', (e) => {
    const t = e.target as Element;
    if (!t.matches(':focus-visible')) return;
    if (fade.value < 0.05) fresh = true;
    target = t;
    fade.target = 1;
    run();
  });
  document.addEventListener('focusout', release);
  document.addEventListener('pointerdown', release);
}

// Button press ----------------------------------------------------------------------------------------

/**
 * The press for every button (DESIGN.md: sink). The look is CSS (.down); this adds the keyboard,
 * so Space and Enter press exactly as the pointer does.
 */
export function installButtonPress(): void {
  let down: HTMLElement | null = null;
  const release = (): void => {
    down?.classList.remove('down');
    down = null;
  };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
    if (!b || b.disabled) return;
    release();
    down = b;
    b.classList.add('down');
  });
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);
  document.addEventListener('keydown', (e) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    const b = e.target instanceof HTMLButtonElement ? e.target : null;
    if (!b || b.disabled) return;
    release();
    down = b;
    b.classList.add('down');
  });
  document.addEventListener('keyup', release);
  document.addEventListener('focusout', release);
}

// Segmented controls ----------------------------------------------------------------------------------

/**
 * Adds one glass lozenge to a group of buttons that slides, critically damped, to whichever button
 * is pressed (aria-pressed). The buttons and their state are unchanged.
 */
export function glassSegments(group: HTMLElement): void {
  group.classList.add('seg');
  const ind = document.createElement('span');
  ind.className = 'seg-ind glass';
  ind.setAttribute('aria-hidden', 'true');
  group.prepend(ind);
  const x = new Damped(0, dur('medium'));
  const w = new Damped(0, dur('medium'));
  let placed = false;
  let stop: (() => void) | null = null;
  const place = (animate: boolean): void => {
    const on = group.querySelector<HTMLElement>('button[aria-pressed="true"]');
    ind.hidden = on === null;
    if (!on) return;
    x.target = on.offsetLeft;
    w.target = on.offsetWidth;
    if (!animate || !placed || motion.reduced) {
      x.snap(x.target);
      w.snap(w.target);
      if (placed && animate && motion.reduced) ind.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: FADE_MS });
    }
    placed = true;
    if (stop) return;
    stop = loop((dt) => {
      x.step(dt);
      w.step(dt);
      ind.style.transform = `translateX(${x.value}px)`;
      ind.style.width = `${w.value}px`;
      const busy = !x.settled || !w.settled;
      if (!busy) stop = null;
      return busy;
    });
  };
  new MutationObserver(() => place(true)).observe(group, { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] });
  new ResizeObserver(() => place(false)).observe(group);
  place(false);
}

// Look switch -----------------------------------------------------------------------------------------

/**
 * The exposure change (DESIGN.md: uniform exposure): the window lifts towards white (or dips towards
 * black when going into fluorescence) over 160ms, `swap` restyles everything at the peak, and the
 * exposure settles over 240ms. With reduced motion it is a short crossfade through the background.
 */
export async function exposure(layer: HTMLElement, intoDark: boolean, swap: () => void): Promise<void> {
  if (motion.reduced) {
    layer.style.background = 'var(--bg)';
    await tween(80, (p) => (layer.style.opacity = String(0.85 * p)));
    swap();
    await tween(80, (p) => (layer.style.opacity = String(0.85 * (1 - p))));
    return;
  }
  layer.style.background = intoDark ? '#000' : '#fff';
  await tween(160, (p) => (layer.style.opacity = String(0.3 * p)));
  swap();
  await tween(240, (p) => (layer.style.opacity = String(0.3 * (1 - p))));
}
