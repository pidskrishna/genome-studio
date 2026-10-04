import { decodeGenome, decodeValue, geneSpan, rawMax, readGene, type DecodedGenome, type GeneDef } from '../genome';
import type { Editor } from './editor';
import { fieldUnit, formatValue, geneNotes, referenceOf } from './gene-info';
import { button, el } from './shell';

// The gene inspector (spec section 5): the gene's slider, an exact number field, its bases as
// editable letters, the model parameter with its unit, one sentence on what it does and its
// reference, with randomise and lock. It sits beside the focused gene on the helix and under the
// focused row in the gene map. What it shows is worked out by `inspectorValues`, a plain function, so
// the sync between bases and slider can be tested without a DOM.

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
  private readonly slider: HTMLInputElement;
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

    const slider = el('input', { type: 'range', min: '0', max: String(max), step: '1', id: `${id}-slider` });
    slider.setAttribute('aria-label', `${def.name} slider`);
    slider.addEventListener('input', () => editor.setGene(locus, Number(slider.value), `slider-${this.gesture}`));
    slider.addEventListener('change', () => (this.gesture = gestures++));
    this.slider = slider;

    const { scale } = fieldUnit(def);
    const field = el('input', { type: 'number', step: 'any', id: `${id}-field` });
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
    const controls = el('div', { className: 'inspector-controls' }, slider, field, this.unit);

    const { start, length } = geneSpan(locus);
    const bases = Array.from({ length }, (_, i) => {
      const position = start + i + 1;
      const b = button('', { className: 'base' });
      b.dataset.position = String(position);
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
      const close = button('Close', { className: 'inspector-close', title: 'Close the inspector (Escape)' });
      close.addEventListener('click', options.onClose);
      actions.append(close);
    }

    this.root = el('section', { className: 'inspector' }, title, parameter, controls, baseRow, this.raw, this.notes, description, reference, tag, actions);
    this.root.dataset.group = def.group;
    this.root.dataset.locus = String(locus);
    this.root.setAttribute('aria-label', `Inspector: ${def.name}`);
  }

  /** Redraws from the editor. The number field is left alone while it is being typed in. */
  fill(rewriteField = false, decoded?: DecodedGenome): void {
    const code = this.editor.code;
    const v = inspectorValues(code, this.def, decoded ?? decodeGenome(code));
    this.inUse.textContent = v.inUse;
    if (this.slider.value !== v.slider) this.slider.value = v.slider;
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
  }
}
