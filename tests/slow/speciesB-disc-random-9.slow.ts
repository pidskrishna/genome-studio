import { it } from 'vitest';
import { checkRandomDiscGenomes } from '../sim/speciesB/random';

// 1,000 random disc genomes in ten files of 100. Run with npm run test:slow.
it('100 random disc genomes grow to maturity with no error and no NaN (part 10 of 10)', () => {
  checkRandomDiscGenomes(7000 + 9, 100);
}, 3_600_000);
