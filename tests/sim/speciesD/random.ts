import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { VERTEX_CAP } from '../../../src/sim/speciesD/constants';
import { assertSound, grow } from './helpers';

/** Grows `count` random species D genomes and checks each is sound and inside the vertex cap. */
export function checkRandomGenomes(seed: number, count: number): void {
  const rand = mulberry32(seed);
  const failures: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomGenome('D', rand);
    try {
      const g = grow(code);
      assertSound(g, code);
      if (g.stats.vertices > VERTEX_CAP) throw new Error(`${code}: ${g.stats.vertices} vertices`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(`${failures.length} of ${count} failed:\n${failures.join('\n')}`);
}
