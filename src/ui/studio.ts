import { formKey, parseGenome, speciesOfHeader, type SpeciesId } from '../genome';
import type { Organism, ViewMode } from '../render/stage';
import type { SimClient } from './sim-client';

// Connects a code to the simulation and the stage. A valid code starts a regrow, with the progress
// indicator showing until the organism is ready; a rejected code leaves the current organism in place.
// A newer code supersedes a regrow still in flight. `update` regrows only when the part of the code the
// simulation reads changes, so a pigment edit never starts a run (spec section 5).

export interface StageView {
  setOrganism(organism: Organism): void;
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
}

export type LoadOutcome =
  | { status: 'grown'; code: string; species: SpeciesId; hash: string }
  | { status: 'rejected'; message: string }
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
      return { status: 'unchanged' };
    }
    return this.grow(code);
  }

  /** Regrows the organism from a valid code. */
  private async grow(code: string): Promise<LoadOutcome> {
    const species = speciesOfHeader(code);
    if (species === null) throw new Error('Code has no valid species header');
    const key = formKey(code);
    this.target = code;
    this.targetKey = key;
    this.deps.progress.show(0);
    const onProgress = (f: number): void => this.deps.progress.show(f);
    const outcome =
      species === 'A'
        ? await this.deps.sim.run('speciesA', { code }, onProgress)
        : await this.deps.sim.run('speciesB', { code }, onProgress);
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
    this.code = this.target ?? code;
    this.species = species;
    this.hash = organism.geometry.hash;
    this.grownKey = key;
    return { status: 'grown', code: this.code, species, hash: this.hash };
  }

  setView(mode: ViewMode): void {
    this.view = mode;
    this.deps.stage.setView(mode);
  }
}
