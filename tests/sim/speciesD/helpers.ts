import { writeModelValue } from '../../../src/genome';
import { growSpeciesD, type ShellGeometry } from '../../../src/sim/speciesD';
import { speciesDParams, type SpeciesDParams } from '../../../src/sim/speciesD/params';

export function runToEnd<T>(gen: Generator<number, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

export function grow(code: string): ShellGeometry {
  return runToEnd(growSpeciesD(speciesDParams(code)));
}

export function growParams(p: SpeciesDParams): ShellGeometry {
  return runToEnd(growSpeciesD(p));
}

/** Sets genes by locus from model values. */
export function withGenes(code: string, genes: Record<number, number>): string {
  let out = code;
  for (const [locus, value] of Object.entries(genes)) out = writeModelValue(out, Number(locus), value);
  return out;
}

/** Throws unless every number is finite, every index is in range and every triangle has area. */
export function assertSound(g: ShellGeometry, label: string): void {
  const n = g.positions.length / 3;
  if (n === 0 || g.triangles.length === 0) throw new Error(`${label}: empty mesh`);
  if (g.drivers.length !== n * 4) throw new Error(`${label}: drivers length`);
  for (const [name, arr] of [['positions', g.positions], ['drivers', g.drivers]] as const) {
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`${label}: ${name}[${i}] is ${arr[i]}`);
  }
  if (!(g.drawnThickness > 0) || !Number.isFinite(g.drawnThickness)) throw new Error(`${label}: drawn thickness ${g.drawnThickness}`);
  const p = g.positions;
  for (let t = 0; t < g.triangles.length; t += 3) {
    const a = g.triangles[t]!;
    const b = g.triangles[t + 1]!;
    const c = g.triangles[t + 2]!;
    for (const v of [a, b, c]) if (v < 0 || v >= n) throw new Error(`${label}: triangle index ${v}`);
    const ux = p[b * 3]! - p[a * 3]!;
    const uy = p[b * 3 + 1]! - p[a * 3 + 1]!;
    const uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
    const vx = p[c * 3]! - p[a * 3]!;
    const vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
    const vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    if (!(cx * cx + cy * cy + cz * cz > 0)) throw new Error(`${label}: triangle ${t / 3} has zero area`);
  }
}
