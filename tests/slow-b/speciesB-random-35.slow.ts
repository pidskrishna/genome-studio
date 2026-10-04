import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesB/random';

// 10,000 random genomes across all body plans, in forty files of 250 that run in parallel worker
// threads. Run with npm run test:slow:b.
it('250 random genomes grow to maturity soundly, with no degenerate triangle (part 36 of 40)', () => {
  checkRandomGenomes(20000 + 35, 250);
}, 7_200_000);
