import type { SpeciesId } from '../genome';
import { SPECIES_NAMES } from './gene-info';
import type { ProgressView } from './studio';

// The page layout from spec section 6, in plain styling: top bar, helix column on the left (holding
// the editor buttons, the helix and, behind a toggle, the gene map), stage on the right and code bar
// along the bottom.

export interface Shell {
  root: HTMLElement;
  stage: HTMLElement;
  viewButtons: { '3d': HTMLButtonElement; flat: HTMLButtonElement };
  speciesButtons: Record<SpeciesId, HTMLButtonElement>;
  tools: {
    randomiseAll: HTMLButtonElement;
    wildType: HTMLButtonElement;
    undo: HTMLButtonElement;
    redo: HTMLButtonElement;
  };
  /** Switches the editor between the helix (the default) and the gene map. */
  editorViews: { helix: HTMLButtonElement; map: HTMLButtonElement };
  /** Holds the helix and the gene map. */
  editorBody: HTMLElement;
  /** Holds the code bar. */
  codeBar: HTMLElement;
  progress: ProgressView;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function button(text: string, props: Partial<HTMLButtonElement> = {}): HTMLButtonElement {
  return el('button', { type: 'button', textContent: text, ...props });
}

function segmented(label: string, ...buttons: HTMLButtonElement[]): HTMLElement {
  const group = el('div', { className: 'segmented' }, ...buttons);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  return group;
}

export function buildShell(parent: HTMLElement): Shell {
  const speciesA = button(SPECIES_NAMES.A);
  const speciesB = button(SPECIES_NAMES.B);
  const view3d = button('3D');
  const viewFlat = button('Flat');
  const top = el(
    'header',
    { className: 'top-bar' },
    el('h1', { textContent: 'Genome studio' }),
    el('span', { className: 'top-label', textContent: 'Species' }),
    segmented('Species', speciesA, speciesB),
    el('span', { className: 'top-label', textContent: 'View' }),
    segmented('View', view3d, viewFlat),
  );

  const tools = {
    randomiseAll: button('Randomise all', { title: 'Give every unlocked gene a new random value' }),
    wildType: button('Wild type', { title: 'Reset to the default genome for this species' }),
    undo: button('Undo'),
    redo: button('Redo'),
  };
  const editorViews = {
    helix: button('Helix', { title: 'Edit on the double helix' }),
    map: button('Gene map', { title: 'A flat list of all 24 genes, for precise work' }),
  };
  const viewToggle = segmented('Editor view', editorViews.helix, editorViews.map);
  viewToggle.classList.add('editor-view-toggle');
  const toolbar = el('div', { className: 'editor-tools' }, tools.randomiseAll, tools.wildType, tools.undo, tools.redo, viewToggle);
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Genome');
  const editorBody = el('div', { className: 'editor-body' });
  const helix = el('aside', { className: 'helix-column' }, toolbar, editorBody);
  helix.setAttribute('aria-label', 'Helix editor');

  const canvasHost = el('div', { className: 'stage-canvas' });
  const fill = el('div', { className: 'progress-fill' });
  const label = el('span', { textContent: 'Growing…' });
  const progressBox = el('div', { className: 'progress', hidden: true }, el('div', { className: 'progress-track' }, fill), label);
  progressBox.setAttribute('role', 'progressbar');
  progressBox.setAttribute('aria-label', 'Growing');
  progressBox.setAttribute('aria-valuemin', '0');
  progressBox.setAttribute('aria-valuemax', '100');
  const stage = el('main', { className: 'stage' }, canvasHost, progressBox);

  const codeBar = el('footer', { className: 'code-bar' });
  codeBar.setAttribute('aria-label', 'Genome code');

  const root = el('div', { className: 'studio' }, top, helix, stage, codeBar);
  parent.replaceChildren(root);

  const progress: ProgressView = {
    show(fraction) {
      const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      fill.style.width = `${pct}%`;
      label.textContent = `Growing… ${pct}%`;
      progressBox.setAttribute('aria-valuenow', String(pct));
      progressBox.hidden = false;
    },
    hide() {
      progressBox.hidden = true;
    },
  };

  return {
    root,
    stage: canvasHost,
    viewButtons: { '3d': view3d, flat: viewFlat },
    speciesButtons: { A: speciesA, B: speciesB },
    tools,
    editorViews,
    editorBody,
    codeBar,
    progress,
  };
}
