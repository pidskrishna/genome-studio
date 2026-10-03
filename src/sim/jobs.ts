import type { JobTable } from './host';
import { probe } from './probe';

/** Every job the worker can run. */
export const JOBS: JobTable = {
  probe,
};
