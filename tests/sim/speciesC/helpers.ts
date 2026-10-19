import { writeModelValue } from '../../../src/genome';
import { growSpeciesC, type PhylloGeometry } from '../../../src/sim/speciesC';
import { speciesCParams, type SpeciesCParams } from '../../../src/sim/speciesC/params';
import { growPlane, type PlaneResult } from '../../../src/sim/speciesC/plane';
import { Rng } from '../../../src/sim/rng';

export function runToEnd<T>(gen: Generator<number, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

export function grow(code: string): PhylloGeometry {
  return runToEnd(growSpeciesC(speciesCParams(code)));
}

/** The organ arrangement alone, for parameters written directly. */
export function plane(p: SpeciesCParams): PlaneResult {
  return runToEnd(growPlane(p, new Rng(p.seed, 1)));
}

/** Sets genes by locus from model values. */
export function withGenes(code: string, genes: Record<number, number>): string {
  let out = code;
  for (const [locus, value] of Object.entries(genes)) out = writeModelValue(out, Number(locus), value);
  return out;
}

/** Angles between successive organs, folded into 0° to 180°, for the last `count` organs. */
export function divergences(r: PlaneResult, count: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(1, r.count - count); i < r.count; i++) {
    let d = ((r.angle[i]! - r.angle[i - 1]!) * 180) / Math.PI;
    d = ((d % 360) + 360) % 360;
    out.push(d > 180 ? 360 - d : d);
  }
  return out;
}

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Throws unless every number is finite, every index is in range and every triangle has area. */
export function assertSound(g: PhylloGeometry, label: string): void {
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
