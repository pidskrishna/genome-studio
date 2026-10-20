import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesE/random';

// 1,000 random species E genomes, in eight files of 125 (clarification 31: no 10,000 run for E).
// Run with npm run test:slow:e.
it('125 random genomes grow to maturity soundly (part 4 of 8)', () => {
  checkRandomGenomes(50000 + 3, 125);
}, 3_600_000);
