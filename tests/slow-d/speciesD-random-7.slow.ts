import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesD/random';

// 10,000 random species D genomes, in twenty files of 500. Run with npm run test:slow:d.
it('500 random genomes grow to maturity soundly (part 8 of 20)', () => {
  checkRandomGenomes(40000 + 7, 500);
}, 3_600_000);
