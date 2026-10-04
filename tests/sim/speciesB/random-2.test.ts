import { it } from 'vitest';
import { checkRandomGenomes } from './random';

// A quick sample: 24 random genomes across all body plans in four files of 6. The full 1,000 run
// in npm run test:slow, and 10,000 in npm run test:slow:b.
it('6 random genomes grow to maturity soundly, with no degenerate triangle (part 2 of 4)', () => {
  checkRandomGenomes(212, 6);
}, 600_000);
