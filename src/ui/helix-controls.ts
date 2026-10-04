import { CHECKSUM_START, FIRST_GENE_POSITION, GENE_COUNT, geneSpan } from '../genome';
import { Editor } from './editor';

// What clicks and keys on the helix do, with no DOM and no WebGL, so it can be tested on its own.
// A click on a base cycles it (A, C, G, T) and selects it, so that typing a letter sets it. Clicking a
// base also focuses its gene, quietly: the helix does not turn, because the base is already where the
// user clicked. A click on a gene's band focuses that gene (or, if it is focused, closes it), and the
// helix turns to face it. Header and checksum bases are shown but cannot be edited (clarification 10).

export type HelixPick =
  | { kind: 'base'; index: number }
  | { kind: 'gene'; locus: number }
  | { kind: 'fixed'; part: 'header' | 'checksum' }
  | null;

/** First and last editable 1-based positions. */
const FIRST = FIRST_GENE_POSITION;
const LAST = CHECKSUM_START;

/** The gene holding a 1-based position, or null for the header and checksum. */
export function locusOfPosition(position: number): number | null {
  if (!Editor.isEditable(position)) return null;
  for (let locus = 1; locus <= GENE_COUNT; locus++) {
    const { start, length } = geneSpan(locus);
    if (position > start && position <= start + length) return locus;
  }
  return null;
}

export class HelixControls {
  /** The selected base, as a 1-based position, or null. */
  private chosen: number | null = null;
  /** A focus change that should not turn the helix (set while a base click focuses its gene). */
  private quiet: number | null = null;

  constructor(private readonly editor: Editor) {}

  get selected(): number | null {
    return this.chosen;
  }

  /**
   * True once for a focus change made by a base click or key on the helix, which should not turn it.
   * The view asks this when the editor's focus changes.
   */
  isQuietFocus(locus: number | null): boolean {
    const quiet = this.quiet !== null && this.quiet === locus;
    this.quiet = null;
    return quiet;
  }

  /** Acts on a click. Returns true when it changed the code, the focus or the selection. */
  click(pick: HelixPick): boolean {
    if (pick === null) {
      if (this.chosen === null) return false;
      this.chosen = null;
      return true;
    }
    if (pick.kind === 'gene') {
      this.chosen = null;
      this.editor.focusGene(this.editor.focus === pick.locus ? null : pick.locus);
      return true;
    }
    if (pick.kind === 'fixed') return false;
    const position = pick.index + 1;
    if (!Editor.isEditable(position)) return false;
    this.select(position);
    return this.editor.cycleBase(position);
  }

  /** Acts on a key press while the helix has keyboard focus. Returns true when the key was used. */
  key(key: string, modifiers = false): boolean {
    if (modifiers) return false;
    if (key === 'Escape') {
      if (this.chosen !== null) this.chosen = null;
      else this.editor.focusGene(null);
      return true;
    }
    if (this.chosen === null) return false;
    if (/^[acgt]$/i.test(key)) {
      const position = this.chosen;
      this.editor.setBase(position, key);
      this.select(Math.min(LAST, position + 1));
      return true;
    }
    const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return false;
    this.select(Math.max(FIRST, Math.min(LAST, this.chosen + step)));
    return true;
  }

  /** Clears the selection (on a species switch, for example). */
  clearSelection(): void {
    this.chosen = null;
  }

  /** Selects an editable base and quietly focuses its gene. */
  select(position: number): void {
    if (!Editor.isEditable(position)) return;
    this.chosen = position;
    const locus = locusOfPosition(position);
    if (locus !== null && locus !== this.editor.focus) {
      this.quiet = locus;
      this.editor.focusGene(locus);
      this.quiet = null;
    }
  }
}
