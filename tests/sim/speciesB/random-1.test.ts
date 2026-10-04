import { it } from 'vitest';
import { checkRandomDiscGenomes } from './random';

// A quick sample: 24 random disc genomes in four files of 6. The full 1,000 run in npm run test:slow.
it('6 random disc genomes grow to maturity with no error and no NaN (part 1 of 4)', () => {
  checkRandomDiscGenomes(111, 6);
}, 300_000);
