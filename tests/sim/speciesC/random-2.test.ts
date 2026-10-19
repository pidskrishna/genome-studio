import { it } from 'vitest';
import { checkRandomGenomes } from './random';

// A quick sample: 4 random genomes in two files of 2. The full 1,000 run in npm run test:slow.
it('2 random genomes grow to maturity soundly (part 2 of 2)', () => {
  checkRandomGenomes(231, 2);
}, 600_000);
