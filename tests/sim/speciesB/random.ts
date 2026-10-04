import { expect } from 'vitest';
import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { VERTEX_CAP } from '../../../src/sim/speciesB/constants';
import { assertSound, grow, withGenes } from './helpers';

/** Grows `count` random genomes with the disc body plan and checks each one is sound. */
export function checkRandomDiscGenomes(seed: number, count: number): void {
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const code = withGenes(randomGenome('B', rand), { 1: 0 });
    const g = grow(code);
    assertSound(g, code);
    expect(g.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
    expect(['area-multiple', 'vertex-cap']).toContain(g.stats.stopReason);
  }
}
