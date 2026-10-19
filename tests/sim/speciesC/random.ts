import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { ORGAN_CAP, VERTEX_CAP } from '../../../src/sim/speciesC/constants';
import { assertSound, grow } from './helpers';

/**
 * Grows `count` random species C genomes and checks each grows to maturity soundly: no NaN, every
 * triangle with area, and at most the organ and vertex caps.
 */
export function checkRandomGenomes(seed: number, count: number): void {
  const rand = mulberry32(seed);
  const failures: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomGenome('C', rand);
    try {
      const g = grow(code);
      assertSound(g, code);
      if (g.stats.vertices > VERTEX_CAP) throw new Error(`${code}: ${g.stats.vertices} vertices`);
      if (g.stats.organs > ORGAN_CAP) throw new Error(`${code}: ${g.stats.organs} organs`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(`${failures.length} of ${count} failed:\n${failures.join('\n')}`);
}
