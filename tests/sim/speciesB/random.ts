import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { VERTEX_CAP } from '../../../src/sim/speciesB/constants';
import { speciesBParams } from '../../../src/sim/speciesB/params';
import { assertSound, grow, MIN_TRIANGLE_ANGLE, PLAN_TOPOLOGY, topology, triangleQuality, withGenes } from './helpers';

/**
 * Grows `count` random species B genomes (all body plans, or one if `plan` is given) and checks
 * each grows to maturity soundly: no NaN, at most the vertex cap, the body plan's topology kept (the
 * closed sphere stays closed), and no degenerate triangle.
 */
export function checkRandomGenomes(seed: number, count: number, plan?: number): void {
  const rand = mulberry32(seed);
  const failures: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      checkOne();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length > 0) throw new Error(`${failures.length} of ${count} failed:\n${failures.join('\n')}`);

  function checkOne(): void {
    let code = randomGenome('B', rand);
    if (plan !== undefined) code = withGenes(code, { 1: plan });
    const g = grow(code);
    assertSound(g, code);
    const fail = (what: string) => {
      throw new Error(`${code}: ${what}`);
    };
    if (g.stats.vertices > VERTEX_CAP) fail(`${g.stats.vertices} vertices`);
    if (g.stats.stopReason !== 'area-multiple' && g.stats.stopReason !== 'vertex-cap') fail(`stopped by ${g.stats.stopReason}`);
    const expected = PLAN_TOPOLOGY[speciesBParams(code).bodyPlan];
    const top = topology(g.triangles, g.positions.length / 3);
    if (top.euler !== expected.euler || top.boundaryLoops !== expected.boundaryLoops) fail(`topology ${JSON.stringify(top)}`);
    if (top.nonManifoldEdges !== 0 || top.misoriented !== 0) fail(`mesh ${JSON.stringify(top)}`);
    const q = triangleQuality(g);
    if (!(q.minAngle > MIN_TRIANGLE_ANGLE)) fail(`smallest triangle angle ${q.minAngle}°`);
    if (!(q.minArea > 0)) fail(`a triangle has zero area`);
  }
}
