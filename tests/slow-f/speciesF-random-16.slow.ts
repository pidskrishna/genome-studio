import { it } from 'vitest';
import { checkRandomGenomes } from '../sim/speciesF/random';

// 10,000 random species F genomes, in twenty files of 500; the first two are the milestone 21 run
// of 1,000. Run with npm run test:slow:f.
it('500 random genomes grow to maturity soundly (part 17 of 20)', () => {
  checkRandomGenomes(60000 + 16, 500);
}, 3_600_000);
