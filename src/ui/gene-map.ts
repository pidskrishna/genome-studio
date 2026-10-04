import {
  CHECKSUM_START,
  decodeGenome,
  decodeValue,
  geneAt,
  geneBases,
  geneSpan,
  geneTable,
  rawMax,
  readGene,
  type DecodedGenome,
  type GeneDef,
  type SpeciesId,
} from '../genome';
import type { Editor } from './editor';
import { fieldUnit, formatValue, geneNotes, GROUP_NAMES, referenceOf, SPECIES_NAMES } from './gene-info';
import { button, el } from './shell';

// The linear gene map (spec section 5): all 24 genes in locus order, grouped as form, pigment and
// seed, with the header and checksum shown but not editable (clarification 10). Clicking a gene
// focuses it and opens the inspector beneath it. Everything is drawn from the editor state and
// updated in place, so a slider keeps working while it is dragged.

interface Row {
  def: GeneDef;
  item: HTMLLIElement;
  value: HTMLElement;
  bases: HTMLElement;
  fill: HTMLElement;
  lock: HTMLElement;
}

interface InspectorParts {
  locus: number;
  root: HTMLElement;
  inUse: HTMLElement;
  slider: HTMLInputElement;
  field: HTMLInputElement;
  fieldUnit: HTMLElement;
  bases: HTMLButtonElement[];
  raw: HTMLElement;
  notes: HTMLElement;
  randomise: HTMLButtonElement;
  lock: HTMLButtonElement;
}

export class GeneMap {
  readonly element: HTMLElement;
  private readonly list: HTMLOListElement;
  private rows: Row[] = [];
  private headerBases!: HTMLElement;
  private headerNote!: HTMLElement;
  private checksumBases!: HTMLElement;
  private species: SpeciesId | null = null;
  private inspector: InspectorParts | null = null;
  private gesture = 0;

  constructor(private readonly editor: Editor) {
    this.list = el('ol', { className: 'gene-map' });
    this.element = el('section', { className: 'gene-map-panel' }, el('h2', { textContent: 'Gene map' }), this.list);
    this.element.setAttribute('aria-label', 'Gene map');
    editor.subscribe(() => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    const editor = this.editor;
    if (editor.species !== this.species) this.build(editor.species);
    const decoded = decodeGenome(editor.code);
    this.headerBases.textContent = editor.code.slice(0, 6);
    this.headerNote.textContent = `${SPECIES_NAMES[decoded.species]}, encoding version 1`;
    this.checksumBases.textContent = editor.code.slice(CHECKSUM_START);
    for (const row of this.rows) {
      const { def } = row;
      const raw = decoded.raw[def.locus - 1] ?? 0;
      row.value.textContent = formatValue(def, decoded.values[def.locus - 1] ?? 0);
      row.bases.textContent = geneBases(editor.code, def.locus);
      row.fill.style.width = `${(raw / rawMax(def)) * 100}%`;
      const locked = editor.isLocked(def.locus);
      row.lock.hidden = !locked;
      row.item.classList.toggle('locked', locked);
      const focused = editor.focus === def.locus;
      row.item.classList.toggle('focused', focused);
      row.item.querySelector('.gene-head')?.setAttribute('aria-expanded', String(focused));
    }
    this.placeInspector(decoded);
  }

  private build(species: SpeciesId): void {
    this.species = species;
    this.inspector = null;
    this.headerBases = el('span', { className: 'bases' });
    this.headerNote = el('span', { className: 'value' });
    this.checksumBases = el('span', { className: 'bases' });
    const items: HTMLLIElement[] = [];
    items.push(this.fixedRow('header', GROUP_NAMES.header, this.headerNote, this.headerBases,
      'Shown, not editable. The species changes only through the switch in the top bar.'));
    this.rows = geneTable(species).map((def) => this.geneRow(def));
    let group = '';
    for (const row of this.rows) {
      if (row.def.group !== group) {
        group = row.def.group;
        items.push(el('li', { className: 'group-heading', textContent: GROUP_NAMES[row.def.group] }));
      }
      items.push(row.item);
    }
    items.push(this.fixedRow('checksum', GROUP_NAMES.checksum, el('span', { className: 'value', textContent: 'Recomputed on every edit' }), this.checksumBases,
      'Shown, not editable. It catches typing errors in a pasted code.'));
    this.list.replaceChildren(...items);
  }

  private fixedRow(group: string, name: string, value: HTMLElement, bases: HTMLElement, title: string): HTMLLIElement {
    const head = el('div', { className: 'gene-head fixed', title },
      el('span', { className: 'locus' }), el('span', { className: 'name', textContent: name }), value, bases);
    const item = el('li', { className: 'gene-row' }, head);
    item.dataset.group = group;
    return item;
  }

  private geneRow(def: GeneDef): Row {
    const value = el('span', { className: 'value' });
    const bases = el('span', { className: 'bases' });
    const lock = el('span', { className: 'lock-mark', textContent: 'Locked', hidden: true });
    const head = button('', { className: 'gene-head' });
    const fill = el('span', { className: 'gene-bar-fill' });
    head.append(el('span', { className: 'locus', textContent: String(def.locus) }), el('span', { className: 'name', textContent: def.name }), lock, value, bases, el('span', { className: 'gene-bar' }, fill));
    head.addEventListener('click', () => this.editor.focusGene(this.editor.focus === def.locus ? null : def.locus));
    const item = el('li', { className: 'gene-row' }, head);
    item.dataset.group = def.group;
    item.dataset.locus = String(def.locus);
    return { def, item, value, bases, fill, lock };
  }

  /** Opens the inspector under the focused gene, or closes it. */
  private placeInspector(decoded: DecodedGenome): void {
    const focus = this.editor.focus;
    if (this.inspector && this.inspector.locus !== focus) {
      this.inspector.root.remove();
      this.inspector = null;
    }
    if (focus === null) return;
    const row = this.rows[focus - 1];
    if (!row) return;
    if (!this.inspector) {
      this.inspector = this.buildInspector(row.def);
      row.item.append(this.inspector.root);
      row.item.scrollIntoView({ block: 'nearest' });
    }
    this.fillInspector(this.inspector, row.def, decoded);
  }

  private buildInspector(def: GeneDef): InspectorParts {
    const editor = this.editor;
    const locus = def.locus;
    const max = rawMax(def);
    const id = `gene-${locus}`;

    const inUse = el('strong');
    const parameter = el('p', { className: 'parameter' }, `${def.parameter}: `, inUse);

    const slider = el('input', { type: 'range', min: '0', max: String(max), step: '1', id: `${id}-slider` });
    slider.setAttribute('aria-label', `${def.name} slider`);
    slider.addEventListener('input', () => editor.setGene(locus, Number(slider.value), `slider-${this.gesture}`));
    slider.addEventListener('change', () => this.gesture++);

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
      this.fillInspector(this.inspector!, def, decodeGenome(editor.code), true);
    };
    field.addEventListener('change', commitField);
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitField();
    });
    const unit = el('span', { className: 'field-unit' });
    const controls = el('div', { className: 'inspector-controls' }, slider, field, unit);

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
    const baseRow = el('div', { className: 'base-edit' }, ...bases);
    baseRow.setAttribute('role', 'group');
    baseRow.setAttribute('aria-label', `${def.name} bases`);

    const raw = el('p', { className: 'raw' });
    const notes = el('p', { className: 'notes' });
    const description = el('p', { className: 'description', textContent: def.description });
    const reference = el('p', { className: 'reference' }, el('span', { className: 'label', textContent: 'Reference: ' }), referenceOf(def));
    const tag = def.designed ? el('p', { className: 'designed-tag', textContent: 'Designed, not from a published model' }) : '';

    const randomise = button('Randomise gene');
    randomise.addEventListener('click', () => editor.randomiseGene(locus));
    const lock = button('Lock');
    lock.addEventListener('click', () => editor.toggleLock(locus));
    const actions = el('div', { className: 'inspector-actions' }, randomise, lock);

    const root = el('section', { className: 'inspector' }, parameter, controls, baseRow, raw, notes, description, reference, tag, actions);
    root.setAttribute('aria-label', `Inspector: ${def.name}`);
    return { locus, root, inUse, slider, field, fieldUnit: unit, bases, raw, notes, randomise, lock };
  }

  private fillInspector(parts: InspectorParts, def: GeneDef, decoded: DecodedGenome, rewriteField = false): void {
    const code = this.editor.code;
    const raw = readGene(code, def.locus);
    parts.inUse.textContent = formatValue(def, decoded.values[def.locus - 1] ?? 0);
    if (parts.slider.value !== String(raw)) parts.slider.value = String(raw);
    // Leave the number field alone while it is being typed in.
    if (rewriteField || document.activeElement !== parts.field) {
      const { scale } = fieldUnit(def);
      const model = decodeValue(def, raw);
      parts.field.value = def.kind === 'seed' || def.kind === 'int' || def.kind === 'choice' ? String(model) : String(Number((model * scale).toPrecision(6)));
    }
    parts.fieldUnit.textContent = def.kind === 'choice' ? formatValue(def, decodeValue(def, raw)) : fieldUnit(def).unit;
    const { start } = geneSpan(def.locus);
    parts.bases.forEach((b, i) => {
      const base = code.charAt(start + i);
      b.textContent = base;
      b.dataset.base = base;
    });
    parts.raw.textContent = `Gene value ${raw.toLocaleString('en-GB')} of ${rawMax(def).toLocaleString('en-GB')}`;
    const notes = geneNotes(decoded, def.locus);
    parts.notes.textContent = notes.join(' ');
    parts.notes.hidden = notes.length === 0;
    const locked = this.editor.isLocked(def.locus);
    parts.lock.textContent = locked ? 'Unlock' : 'Lock';
    parts.lock.setAttribute('aria-pressed', String(locked));
    parts.lock.title = locked ? 'Let randomise-all change this gene again' : 'Keep this gene when randomising all';
    parts.randomise.disabled = locked;
    parts.randomise.title = locked ? 'Unlock this gene to randomise it' : 'Give this gene a new random value';
  }
}

/** Name and value of a gene, for hover text. */
export function geneSummary(code: string, species: SpeciesId, locus: number): string {
  const def = geneAt(species, locus);
  const decoded = decodeGenome(code);
  return `${def.name}: ${formatValue(def, decoded.values[locus - 1] ?? 0)}`;
}
