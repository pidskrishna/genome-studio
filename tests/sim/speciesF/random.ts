import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { SEGMENT_CAP, TIP_CAP, VERTEX_CAP } from '../../../src/sim/speciesF/constants';
import { assertSound, grow } from './helpers';

/** Grows `count` random species F genomes and checks each is sound and inside the caps. */
export function checkRandomGenomes(seed: number, count: number): void {
  const rand = mulberry32(seed);
  const failures: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomGenome('F', rand);
    try {
      const g = grow(code);
      assertSound(g, code);
      const s = g.stats;
      if (s.segments > SEGMENT_CAP || s.tips > TIP_CAP || s.drawnVertices > VERTEX_CAP) throw new Error(`${code}: over a cap ${JSON.stringify(s)}`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(`${failures.length} of ${count} failed:\n${failures.join('\n')}`);
}
