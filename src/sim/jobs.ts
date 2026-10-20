import { speciesADraft, speciesBDraft, speciesCDraft, speciesDDraft, speciesEDraft, speciesFDraft } from './draft';
import type { JobTable } from './host';
import { probe } from './probe';
import { speciesA } from './speciesA';
import { speciesB } from './speciesB';
import { speciesC } from './speciesC';
import { speciesD } from './speciesD';
import { speciesE } from './speciesE';
import { speciesF } from './speciesF';

/** Every job the worker can run. */
export const JOBS: JobTable = {
  probe,
  speciesA,
  speciesB,
  speciesC,
  speciesD,
  speciesE,
  speciesF,
  speciesADraft,
  speciesBDraft,
  speciesCDraft,
  speciesDDraft,
  speciesEDraft,
  speciesFDraft,
};
