import {
  CHECKSUM_START,
  decodeGenome,
  geneAt,
  geneBases,
  geneTable,
  rawMax,
  type DecodedGenome,
  type GeneDef,
  type SpeciesId,
} from '../genome';
import type { Editor } from './editor';
import { formatValue, GROUP_NAMES, SPECIES_NAMES } from './gene-info';
import { Inspector } from './inspector';
import { button, el } from './shell';

// The linear gene map (spec section 5): all 24 genes in locus order, grouped as form, pigment and
// seed, with the header and checksum shown but not editable (clarification 10). Clicking a gene
// focuses it and opens the inspector (inspector.ts) beneath it. Everything is drawn from the editor
// state and updated in place, so a slider keeps working while it is dragged.

interface Row {
  def: GeneDef;
  item: HTMLLIElement;
  value: HTMLElement;
  bases: HTMLElement;
  fill: HTMLElement;
  lock: HTMLElement;
}

export class GeneMap {
  readonly element: HTMLElement;
  private readonly list: HTMLOListElement;
  private rows: Row[] = [];
  private headerBases!: HTMLElement;
  private headerNote!: HTMLElement;
  private checksumBases!: HTMLElement;
  private species: SpeciesId | null = null;
  private inspector: Inspector | null = null;

  constructor(private readonly editor: Editor) {
    this.list = el('ol', { className: 'gene-map' });
    this.element = el('section', { className: 'gene-map-panel' }, el('h2', { textContent: 'Gene map' }), this.list);
    this.element.setAttribute('aria-label', 'Gene map');
    editor.subscribe(() => this.refresh());
    this.refresh();
  }

  /** Scrolls the focused gene into view (when the map is shown again). */
  reveal(): void {
    this.inspector?.root.closest('li')?.scrollIntoView({ block: 'nearest' });
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
      this.inspector = new Inspector(this.editor, row.def);
      row.item.append(this.inspector.root);
      if (this.element.isConnected && this.element.offsetParent !== null) row.item.scrollIntoView({ block: 'nearest' });
    }
    this.inspector.fill(false, decoded);
  }
}

/** Name and value of a gene, for hover text. */
export function geneSummary(code: string, species: SpeciesId, locus: number): string {
  const def = geneAt(species, locus);
  const decoded = decodeGenome(code);
  return `${def.name}: ${formatValue(def, decoded.values[locus - 1] ?? 0)}`;
}
