import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesA/random';

// The slow script: 10,000 random genomes in ten files of 1,000. Run with npm run test:slow.
it('1,000 random genomes grow to maturity with no error and no NaN (part 10 of 10)', () => {
  checkRandomGenomes(9000 + 9, 1000);
}, 1_200_000);
