import { speciesADraft, speciesBDraft } from './draft';
import type { JobTable } from './host';
import { probe } from './probe';
import { speciesA } from './speciesA';
import { speciesB } from './speciesB';

/** Every job the worker can run. */
export const JOBS: JobTable = {
  probe,
  speciesA,
  speciesB,
  speciesADraft,
  speciesBDraft,
};
