import { NoToneMapping, PMREMGenerator, SRGBColorSpace, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CHECKSUM_START, complementStrand, decodeGenome, GENE_COUNT, geneAt, type SpeciesId } from '../genome';
import type { LookId } from '../render/colour';
import type { Editor, EditorChange } from './editor';
import { geneSummary } from './gene-map';
import { GROUP_NAMES } from './gene-info';
import { HelixControls, type HelixPick } from './helix-controls';
import { bandMiddle, detent, facingSpin, nearestSpin, RISE, type Band } from './helix-geometry';
import { labelOpacity } from './helix-ruler';
import { HelixScene, type ScreenPoint } from './helix-scene';
import { Inspector } from './inspector';
import { Damped, dur, loop, motion } from './motion';
import { el } from './shell';
import type { Reticle } from './surface';
import { BACKDROP_HEX } from './theme';

// The helix editor (spec section 5; DESIGN.md sections 6 and 7): the borosilicate double helix with a
// margin ruler of gene bands, hover, click to focus (light leads: the gene lights, then the helix turns
// to face it and the inspector opens below it), base editing with light meeting in the middle, drag to
// rotate with detents, scroll to travel, and a slow idle drift. It has its own renderer and canvas,
// separate from the stage. Everything it changes goes through the editor; it redraws from the
// editor's events, and nothing it draws writes back into the code or the simulation.

/** Spin per pixel of horizontal drag, in radians. */
const DRAG_SPIN = 0.012;
/** Pointer travel (pixels) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 4;
/** Idle drift: one turn every 30 seconds. */
const DRIFT = (2 * Math.PI) / 30;
/** The drift pauses this long after any press, drag or scroll. */
const DRIFT_PAUSE_MS = 2500;
/** Base pairs travelled per unit of wheel movement. */
const WHEEL_BASES = 0.035;
/** A released drag glides on for this long at its release speed before settling. */
const GLIDE_S = 0.14;
/** The focused gene settles here (fraction of the height), so the inspector fits below it. */
const FOCUS_ROW = 0.24;
/** Light leads: the gene lights over this long before the helix turns. */
const LIGHT_LEAD_MS = 150;

export interface ClientPoint {
  /** Viewport (client) pixels, for clicking. */
  x: number;
  y: number;
  visible: boolean;
}

interface RulerSegment {
  band: Band;
  node: HTMLElement;
  label: HTMLElement;
  name: string;
}

export interface FrameReport {
  frames: number;
  /** Share of frame intervals at or under 16.7 ms. */
  within: number;
  p95: number;
  worst: number;
  width: number;
  height: number;
}

export class HelixView {
  readonly element: HTMLElement;
  readonly controls: HelixControls;
  private readonly view: HelixScene;
  private readonly renderer: WebGLRenderer;
  private readonly area: HTMLElement;
  private readonly ruler: HTMLElement;
  private readonly groups: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly host: HTMLElement;
  private readonly leader: HTMLElement;
  private readonly status: HTMLElement;
  private segments: RulerSegment[] = [];
  private groupLabels: { node: HTMLElement; start: number; end: number }[] = [];
  private inspector: Inspector | null = null;
  private species: SpeciesId | null = null;
  private lastFocus: number | null = null;
  private lastCode = '';
  private lastLocked = new Set<number>();
  private readonly spin = new Damped(0, dur('large'));
  private readonly travel = new Damped(0, dur('large'));
  private press: { x: number; y: number; spin: number; dragging: boolean; id: number; lastX: number; lastT: number; v: number } | null = null;
  private placed = false;
  private touchedAt = -Infinity;
  private lastStep = 0;
  private stopLoop: (() => void) | null = null;
  private onScreen = true;
  private pointerY: number | null = null;
  private hoverBand: Band | null = null;
  private focusTimers: number[] = [];
  private reticle: Reticle | null = null;

  constructor(private readonly editor: Editor) {
    this.controls = new HelixControls(editor);
    this.view = new HelixScene(BACKDROP_HEX.glossy);

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const pmrem = new PMREMGenerator(this.renderer);
    this.view.setEnvironment(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();
    const canvas = this.renderer.domElement;
    canvas.className = 'helix-canvas';

    this.ruler = el('div', { className: 'ruler' });
    this.ruler.setAttribute('aria-label', 'Genes along the helix');
    this.groups = el('div', { className: 'ruler-groups' });
    this.groups.setAttribute('aria-hidden', 'true');
    this.leader = el('div', { className: 'helix-leader', hidden: true });
    this.host = el('div', { className: 'helix-inspector', hidden: true });
    this.tooltip = el('div', { className: 'helix-tooltip', hidden: true });
    this.tooltip.setAttribute('role', 'tooltip');
    this.area = el('div', { className: 'helix-area', tabIndex: 0 }, canvas, this.groups, this.ruler, this.leader, this.host, this.tooltip);
    this.area.setAttribute('aria-label', 'Double helix. Drag to rotate, scroll to travel, click a gene or a base.');
    this.status = el('p', { className: 'helix-status' });
    this.status.setAttribute('aria-live', 'polite');
    this.element = el('section', { className: 'helix-view' }, this.area, this.status);
    this.element.setAttribute('aria-label', 'Helix');

    this.listen(canvas);
    new ResizeObserver(() => this.resize()).observe(this.area);
    new IntersectionObserver((entries) => {
      this.onScreen = entries.some((e) => e.isIntersecting);
      this.wake();
    }).observe(this.area);
    document.addEventListener('visibilitychange', () => this.wake());
    editor.subscribe((change) => this.refresh(change));
    this.refresh(null);
  }

  /** The reticle frames the base under the pointer. */
  setReticle(reticle: Reticle): void {
    this.reticle = reticle;
  }

  /** Follows the look: the backdrop the glass refracts, the dim colour and the outline. */
  setLook(look: LookId): void {
    this.view.setLook(look);
    this.wake();
  }

  // Dev and check handles ---------------------------------------------------------------------------

  /** Where to click a base (1-based position), in viewport pixels, and whether it is in sight there. */
  basePoint(position: number): ClientPoint {
    this.advance();
    return this.toClient(this.view.basePoint(position - 1));
  }

  /** Where to click a gene's band, in viewport pixels, and whether it is in sight there. */
  genePoint(locus: number): ClientPoint {
    const band = this.view.bands.find((b) => b.locus === locus);
    if (!band) throw new RangeError(`No gene at locus ${locus}`);
    this.advance();
    return this.toClient(this.view.bandPoint(band));
  }

  /** Turns a base pair (1-based position) to face the viewer at once, and returns where to click it. */
  showBase(position: number): ClientPoint {
    this.jumpTo(this.view.viewFor(position - 1));
    return this.basePoint(position);
  }

  /** Turns a gene to face the viewer at once, and returns where to click its band. */
  showGene(locus: number): ClientPoint {
    const band = this.view.bands.find((b) => b.locus === locus);
    if (!band) throw new RangeError(`No gene at locus ${locus}`);
    this.jumpTo(this.view.viewFor(bandMiddle(band)));
    return this.genePoint(locus);
  }

  /** What is under a viewport point. */
  pickAt(clientX: number, clientY: number): HelixPick {
    this.advance();
    const r = this.area.getBoundingClientRect();
    return this.view.pick(clientX - r.left, clientY - r.top);
  }

  get state(): { travel: number; spin: number; selected: number | null; focus: number | null; animating: boolean; drifting: boolean } {
    this.advance();
    return {
      travel: this.view.travel,
      spin: this.view.spin,
      selected: this.controls.selected,
      focus: this.editor.focus,
      animating: !this.spin.settled || !this.travel.settled,
      drifting: this.drifting(performance.now()),
    };
  }

  /**
   * Frame-time check (milestone 10b): records frame intervals for `ms` while the helix drifts, turns to
   * two genes and is dragged and released, then reports the share of frames within 16.7 ms.
   */
  async measureFrames(ms = 10_000): Promise<FrameReport> {
    const intervals: number[] = [];
    let last = performance.now();
    let running = true;
    const record = (now: number): void => {
      intervals.push(now - last);
      last = now;
      if (running) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
    const at = (t: number, f: () => void): Promise<void> => new Promise((r) => setTimeout(() => (f(), r()), (t * ms) / 10_000));
    this.editor.focusGene(null);
    this.touchedAt = -Infinity;
    this.wake();
    // 0 to 2 s drift; 2 s and 4 s turn to two genes; 5.5 s release; 6 to 8.5 s drag; then a detent.
    const script = [
      at(2000, () => this.editor.focusGene(5)),
      at(4000, () => this.editor.focusGene(17)),
      at(5500, () => this.editor.focusGene(null)),
      at(6000, () => {
        const start = performance.now();
        const drag = (): void => {
          const t = performance.now() - start;
          this.touchedAt = performance.now();
          this.spin.snap(this.spin.value + 0.035);
          this.wake();
          if (t < (2500 * ms) / 10_000) requestAnimationFrame(drag);
          else this.release(2.4);
        };
        requestAnimationFrame(drag);
      }),
    ];
    await Promise.all(script);
    await new Promise((r) => setTimeout(r, Math.max(0, ms - (6000 * ms) / 10_000)));
    running = false;
    const sorted = intervals.slice(1).sort((a, b) => a - b);
    const within = sorted.filter((d) => d <= 16.7).length / Math.max(1, sorted.length);
    return {
      frames: sorted.length,
      within: Math.round(within * 1000) / 1000,
      p95: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
      worst: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }

  /**
   * Cost of drawing one helix frame, in milliseconds, with the GPU made to finish each frame (a 1-pixel
   * read). A proxy for the frame-time check where animation frames are throttled (a hidden window).
   */
  renderCost(frames = 120): { mean: number; p95: number; worst: number; width: number; height: number } {
    const gl = this.renderer.getContext();
    const px = new Uint8Array(4);
    const times: number[] = [];
    for (let i = 0; i < frames; i++) {
      const t = performance.now();
      this.spin.snap(this.spin.value + 0.02);
      this.renderNow();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t);
    }
    const sorted = times.slice(5).sort((a, b) => a - b);
    const round = (n: number): number => Math.round(n * 100) / 100;
    return {
      mean: round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
      p95: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
      worst: round(sorted[sorted.length - 1] ?? 0),
      width: this.area.clientWidth,
      height: this.area.clientHeight,
    };
  }

  // Editor events ----------------------------------------------------------------------------------

  private refresh(change: EditorChange | null): void {
    const { editor } = this;
    const newSpecies = editor.species !== this.species;
    const previous = this.lastCode;
    this.lastCode = editor.code;
    if (newSpecies) {
      this.species = editor.species;
      this.controls.clearSelection();
      this.view.setCode(editor.code, editor.species);
      this.buildRuler();
      this.lastLocked = new Set();
    } else {
      this.view.setCode(editor.code, editor.species);
      // A single base edited (on the helix or in the inspector): light meets in the middle of its rung.
      if (change?.type === 'code' && previous.length === editor.code.length) {
        const changed: number[] = [];
        for (let i = 0; i < CHECKSUM_START; i++) if (previous[i] !== editor.code[i]) changed.push(i);
        if (changed.length === 1 && !motion.reduced) {
          const i = changed[0]!;
          this.view.pulseBase(i, previous.charAt(i), dur('medium') + 35, performance.now());
        }
      }
    }
    // Locked genes frost over; unlocking clears them.
    for (let locus = 1; locus <= GENE_COUNT; locus++) {
      const locked = editor.isLocked(locus);
      if (locked !== this.lastLocked.has(locus)) {
        this.view.setLocked(locus, locked, motion.reduced || newSpecies ? 0 : dur('large'));
        if (locked) this.lastLocked.add(locus);
        else this.lastLocked.delete(locus);
      }
    }
    const focus = editor.focus;
    if (focus !== this.lastFocus || newSpecies) {
      // A species switch keeps the focused locus but changes its gene: rebuild without turning.
      const quiet = this.controls.isQuietFocus(focus) || focus === this.lastFocus;
      this.lastFocus = focus;
      this.inspector?.root.remove();
      this.inspector = null;
      for (const t of this.focusTimers) clearTimeout(t);
      this.focusTimers = [];
      this.host.classList.remove('open');
      const band = focus === null ? null : (this.view.bands.find((b) => b.locus === focus) ?? null);
      if (focus !== null && band) {
        this.inspector = new Inspector(editor, geneAt(editor.species, focus), { onClose: () => editor.focusGene(null) });
        this.host.replaceChildren(this.inspector.root);
        if (quiet) {
          this.view.setFocusLight(band, motion.reduced ? 140 : dur('medium'));
          this.host.classList.add('open');
        } else this.focusSequence(band);
      } else {
        this.view.setFocusLight(null, motion.reduced ? 140 : dur('medium'));
      }
    }
    this.inspector?.fill(false, decodeGenome(editor.code));
    // A hover note would show the old value; the next pointer move brings it back.
    this.tooltip.hidden = true;
    this.refreshRuler();
    this.wake();
  }

  /** Light leads: the gene lights where it is, then the helix turns to face it, then the inspector opens. */
  private focusSequence(band: Band): void {
    if (motion.reduced || !this.placed) {
      this.view.setFocusLight(band, motion.reduced ? 140 : 0);
      this.turnTo(band);
      this.host.classList.add('open');
      return;
    }
    this.view.setFocusLight(band, LIGHT_LEAD_MS);
    const later = (ms: number, f: () => void): void => {
      this.focusTimers.push(window.setTimeout(() => (f(), this.wake()), ms));
    };
    later(LIGHT_LEAD_MS, () => this.turnTo(band));
    later(LIGHT_LEAD_MS + dur('large') * 0.8, () => this.host.classList.add('open'));
  }

  // Ruler -------------------------------------------------------------------------------------------

  private buildRuler(): void {
    this.segments = this.view.bands.map((band) => {
      const name = band.locus === null ? (band.kind === 'header' ? GROUP_NAMES.header : GROUP_NAMES.checksum) : geneAt(this.editor.species, band.locus).name;
      const label = el('span', { className: 'ruler-label' });
      let node: HTMLElement;
      if (band.locus === null) {
        node = el('span', { className: 'ruler-seg fixed' }, label);
      } else {
        const locus = band.locus;
        node = el('button', { type: 'button', className: 'ruler-seg' }, label);
        node.dataset.locus = String(locus);
        node.setAttribute('aria-label', name);
        node.addEventListener('click', () => {
          this.controls.click({ kind: 'gene', locus });
          this.wake();
        });
        node.addEventListener('pointerenter', () => ((this.hoverBand = band), this.wake()));
        node.addEventListener('pointerleave', () => ((this.hoverBand = null), this.wake()));
      }
      node.dataset.group = band.kind;
      return { band, node, label, name };
    });
    this.ruler.replaceChildren(...this.segments.map((s) => s.node));
    this.groupLabels = (['header', 'form', 'pigment', 'seed', 'checksum'] as const).map((kind) => {
      const inGroup = this.view.bands.filter((b) => b.kind === kind);
      const last = inGroup[inGroup.length - 1]!;
      return { node: el('span', { className: `ruler-group g-${kind}`, textContent: GROUP_NAMES[kind] }), start: inGroup[0]!.start, end: last.start + last.length };
    });
    this.groups.replaceChildren(...this.groupLabels.map((g) => g.node));
  }

  private refreshRuler(): void {
    const code = this.editor.code;
    for (const { band, node } of this.segments) {
      node.title = this.describeBand(band, code);
      if (band.locus !== null) {
        node.classList.toggle('focused', band.locus === this.editor.focus);
        node.classList.toggle('locked', this.editor.isLocked(band.locus));
      }
    }
  }

  private describeBand(band: Band, code: string): string {
    if (band.kind === 'header') return `${GROUP_NAMES.header}: ${code.slice(0, 6)}. Not editable.`;
    if (band.kind === 'checksum') return `${GROUP_NAMES.checksum}: ${code.slice(CHECKSUM_START)}. Recomputed on every edit; not editable.`;
    return geneSummary(code, this.editor.species, band.locus!);
  }

  // Motion ------------------------------------------------------------------------------------------

  /** Turns the helix so a gene faces the viewer, settled in the upper part of the view. */
  private turnTo(band: Band): void {
    const mid = bandMiddle(band);
    const offset = ((0.5 - FOCUS_ROW) * this.view.height) / (this.view.pixelsPerUnit * RISE);
    const to = { travel: mid + offset, spin: facingSpin(mid) };
    if (!this.placed || motion.reduced) {
      this.jumpTo(to);
      return;
    }
    this.spin.setSettle(dur('large'));
    this.travel.setSettle(dur('large'));
    this.spin.target = nearestSpin(this.spin.value, to.spin);
    this.travel.target = this.clampTravel(to.travel);
    this.wake();
  }

  private jumpTo(target: { travel: number; spin: number }): void {
    this.spin.snap(nearestSpin(this.spin.value, target.spin));
    this.travel.snap(this.clampTravel(target.travel));
    this.view.setView(this.travel.value, this.spin.value);
    this.renderNow();
  }

  private clampTravel(t: number): number {
    return Math.max(0, Math.min(159, t));
  }

  private drifting(now: number): boolean {
    return this.editor.focus === null && this.press === null && now - this.touchedAt > DRIFT_PAUSE_MS && !motion.reduced && this.spin.settled;
  }

  /**
   * Moves everything on to where it should be by now: drift, springs, light, pulses and frost. Called
   * every frame, and before any reading of positions, so a page whose frames are paused still settles.
   * Returns true while anything is moving.
   */
  private advance(): boolean {
    const now = performance.now();
    let dt = this.lastStep === 0 ? 1 / 60 : (now - this.lastStep) / 1000;
    this.lastStep = now;
    let busy = false;
    this.view.breathe = !motion.reduced;
    while (dt > 0) {
      const h = Math.min(dt, 0.05);
      dt -= h;
      if (this.drifting(now)) {
        this.spin.snap(this.spin.value + DRIFT * h);
        busy = true;
      }
      this.spin.step(h);
      this.travel.step(h);
      if (this.view.step(h, now)) busy = true;
    }
    if (!this.spin.settled || !this.travel.settled) busy = true;
    this.view.setView(this.travel.value, this.spin.value);
    return busy;
  }

  /** Keeps drawing while anything moves (the drift keeps it going while the helix is on screen). */
  private wake(): void {
    if (this.stopLoop) return;
    this.stopLoop = loop(() => {
      if (!this.isShown()) {
        this.stopLoop = null;
        return false;
      }
      const busy = this.renderNow();
      if (!busy) this.stopLoop = null;
      return busy;
    });
  }

  private isShown(): boolean {
    return this.onScreen && !document.hidden && this.area.clientWidth > 0;
  }

  /** Releases a drag: glides on at the release speed, then settles so a base pair faces the viewer. */
  private release(velocity: number): void {
    this.touchedAt = performance.now();
    this.spin.setSettle(dur('large'));
    this.spin.target = detent(this.spin.value + velocity * GLIDE_S);
    this.spin.velocity = motion.reduced ? 0 : velocity;
    if (motion.reduced) this.spin.snap(this.spin.target);
    // A soft visual click as it settles: the base pair now facing the viewer brightens briefly.
    const centre = Math.round(this.travel.target);
    let facing = centre;
    let best = Infinity;
    for (let i = Math.max(0, centre - 6); i <= Math.min(159, centre + 6); i++) {
      const err = Math.abs(nearestSpin(this.spin.target, facingSpin(i)) - this.spin.target);
      if (err < best) {
        best = err;
        facing = i;
      }
    }
    this.focusTimers.push(window.setTimeout(() => (this.view.flashBase(facing, 0.3), this.wake()), motion.reduced ? 0 : dur('large') * 0.7));
    this.wake();
  }

  // Input -------------------------------------------------------------------------------------------

  private listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.advance();
      this.area.focus({ preventScroll: true });
      this.touchedAt = performance.now();
      this.spin.snap(this.spin.value);
      this.press = { x: e.clientX, y: e.clientY, spin: this.spin.value, dragging: false, id: e.pointerId, lastX: e.clientX, lastT: performance.now(), v: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const press = this.press;
      if (press && press.id === e.pointerId) {
        const dx = e.clientX - press.x;
        if (!press.dragging && Math.hypot(dx, e.clientY - press.y) > CLICK_SLOP) {
          press.dragging = true;
          this.hideTooltip();
          this.reticle?.claim(null);
        }
        if (press.dragging) {
          const now = performance.now();
          const dt = Math.max(1, now - press.lastT) / 1000;
          press.v = press.v * 0.6 + (((e.clientX - press.lastX) * DRAG_SPIN) / dt) * 0.4;
          press.lastX = e.clientX;
          press.lastT = now;
          this.touchedAt = now;
          this.spin.snap(press.spin + dx * DRAG_SPIN);
          this.wake();
        }
        return;
      }
      this.hover(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, cancelled: boolean): void => {
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      this.press = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (press.dragging) this.release(press.v);
      else if (!cancelled) {
        this.controls.click(this.pickAt(e.clientX, e.clientY));
        this.wake();
      }
      this.hover(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', (e) => end(e, false));
    canvas.addEventListener('pointercancel', (e) => end(e, true));
    canvas.addEventListener('pointerleave', () => {
      if (!this.press) this.hideTooltip();
    });
    this.area.addEventListener('pointermove', (e) => {
      this.pointerY = e.clientY - this.area.getBoundingClientRect().top;
      this.wake();
    });
    this.area.addEventListener('pointerleave', () => {
      this.pointerY = null;
      this.wake();
    });

    this.area.addEventListener('wheel', (e) => {
      if (this.host.contains(e.target as Node)) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.view.height : 1;
      this.touchedAt = performance.now();
      this.travel.setSettle(dur('medium'));
      this.travel.target = this.clampTravel(this.travel.target + e.deltaY * lines * WHEEL_BASES);
      if (motion.reduced) this.travel.snap(this.travel.target);
      this.hideTooltip();
      this.wake();
    }, { passive: false });

    this.area.addEventListener('keydown', (e) => {
      if (e.target !== this.area) return;
      if (this.controls.key(e.key, e.metaKey || e.ctrlKey || e.altKey)) {
        e.preventDefault();
        this.keepSelectedInView();
        this.wake();
      }
    });
  }

  private hover(clientX: number, clientY: number): void {
    const r = this.area.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const { pick, band } = this.view.probe(x, y);
    this.hoverBand = band;
    if (!pick || !band || pick.kind !== 'base') {
      this.hideTooltip(false);
      this.wake();
      return;
    }
    // A base: the reticle frames it, and a short note names it and its partner.
    const code = this.editor.code;
    const base = code.charAt(pick.index);
    const position = pick.index + 1;
    const editable = band.locus !== null;
    this.tooltip.textContent = `Base ${position}: ${base}, paired with ${complementStrand(base)}.${editable ? '' : ' Not editable.'}`;
    this.tooltip.hidden = false;
    const w = this.tooltip.offsetWidth;
    this.tooltip.style.left = `${Math.min(x + 16, Math.max(4, this.view.width - w - 4))}px`;
    this.tooltip.style.top = `${Math.min(y + 18, this.view.height - this.tooltip.offsetHeight - 4)}px`;
    const p = this.view.basePoint(pick.index);
    this.reticle?.claim({ x: r.left + p.x - 11, y: r.top + p.y - 11, width: 22, height: 22, radius: 11 });
    this.wake();
  }

  private hideTooltip(clearBand = true): void {
    this.tooltip.hidden = true;
    if (clearBand) this.hoverBand = null;
    this.reticle?.claim(null);
  }

  /** Travels just far enough to keep the selected base in view while typing. */
  private keepSelectedInView(): void {
    const selected = this.controls.selected;
    if (selected === null) return;
    const margin = Math.max(2, this.view.halfView - 4);
    const t = selected - 1;
    if (Math.abs(t - this.travel.target) > margin) {
      this.travel.setSettle(dur('medium'));
      this.travel.target = this.clampTravel(t - Math.sign(t - this.travel.target) * margin);
      if (motion.reduced) this.travel.snap(this.travel.target);
    }
  }

  // Drawing -----------------------------------------------------------------------------------------

  private resize(): void {
    const w = this.area.clientWidth;
    const h = this.area.clientHeight;
    if (w === 0 || h === 0) return;
    this.view.setSize(w, h);
    this.renderer.setSize(w, h, false);
    if (!this.placed) {
      this.placed = true;
      // Open at the top of the helix, unless a gene is already focused.
      const band = this.editor.focus === null ? undefined : this.view.bands.find((b) => b.locus === this.editor.focus);
      if (band) this.turnTo(band);
      else this.jumpTo({ travel: Math.max(0, this.view.halfView - 3), spin: 0 });
    }
    this.renderNow();
    this.wake();
  }

  /** Draws a frame now. Returns true while anything is still moving. */
  private renderNow(): boolean {
    if (this.area.clientWidth === 0) return false;
    const busy = this.advance();
    const selected = this.controls.selected;
    this.view.setSelected(selected === null ? null : selected - 1);
    this.renderer.render(this.view.scene, this.view.camera);
    this.placeOverlays();
    return busy;
  }

  /** The ruler beside the helix, and the inspector just below the focused gene. */
  private placeOverlays(): void {
    const v = this.view;
    const focus = this.editor.focus;
    for (const { band, node, label, name } of this.segments) {
      const top = v.axisY(band.start - 0.5);
      const bottom = v.axisY(band.start + band.length - 0.5);
      const inside = bottom > -40 && top < v.height + 40;
      node.hidden = !inside;
      if (!inside) continue;
      node.style.transform = `translateY(${(top + 1).toFixed(1)}px)`;
      node.style.height = `${Math.max(1, bottom - top - 2).toFixed(1)}px`;
      const hovered = band === this.hoverBand;
      const named = hovered || (band.locus !== null && band.locus === focus);
      // The hovered gene shows its name and current value; others show their name on approach.
      const text = hovered ? this.describeBand(band, this.editor.code).replace(/\. Not editable\.$|\. Recomputed.*$/, '') : name;
      if (label.textContent !== text) label.textContent = text;
      label.style.opacity = String(labelOpacity(this.pointerY, (top + bottom) / 2, named));
    }
    for (const g of this.groupLabels) {
      const top = v.axisY(g.start - 0.5);
      const bottom = v.axisY(g.end - 0.5);
      g.node.hidden = bottom < 0 || top > v.height;
      g.node.style.transform = `translateY(${Math.min(Math.max(top, 8), bottom - 18).toFixed(1)}px)`;
    }

    const band = focus === null ? undefined : v.bands.find((b) => b.locus === focus);
    if (!band || !this.inspector) {
      this.host.hidden = true;
      this.leader.hidden = true;
    } else {
      this.host.hidden = false;
      const gap = 8;
      const w = this.host.offsetWidth;
      const h = this.host.offsetHeight;
      const bottom = v.axisY(band.start + band.length - 0.5);
      const left = Math.max(gap, Math.min(v.width - w - gap, v.axisX - w * 0.4));
      const top = Math.max(gap, Math.min(v.height - h - gap, bottom + 14));
      this.host.style.left = `${left.toFixed(1)}px`;
      this.host.style.top = `${top.toFixed(1)}px`;
      // A hairline from the gene down to the inspector, while there is room for it.
      const room = top - bottom;
      this.leader.hidden = !(room > 4 && bottom > 0);
      if (!this.leader.hidden) {
        this.leader.style.left = `${v.axisX.toFixed(1)}px`;
        this.leader.style.top = `${(bottom + 2).toFixed(1)}px`;
        this.leader.style.height = `${(room - 2).toFixed(1)}px`;
        this.leader.classList.toggle('open', this.host.classList.contains('open'));
      }
    }

    const selected = this.controls.selected;
    if (selected !== null) {
      const base = this.editor.code.charAt(selected - 1);
      this.status.textContent = `Base ${selected} selected (${base}). Type A, C, G or T to set it; arrow keys move along the code; Escape clears.`;
    } else if (this.status.textContent !== '') {
      this.status.textContent = '';
    }
  }

  private toClient(p: ScreenPoint & { visible: boolean }): ClientPoint {
    const r = this.area.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, visible: p.visible };
  }

  /** Redraws now (after the column is shown again). */
  show(): void {
    this.resize();
  }
}
