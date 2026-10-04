import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesB/random';

// 1,000 random genomes across all body plans, in ten files of 100. Run with npm run test:slow.
it('100 random genomes grow to maturity soundly, with no degenerate triangle (part 10 of 10)', () => {
  checkRandomGenomes(7000 + 9, 100);
}, 3_600_000);
