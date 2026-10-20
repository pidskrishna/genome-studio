import { wildType } from '../../src/genome';
import type { BranchGeometry } from '../../src/sim/speciesA';
import { BODY_PLANS, type BodyPlan } from '../../src/sim/speciesB/params';
import type { SheetGeometry } from '../../src/sim/speciesB';
import { grow as growA } from '../sim/speciesA/helpers';
import { grow as growB, withGenes } from '../sim/speciesB/helpers';
import type { PhylloGeometry } from '../../src/sim/speciesC';
import type { ShellGeometry } from '../../src/sim/speciesD';
import { grow as growC } from '../sim/speciesC/helpers';
import { grow as growD } from '../sim/speciesD/helpers';
import type { CoralGeometry } from '../../src/sim/speciesE';
import type { HyphaGeometry } from '../../src/sim/speciesF';
import { grow as growE } from '../sim/speciesE/helpers';
import { grow as growF } from '../sim/speciesF/helpers';

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

let c: PhylloGeometry | undefined;
let d: ShellGeometry | undefined;

export function wildC(): PhylloGeometry {
  return (c ??= growC(wildType('C')));
}

export function wildD(): ShellGeometry {
  return (d ??= growD(wildType('D')));
}

let e: CoralGeometry | undefined;
let f: HyphaGeometry | undefined;

export function wildE(): CoralGeometry {
  return (e ??= growE(wildType('E')));
}

export function wildF(): HyphaGeometry {
  return (f ??= growF(wildType('F')));
}
