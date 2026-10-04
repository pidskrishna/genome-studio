import type { ProgressView } from './studio';

// The page layout from spec section 6, in plain styling: top bar, helix column on the left (empty
// until the helix editor is built), stage on the right and code bar along the bottom. The code bar
// holds a temporary paste box until the real code bar replaces it.

export interface Shell {
  root: HTMLElement;
  stage: HTMLElement;
  viewButtons: { '3d': HTMLButtonElement; flat: HTMLButtonElement };
  codeInput: HTMLTextAreaElement;
  growButton: HTMLButtonElement;
  notice: HTMLElement;
  progress: ProgressView;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Node[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function buildShell(parent: HTMLElement): Shell {
  const view3d = el('button', { type: 'button', textContent: '3D' });
  const viewFlat = el('button', { type: 'button', textContent: 'Flat' });
  const viewGroup = el('div', { className: 'segmented' }, view3d, viewFlat);
  viewGroup.setAttribute('role', 'group');
  viewGroup.setAttribute('aria-label', 'View');
  const top = el('header', { className: 'top-bar' }, el('h1', { textContent: 'Genome studio' }), viewGroup);

  const helix = el('aside', { className: 'helix-column', textContent: 'Helix editor' });
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

  const codeInput = el('textarea', { id: 'code-input', rows: 2, spellcheck: false });
  const growButton = el('button', { type: 'button', textContent: 'Grow' });
  const notice = el('div', { className: 'notice' });
  notice.setAttribute('aria-live', 'polite');
  const codeLabel = el('label', { htmlFor: 'code-input', textContent: 'Genome code (paste a code and press Grow)' });
  const code = el('footer', { className: 'code-bar' }, codeLabel, codeInput, growButton, notice);

  const root = el('div', { className: 'studio' }, top, helix, stage, code);
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

  return { root, stage: canvasHost, viewButtons: { '3d': view3d, flat: viewFlat }, codeInput, growButton, notice, progress };
}
