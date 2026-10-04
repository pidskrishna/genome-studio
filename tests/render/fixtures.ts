import { wildType } from '../../src/genome';
import type { BranchGeometry } from '../../src/sim/speciesA';
import { BODY_PLANS, type BodyPlan } from '../../src/sim/speciesB/params';
import type { SheetGeometry } from '../../src/sim/speciesB';
import { grow as growA } from '../sim/speciesA/helpers';
import { grow as growB, withGenes } from '../sim/speciesB/helpers';

// Grown organisms shared by the render tests, each grown once per test file.

let a: BranchGeometry | undefined;
const b = new Map<BodyPlan, SheetGeometry>();

export function wildA(): BranchGeometry {
  return (a ??= growA(wildType('A')));
}

/** The species B wild type with its body plan set to `plan`. */
export function wildB(plan: BodyPlan = 'disc'): SheetGeometry {
  let g = b.get(plan);
  if (!g) {
    g = growB(withGenes(wildType('B'), { 1: BODY_PLANS.indexOf(plan) }));
    b.set(plan, g);
  }
  return g;
}
