import { expect } from 'vitest';
import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { STEP_CAP } from '../../../src/sim/speciesA/constants';
import { assertSound, grow } from './helpers';

/** Grows `count` random species A genomes from `seed` and checks each one is sound. */
export function checkRandomGenomes(seed: number, count: number): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const code = randomGenome('A', rand);
    const g = grow(code);
    assertSound(g, code);
    expect(g.stats.steps).toBeLessThanOrEqual(STEP_CAP);
  }
}
