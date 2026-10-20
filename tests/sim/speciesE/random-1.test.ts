import { it } from 'vitest';
import { checkRandomGenomes } from './random';

// A quick sample of 10 random genomes. The full 1,000 run in npm run test:slow:e (clarification 31).
it('10 random genomes grow to maturity soundly', () => {
  checkRandomGenomes(151, 10);
}, 600_000);
