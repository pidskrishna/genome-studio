import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesC/random';

// 10,000 random species C genomes, in forty files of 250. Run with npm run test:slow:c.
it('250 random genomes grow to maturity soundly (part 14 of 40)', () => {
  checkRandomGenomes(30000 + 13, 250);
}, 14_400_000);
