import { speciesADraft, speciesBDraft, speciesCDraft } from './draft';
import type { JobTable } from './host';
import { probe } from './probe';
import { speciesA } from './speciesA';
import { speciesB } from './speciesB';
import { speciesC } from './speciesC';

/** Every job the worker can run. */
export const JOBS: JobTable = {
  probe,
  speciesA,
  speciesB,
  speciesC,
  speciesADraft,
  speciesBDraft,
  speciesCDraft,
};
