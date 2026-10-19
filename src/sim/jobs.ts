import { speciesADraft, speciesBDraft, speciesCDraft, speciesDDraft } from './draft';
import type { JobTable } from './host';
import { probe } from './probe';
import { speciesA } from './speciesA';
import { speciesB } from './speciesB';
import { speciesC } from './speciesC';
import { speciesD } from './speciesD';

/** Every job the worker can run. */
export const JOBS: JobTable = {
  probe,
  speciesA,
  speciesB,
  speciesC,
  speciesD,
  speciesADraft,
  speciesBDraft,
  speciesCDraft,
  speciesDDraft,
};
