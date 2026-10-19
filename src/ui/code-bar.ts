import { CHECKSUM_START, GENE_COUNT, geneAt, geneSpan, type SpeciesId } from '../genome';
import type { Editor, EditorChange } from './editor';
import { READ_STEP_MS, rippleSchedule, type RippleStep } from './interaction';
import { dur, motion } from './motion';
import { geneSummary } from './gene-map';
import { GROUP_NAMES } from './gene-info';
import { button, el } from './shell';

// The code bar (spec section 5): the full 160-letter code, always visible and grouped by gene, with
// copy and paste. Clicking a gene's group focuses that gene. Pasting reads the clipboard; where the
// browser does not allow that, a field opens to paste into. Copying reads the code out gene by gene
// and the button rolls to "Copied"; randomise-all changes genes in a gene-by-gene ripple; a pasted
// code is written in gene by gene (DESIGN.md section 7).

export interface CodeBarOptions {
  /** The link that opens the current organism. */
  link: () => string;
  /** Writes text to the clipboard. */
  copy: (text: string) => Promise<void>;
  /** Reads text from the clipboard; rejects if the browser does not allow it. */
  readClipboard: () => Promise<string>;
}

/** One group of the code bar: the header, a gene or the checksum. */
export interface CodeGroup {
  group: 'header' | 'form' | 'pigment' | 'seed' | 'checksum';
  locus: number | null;
  text: string;
  title: string;
}

/** The code bar's groups for a code, worked out without the DOM. */
export function codeGroups(code: string, species: SpeciesId): CodeGroup[] {
  const groups: CodeGroup[] = [
    { group: 'header', locus: null, text: code.slice(0, 6), title: `${GROUP_NAMES.header}: species and encoding version (not editable)` },
  ];
  for (let locus = 1; locus <= GENE_COUNT; locus++) {
    const { start, length } = geneSpan(locus);
    groups.push({
      group: geneAt(species, locus).group,
      locus,
      text: code.slice(start, start + length),
      title: `${locus}. ${geneSummary(code, species, locus)}`,
    });
  }
  groups.push({ group: 'checksum', locus: null, text: code.slice(CHECKSUM_START), title: `${GROUP_NAMES.checksum} (not editable)` });
  return groups;
}

export class CodeBar {
  private readonly code: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly pasteField: HTMLInputElement;
  private readonly pasteBox: HTMLElement;
  private groups: { locus: number | null; node: HTMLElement }[] = [];
  private species: SpeciesId | null = null;
  private flash: { text: string; timer: number } | null = null;
  private external: { text: string; tone: 'info' | 'warning' | 'error' } | null = null;
  private readonly status: HTMLElement;
  /** Timers of a ripple or write-in still running; the next change finishes it at once. */
  private pending: number[] = [];
  /** Groups whose text is held back until their turn in a ripple. */
  private held = new Set<number>();

  constructor(
    parent: HTMLElement,
    private readonly editor: Editor,
    private readonly options: CodeBarOptions,
  ) {
    this.code = el('div', { className: 'code', id: 'genome-code' });
    this.code.setAttribute('aria-label', 'The 160-letter code, grouped by gene');

    const copyCode = rollButton('Copy code');
    copyCode.addEventListener('click', () => void this.copy(editor.code, copyCode, true));
    const copyLink = rollButton('Copy link');
    copyLink.addEventListener('click', () => void this.copy(options.link(), copyLink, false));
    const paste = button('Paste');
    paste.addEventListener('click', () => void this.pasteFromClipboard());

    this.pasteField = el('input', { type: 'text', className: 'paste-field', placeholder: 'Paste a code here and press Enter', spellcheck: false });
    this.pasteField.setAttribute('aria-label', 'Paste a genome code');
    this.pasteField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.acceptPaste(this.pasteField.value);
      if (e.key === 'Escape') this.closePasteBox();
    });
    this.pasteField.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text');
      if (text === undefined) return;
      e.preventDefault();
      this.pasteField.value = text;
      this.acceptPaste(text);
    });
    const cancel = button('Cancel');
    cancel.addEventListener('click', () => this.closePasteBox());
    this.pasteBox = el('div', { className: 'paste-box', hidden: true }, this.pasteField, cancel);

    this.notice = el('div', { className: 'notice' });
    this.notice.setAttribute('aria-live', 'polite');
    this.status = el('span', { className: 'sr-only' });
    this.status.setAttribute('role', 'status');

    const actions = el('div', { className: 'code-actions' }, copyCode, copyLink, paste);
    const label = el('label', { htmlFor: 'genome-code', className: 'code-label', textContent: 'Genome code' });
    parent.replaceChildren(label, this.code, actions, this.pasteBox, this.notice, this.status);

    editor.subscribe((change) => {
      if (change.type === 'code') {
        this.flash = null;
        this.external = null;
      }
      this.finishPending();
      this.refresh();
      this.animateChange(change);
    });
    this.refresh();
  }

  /** Shows a message that is not the editor's own (a failed regrow), until the code next changes. */
  say(text: string, tone: 'info' | 'warning' | 'error'): void {
    this.external = text ? { text, tone } : null;
    this.refresh();
  }

  private show(text: string, tone: string): void {
    this.notice.textContent = text;
    this.notice.dataset.tone = tone;
  }

  /** Loads a pasted code into the editor. Returns whether it was accepted. */
  acceptPaste(text: string): boolean {
    const result = this.editor.paste(text);
    if (result.ok) this.closePasteBox();
    return result.ok;
  }

  private async pasteFromClipboard(): Promise<void> {
    try {
      const text = await this.options.readClipboard();
      if (text.trim() !== '') {
        this.acceptPaste(text);
        return;
      }
    } catch {
      // The browser would not hand over the clipboard; paste into the field instead.
    }
    this.pasteBox.hidden = false;
    this.pasteField.value = '';
    this.pasteField.focus();
  }

  private closePasteBox(): void {
    this.pasteBox.hidden = true;
    this.pasteField.value = '';
  }

  private async copy(text: string, button: HTMLButtonElement, readOut: boolean): Promise<void> {
    try {
      await this.options.copy(text);
    } catch {
      roll(button, 'Copy failed');
      this.showFlash('The browser would not allow copying. Select the code and copy it by hand.');
      return;
    }
    this.status.textContent = readOut ? 'Code copied.' : 'Link copied.';
    roll(button, 'Copied');
    if (readOut && !motion.reduced) {
      // Each gene lights in turn, as if read out, then all settle back together.
      this.groups.forEach((g, i) => this.pending.push(window.setTimeout(() => g.node.classList.add('read'), i * READ_STEP_MS)));
      this.pending.push(window.setTimeout(() => this.groups.forEach((g) => g.node.classList.remove('read')), this.groups.length * READ_STEP_MS + 160));
    }
  }

  /** The randomise ripple and the paste write-in: each group changes on its turn. */
  private animateChange(change: EditorChange): void {
    if (change.type !== 'code' || motion.reduced) return;
    let steps: RippleStep[];
    if (change.cause === 'randomise-all') {
      const locked = new Set(this.groups.filter((g) => g.locus !== null && this.editor.isLocked(g.locus)).map((g) => g.locus!));
      steps = rippleSchedule(codeGroups(change.code, this.editor.species).map((g) => ({ locus: g.locus, kind: g.group })), locked);
    } else if (change.cause === 'paste') {
      steps = this.groups.map((_, i) => ({ group: i, delayMs: i * READ_STEP_MS }));
    } else return;
    const before = codeGroups(change.previous, this.editor.species);
    for (const { group, delayMs } of steps) {
      const node = this.groups[group]?.node;
      const old = before[group]?.text;
      if (!node || old === undefined) continue;
      const fresh = node.textContent ?? '';
      if (old === fresh && change.cause === 'paste') continue;
      // Hold the old letters until this group's turn; then the new ones roll in under a brief light.
      this.held.add(group);
      node.textContent = old;
      this.pending.push(
        window.setTimeout(() => {
          this.held.delete(group);
          node.textContent = fresh;
          node.classList.remove('front');
          void node.offsetWidth;
          node.classList.add('front');
          if (old !== fresh) node.animate([{ transform: 'translateY(45%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: dur('medium'), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
        }, delayMs),
      );
    }
  }

  /** Ends a running ripple or read-out at once, so a new change starts from the true code. */
  private finishPending(): void {
    for (const t of this.pending) window.clearTimeout(t);
    this.pending = [];
    this.held.clear();
    for (const g of this.groups) g.node.classList.remove('read');
  }

  private showFlash(text: string): void {
    if (this.flash) window.clearTimeout(this.flash.timer);
    this.flash = { text, timer: window.setTimeout(() => ((this.flash = null), this.refresh()), 2500) };
    this.refresh();
  }

  private build(species: SpeciesId): void {
    this.species = species;
    this.groups = codeGroups(this.editor.code, species).map(({ group, locus, title }) => {
      const node = locus === null ? el('span', { className: 'code-group', title }) : button('', { className: 'code-group' });
      node.dataset.group = group;
      if (locus !== null) {
        node.dataset.locus = String(locus);
        node.dataset.link = `gene-${locus}`;
        node.addEventListener('click', () => this.editor.focusGene(locus));
      }
      return { locus, node };
    });
    this.code.replaceChildren(...this.groups.map((g) => g.node));
  }

  private refresh(): void {
    const { editor } = this;
    if (editor.species !== this.species) this.build(editor.species);
    codeGroups(editor.code, editor.species).forEach(({ locus, text, title }, i) => {
      const node = this.groups[i]?.node;
      if (!node) return;
      if (!this.held.has(i)) node.textContent = text;
      if (locus === null) return;
      node.title = title;
      node.classList.toggle('focused', editor.focus === locus);
      node.classList.toggle('locked', editor.isLocked(locus));
    });
    const message = editor.message ?? this.external;
    if (message) this.show(message.text, message.tone);
    else this.show(this.flash?.text ?? '', 'info');
  }
}

/** A word button whose label can roll to another word and back (Copy, then Copied). */
function rollButton(text: string): HTMLButtonElement {
  const b = button('');
  b.classList.add('roll-button');
  b.setAttribute('aria-label', text);
  b.append(el('span', { className: 'roll' }, el('span', { textContent: text }), el('span', { className: 'roll-next' })));
  return b;
}

/** Rolls the label up to `text`, holds it for 1.5 seconds, and rolls it back. */
function roll(b: HTMLButtonElement, text: string): void {
  const next = b.querySelector('.roll-next');
  if (next) next.textContent = text;
  b.classList.add('rolled');
  window.clearTimeout(Number(b.dataset.rollTimer ?? 0));
  b.dataset.rollTimer = String(window.setTimeout(() => b.classList.remove('rolled'), 1500));
}
