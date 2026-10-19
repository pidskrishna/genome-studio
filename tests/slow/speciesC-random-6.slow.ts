import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesC/random';

// 1,000 random species C genomes, in ten files of 100. Run with npm run test:slow.
it('100 random genomes grow to maturity soundly (part 7 of 10)', () => {
  checkRandomGenomes(9000 + 6, 100);
}, 7_200_000);
