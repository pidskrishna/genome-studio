import { it } from 'vitest';
import { checkRandomGenomes } from './random';

// A quick sample of 20 random genomes. The full 1,000 run in npm run test:slow.
it('20 random genomes grow to maturity soundly', () => {
  checkRandomGenomes(141, 20);
}, 600_000);
