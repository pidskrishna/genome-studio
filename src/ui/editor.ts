import {
  CHECKSUM_START,
  FIRST_GENE_POSITION,
  GENE_COUNT,
  geneAt,
  nextBase,
  parseGenome,
  rawMax,
  readGene,
  speciesOfHeader,
  wildType,
  writeBase,
  writeGene,
  writeModelValue,
  type ParseResult,
  type SpeciesId,
} from '../genome';

// The editor state from spec section 5: the current code, the focused gene, locks, undo and redo.
// It holds no DOM; the gene map, inspector, code bar and (later) the helix all drive it through these
// commands and redraw from its change events. Every stored code is complete and has a correct
// checksum, so undo and redo restore exact codes.

export type EditCause =
  | 'gene'
  | 'base'
  | 'randomise-all'
  | 'randomise-gene'
  | 'wild-type'
  | 'species'
  | 'paste'
  | 'undo'
  | 'redo';

export interface CodeChange {
  type: 'code';
  code: string;
  previous: string;
  cause: EditCause;
}

/** Focus, locks, warnings and messages: things that change what is shown but not the code. */
export interface StateChange {
  type: 'state';
}

export type EditorChange = CodeChange | StateChange;

export interface EditorOptions {
  /** A complete code with a correct checksum. Defaults to the species A wild type. */
  code?: string;
  /** Random numbers in [0, 1) for randomise. Never used by the simulation. */
  random?: () => number;
  /** A typo warning that came with the starting code (clarification 11). */
  warning?: string;
}

export type Message = { tone: 'warning' | 'error'; text: string };

export class Editor {
  private current: string;
  private focused: number | null = null;
  private readonly locks: Record<SpeciesId, Set<number>> = { A: new Set(), B: new Set(), C: new Set(), D: new Set(), E: new Set(), F: new Set() };
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];
  private readonly listeners = new Set<(change: EditorChange) => void>();
  private readonly random: () => number;
  /** A run of edits with the same gesture (one slider drag) makes one undo step. */
  private gesture: string | null = null;
  private note: Message | null;

  constructor(options: EditorOptions = {}) {
    const code = options.code ?? wildType('A');
    if (speciesOfHeader(code) === null) throw new Error('Code has no valid species header');
    this.current = code;
    this.random = options.random ?? Math.random;
    this.note = options.warning ? { tone: 'warning', text: options.warning } : null;
  }

  get code(): string {
    return this.current;
  }

  get species(): SpeciesId {
    return speciesOfHeader(this.current) as SpeciesId;
  }

  /** Locus of the focused gene, or null. */
  get focus(): number | null {
    return this.focused;
  }

  /** Loci locked in the current species. */
  get locked(): ReadonlySet<number> {
    return this.locks[this.species];
  }

  /** A typo warning or a rejected paste. Cleared by the next edit. */
  get message(): Message | null {
    return this.note;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(listener: (change: EditorChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  focusGene(locus: number | null): void {
    if (locus !== null) geneAt(this.species, locus);
    if (locus === this.focused) return;
    this.focused = locus;
    this.emit({ type: 'state' });
  }

  isLocked(locus: number): boolean {
    return this.locked.has(locus);
  }

  /** Locks or unlocks a gene, so that randomise-all leaves it alone. Defaults to the focused gene. */
  toggleLock(locus: number | null = this.focused): void {
    if (locus === null) return;
    geneAt(this.species, locus);
    const set = this.locks[this.species];
    if (set.has(locus)) set.delete(locus);
    else set.add(locus);
    this.emit({ type: 'state' });
  }

  /**
   * Moves a slider: rewrites the gene's bases. Edits that share a gesture id with the edit before
   * them (one drag of a slider) are undone together.
   */
  setGene(locus: number, raw: number, gesture?: string): void {
    this.commit(writeGene(this.current, locus, raw), 'gene', gesture);
  }

  /** Sets a gene from a model value, as typed into the exact number field (clarification 6). */
  setModelValue(locus: number, model: number): void {
    if (!Number.isFinite(model)) return;
    this.commit(writeModelValue(this.current, locus, model), 'gene');
  }

  /** True when the base at a 1-based position may be edited (clarification 10). */
  static isEditable(position: number): boolean {
    return Number.isInteger(position) && position >= FIRST_GENE_POSITION && position <= CHECKSUM_START;
  }

  /**
   * Types a base at a 1-based position. Header and checksum bases cannot be edited; nor can anything
   * but A, C, G or T be typed. Returns whether the base was accepted.
   */
  setBase(position: number, base: string): boolean {
    const letter = base.toUpperCase();
    if (!Editor.isEditable(position) || !/^[ACGT]$/.test(letter)) return false;
    this.commit(writeBase(this.current, position, letter), 'base');
    return true;
  }

  /** Cycles a base through A, C, G, T. Returns whether the base could be edited. */
  cycleBase(position: number): boolean {
    if (!Editor.isEditable(position)) return false;
    return this.setBase(position, nextBase(this.current.charAt(position - 1)));
  }

  /** Gives every unlocked gene a new random value. Locked genes keep theirs. */
  randomiseAll(): void {
    let code = this.current;
    for (let locus = 1; locus <= GENE_COUNT; locus++) {
      if (!this.isLocked(locus)) code = writeGene(code, locus, this.freshValue(code, locus));
    }
    this.commit(code, 'randomise-all');
  }

  /** Gives one gene (by default the focused gene) a new random value. A locked gene is left alone. */
  randomiseGene(locus: number | null = this.focused): void {
    if (locus === null || this.isLocked(locus)) return;
    this.commit(writeGene(this.current, locus, this.freshValue(this.current, locus)), 'randomise-gene');
  }

  /** Resets to the wild type of the current species. */
  resetWildType(): void {
    this.commit(wildType(this.species), 'wild-type');
  }

  /** Switches species, which loads that species' wild type. */
  switchSpecies(species: SpeciesId): void {
    if (species === this.species) return;
    this.commit(wildType(species), 'species');
  }

  /**
   * Loads a pasted or linked code. A rejected code leaves everything as it was and sets an error
   * message; a code with a wrong checksum loads corrected, with a typo warning (clarification 11).
   */
  paste(input: string): ParseResult {
    const parsed = parseGenome(input);
    if (!parsed.ok) {
      this.note = { tone: 'error', text: parsed.message };
      this.emit({ type: 'state' });
      return parsed;
    }
    this.commit(parsed.code, 'paste', undefined, parsed.warning);
    return parsed;
  }

  undo(): void {
    const code = this.undoStack.pop();
    if (code === undefined) return;
    this.redoStack.push(this.current);
    this.replace(code, 'undo');
  }

  redo(): void {
    const code = this.redoStack.pop();
    if (code === undefined) return;
    this.undoStack.push(this.current);
    this.replace(code, 'redo');
  }

  /** A raw value for the gene, uniformly random among every value except the one it has now. */
  private freshValue(code: string, locus: number): number {
    const max = rawMax(geneAt(this.species, locus));
    const now = readGene(code, locus);
    const pick = Math.min(max - 1, Math.floor(this.random() * max));
    return pick >= now ? pick + 1 : pick;
  }

  private commit(code: string, cause: EditCause, gesture?: string, warning?: string): void {
    const merging = gesture !== undefined && gesture === this.gesture;
    const hadNote = this.note !== null;
    this.note = warning ? { tone: 'warning', text: warning } : null;
    if (code === this.current) {
      // Nothing to undo yet, so a later edit in the same gesture must still make an undo step.
      if (!merging) this.gesture = null;
      if (hadNote || warning) this.emit({ type: 'state' });
      return;
    }
    if (!merging) this.undoStack.push(this.current);
    this.gesture = gesture ?? null;
    this.redoStack.length = 0;
    this.replace(code, cause);
  }

  private replace(code: string, cause: EditCause): void {
    if (cause === 'undo' || cause === 'redo') {
      this.gesture = null;
      this.note = null;
    }
    const previous = this.current;
    this.current = code;
    this.emit({ type: 'code', code, previous, cause });
  }

  private emit(change: EditorChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
