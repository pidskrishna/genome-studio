import { expect } from 'vitest';
import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { STEP_CAP } from '../../../src/sim/speciesA/constants';
import { assertSound, grow } from './helpers';

/** Grows `count` random species A genomes from `seed` and checks each one is sound and branches. */
export function checkRandomGenomes(seed: number, count: number): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const code = randomGenome('A', rand);
    const g = grow(code);
    assertSound(g, code);
    expect(g.stats.steps).toBeLessThanOrEqual(STEP_CAP);
    // Every genome grows an organism, not a bare stem: at least one node has two or more children.
    const children = new Int32Array(g.parents.length);
    for (const p of g.parents) if (p >= 0) children[p] = (children[p] as number) + 1;
    if (!children.some((c) => c >= 2)) throw new Error(`${code}: grew a bare stem (${g.stats.stopReason})`);
  }
}
