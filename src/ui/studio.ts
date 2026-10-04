import { parseGenome, type SpeciesId } from '../genome';
import type { Organism, ViewMode } from '../render/stage';
import type { SimClient } from './sim-client';

// Connects a pasted code to the simulation and the stage. A valid code starts a regrow, with the
// progress indicator showing until the organism is ready; a rejected code leaves the current organism
// in place. A newer code supersedes a regrow still in flight.

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

export class Studio {
  /** The code of the organism on the stage. */
  code: string | null = null;
  species: SpeciesId | null = null;
  /** Geometry hash of the organism on the stage. */
  hash: string | null = null;
  view: ViewMode = '3d';

  constructor(private readonly deps: StudioDeps) {}

  /** Parses a code and, if it is valid, regrows the organism from it. */
  async load(input: string): Promise<LoadOutcome> {
    const parsed = parseGenome(input);
    if (!parsed.ok) {
      this.deps.notice(parsed.message, 'error');
      return { status: 'rejected', message: parsed.message };
    }
    const { code, species } = parsed;
    this.deps.notice(parsed.warning ?? '', parsed.warning ? 'warning' : 'info');
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
      const message = `The organism could not be grown: ${outcome.message}`;
      this.deps.notice(message, 'error');
      return { status: 'failed', message };
    }
    const organism: Organism =
      species === 'A'
        ? { species, geometry: outcome.output as Extract<Organism, { species: 'A' }>['geometry'] }
        : { species, geometry: outcome.output as Extract<Organism, { species: 'B' }>['geometry'] };
    this.deps.stage.setOrganism(organism);
    this.code = code;
    this.species = species;
    this.hash = organism.geometry.hash;
    return { status: 'grown', code, species, hash: this.hash };
  }

  setView(mode: ViewMode): void {
    this.view = mode;
    this.deps.stage.setView(mode);
  }
}
