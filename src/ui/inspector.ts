import { binCount, decodeGenome, decodeValue, geneSpan, rawMax, readGene, type DecodedGenome, type GeneDef } from '../genome';
import type { Editor } from './editor';
import { fieldUnit, formatValue, geneNotes, referenceOf } from './gene-info';
import { LensSlider } from './lens-slider';
import { Damped, dur, loop, motion } from './motion';
import { button, el } from './shell';
import { pulse } from './surface';

// The gene inspector (spec section 5): the gene's slider, an exact number field, its bases as
// editable letters, the model parameter with its unit, one sentence on what it does and its
// reference, with randomise and lock. It sits beside the focused gene on the helix and under the
// focused row in the gene map. What it shows is worked out by `inspectorValues`, a plain function, so
// the sync between bases and slider can be tested without a DOM. The slider is the lens slider; the
// slider, number field, bases and the gene's code-bar group share one linked pulse; a locked gene's
// controls frost over (DESIGN.md section 7).

/** Everything the inspector shows for a gene, worked out from the code alone. */
export interface InspectorValues {
  /** The decoded value in words ("1.60% of envelope height"). */
  inUse: string;
  /** The slider position: the raw gene value. */
  slider: string;
  /** The exact number field, in the field's unit. */
  field: string;
  /** Unit beside the number field, or the choice in words. */
  fieldUnit: string;
  /** The gene's bases, in order. */
  bases: string[];
  /** "Gene value 1,234 of 4,095". */
  raw: string;
  notes: string[];
}

export function inspectorValues(code: string, def: GeneDef, decoded: DecodedGenome): InspectorValues {
  const raw = readGene(code, def.locus);
  const model = decodeValue(def, raw);
  const { scale, unit } = fieldUnit(def);
  const whole = def.kind === 'seed' || def.kind === 'int' || def.kind === 'choice';
  const { start, length } = geneSpan(def.locus);
  return {
    inUse: formatValue(def, decoded.values[def.locus - 1] ?? 0),
    slider: String(raw),
    field: whole ? String(model) : String(Number((model * scale).toPrecision(6))),
    fieldUnit: def.kind === 'choice' ? formatValue(def, model) : unit,
    bases: code.slice(start, start + length).split(''),
    raw: `Gene value ${raw.toLocaleString('en-GB')} of ${rawMax(def).toLocaleString('en-GB')}`,
    notes: geneNotes(decoded, def.locus),
  };
}

export interface InspectorOptions {
  /** Adds a close button (beside the helix, where there is no row to click again). */
  onClose?: () => void;
}

/** Slider gestures, numbered across every inspector so two drags never merge into one undo step. */
let gestures = 0;

export class Inspector {
  readonly root: HTMLElement;
  readonly locus: number;
  private readonly inUse: HTMLElement;
  private readonly slider: LensSlider;
  private readonly lockable: HTMLElement;
  private readonly frost: HTMLElement;
  private readonly frostAmount = new Damped(0, dur('large'));
  private frostLoop: (() => void) | null = null;
  private lastRaw: string | null = null;
  private lastLocked: boolean | null = null;
  private readonly field: HTMLInputElement;
  private readonly unit: HTMLElement;
  private readonly baseButtons: HTMLButtonElement[];
  private readonly raw: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly randomise: HTMLButtonElement;
  private readonly lock: HTMLButtonElement;
  private gesture = gestures++;

  constructor(
    private readonly editor: Editor,
    readonly def: GeneDef,
    options: InspectorOptions = {},
  ) {
    const locus = def.locus;
    this.locus = locus;
    const max = rawMax(def);
    const id = `gene-${locus}-${this.gesture}`;

    const title = el('h3', { className: 'inspector-title' },
      el('span', { className: 'locus', textContent: String(locus) }), ` ${def.name}`);

    this.inUse = el('strong');
    const parameter = el('p', { className: 'parameter' }, `${def.parameter}: `, this.inUse);

    const link = `gene-${locus}`;
    const whole = def.kind === 'int' || def.kind === 'choice';
    const slider = new LensSlider({
      max,
      bin: whole ? (max + 1) / binCount(def) : 1,
      label: `${def.name} slider`,
      link,
      onInput: (raw) => editor.setGene(locus, raw, `slider-${this.gesture}`),
      onGestureEnd: () => (this.gesture = gestures++),
    });
    slider.el.id = `${id}-slider`;
    this.slider = slider;

    const { scale } = fieldUnit(def);
    const field = el('input', { type: 'number', step: 'any', id: `${id}-field` });
    field.dataset.link = link;
    field.setAttribute('aria-label', `${def.name} exact value`);
    if (def.kind !== 'seed') {
      field.min = String(def.min * scale);
      field.max = String(def.max * scale);
    }
    if (def.kind === 'int' || def.kind === 'choice' || def.kind === 'seed') field.step = '1';
    const commitField = (): void => {
      const typed = Number(field.value);
      if (field.value.trim() === '' || !Number.isFinite(typed)) return;
      editor.setModelValue(locus, typed / scale);
      // A value that lands on the same gene value leaves the code unchanged; show it as stored.
      this.fill(true);
    };
    field.addEventListener('change', commitField);
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitField();
    });
    this.field = field;
    this.unit = el('span', { className: 'field-unit' });
    const controls = el('div', { className: 'inspector-controls' }, slider.el, field, this.unit);

    const { start, length } = geneSpan(locus);
    const bases = Array.from({ length }, (_, i) => {
      const position = start + i + 1;
      const b = button('', { className: 'base' });
      b.dataset.position = String(position);
      b.dataset.link = link;
      b.title = `Base ${position}: click to cycle A, C, G, T, or type a letter`;
      b.addEventListener('click', () => editor.cycleBase(position));
      b.addEventListener('keydown', (e) => {
        if (/^[acgt]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          editor.setBase(position, e.key);
          bases[Math.min(i + 1, length - 1)]?.focus();
        } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          bases[Math.max(0, Math.min(length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))]?.focus();
        }
      });
      return b;
    });
    this.baseButtons = bases;
    const baseRow = el('div', { className: 'base-edit' }, ...bases);
    baseRow.setAttribute('role', 'group');
    baseRow.setAttribute('aria-label', `${def.name} bases`);

    this.raw = el('p', { className: 'raw' });
    this.notes = el('p', { className: 'notes' });
    const description = el('p', { className: 'description', textContent: def.description });
    const reference = el('p', { className: 'reference' }, el('span', { className: 'label', textContent: 'Reference: ' }), referenceOf(def));
    const tag = def.designed ? el('p', { className: 'designed-tag', textContent: 'Designed, not from a published model' }) : '';

    this.randomise = button('Randomise gene');
    this.randomise.addEventListener('click', () => editor.randomiseGene(locus));
    this.lock = button('Lock');
    this.lock.addEventListener('click', () => editor.toggleLock(locus));
    const actions = el('div', { className: 'inspector-actions' }, this.randomise, this.lock);
    if (options.onClose) {
      const close = button('Close', { className: 'btn glass inspector-close', title: 'Close the inspector (Escape)' });
      close.addEventListener('click', options.onClose);
      actions.append(close);
    }

    // The editable part frosts over while the gene is locked: condensation from the edges inward.
    this.frost = el('div', { className: 'frost' }, el('span', { className: 'frost-note', textContent: 'Locked. Randomise all leaves this gene alone.' }));
    this.lockable = el('div', { className: 'lockable' }, parameter, controls, baseRow, this.raw, this.frost);
    this.root = el('section', { className: 'inspector glass layer-3' }, title, this.lockable, this.notes, description, reference, tag, actions);
    this.root.dataset.group = def.group;
    this.root.dataset.locus = String(locus);
    this.root.setAttribute('aria-label', `Inspector: ${def.name}`);
  }

  /** Redraws from the editor. The number field is left alone while it is being typed in. */
  fill(rewriteField = false, decoded?: DecodedGenome): void {
    const code = this.editor.code;
    const v = inspectorValues(code, this.def, decoded ?? decodeGenome(code));
    this.inUse.textContent = v.inUse;
    this.slider.set(Number(v.slider), v.inUse);
    // A changed value lights every place that shows it, together (held while the slider is dragged).
    if (this.lastRaw !== null && this.lastRaw !== v.slider) pulse(`gene-${this.locus}`);
    this.lastRaw = v.slider;
    if (rewriteField || document.activeElement !== this.field) this.field.value = v.field;
    this.unit.textContent = v.fieldUnit;
    this.baseButtons.forEach((b, i) => {
      const base = v.bases[i] ?? '';
      b.textContent = base;
      b.dataset.base = base;
    });
    this.raw.textContent = v.raw;
    this.notes.textContent = v.notes.join(' ');
    this.notes.hidden = v.notes.length === 0;
    const locked = this.editor.isLocked(this.locus);
    this.lock.textContent = locked ? 'Unlock' : 'Lock';
    this.lock.setAttribute('aria-pressed', String(locked));
    this.lock.title = locked ? 'Let randomise-all change this gene again' : 'Keep this gene when randomising all';
    this.randomise.disabled = locked;
    this.randomise.title = locked ? 'Unlock this gene to randomise it' : 'Give this gene a new random value';
    this.slider.setDisabled(locked);
    this.lockable.inert = locked;
    this.lockable.classList.toggle('is-locked', locked);
    if (locked !== this.lastLocked) {
      const first = this.lastLocked === null;
      this.lastLocked = locked;
      this.condense(locked, first);
    }
  }

  /** Frost forms from the edges inward over 520ms; unlocking clears it from the centre outward. */
  private condense(locked: boolean, instant: boolean): void {
    const a = this.frostAmount;
    a.setSettle(dur('large'));
    a.target = locked ? 1 : 0;
    if (instant || motion.reduced) a.snap(a.target);
    if (motion.reduced && !instant) this.frost.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160 });
    const paint = (): void => {
      this.frost.style.setProperty('--a', a.value.toFixed(4));
      this.frost.style.visibility = a.value < 0.001 ? 'hidden' : 'visible';
    };
    paint();
    if (this.frostLoop) return;
    this.frostLoop = loop((dt) => {
      a.step(dt);
      paint();
      if (a.settled) this.frostLoop = null;
      return !a.settled;
    });
  }
}
