import { CHECKSUM_START, GENE_COUNT, geneAt, geneSpan, type SpeciesId } from '../genome';
import type { Editor } from './editor';
import { geneSummary } from './gene-map';
import { GROUP_NAMES } from './gene-info';
import { button, el } from './shell';

// The code bar (spec section 5): the full 160-letter code, always visible and grouped by gene, with
// copy and paste. Clicking a gene's group focuses that gene. Pasting reads the clipboard; where the
// browser does not allow that, a field opens to paste into.

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

  constructor(
    parent: HTMLElement,
    private readonly editor: Editor,
    private readonly options: CodeBarOptions,
  ) {
    this.code = el('div', { className: 'code', id: 'genome-code' });
    this.code.setAttribute('aria-label', 'The 160-letter code, grouped by gene');

    const copyCode = button('Copy code');
    copyCode.addEventListener('click', () => void this.copy(editor.code, 'Code copied.'));
    const copyLink = button('Copy link');
    copyLink.addEventListener('click', () => void this.copy(options.link(), 'Link copied.'));
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

    const actions = el('div', { className: 'code-actions' }, copyCode, copyLink, paste);
    const label = el('label', { htmlFor: 'genome-code', className: 'code-label', textContent: 'Genome code' });
    parent.replaceChildren(label, this.code, actions, this.pasteBox, this.notice);

    editor.subscribe((change) => {
      if (change.type === 'code') {
        this.flash = null;
        this.external = null;
      }
      this.refresh();
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

  private async copy(text: string, done: string): Promise<void> {
    try {
      await this.options.copy(text);
      this.showFlash(done);
    } catch {
      this.showFlash('The browser would not allow copying. Select the code and copy it by hand.');
    }
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
      node.textContent = text;
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
