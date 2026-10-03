import { growSpeciesA, type BranchGeometry } from '../../../src/sim/speciesA';
import { speciesAParams, type SpeciesAParams } from '../../../src/sim/speciesA/params';
import { writeModelValue } from '../../../src/genome';

export function runToEnd<T>(gen: Generator<number, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

export function grow(code: string): BranchGeometry {
  return runToEnd(growSpeciesA(speciesAParams(code)));
}

export function growParams(params: SpeciesAParams): BranchGeometry {
  return runToEnd(growSpeciesA(params));
}

/** Sets genes by locus from model values. */
export function withGenes(code: string, genes: Record<number, number>): string {
  let out = code;
  for (const [locus, value] of Object.entries(genes)) out = writeModelValue(out, Number(locus), value);
  return out;
}

/** Throws unless every number in the geometry is finite and the structure is sound. */
export function assertSound(g: BranchGeometry, label: string): void {
  const n = g.parents.length;
  if (n === 0) throw new Error(`${label}: no nodes`);
  if (g.positions.length !== n * 3 || g.radii.length !== n || g.drivers.length !== n * 4) {
    throw new Error(`${label}: array lengths do not match`);
  }
  for (const [name, arr] of [['positions', g.positions], ['radii', g.radii], ['drivers', g.drivers]] as const) {
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) throw new Error(`${label}: ${name}[${i}] is ${arr[i]}`);
    }
  }
  for (let v = 0; v < n; v++) {
    const p = g.parents[v] as number;
    if (p >= v || p < -1) throw new Error(`${label}: node ${v} has parent ${p}`);
    if (!((g.radii[v] as number) > 0)) throw new Error(`${label}: radius ${g.radii[v]} at ${v}`);
  }
}
