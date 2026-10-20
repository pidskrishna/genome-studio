import { ALL_SPECIES, specimenName, speciesOfHeader } from '../genome';
import { SPECIES_NAMES } from './gene-info';
import { ENCODING_NOTES, geneRows, GROUNDING, SPECIES_A, SPECIES_B, SPECIES_C, SPECIES_D, SPECIES_E, SPECIES_F, type ModelSection } from './methods-content';
import { button, el } from './shell';

// The Methods page (spec section 10): inside the app, so it can show the current organism's code and
// geometry hash for comparison across browsers and machines. Content is in methods-content.ts.

export interface MethodsContext {
  /** The organism on the stage: its code and geometry hash, or null before the first one grows. */
  current: () => { code: string; hash: string } | null;
}

function table(head: string[], rows: string[][], className = ''): HTMLTableElement {
  const t = el('table', { className: `methods-table ${className}`.trim() });
  t.append(el('thead', {}, el('tr', {}, ...head.map((h) => el('th', { scope: 'col', textContent: h })))));
  t.append(el('tbody', {}, ...rows.map((r) => el('tr', {}, ...r.map((c) => el('td', { textContent: c }))))));
  return t;
}

function modelSection(m: ModelSection): HTMLElement {
  return el(
    'section',
    { className: 'methods-section' },
    el('h3', { textContent: m.title }),
    el('h4', { textContent: 'Procedure' }),
    el('ol', {}, ...m.procedure.map((p) => el('li', { textContent: p }))),
    el('h4', { textContent: 'Equations' }),
    el('ul', { className: 'methods-equations' }, ...m.equations.map((e) => el('li', { textContent: e }))),
    el('h4', { textContent: 'Additions and choices beyond the publications' }),
    table(['', 'Status'], m.additions.map((a) => [a.text, a.status]), 'methods-notes'),
    el('h4', { textContent: 'Limits' }),
    el('ul', {}, ...m.limits.map((l) => el('li', { textContent: l }))),
    el('h4', { textContent: 'References' }),
    el('ul', { className: 'methods-refs' }, ...m.references.map((r) => el('li', { textContent: r }))),
  );
}

export class MethodsPage {
  readonly element: HTMLDialogElement;
  private readonly organism = el('dl', { className: 'methods-organism' });

  constructor(private readonly ctx: MethodsContext) {
    const close = button('Close');
    close.addEventListener('click', () => this.element.close());
    const genes = ALL_SPECIES.map((species) =>
      el(
        'section',
        { className: 'methods-section' },
        el('h3', { textContent: `Genes of species ${species}: ${SPECIES_NAMES[species].toLowerCase()}` }),
        table(['Locus', 'Gene', 'Model parameter', 'Range', 'Scale', 'Status'], geneRows(species).map((g) => [String(g.locus), g.name, g.parameter, g.range, g.scale, g.status]), 'methods-genes'),
      ),
    );
    const body = el(
      'article',
      { className: 'methods-body' },
      el('header', { className: 'methods-head' }, el('h2', { textContent: 'Methods' }), close),
      el('p', { className: 'methods-lede', textContent: 'The tool is accurate at the level of its growth models and openly a designed abstraction at the level of its genome. This page says which is which.' }),
      el('section', { className: 'methods-section' }, el('h3', { textContent: 'This organism' }), this.organism),
      el('section', { className: 'methods-section' }, el('h3', { textContent: 'What is published and what is designed' }), table(['Part', 'Status', 'Basis'], GROUNDING.map((g) => [g.part, g.status, g.basis]))),
      modelSection(SPECIES_A),
      modelSection(SPECIES_B),
      modelSection(SPECIES_C),
      modelSection(SPECIES_D),
      modelSection(SPECIES_E),
      modelSection(SPECIES_F),
      el('section', { className: 'methods-section' }, el('h3', { textContent: 'From code to organism' }), ...ENCODING_NOTES.map((n) => el('p', { textContent: n }))),
      ...genes,
    );
    this.element = el('dialog', { className: 'methods-page glass layer-3' }, body);
    this.element.setAttribute('aria-label', 'Methods');
    document.body.append(this.element);
  }

  open(): void {
    this.fillOrganism();
    this.element.showModal();
    this.element.scrollTop = 0;
  }

  /** The organism on the stage now: compare its hash across browsers and machines (spec section 10). */
  private fillOrganism(): void {
    const now = this.ctx.current();
    const rows: [string, string][] = now
      ? [
          ['Specimen', specimenName(now.code).full],
          ['Species', SPECIES_NAMES[speciesOfHeader(now.code) ?? 'A']],
          ['Encoding version', '1'],
          ['Geometry hash', now.hash],
          ['Code', now.code],
        ]
      : [['Geometry hash', 'Not yet grown']];
    this.organism.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v, className: k === 'Code' || k === 'Geometry hash' ? 'mono' : '' })]));
  }
}
