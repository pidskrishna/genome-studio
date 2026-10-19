import { formKey, parseGenome, pigmentsOf, speciesOfHeader, type Pigments, type SpeciesId } from '../genome';
import type { Organism, ViewMode } from '../render/stage';
import type { SimClient } from './sim-client';

// Connects a code to the simulation and the stage. A valid code starts a regrow, with the progress
// indicator showing until the organism is ready; a rejected code leaves the current organism in place.
// A newer code supersedes a regrow still in flight. `update` regrows only when the part of the code the
// simulation reads changes, so a pigment edit never starts a run (spec section 5). Pigment genes go
// straight to the stage instead (spec section 8), so the picture changes at once.
//
// While a form gene's slider is dragged, `draft` grows a coarse draft of the same code instead
// (clarification 3). A draft is held under its own key, so the update on release always regrows the
// organism itself, and its hash is never taken for the organism's.

export interface StageView {
  setOrganism(organism: Organism): void;
  /** Applies the pigment and surface genes to the organism on the stage, without regrowing. */
  setPigments(pigments: Pigments): void;
  setView(mode: ViewMode): void;
}

export interface ProgressView {
  show(fraction: number): void;
  hide(): void;
}

export type NoticeTone = 'info' | 'warning' | 'error';

export interface StudioDeps {
  sim: Pick<SimClient, 'run'>;
  stage: StageView;
  progress: ProgressView;
  notice: (message: string, tone: NoticeTone) => void;
  /** Told whether the organism on the stage is a draft (true) or the organism itself (false). */
  drafted?: (isDraft: boolean) => void;
}

export type LoadOutcome =
  | { status: 'grown'; code: string; species: SpeciesId; hash: string }
  | { status: 'rejected'; message: string }
  | { status: 'drafted'; code: string; species: SpeciesId }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };

export type UpdateOutcome = LoadOutcome | { status: 'unchanged' };

export class Studio {
  /** The code of the organism on the stage. */
  code: string | null = null;
  species: SpeciesId | null = null;
  /** Geometry hash of the organism on the stage. */
  hash: string | null = null;
  view: ViewMode = '3d';
  /** The latest code asked for, and the form keys of the organism growing and the one on the stage. */
  private target: string | null = null;
  private targetKey: string | null = null;
  private grownKey: string | null = null;

  constructor(private readonly deps: StudioDeps) {}

  /** Parses a code and, if it is valid, regrows the organism from it. */
  async load(input: string): Promise<LoadOutcome> {
    const parsed = parseGenome(input);
    if (!parsed.ok) {
      this.deps.notice(parsed.message, 'error');
      return { status: 'rejected', message: parsed.message };
    }
    this.deps.notice(parsed.warning ?? '', parsed.warning ? 'warning' : 'info');
    return this.grow(parsed.code);
  }

  /**
   * Shows a valid code. Regrows only if its header, form genes or seed differ from the organism on the
   * stage (or the one growing); otherwise the code is recorded without a run.
   */
  async update(code: string): Promise<UpdateOutcome> {
    if (this.targetKey !== null && formKey(code) === this.targetKey) {
      this.target = code;
      if (this.targetKey === this.grownKey) this.code = code;
      this.deps.stage.setPigments(pigmentsOf(code));
      return { status: 'unchanged' };
    }
    return this.grow(code);
  }

  /**
   * Shows a coarse draft of a valid code while a slider is dragged. A code whose form genes and seed
   * match what is on the stage (or growing) only updates the pigments, as `update` does.
   */
  async draft(code: string): Promise<UpdateOutcome> {
    const key = formKey(code);
    if (this.targetKey !== null && (key === this.targetKey || draftKey(key) === this.targetKey)) {
      this.target = code;
      if (this.targetKey === this.grownKey) this.code = code;
      this.deps.stage.setPigments(pigmentsOf(code));
      return { status: 'unchanged' };
    }
    return this.grow(code, true);
  }

  /** Regrows the organism (or, for a draft, a coarse run of the same code) from a valid code. */
  private async grow(code: string, draft = false): Promise<LoadOutcome> {
    const species = speciesOfHeader(code);
    if (species === null) throw new Error('Code has no valid species header');
    const key = draft ? draftKey(formKey(code)) : formKey(code);
    this.target = code;
    this.targetKey = key;
    this.deps.progress.show(0);
    const onProgress = (f: number): void => this.deps.progress.show(f);
    const outcome =
      species === 'A'
        ? await this.deps.sim.run(draft ? 'speciesADraft' : 'speciesA', { code }, onProgress)
        : await this.deps.sim.run(draft ? 'speciesBDraft' : 'speciesB', { code }, onProgress);
    // A superseded run leaves the indicator to the run that replaced it.
    if (outcome.status === 'superseded') return { status: 'superseded' };
    this.deps.progress.hide();
    if (outcome.status === 'failed') {
      this.targetKey = this.grownKey;
      const message = `The organism could not be grown: ${outcome.message}`;
      this.deps.notice(message, 'error');
      return { status: 'failed', message };
    }
    const organism: Organism =
      species === 'A'
        ? { species, geometry: outcome.output as Extract<Organism, { species: 'A' }>['geometry'] }
        : { species, geometry: outcome.output as Extract<Organism, { species: 'B' }>['geometry'] };
    this.deps.stage.setOrganism(organism);
    // Pigment edits made while this run was growing share its form key; keep the latest.
    const shown = this.target ?? code;
    this.deps.stage.setPigments(pigmentsOf(shown));
    this.grownKey = key;
    this.deps.drafted?.(draft);
    if (draft) return { status: 'drafted', code: shown, species };
    this.code = shown;
    this.species = species;
    this.hash = organism.geometry.hash;
    return { status: 'grown', code: this.code, species, hash: this.hash };
  }

  setView(mode: ViewMode): void {
    this.view = mode;
    this.deps.stage.setView(mode);
  }
}

/** The key a draft is held under: never equal to any organism's form key. */
function draftKey(key: string): string {
  return `draft:${key}`;
}
