import type { SpeciesId } from '../genome';
import { LOOK_NAMES, LOOKS, type LookId } from '../render/colour';
import type { ProgressView } from './studio';
import { SpeciesMenu } from './species-menu';
import { glassSegments } from './surface';

// The page layout from spec section 6: top bar, helix column on the left (holding the editor buttons,
// the helix and, behind a toggle, the gene map), stage on the right and code bar along the bottom.
// The top bar and code bar are glass laid over the stage's edge, so the organism shows through them
// (DESIGN.md section 3); the helix column sits on its own backdrop.

export interface Shell {
  root: HTMLElement;
  stage: HTMLElement;
  viewButtons: { '3d': HTMLButtonElement; flat: HTMLButtonElement };
  lookButtons: Record<LookId, HTMLButtonElement>;
  /** Toggles a transparent background (aria-pressed). */
  transparentButton: HTMLButtonElement;
  /** The species switch, a drop list (DESIGN.md section 7). */
  speciesMenu: SpeciesMenu;
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
  /** Full-window layer for the exposure change when the look switches. */
  exposureLayer: HTMLElement;
  /** Opens the export dialog (spec section 9). */
  exportButton: HTMLButtonElement;
  /** Opens the Methods page (spec section 10). */
  methodsButton: HTMLButtonElement;
  /** The stage region, for things placed over the organism (the tray). */
  stageArea: HTMLElement;
  /** The plate caption: the specimen name and its code (spec section 6). */
  caption: { name: HTMLElement; code: HTMLElement };
  /** Shown while the organism on the stage is a draft. */
  draftLabel: HTMLElement;
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

/** A word button; unless given its own class it is a glass action button. */
export function button(text: string, props: Partial<HTMLButtonElement> = {}): HTMLButtonElement {
  return el('button', { type: 'button', textContent: text, className: 'btn glass', ...props });
}

/** Word segments sharing one sliding glass indicator; the pressed one is the choice. */
function segmented(label: string, ...buttons: HTMLButtonElement[]): HTMLElement {
  for (const b of buttons) b.className = '';
  const group = el('div', { className: 'segmented' }, ...buttons);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  glassSegments(group);
  return group;
}

/** A labelled group in the top bar; it wraps to the next line as a whole. */
function topGroup(label: string, ...controls: HTMLElement[]): HTMLElement {
  return el('span', { className: 'top-group' }, el('span', { className: 'top-label', textContent: label }), ...controls);
}

export function buildShell(parent: HTMLElement, onSpecies: (species: SpeciesId) => void): Shell {
  const speciesMenu = new SpeciesMenu(onSpecies);
  const view3d = button('3D');
  const viewFlat = button('Flat');
  const lookButtons = Object.fromEntries(LOOKS.map((l) => [l, button(LOOK_NAMES[l])])) as Record<LookId, HTMLButtonElement>;
  const exportButton = button('Export', { title: 'Save the organism as a print-size PNG' });
  const methodsButton = button('Methods', { title: 'The models, their sources, and what is designed' });
  const transparentButton = button('Transparent background', { className: 'btn glass toggle', title: 'Draw the organism without a background, as a layer' });
  transparentButton.setAttribute('aria-pressed', 'false');
  const top = el(
    'header',
    { className: 'top-bar glass layer-1' },
    el('h1', { textContent: 'Genome studio' }),
    topGroup('Species', speciesMenu.button),
    topGroup('View', segmented('View', view3d, viewFlat)),
    topGroup('Look', segmented('Look', ...LOOKS.map((l) => lookButtons[l])), transparentButton),
    methodsButton,
    exportButton,
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
  // Progress while growing (DESIGN.md: hairline and readout): a 1px line fills across the top of the
  // stage, under the top bar, with a quiet readout beside it.
  const fill = el('div', { className: 'progress-fill' });
  const label = el('span', { className: 'progress-readout', textContent: 'Growing 0%' });
  const progressBox = el('div', { className: 'progress', hidden: true }, el('div', { className: 'progress-track' }, fill), label);
  progressBox.setAttribute('role', 'progressbar');
  progressBox.setAttribute('aria-label', 'Growing');
  progressBox.setAttribute('aria-valuemin', '0');
  progressBox.setAttribute('aria-valuemax', '100');
  const draftLabel = el('span', { className: 'draft-label', hidden: true, textContent: 'Draft' });
  draftLabel.setAttribute('role', 'status');
  const captionName = el('em', { className: 'caption-name' });
  const captionCode = el('span', { className: 'caption-code' });
  const caption = el('figcaption', { className: 'caption' }, captionName, captionCode);
  const stage = el('main', { className: 'stage' }, canvasHost, progressBox, draftLabel, caption);

  const codeBar = el('footer', { className: 'code-bar glass layer-1' });
  codeBar.setAttribute('aria-label', 'Genome code');

  const exposureLayer = el('div', { className: 'exposure' });
  exposureLayer.setAttribute('aria-hidden', 'true');
  const root = el('div', { className: 'studio' }, stage, helix, top, codeBar, exposureLayer);
  parent.replaceChildren(root);
  // The bars lie over the stage's edge; things placed on the stage keep clear of them.
  new ResizeObserver(() => {
    root.style.setProperty('--top-h', `${top.offsetHeight}px`);
    root.style.setProperty('--code-h', `${codeBar.offsetHeight}px`);
  }).observe(root);

  const progress: ProgressView = {
    show(fraction) {
      const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
      fill.style.width = `${pct}%`;
      label.textContent = `Growing ${pct}%`;
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
    lookButtons,
    transparentButton,
    speciesMenu,
    tools,
    editorViews,
    editorBody,
    codeBar,
    progress,
    exposureLayer,
    exportButton,
    methodsButton,
    stageArea: stage,
    caption: { name: captionName, code: captionCode },
    draftLabel,
  };
}
