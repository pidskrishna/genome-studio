// Messages between the main thread and the simulation worker.

import type { BranchGeometry, SpeciesAInput } from './speciesA';
import type { SheetGeometry, SpeciesBInput } from './speciesB';

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
  /** The coarse draft shown while a form gene is dragged (clarification 3). */
  speciesADraft: SpeciesAInput;
  speciesBDraft: SpeciesBInput;
}

/** Output of each job. */
export interface JobOutputs {
  probe: ProbeOutput;
  speciesA: BranchGeometry;
  speciesB: SheetGeometry;
  speciesADraft: BranchGeometry;
  speciesBDraft: SheetGeometry;
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
