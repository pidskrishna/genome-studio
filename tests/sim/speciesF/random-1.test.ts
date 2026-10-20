import { it } from 'vitest';
import { checkRandomGenomes } from './random';

// A quick sample of 40 random genomes. 1,000 and 10,000 run in npm run test:slow:f.
it('40 random genomes grow to maturity soundly', () => {
  checkRandomGenomes(161, 40);
}, 600_000);
