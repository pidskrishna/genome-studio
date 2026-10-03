import type { JobTable } from './host';
import { probe } from './probe';
import { speciesA } from './speciesA';

/** Every job the worker can run. */
export const JOBS: JobTable = {
  probe,
  speciesA,
};
