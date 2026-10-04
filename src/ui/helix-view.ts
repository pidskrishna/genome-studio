import { NoToneMapping, SRGBColorSpace, WebGLRenderer } from 'three';
import { BASES, CHECKSUM_START, complementStrand, decodeGenome, geneAt, type SpeciesId } from '../genome';
import type { Editor } from './editor';
import { geneSummary } from './gene-map';
import { GROUP_NAMES, SPECIES_NAMES } from './gene-info';
import { HelixControls, type HelixPick } from './helix-controls';
import { BACKBONE_RADIUS, bandMiddle, nearestSpin, RISE, type Band } from './helix-geometry';
import { BAND_COLOURS, BASE_COLOURS, HelixScene, type ScreenPoint } from './helix-scene';
import { Inspector } from './inspector';
import { el } from './shell';

// The helix editor (spec section 5): the 3D double helix with labelled gene bands, hover, click to
// focus (the helix turns to face the gene and the inspector opens beside it), base editing, drag to
// rotate and scroll to travel. It has its own renderer and canvas, separate from the stage, and draws
// on demand. Everything it changes goes through the editor; it redraws from the editor's events.

/** Duration of the turn to a focused gene, in milliseconds. */
const TURN_MS = 650;
/** Spin per pixel of horizontal drag, in radians. */
const DRAG_SPIN = 0.012;
/** Pointer travel (pixels) below which a press counts as a click, not a drag. */
const CLICK_SLOP = 4;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export interface ClientPoint {
  /** Viewport (client) pixels, for clicking. */
  x: number;
  y: number;
  visible: boolean;
}

export class HelixView {
  readonly element: HTMLElement;
  readonly controls: HelixControls;
  private readonly view: HelixScene;
  private readonly renderer: WebGLRenderer;
  private readonly area: HTMLElement;
  private readonly labels: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly host: HTMLElement;
  private readonly leader: HTMLElement;
  private readonly status: HTMLElement;
  private labelNodes: { band: Band; node: HTMLElement }[] = [];
  private inspector: Inspector | null = null;
  private species: SpeciesId | null = null;
  private lastFocus: number | null = null;
  private frameRequested = false;
  private animation: { from: { travel: number; spin: number }; to: { travel: number; spin: number }; start: number } | null = null;
  private press: { x: number; y: number; spin: number; dragging: boolean; id: number } | null = null;
  private placed = false;

  constructor(private readonly editor: Editor) {
    this.controls = new HelixControls(editor);
    this.view = new HelixScene(0xffffff);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = this.renderer.domElement;
    canvas.className = 'helix-canvas';

    this.labels = el('div', { className: 'helix-labels' });
    this.leader = el('div', { className: 'helix-leader', hidden: true });
    this.host = el('div', { className: 'helix-inspector', hidden: true });
    this.tooltip = el('div', { className: 'helix-tooltip', hidden: true });
    this.tooltip.setAttribute('role', 'tooltip');
    this.area = el('div', { className: 'helix-area', tabIndex: 0 }, canvas, this.labels, this.leader, this.host, this.tooltip);
    this.area.setAttribute('aria-label', 'Double helix. Drag to rotate, scroll to travel, click a band or a base.');
    this.status = el('p', { className: 'helix-status' });
    this.status.setAttribute('aria-live', 'polite');
    this.element = el('section', { className: 'helix-view' }, this.legend(), this.area, this.status);
    this.element.setAttribute('aria-label', 'Helix');

    this.listen(canvas);
    new ResizeObserver(() => this.resize()).observe(this.area);
    editor.subscribe(() => this.refresh());
    this.refresh();
  }

  // Dev and check handles ---------------------------------------------------------------------------

  /** Where to click a base (1-based position), in viewport pixels, and whether it is in sight there. */
  basePoint(position: number): ClientPoint {
    this.step();
    return this.toClient(this.view.basePoint(position - 1));
  }

  /** Where to click a gene's band, in viewport pixels, and whether it is in sight there. */
  genePoint(locus: number): ClientPoint {
    const band = this.view.bands.find((b) => b.locus === locus);
    if (!band) throw new RangeError(`No gene at locus ${locus}`);
    this.step();
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
    this.step();
    const r = this.area.getBoundingClientRect();
    return this.view.pick(clientX - r.left, clientY - r.top);
  }

  get state(): { travel: number; spin: number; selected: number | null; focus: number | null; animating: boolean } {
    this.step();
    return { travel: this.view.travel, spin: this.view.spin, selected: this.controls.selected, focus: this.editor.focus, animating: this.animation !== null };
  }

  // Editor events ----------------------------------------------------------------------------------

  private refresh(): void {
    const { editor } = this;
    const newSpecies = editor.species !== this.species;
    if (newSpecies) {
      this.species = editor.species;
      this.controls.clearSelection();
      this.view.setCode(editor.code, editor.species);
      this.buildLabels();
    } else {
      this.view.setCode(editor.code, editor.species);
    }
    const focus = editor.focus;
    if (focus !== this.lastFocus || newSpecies) {
      // A species switch keeps the focused locus but changes its gene: rebuild without turning.
      const quiet = this.controls.isQuietFocus(focus) || focus === this.lastFocus;
      this.lastFocus = focus;
      this.inspector?.root.remove();
      this.inspector = null;
      if (focus !== null) {
        this.inspector = new Inspector(editor, geneAt(editor.species, focus), { onClose: () => editor.focusGene(null) });
        this.host.replaceChildren(this.inspector.root);
        if (!quiet) this.turnTo(focus);
      }
      this.view.setFocus(focus);
    }
    this.inspector?.fill(false, decodeGenome(editor.code));
    // A hover note would show the old value; the next pointer move brings it back.
    this.tooltip.hidden = true;
    this.refreshLabels();
    this.redraw();
  }

  private buildLabels(): void {
    this.labelNodes = this.view.bands.map((band) => {
      let node: HTMLElement;
      if (band.locus === null) {
        node = el('span', { className: 'helix-label fixed', textContent: band.kind === 'header' ? GROUP_NAMES.header : GROUP_NAMES.checksum });
      } else {
        const locus = band.locus;
        const def = geneAt(this.editor.species, locus);
        node = el('button', { type: 'button', className: 'helix-label' }, el('span', { className: 'locus', textContent: String(locus) }), ` ${def.name}`);
        node.dataset.locus = String(locus);
        node.addEventListener('click', () => {
          this.controls.click({ kind: 'gene', locus });
          this.redraw();
        });
      }
      node.dataset.group = band.kind;
      return { band, node };
    });
    this.labels.replaceChildren(...this.labelNodes.map((l) => l.node));
  }

  private refreshLabels(): void {
    const code = this.editor.code;
    for (const { band, node } of this.labelNodes) {
      node.title = this.describeBand(band, code);
      if (band.locus !== null) {
        node.classList.toggle('focused', band.locus === this.editor.focus);
        node.classList.toggle('locked', this.editor.isLocked(band.locus));
      }
    }
  }

  private describeBand(band: Band, code: string): string {
    if (band.kind === 'header') return `${GROUP_NAMES.header}: ${code.slice(0, 6)}, ${SPECIES_NAMES[this.editor.species]}, encoding version 1. Not editable.`;
    if (band.kind === 'checksum') return `${GROUP_NAMES.checksum}: ${code.slice(CHECKSUM_START)}. Recomputed on every edit; not editable.`;
    return `${band.locus}. ${geneSummary(code, this.editor.species, band.locus!)}`;
  }

  // Motion ------------------------------------------------------------------------------------------

  /** Turns the helix (animated) so that a gene faces the viewer in the middle of the view. */
  private turnTo(locus: number): void {
    const band = this.view.bands.find((b) => b.locus === locus);
    if (!band) return;
    const target = this.view.viewFor(bandMiddle(band));
    const to = { travel: target.travel, spin: nearestSpin(this.view.spin, target.spin) };
    if (!this.placed) {
      this.jumpTo(to);
      return;
    }
    this.animation = { from: { travel: this.view.travel, spin: this.view.spin }, to, start: performance.now() };
    this.redraw();
  }

  private jumpTo(target: { travel: number; spin: number }): void {
    this.animation = null;
    this.view.setView(target.travel, nearestSpin(this.view.spin, target.spin));
    this.redraw();
    this.renderNow();
  }

  private stopAnimation(): void {
    this.animation = null;
  }

  // Input -------------------------------------------------------------------------------------------

  private listen(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.step();
      this.area.focus({ preventScroll: true });
      this.press = { x: e.clientX, y: e.clientY, spin: this.view.spin, dragging: false, id: e.pointerId };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      const press = this.press;
      if (press && press.id === e.pointerId) {
        const dx = e.clientX - press.x;
        if (!press.dragging && Math.hypot(dx, e.clientY - press.y) > CLICK_SLOP) {
          press.dragging = true;
          this.stopAnimation();
          this.hideTooltip();
          canvas.style.cursor = 'grabbing';
        }
        if (press.dragging) {
          this.view.setView(this.view.travel, press.spin + dx * DRAG_SPIN);
          this.redraw();
        }
        return;
      }
      this.hover(e.clientX, e.clientY);
    });
    const release = (e: PointerEvent, cancelled: boolean): void => {
      const press = this.press;
      if (!press || press.id !== e.pointerId) return;
      this.press = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      canvas.style.cursor = '';
      if (!press.dragging && !cancelled) {
        this.controls.click(this.pickAt(e.clientX, e.clientY));
        this.redraw();
      }
      this.hover(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', (e) => release(e, false));
    canvas.addEventListener('pointercancel', (e) => release(e, true));
    canvas.addEventListener('pointerleave', () => {
      if (!this.press) this.hideTooltip();
    });

    this.area.addEventListener('wheel', (e) => {
      if (this.host.contains(e.target as Node)) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.view.height : 1;
      this.stopAnimation();
      const bases = (e.deltaY * lines) / (this.view.pixelsPerUnit * RISE);
      this.view.setView(this.view.travel + bases, this.view.spin);
      this.hideTooltip();
      this.redraw();
    }, { passive: false });

    this.area.addEventListener('keydown', (e) => {
      if (e.target !== this.area) return;
      if (this.controls.key(e.key, e.metaKey || e.ctrlKey || e.altKey)) {
        e.preventDefault();
        this.keepSelectedInView();
        this.redraw();
      }
    });
  }

  private hover(clientX: number, clientY: number): void {
    const r = this.area.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const { pick, band } = this.view.probe(x, y);
    this.view.setHover(band);
    const canvas = this.renderer.domElement;
    if (!pick || !band) {
      canvas.style.cursor = '';
      this.hideTooltip();
      this.redraw();
      return;
    }
    const code = this.editor.code;
    let text = this.describeBand(band, code);
    if (pick.kind === 'base') {
      const base = code.charAt(pick.index);
      const position = pick.index + 1;
      const editable = band.locus !== null;
      text += `\nBase ${position}: ${base}, paired with ${complementStrand(base)}. ${editable ? 'Click to cycle A, C, G, T, or select it and type a letter.' : 'Not editable.'}`;
      canvas.style.cursor = editable ? 'pointer' : 'not-allowed';
    } else {
      canvas.style.cursor = pick.kind === 'gene' ? 'pointer' : 'default';
    }
    this.tooltip.textContent = text;
    this.tooltip.hidden = false;
    const w = this.tooltip.offsetWidth;
    this.tooltip.style.left = `${Math.min(x + 14, Math.max(4, this.view.width - w - 4))}px`;
    this.tooltip.style.top = `${Math.min(y + 16, this.view.height - this.tooltip.offsetHeight - 4)}px`;
    this.redraw();
  }

  private hideTooltip(): void {
    this.tooltip.hidden = true;
    this.view.setHover(null);
  }

  /** Travels just far enough to keep the selected base in view while typing. */
  private keepSelectedInView(): void {
    const selected = this.controls.selected;
    if (selected === null) return;
    const margin = Math.max(2, this.view.halfView - 4);
    const t = selected - 1;
    if (Math.abs(t - this.view.travel) > margin) {
      this.stopAnimation();
      this.view.setView(t - Math.sign(t - this.view.travel) * margin, this.view.spin);
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
      if (this.editor.focus !== null) this.turnTo(this.editor.focus);
      else this.view.setView(Math.max(0, this.view.halfView - 3), 0);
    }
    this.renderNow();
  }

  private redraw(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.renderNow();
    });
  }

  private renderNow(): void {
    if (this.area.clientWidth === 0) return;
    this.step();
    if (this.animation) this.redraw();
    const selected = this.controls.selected;
    this.view.setSelected(selected === null ? null : selected - 1);
    this.renderer.render(this.view.scene, this.view.camera);
    this.placeOverlays();
  }

  /**
   * Moves a running turn on to where it should be by now. Called on every frame, and before any
   * reading of positions, so that a page whose frames are paused (a hidden tab) still settles.
   */
  private step(): void {
    const a = this.animation;
    if (!a) return;
    const u = Math.min(1, (performance.now() - a.start) / TURN_MS);
    const k = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    this.view.setView(a.from.travel + (a.to.travel - a.from.travel) * k, a.from.spin + (a.to.spin - a.from.spin) * k);
    if (u >= 1) this.animation = null;
  }

  /** Labels beside their bands, and the inspector beside the focused gene. */
  private placeOverlays(): void {
    const v = this.view;
    const labelX = v.axisX + (BACKBONE_RADIUS + 3) * v.pixelsPerUnit;
    this.labels.style.left = `${labelX}px`;
    for (const { band, node } of this.labelNodes) {
      const y = v.axisY(bandMiddle(band));
      const inside = y > -10 && y < v.height + 10;
      node.hidden = !inside;
      if (inside) node.style.transform = `translateY(${y.toFixed(1)}px) translateY(-50%)`;
    }

    const focus = this.editor.focus;
    const band = focus === null ? undefined : v.bands.find((b) => b.locus === focus);
    if (!band || !this.inspector) {
      this.host.hidden = true;
      this.leader.hidden = true;
    } else {
      this.host.hidden = false;
      const gap = 10;
      const left = Math.max(labelX - 6, Math.min(labelX + 20, v.width - 300));
      this.host.style.left = `${left}px`;
      const y = v.axisY(bandMiddle(band));
      const h = this.host.offsetHeight;
      const top = Math.max(gap, Math.min(v.height - h - gap, y - 28));
      this.host.style.top = `${top}px`;
      // A short line from the gene's band to the inspector, while the gene is in view.
      const inView = y > 0 && y < v.height;
      this.leader.hidden = !inView;
      if (inView) {
        const x0 = v.axisX + BACKBONE_RADIUS * v.pixelsPerUnit;
        this.leader.style.left = `${x0}px`;
        this.leader.style.width = `${Math.max(0, left - x0)}px`;
        this.leader.style.top = `${y}px`;
        this.leader.style.background = hex(BAND_COLOURS[band.kind]);
      }
    }

    const selected = this.controls.selected;
    if (selected !== null) {
      const base = this.editor.code.charAt(selected - 1);
      this.status.textContent = `Base ${selected} selected (${base}). Type A, C, G or T to set it; arrow keys move along the code; Escape clears.`;
    } else {
      this.status.textContent = 'Drag to rotate, scroll to travel. Click a gene’s band to inspect it, or a base to cycle it through A, C, G, T.';
    }
  }

  private legend(): HTMLElement {
    const chip = (colour: number, text: string, cls: string): HTMLElement => {
      const swatch = el('span', { className: 'swatch' });
      swatch.style.background = hex(colour);
      return el('span', { className: cls }, swatch, text);
    };
    const bases = el('div', { className: 'legend-row' }, ...BASES.split('').map((b) => chip(BASE_COLOURS[b]!, b, 'legend-base')));
    bases.setAttribute('aria-label', 'Base colours');
    const groups = el('div', { className: 'legend-row' },
      chip(BAND_COLOURS.form, 'Form', 'legend-group'),
      chip(BAND_COLOURS.pigment, 'Pigment', 'legend-group'),
      chip(BAND_COLOURS.seed, 'Seed', 'legend-group'),
      chip(BAND_COLOURS.header, 'Header and checksum', 'legend-group'));
    groups.setAttribute('aria-label', 'Gene groups');
    return el('div', { className: 'helix-legend' }, bases, groups);
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
