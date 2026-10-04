import {
  basesToValue,
  decodeValue,
  encodeValue,
  geneAt,
  GENE_MAX,
  nextBase,
  specimenName,
  valueToBases,
  writeGene,
  type GeneDef,
} from '../../src/genome';
import { Damped, dur, easeOut, loop, motion, tween, wait } from './motion';
import { hold, pulse } from './surface';
import { codeBar, FACES, formatModel, geneReadout, helixBackdrop, lab, section, type Face, type Numerals } from './lab';

// Lab sections for the flat controls: slider, button press, lock, copy, typeface and numerals.

let linkCount = 0;
const nextLink = (): string => `v${++linkCount}`;

// Slider ----------------------------------------------------------------------------------------------

export type ThumbKind = 'lens' | 'loupe' | 'vernier';

interface SliderOpts {
  kind: ThumbKind;
  def: GeneDef;
  raw: number;
  link: string;
  onInput: (raw: number) => void;
}

const PAD = 14;

/**
 * A hairline track with scale ticks and a glass thumb that magnifies the scale beneath it. Fine
 * control: hold Shift for a tenth of the speed, or move the pointer away from the track (half,
 * quarter, then a tenth). Arrow keys step one bin; Page Up and Down step 64.
 */
export class GlassSlider {
  readonly el = document.createElement('div');
  disabled = false;
  private raw: number;
  private exact: number;
  private readonly pos = new Damped(0, 0);
  private readonly lift = new Damped(0, 0);
  private readonly ticks = document.createElement('div');
  private readonly thumb = document.createElement('div');
  private readonly win = document.createElement('div');
  private readonly mag = document.createElement('div');
  private readonly read = document.createElement('span');
  private readonly mode = document.createElement('span');
  private grabbing = false;
  private fine = 1;
  private stop: (() => void) | null = null;

  constructor(private readonly o: SliderOpts) {
    this.raw = o.raw;
    this.exact = o.raw;
    const el = this.el;
    el.className = `gs gs-${o.kind}`;
    el.tabIndex = 0;
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-label', o.def.name);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', String(GENE_MAX));
    el.dataset.link = o.link;
    const rail = document.createElement('div');
    rail.className = 'gs-rail';
    this.ticks.className = 'gs-ticks';
    rail.append(this.ticks);
    this.thumb.className = 'gs-thumb';
    this.win.className = 'gs-window glass';
    this.mag.className = 'gs-mag';
    const hair = document.createElement('i');
    hair.className = 'gs-hair';
    this.win.append(this.mag, hair);
    this.read.className = 'gs-read num';
    this.read.dataset.link = o.link;
    this.mode.className = 'gs-mode';
    if (o.kind === 'loupe') {
      const needle = document.createElement('i');
      needle.className = 'gs-needle';
      this.thumb.append(needle);
    }
    this.thumb.append(this.win, this.read, this.mode);
    el.append(rail, this.thumb);
    new ResizeObserver(() => this.layout(true)).observe(el);
    this.bind();
    this.setRaw(o.raw, false);
  }

  private get width(): number {
    return Math.max(1, this.el.clientWidth - PAD * 2);
  }

  private get magnification(): number {
    const base = this.o.kind === 'lens' ? 3 : this.o.kind === 'loupe' ? 4 : 2;
    const fineMag = this.o.kind === 'lens' ? 6 : this.o.kind === 'loupe' ? 10 : 6;
    return this.fine < 1 ? fineMag : base;
  }

  /** Sets the value from outside (a base edit or the number field): the thumb travels there. */
  setRaw(raw: number, animate = true): void {
    this.raw = raw;
    this.exact = raw;
    this.el.setAttribute('aria-valuenow', String(raw));
    const def = this.o.def;
    const text = `${formatModel(def, decodeValue(def, raw))}${def.unit === '°' ? '°' : ''}`;
    this.el.setAttribute('aria-valuetext', `${text} ${def.unit === '°' ? '' : def.unit}`.trim());
    this.read.textContent = text;
    this.pos.setSettle(dur('medium'));
    this.pos.target = raw / GENE_MAX;
    if (!animate || motion.reduced) this.pos.snap(this.pos.target);
    this.run();
  }

  private bind(): void {
    const el = this.el;
    let lastX = 0;
    el.addEventListener('pointerdown', (e) => {
      if (this.disabled) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      const r = this.thumb.getBoundingClientRect();
      const onThumb = e.clientX >= r.left - 6 && e.clientX <= r.right + 6;
      if (!onThumb) {
        // A click on the track sends the thumb there, then dragging continues from that point.
        const f = Math.min(1, Math.max(0, (e.clientX - el.getBoundingClientRect().left - PAD) / this.width));
        const raw = Math.round(f * GENE_MAX);
        this.raw = raw;
        this.exact = raw;
        this.pos.setSettle(dur('medium'));
        this.pos.target = f;
        if (motion.reduced) this.pos.snap(f);
        this.o.onInput(raw);
        this.readOnly(raw);
      }
      this.grabbing = true;
      hold(this.o.link, true);
      el.classList.add('grabbing');
      lastX = e.clientX;
      this.lift.setSettle(dur('small') * 1.4);
      this.lift.target = 1;
      this.run();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.grabbing) return;
      const rail = el.getBoundingClientRect();
      const away = Math.abs(e.clientY - (rail.top + rail.height / 2));
      const fine = e.shiftKey ? 0.1 : away < 40 ? 1 : away < 90 ? 0.5 : away < 150 ? 0.25 : 0.1;
      if (fine !== this.fine) {
        this.fine = fine;
        this.mode.textContent = fine === 1 ? '' : fine === 0.5 ? 'Half speed' : fine === 0.25 ? 'Quarter speed' : 'Fine';
        el.classList.toggle('fine', fine < 1);
        this.layout(false);
      }
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.exact = Math.min(GENE_MAX, Math.max(0, this.exact + (dx / this.width) * GENE_MAX * fine));
      this.pos.snap(this.exact / GENE_MAX);
      const raw = Math.round(this.exact);
      if (raw !== this.raw) {
        this.raw = raw;
        this.o.onInput(raw);
        this.readOnly(raw);
      }
      this.run();
    });
    const end = (): void => {
      if (!this.grabbing) return;
      this.grabbing = false;
      this.fine = 1;
      this.mode.textContent = '';
      el.classList.remove('grabbing', 'fine');
      hold(this.o.link, false);
      pulse(this.o.link);
      this.lift.setSettle(dur('medium'));
      this.lift.target = 0;
      this.layout(false);
      this.run();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      if (this.disabled) return;
      const bin = this.o.def.kind === 'int' || this.o.def.kind === 'choice' ? (GENE_MAX + 1) / (this.o.def.max - this.o.def.min + 1) : 1;
      const step: Record<string, number> = { ArrowRight: bin, ArrowUp: bin, ArrowLeft: -bin, ArrowDown: -bin, PageUp: 64 * bin, PageDown: -64 * bin };
      let raw = this.raw;
      if (e.key in step) raw = Math.round(Math.min(GENE_MAX, Math.max(0, raw + step[e.key]!)));
      else if (e.key === 'Home') raw = 0;
      else if (e.key === 'End') raw = GENE_MAX;
      else return;
      e.preventDefault();
      this.raw = raw;
      this.setRaw(raw);
      this.o.onInput(raw);
      pulse(this.o.link);
    });
  }

  private readOnly(raw: number): void {
    const def = this.o.def;
    this.read.textContent = `${formatModel(def, decodeValue(def, raw))}${def.unit === '°' ? '°' : ''}`;
    this.el.setAttribute('aria-valuenow', String(raw));
  }

  private run(): void {
    if (this.stop) return;
    this.stop = loop((dt) => {
      this.pos.step(dt);
      this.lift.step(dt);
      this.layout(false);
      const busy = !this.pos.settled || !this.lift.settled;
      if (!busy) this.stop = null;
      return busy;
    });
  }

  private layout(full: boolean): void {
    const W = this.width;
    const f = this.pos.value;
    const mag = this.magnification;
    if (full) {
      this.ticks.style.backgroundSize = `${W / 10}px 7px, ${W / 50}px 3px`;
    }
    const x = PAD + f * W;
    const lift = this.lift.value;
    this.thumb.style.transform = `translateX(${x}px)`;
    const ww = this.win.offsetWidth;
    const mw = W * mag;
    this.mag.style.width = `${mw + ww}px`;
    this.mag.style.backgroundSize = `${mw / 10}px 9px, ${mw / 50}px 5px, ${mw / 500}px 3px`;
    this.mag.style.backgroundPosition = `${ww / 2}px 100%, ${ww / 2}px 100%, ${ww / 2}px 100%`;
    this.mag.style.transform = `translateX(${-f * mw}px)`;
    this.mag.classList.toggle('show-fine', mag >= 6);
    if (this.o.kind === 'lens') {
      this.win.style.transform = `translate(-50%, -50%) scale(${1 + 0.1 * lift})`;
    } else if (this.o.kind === 'loupe') {
      this.win.style.transform = `translate(-50%, ${-50 - 70 * lift}%) scale(${0.35 + 0.65 * lift})`;
      this.win.style.opacity = String(motion.reduced ? (lift > 0.5 ? 1 : 0) : Math.min(1, lift * 1.6));
      this.read.style.opacity = String(lift > 0.5 ? 1 : 0);
    } else {
      this.win.style.transform = `translate(-50%, -50%)`;
      this.win.style.width = `${76 + 36 * (this.fine < 1 ? 1 : 0)}px`;
    }
  }
}

/** Six base letters that cycle on click, linked to the value. */
function baseLetters(bases: string, link: string, onCycle: (index: number) => void): { el: HTMLElement; set: (b: string, changed?: number[]) => void } {
  const el = document.createElement('div');
  el.className = 'bases';
  const buttons: HTMLButtonElement[] = [];
  for (let i = 0; i < bases.length; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'base';
    b.dataset.link = link;
    b.addEventListener('click', () => onCycle(i));
    el.append(b);
    buttons.push(b);
  }
  const set = (next: string, changed?: number[]): void => {
    buttons.forEach((b, i) => {
      const letter = next.charAt(i);
      if (b.textContent !== letter && changed?.includes(i) && !motion.reduced) rollLetter(b, letter);
      else b.textContent = letter;
      b.dataset.base = letter;
      b.setAttribute('aria-label', `Base ${i + 1}: ${letter}`);
    });
  };
  set(bases);
  return { el, set };
}

/** The old letter rolls up and out while the new one rolls in. */
export function rollLetter(el: HTMLElement, letter: string): void {
  el.textContent = letter;
  el.animate(
    [
      { transform: 'translateY(55%)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: dur('medium'), easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
}

/** An inspector-like panel: name, number field, slider, bases, parameter. */
function geneEditor(kind: ThumbKind, locus: number, opts: { buttons?: string[] } = {}): { el: HTMLElement; lockable: HTMLElement; slider: GlassSlider; buttons: HTMLButtonElement[] } {
  const link = nextLink();
  let code = lab.code;
  const r = geneReadout(code, lab.species, locus);
  const def = r.def;
  const el = document.createElement('div');
  el.className = 'inspector glass layer-3';
  const head = document.createElement('div');
  head.className = 'insp-head';
  head.innerHTML = `<span class="insp-name"></span><label class="insp-value"><input class="num" type="text" inputmode="decimal" spellcheck="false"><span class="insp-unit"></span></label>`;
  (head.querySelector('.insp-name') as HTMLElement).textContent = def.name;
  const input = head.querySelector('input') as HTMLInputElement;
  input.dataset.link = link;
  input.setAttribute('aria-label', `${def.name} value`);
  (head.querySelector('.insp-unit') as HTMLElement).textContent = def.unit === '°' ? '°' : def.unit;
  const lockable = document.createElement('div');
  lockable.className = 'lockable';
  const param = document.createElement('p');
  param.className = 'insp-param';
  param.textContent = def.parameter;
  const update = (raw: number, changed?: number[]): void => {
    code = writeGene(code, locus, raw);
    input.value = formatModel(def, decodeValue(def, raw));
    letters.set(valueToBases(raw, 6), changed);
  };
  const slider = new GlassSlider({
    kind,
    def,
    raw: r.raw,
    link,
    onInput: (raw) => {
      const before = valueToBases(readRaw(), 6);
      const after = valueToBases(raw, 6);
      update(raw, diff(before, after));
    },
  });
  const readRaw = (): number => basesToValue(code.slice(6 + (locus - 1) * 6, 6 + locus * 6));
  const letters = baseLetters(r.bases, link, (i) => {
    const bases = valueToBases(readRaw(), 6);
    const next = bases.slice(0, i) + nextBase(bases.charAt(i)) + bases.slice(i + 1);
    const raw = basesToValue(next);
    update(raw, [i]);
    slider.setRaw(raw);
    pulse(link);
  });
  input.value = r.value;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const model = Number(input.value.replace(/,/g, ''));
    if (!Number.isFinite(model)) return;
    const raw = encodeValue(def, model);
    const before = valueToBases(readRaw(), 6);
    update(raw, diff(before, valueToBases(raw, 6)));
    slider.setRaw(raw);
    pulse(link);
  });
  lockable.append(head, slider.el, letters.el, param);
  el.append(lockable);
  const buttons: HTMLButtonElement[] = [];
  if (opts.buttons) {
    const row = document.createElement('div');
    row.className = 'insp-actions';
    for (const text of opts.buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn glass press-sink';
      b.textContent = text;
      row.append(b);
      buttons.push(b);
    }
    el.append(row);
  }
  return { el, lockable, slider, buttons };
}

function diff(a: string, b: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

function helixStage(stage: HTMLElement): void {
  stage.classList.add('over-helix');
  const paint = (): void => {
    stage.style.backgroundImage = helixBackdrop(lab.code, stage.clientWidth || 400, stage.clientHeight || 300, lab.look);
  };
  new ResizeObserver(paint).observe(stage);
  document.addEventListener('lab:look', paint);
}

export function sliderSection(): HTMLElement {
  const make = (kind: ThumbKind) => (stage: HTMLElement): void => {
    helixStage(stage);
    stage.append(geneEditor(kind, 5).el);
  };
  return section({
    id: 'slider',
    title: 'Dragging a slider',
    note: 'Clearance, a real gene. Drag the thumb; hold Shift or move the pointer away from the track for finer control; arrow keys step one bin. The slider, number, bases share one linked light.',
    variants: [
      { key: 'A', name: 'Lens', note: 'A small clear lens rides the track and shows the scale under it at 3×, 6× when fine.', build: make('lens') },
      { key: 'B', name: 'Loupe', note: 'A slim needle at rest; on grab a round loupe rises above it with the exact value.', build: make('loupe') },
      { key: 'C', name: 'Vernier window', note: 'A wide glass window reads the scale at 2×; fine control widens it and adds sub-ticks.', build: make('vernier') },
    ],
  });
}

export function lensFrostSection(): HTMLElement {
  const make = (level: 1 | 2 | 3) => (stage: HTMLElement): void => {
    helixStage(stage);
    const ed = geneEditor('lens', 5);
    ed.el.classList.add(`lens-frost-${level}`);
    stage.append(ed.el);
  };
  return section({
    id: 'lens',
    title: 'Lens frost',
    note: 'Your lens (slider A) at three levels of frost. Drag each and compare in every look; hold Shift to see the 6× scale. The frost is the lens’s own surface: milkiness and a fine grain, as on acid-etched glass.',
    variants: [
      { key: 'A', name: 'Light frost', note: 'The current lens: a thin milky film; the scale beneath shows faintly.', build: make(1) },
      { key: 'B', name: 'Satin', note: 'A denser milky body with a soft lit top edge; the scale beneath disappears, only the magnified scale shows.', build: make(2) },
      { key: 'C', name: 'Etched', note: 'Fully matte like the panels, with a fine grain you can see up close.', build: make(3) },
    ],
  });
}

// Button press ----------------------------------------------------------------------------------------

/** Wires press behaviour: pointer and keyboard both add .down; 'light' adds a light at the press point. */
export type PressKind = 'sink' | 'light' | 'depth' | 'clear' | 'contact' | 'seat';

export function pressable(b: HTMLButtonElement, kind: PressKind): void {
  b.classList.add(`press-${kind}`);
  const down = (x: number, y: number): void => {
    if (b.disabled) return;
    b.classList.add('down');
    if (kind === 'light' && !motion.reduced) {
      const r = b.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'press-glow';
      dot.style.left = `${x - r.left}px`;
      dot.style.top = `${y - r.top}px`;
      b.append(dot);
      dot.addEventListener('animationend', () => dot.remove());
    }
    if (kind === 'contact') {
      const r = b.getBoundingClientRect();
      const patch = document.createElement('span');
      patch.className = 'contact';
      patch.style.left = `${x - r.left}px`;
      patch.style.top = `${y - r.top}px`;
      // Scale so the patch can reach the far corner of the button.
      const far = Math.hypot(Math.max(x - r.left, r.right - x), Math.max(y - r.top, r.bottom - y));
      patch.style.setProperty('--reach', String((far * 2.1) / 16));
      b.append(patch);
      requestAnimationFrame(() => patch.classList.add('on'));
    }
  };
  const up = (): void => {
    b.classList.remove('down');
    for (const patch of b.querySelectorAll('.contact')) {
      patch.classList.remove('on');
      setTimeout(() => patch.remove(), dur('medium') + 60);
    }
  };
  b.addEventListener('pointerdown', (e) => down(e.clientX, e.clientY));
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', up);
  b.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      const r = b.getBoundingClientRect();
      down(r.left + r.width / 2, r.top + r.height / 2);
    }
  });
  b.addEventListener('keyup', up);
  b.addEventListener('blur', up);
}

export function buttonSection(): HTMLElement {
  const make = (kind: PressKind) => (stage: HTMLElement): void => {
    helixStage(stage);
    const panel = document.createElement('div');
    panel.className = 'tools glass layer-2';
    for (const text of ['Randomise all', 'Wild type', 'Undo', 'Redo']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn glass';
      b.textContent = text;
      if (text === 'Redo') b.disabled = true;
      pressable(b, kind);
      panel.append(b);
    }
    stage.append(panel);
  };
  return section({
    id: 'press',
    title: 'Pressing a button',
    note: 'Press and hold to feel the pressed state; release to see it return. Space and Enter press too. Redo is disabled. D to F are new; C was your pick last round.',
    variants: [
      { key: 'A', name: 'Sink', note: 'The button sinks to 97% and its rim dims, then returns without overshoot.', build: make('sink') },
      { key: 'B', name: 'Sink and light', note: 'As A, and the frost brightens where you pressed, then fades.', build: make('light') },
      { key: 'C', name: 'Pressed pane', note: 'No scaling: the rim light flips from top to bottom and the face drops 1px, like a pane pushed into the panel.', build: make('depth') },
      { key: 'D', name: 'Frost clears', note: 'Pressing turns the button’s frost clear, the way frosted film clears where it touches glass. It frosts over again on release.', build: make('clear') },
      { key: 'E', name: 'Contact patch', note: 'A clear patch spreads from exactly where you pressed while you hold, and recedes on release.', build: make('contact') },
      { key: 'F', name: 'Seated pane', note: 'At rest the pane floats a hair above the panel with a fine shadow; pressing seats it flat and the shadow closes.', build: make('seat') },
    ],
  });
}

// Lock ------------------------------------------------------------------------------------------------

export function lockSection(): HTMLElement {
  const make = (kind: 'veil' | 'slide' | 'condense') => (stage: HTMLElement): void => {
    helixStage(stage);
    const ed = geneEditor('lens', 3, { buttons: ['Randomise gene', 'Lock'] });
    const [randomise, lock] = ed.buttons as [HTMLButtonElement, HTMLButtonElement];
    pressable(randomise, 'sink');
    pressable(lock, 'sink');
    lock.setAttribute('aria-pressed', 'false');
    const frost = document.createElement('div');
    frost.className = `frost frost-${kind}`;
    frost.innerHTML = '<span class="frost-edge"></span><span class="frost-note">Locked. Randomise all leaves this gene alone.</span>';
    ed.lockable.append(frost);
    const amount = new Damped(0, dur('large'));
    let stop: (() => void) | null = null;
    const paint = (): void => {
      const a = amount.value;
      frost.style.setProperty('--a', String(a));
      frost.style.visibility = a < 0.001 ? 'hidden' : 'visible';
    };
    lock.addEventListener('click', () => {
      const locked = lock.getAttribute('aria-pressed') !== 'true';
      lock.setAttribute('aria-pressed', String(locked));
      lock.textContent = locked ? 'Locked' : 'Lock';
      randomise.disabled = locked;
      ed.slider.disabled = locked;
      ed.lockable.classList.toggle('is-locked', locked);
      ed.lockable.inert = locked;
      amount.setSettle(kind === 'veil' ? dur('medium') : dur('large'));
      amount.target = locked ? 1 : 0;
      if (motion.reduced) {
        amount.snap(amount.target);
        frost.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160 });
      }
      if (stop) return;
      stop = loop((dt) => {
        amount.step(dt);
        paint();
        if (amount.settled) stop = null;
        return !amount.settled;
      });
    });
    paint();
    stage.append(ed.el);
  };
  return section({
    id: 'lock',
    title: 'Toggling a lock',
    note: 'Press Lock on Space density. The gene’s controls frost over and stop responding; Randomise gene is disabled. Press again to unlock.',
    variants: [
      { key: 'A', name: 'Veil', note: 'A layer of frost fades in over the controls in about 220ms.', build: make('veil') },
      { key: 'B', name: 'Sliding pane', note: 'A frosted pane slides across from the lock, with a fine lit leading edge.', build: make('slide') },
      { key: 'C', name: 'Condensation', note: 'Frost forms from the edges inward; unlocking clears it from the centre out.', build: make('condense') },
    ],
  });
}

// Copy ------------------------------------------------------------------------------------------------

export function copySection(): HTMLElement {
  const make = (kind: 'pass' | 'read' | 'return') => (stage: HTMLElement): void => {
    stage.classList.add('over-stage');
    const bar = document.createElement('div');
    bar.className = 'codebar glass layer-1';
    const cb = codeBar(lab.code, lab.species);
    const scan = document.createElement('i');
    scan.className = 'scan';
    cb.el.append(scan);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn glass copy-btn';
    btn.innerHTML = '<span class="roll"><span>Copy</span><span>Copied</span></span>';
    btn.setAttribute('aria-label', 'Copy code');
    pressable(btn, 'sink');
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    bar.append(cb.el, btn, status);
    stage.append(bar);
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      try {
        await navigator.clipboard.writeText(lab.code);
      } catch {
        // The browser pane may refuse clipboard writes; the confirmation still plays for the lab.
      }
      status.textContent = 'Copied';
      btn.classList.add('copied');
      if (motion.reduced) {
        cb.el.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 200 });
      } else if (kind === 'pass') {
        await sweep(cb.el, scan, cb.letters, 'ltr', 460);
      } else if (kind === 'read') {
        for (const g of cb.groups) {
          for (const l of g.letters) l.classList.add('read');
          await wait(14);
        }
        await wait(160);
        cb.letters.forEach((l) => l.classList.remove('read'));
      } else {
        await sweep(cb.el, scan, cb.letters, 'rtl', 460);
      }
      await wait(1500);
      btn.classList.remove('copied');
      status.textContent = '';
      busy = false;
    });
  };
  return section({
    id: 'copy',
    title: 'Copying the code',
    note: 'The code bar sits over the edge of the stage, so the organism shows through the frost. Press Copy; the code really goes to your clipboard.',
    rows: true,
    stageClass: 'wide',
    variants: [
      { key: 'A', name: 'Scan line', note: 'A fine line of light passes left to right along the 160 letters; Copy reads Copied for 1.5s.', build: make('pass') },
      { key: 'B', name: 'Gene by gene', note: 'Each gene lights in turn, as if read out, then all settle back; the label rolls to Copied.', build: make('read') },
      { key: 'C', name: 'From the button', note: 'The scan line starts at the button and runs back along the code, towards where the copy came from.', build: make('return') },
    ],
  });
}

function sweep(code: HTMLElement, scan: HTMLElement, letters: HTMLElement[], dir: 'ltr' | 'rtl', ms: number): Promise<void> {
  const box = code.getBoundingClientRect();
  const lines = new Map<number, HTMLElement[]>();
  for (const l of letters) {
    const top = Math.round(l.offsetTop);
    lines.set(top, [...(lines.get(top) ?? []), l]);
  }
  scan.style.opacity = '1';
  const lit = new Set<HTMLElement>();
  const t = tween(
    ms,
    (p) => {
      const x = (dir === 'ltr' ? p : 1 - p) * box.width;
      scan.style.transform = `translateX(${x}px)`;
      for (const l of letters) {
        const cx = l.offsetLeft + l.offsetWidth / 2;
        const passed = dir === 'ltr' ? cx <= x : cx >= x;
        if (passed && !lit.has(l)) {
          lit.add(l);
          l.classList.remove('scanned');
          void l.offsetWidth;
          l.classList.add('scanned');
        }
      }
    },
    easeOut,
  );
  return t.done.then(() => {
    scan.style.opacity = '0';
  });
}

// Typeface and numerals -------------------------------------------------------------------------------

function readoutSample(el: HTMLElement): void {
  const name = specimenName(lab.code);
  const locus = 5;
  const r = geneReadout(lab.code, lab.species, locus);
  const def = geneAt(lab.species, locus);
  el.innerHTML = `
    <div class="sample glass layer-3">
      <p class="sample-caption"><em></em></p>
      <div class="insp-head"><span class="insp-name"></span><span class="insp-value"><span class="num big"></span><span class="insp-unit"></span></span></div>
      <p class="insp-param"></p>
      <div class="sample-row"><span class="label">Bases</span><span class="mono-code bases-inline"></span></div>
      <div class="sample-row"><span class="label">Growing</span><span class="num">63%, step 140 of 222</span></div>
      <div class="sample-row"><span class="label">Kill distance</span><span class="num">4.17 D, limited by sensing range</span></div>
      <p class="sample-desc"></p>
      <div class="sample-code mono-code"></div>
    </div>`;
  (el.querySelector('em') as HTMLElement).textContent = name.full;
  (el.querySelector('.insp-name') as HTMLElement).textContent = def.name;
  (el.querySelector('.big') as HTMLElement).textContent = r.value;
  (el.querySelector('.insp-unit') as HTMLElement).textContent = r.unit;
  (el.querySelector('.insp-param') as HTMLElement).textContent = def.parameter;
  (el.querySelector('.bases-inline') as HTMLElement).textContent = r.bases;
  (el.querySelector('.sample-desc') as HTMLElement).textContent = def.description;
  (el.querySelector('.sample-code') as HTMLElement).textContent = lab.code.slice(0, 48).replace(/(.{6})/g, '$1 ');
}

export function typeSection(): HTMLElement {
  const make = (face: Face) => (stage: HTMLElement): void => {
    stage.classList.add('over-helix', 'type-stage');
    stage.dataset.face = face;
    const f = FACES[face];
    stage.style.setProperty('--ui', `${f.ui}, system-ui, sans-serif`);
    stage.style.setProperty('--mono', `${f.mono}, ui-monospace, monospace`);
    // --num on the page resolves against the page's face, so restate it here for this column's face.
    stage.style.setProperty('--num', 'var(--ui)');
    readoutSample(stage);
  };
  return section({
    id: 'type',
    title: 'Typeface',
    note: 'The same inspector content in three technical grotesks, each with its own mono for the code. The toolbar’s typeface setting applies one to the whole lab.',
    variants: [
      { key: 'A', name: 'IBM Plex Sans', note: 'Engineered and slightly mechanical; made for instruments and documentation.', build: make('plex') },
      { key: 'B', name: 'Geist', note: 'Swiss-precise and neutral; very even colour at small sizes.', build: make('geist') },
      { key: 'C', name: 'Chivo', note: 'A grotesk with sturdier forms; its mono is narrow and technical.', build: make('chivo') },
    ],
  });
}

export function numeralsSection(): HTMLElement {
  const make = (n: Numerals) => (stage: HTMLElement): void => {
    stage.classList.add('over-helix', 'type-stage');
    stage.style.setProperty('--num', n === 'mono' ? 'var(--mono)' : 'var(--ui)');
    stage.style.setProperty('--num-variant', n === 'code' ? 'proportional-nums' : 'tabular-nums');
    readoutSample(stage);
    // A live counter shows whether the figures hold still while changing.
    const big = stage.querySelector('.big') as HTMLElement;
    const def = geneAt(lab.species, 5);
    let raw = 1800;
    setInterval(() => {
      if (document.hidden) return;
      raw = (raw + 37) % 4096;
      big.textContent = formatModel(def, decodeValue(def, raw));
    }, 180);
  };
  return section({
    id: 'numerals',
    title: 'Numerals',
    note: 'The value counts continuously so you can see whether the figures jitter. The code is always set in the mono.',
    variants: [
      { key: 'A', name: 'Tabular, same face', note: 'Tabular lining figures in the interface face: numbers hold their width while changing.', build: make('tabular') },
      { key: 'B', name: 'Everything mono', note: 'Every number in the mono, like an instrument readout.', build: make('mono') },
      { key: 'C', name: 'Mono code only', note: 'Proportional figures in the interface face; only the code is mono.', build: make('code') },
    ],
  });
}
