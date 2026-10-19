import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesD/random';

// 1,000 random species D genomes, in ten files of 100. Run with npm run test:slow.
it('100 random genomes grow to maturity soundly (part 9 of 10)', () => {
  checkRandomGenomes(11000 + 8, 100);
}, 3_600_000);
