import { writeModelValue } from '../../../src/genome';
import { growSpeciesF, type HyphaGeometry } from '../../../src/sim/speciesF';
import { speciesFParams, type SpeciesFParams } from '../../../src/sim/speciesF/params';

export function runToEnd<T>(gen: Generator<number, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

export function grow(code: string): HyphaGeometry {
  return runToEnd(growSpeciesF(speciesFParams(code)));
}

export function growParams(p: SpeciesFParams): HyphaGeometry {
  return runToEnd(growSpeciesF(p));
}

/** Sets genes by locus from model values. */
export function withGenes(code: string, genes: Record<number, number>): string {
  let out = code;
  for (const [locus, value] of Object.entries(genes)) out = writeModelValue(out, Number(locus), value);
  return out;
}

/** Throws unless every number is finite, parents come before children, and every node has a radius. */
export function assertSound(g: HyphaGeometry, label: string): void {
  const n = g.positions.length / 3;
  if (n === 0) throw new Error(`${label}: no nodes`);
  if (g.parents.length !== n || g.radii.length !== n || g.drivers.length !== n * 4) throw new Error(`${label}: array lengths`);
  for (const [name, arr] of [['positions', g.positions], ['radii', g.radii], ['drivers', g.drivers]] as const) {
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`${label}: ${name}[${i}] is ${arr[i]}`);
  }
  if (g.parents[0] !== -1) throw new Error(`${label}: the first node is not the start`);
  for (let v = 1; v < n; v++) {
    const u = g.parents[v]!;
    if (u < 0 || u >= v) throw new Error(`${label}: node ${v} has parent ${u}`);
    if (!(g.radii[v]! > 0)) throw new Error(`${label}: radius ${g.radii[v]}`);
  }
}

/** The radius from the vertical axis at the 90th percentile, of the nodes laid down in one phase. */
export function phaseRadius(g: HyphaGeometry, phase: number, fraction = 0.9): number {
  const radii: number[] = [];
  for (let v = 0; v < g.positions.length / 3; v++) {
    if (g.drivers[v * 4 + 2] !== phase) continue;
    radii.push(Math.hypot(g.positions[v * 3]!, g.positions[v * 3 + 2]!));
  }
  radii.sort((a, b) => a - b);
  return radii[Math.floor(fraction * (radii.length - 1))] ?? 0;
}
