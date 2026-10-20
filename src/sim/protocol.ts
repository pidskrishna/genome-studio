// Messages between the main thread and the simulation worker.

import type { BranchGeometry, SpeciesAInput } from './speciesA';
import type { SheetGeometry, SpeciesBInput } from './speciesB';
import type { PhylloGeometry, SpeciesCInput } from './speciesC';
import type { ShellGeometry, SpeciesDInput } from './speciesD';
import type { CoralGeometry, SpeciesEInput } from './speciesE';
import type { HyphaGeometry, SpeciesFInput } from './speciesF';

export interface ProbeInput {
  /** Seed for the generator. */
  seed: number;
  /** Number of steps; each step is one progress point. */
  steps: number;
}

export interface ProbeOutput {
  hash: string;
}

/** Input of each job the worker can run. */
export interface JobInputs {
  probe: ProbeInput;
  speciesA: SpeciesAInput;
  speciesB: SpeciesBInput;
  speciesC: SpeciesCInput;
  speciesD: SpeciesDInput;
  speciesE: SpeciesEInput;
  speciesF: SpeciesFInput;
  /** The coarse draft shown while a form gene is dragged (clarification 3). */
  speciesADraft: SpeciesAInput;
  speciesBDraft: SpeciesBInput;
  speciesCDraft: SpeciesCInput;
  speciesDDraft: SpeciesDInput;
  speciesEDraft: SpeciesEInput;
  speciesFDraft: SpeciesFInput;
}

/** Output of each job. */
export interface JobOutputs {
  probe: ProbeOutput;
  speciesA: BranchGeometry;
  speciesB: SheetGeometry;
  speciesC: PhylloGeometry;
  speciesD: ShellGeometry;
  speciesE: CoralGeometry;
  speciesF: HyphaGeometry;
  speciesADraft: BranchGeometry;
  speciesBDraft: SheetGeometry;
  speciesCDraft: PhylloGeometry;
  speciesDDraft: ShellGeometry;
  speciesEDraft: CoralGeometry;
  speciesFDraft: HyphaGeometry;
}

export type JobKind = keyof JobInputs;

export type JobRequest = { [K in JobKind]: { kind: K; input: JobInputs[K] } }[JobKind];

export type ToWorker =
  | { type: 'run'; runId: number; job: JobRequest }
  | { type: 'cancel'; runId: number };

export type FromWorker =
  | { type: 'progress'; runId: number; fraction: number }
  | { type: 'result'; runId: number; kind: JobKind; output: JobOutputs[JobKind] }
  | { type: 'cancelled'; runId: number }
  | { type: 'error'; runId: number; message: string };
