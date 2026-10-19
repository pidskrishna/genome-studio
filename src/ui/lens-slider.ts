import { fineLabel, fineSpeed } from './interaction';
import { Damped, dur, loop, motion } from './motion';
import { hold, pulse } from './surface';

// The gene slider (DESIGN.md section 7: lens, light frost). A 1px track with scale ticks; the thumb is
// a lightly frosted lens that shows the scale beneath it at 3× (6× in fine control), with an accent
// hairline at its centre. Fine control: Shift for a tenth of the speed, or move the pointer away from
// the track (half, a quarter, a tenth). Arrows step one bin, Page Up and Down 64 bins, Home and End
// jump to the ends. It is an ARIA slider over raw gene values, 0 to max.

const PAD = 14;

export interface LensSliderOptions {
  max: number;
  /** Raw values per step of the arrow keys (one bin for whole-number and choice genes). */
  bin: number;
  label: string;
  /** The linked-pulse key shared with the number field, bases and code bar. */
  link: string;
  /** A new value from the pointer or keys; `gestureEnd` is true when a drag or key press finishes. */
  onInput: (raw: number) => void;
  onGestureEnd: () => void;
}

export class LensSlider {
  readonly el = document.createElement('div');
  disabled = false;
  private raw = 0;
  private exact = 0;
  private readonly pos = new Damped(0, 0);
  private readonly lift = new Damped(0, 0);
  private readonly ticks = document.createElement('div');
  private readonly thumb = document.createElement('div');
  private readonly lens = document.createElement('div');
  private readonly mag = document.createElement('div');
  private readonly mode = document.createElement('span');
  private grabbing = false;
  private speed = 1;
  private stop: (() => void) | null = null;

  constructor(private readonly o: LensSliderOptions) {
    const el = this.el;
    el.className = 'lens-slider';
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', o.label);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', String(o.max));
    el.dataset.link = o.link;
    const rail = document.createElement('div');
    rail.className = 'ls-rail';
    this.ticks.className = 'ls-ticks';
    rail.append(this.ticks);
    this.thumb.className = 'ls-thumb';
    this.lens.className = 'ls-lens glass';
    this.mag.className = 'ls-mag';
    const hair = document.createElement('i');
    hair.className = 'ls-hair';
    this.lens.append(this.mag, hair);
    this.mode.className = 'ls-mode';
    this.thumb.append(this.lens, this.mode);
    el.append(rail, this.thumb);
    new ResizeObserver(() => this.layout()).observe(el);
    this.bind();
  }

  private get width(): number {
    return Math.max(1, this.el.clientWidth - PAD * 2);
  }

  /** Shows a value from outside (the editor): the thumb travels there unless it is being dragged. */
  set(raw: number, valueText: string): void {
    this.el.setAttribute('aria-valuenow', String(raw));
    this.el.setAttribute('aria-valuetext', valueText);
    if (this.grabbing) return;
    const first = this.el.getAttribute('data-placed') === null;
    this.el.setAttribute('data-placed', '');
    this.raw = raw;
    this.exact = raw;
    this.pos.setSettle(dur('medium'));
    this.pos.target = raw / this.o.max;
    if (first || motion.reduced) this.pos.snap(this.pos.target);
    this.run();
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    this.el.setAttribute('aria-disabled', String(disabled));
  }

  private emit(raw: number): void {
    if (raw === this.raw) return;
    this.raw = raw;
    this.o.onInput(raw);
  }

  private bind(): void {
    const el = this.el;
    let lastX = 0;
    el.addEventListener('pointerdown', (e) => {
      if (this.disabled || e.button !== 0) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      const r = this.thumb.getBoundingClientRect();
      if (e.clientX < r.left - 22 || e.clientX > r.right + 22) {
        // A press on the track sends the thumb there; dragging carries on from that point.
        const f = Math.min(1, Math.max(0, (e.clientX - el.getBoundingClientRect().left - PAD) / this.width));
        this.exact = Math.round(f * this.o.max);
        this.pos.setSettle(dur('medium'));
        this.pos.target = f;
        if (motion.reduced) this.pos.snap(f);
        this.emit(this.exact);
      }
      this.grabbing = true;
      // Announces the drag, so the organism can be drafted while it lasts (milestone 11).
      el.dispatchEvent(new CustomEvent('slidergesture', { bubbles: true, detail: { active: true } }));
      hold(this.o.link, true);
      el.classList.add('grabbing');
      lastX = e.clientX;
      this.lift.setSettle(dur('small') * 1.4);
      this.lift.target = motion.reduced ? 0 : 1;
      this.run();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.grabbing) return;
      const rail = el.getBoundingClientRect();
      const speed = fineSpeed(e.clientY - (rail.top + rail.height / 2), e.shiftKey);
      if (speed !== this.speed) {
        this.speed = speed;
        this.mode.textContent = fineLabel(speed);
        el.classList.toggle('fine', speed < 1);
      }
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.exact = Math.min(this.o.max, Math.max(0, this.exact + (dx / this.width) * this.o.max * speed));
      this.pos.snap(this.exact / this.o.max);
      this.emit(Math.round(this.exact));
      this.run();
    });
    const end = (): void => {
      if (!this.grabbing) return;
      this.grabbing = false;
      this.speed = 1;
      this.mode.textContent = '';
      el.classList.remove('grabbing', 'fine');
      hold(this.o.link, false);
      pulse(this.o.link);
      this.lift.setSettle(dur('medium'));
      this.lift.target = 0;
      this.o.onGestureEnd();
      el.dispatchEvent(new CustomEvent('slidergesture', { bubbles: true, detail: { active: false } }));
      this.run();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (this.disabled) return;
      const bin = this.o.bin;
      const step: Record<string, number> = { ArrowRight: bin, ArrowUp: bin, ArrowLeft: -bin, ArrowDown: -bin, PageUp: 64 * bin, PageDown: -64 * bin };
      let raw = this.raw;
      if (e.key in step) raw = Math.round(Math.min(this.o.max, Math.max(0, raw + step[e.key]!)));
      else if (e.key === 'Home') raw = 0;
      else if (e.key === 'End') raw = this.o.max;
      else return;
      e.preventDefault();
      this.emit(raw);
      this.o.onGestureEnd();
    });
  }

  private run(): void {
    if (this.stop) return;
    this.stop = loop((dt) => {
      this.pos.step(dt);
      this.lift.step(dt);
      this.layout();
      const busy = !this.pos.settled || !this.lift.settled;
      if (!busy) this.stop = null;
      return busy;
    });
  }

  private layout(): void {
    const W = this.width;
    const f = this.pos.value;
    // Fine control magnifies 6×, otherwise 3×; the fine scale shows 0.2% ticks.
    const mag = this.speed < 1 ? 6 : 3;
    this.ticks.style.backgroundSize = `${W / 10}px 7px, ${W / 50}px 3px`;
    this.thumb.style.transform = `translateX(${PAD + f * W}px)`;
    const lw = this.lens.offsetWidth;
    const mw = W * mag;
    this.mag.style.width = `${mw + lw}px`;
    this.mag.style.backgroundSize = `${mw / 10}px 9px, ${mw / 50}px 5px, ${mw / 500}px 3px`;
    this.mag.style.backgroundPosition = `${lw / 2}px 100%, ${lw / 2}px 100%, ${lw / 2}px 100%`;
    this.mag.style.transform = `translateX(${-f * mw}px)`;
    this.mag.classList.toggle('show-fine', mag >= 6);
    this.lens.style.transform = `translate(-50%, -50%) scale(${1 + 0.1 * this.lift.value})`;
  }
}
