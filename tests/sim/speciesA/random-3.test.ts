import { it } from 'vitest';
import { checkRandomGenomes } from './random';

// 1,000 random genomes in four files of 250, so they run in parallel.
it('250 random genomes grow to maturity with no error and no NaN (part 3 of 4)', () => {
  checkRandomGenomes(303, 250);
}, 120_000);
