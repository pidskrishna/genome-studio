import { writeModelValue } from '../../../src/genome';
import { growSpeciesB, type SheetGeometry } from '../../../src/sim/speciesB';
import { speciesBParams } from '../../../src/sim/speciesB/params';

export function runToEnd<T>(gen: Generator<number, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

export function grow(code: string): SheetGeometry {
  return runToEnd(growSpeciesB(speciesBParams(code)));
}

/** Sets genes by locus from model values. */
export function withGenes(code: string, genes: Record<number, number>): string {
  let out = code;
  for (const [locus, value] of Object.entries(genes)) out = writeModelValue(out, Number(locus), value);
  return out;
}

/** Largest distance from the mean height, over the radius of a disc with the same area. */
export function outOfPlane(g: SheetGeometry): number {
  const n = g.positions.length / 3;
  let mean = 0;
  for (let v = 0; v < n; v++) mean += g.positions[v * 3 + 1]!;
  mean /= n;
  let worst = 0;
  for (let v = 0; v < n; v++) worst = Math.max(worst, Math.abs(g.positions[v * 3 + 1]! - mean));
  let area = 0;
  for (let t = 0; t < g.triangles.length; t += 3) {
    const [a, b, c] = [g.triangles[t]!, g.triangles[t + 1]!, g.triangles[t + 2]!];
    const ux = g.positions[b * 3]! - g.positions[a * 3]!;
    const uy = g.positions[b * 3 + 1]! - g.positions[a * 3 + 1]!;
    const uz = g.positions[b * 3 + 2]! - g.positions[a * 3 + 2]!;
    const vx = g.positions[c * 3]! - g.positions[a * 3]!;
    const vy = g.positions[c * 3 + 1]! - g.positions[a * 3 + 1]!;
    const vz = g.positions[c * 3 + 2]! - g.positions[a * 3 + 2]!;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    area += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
  }
  return worst / Math.sqrt(area / Math.PI);
}

/** Throws unless every number is finite and the structure is sound. */
export function assertSound(g: SheetGeometry, label: string): void {
  const n = g.positions.length / 3;
  if (n === 0 || g.triangles.length === 0) throw new Error(`${label}: empty mesh`);
  if (g.drivers.length !== n * 4) throw new Error(`${label}: drivers length`);
  for (const [name, arr] of [['positions', g.positions], ['drivers', g.drivers]] as const) {
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) throw new Error(`${label}: ${name}[${i}] is ${arr[i]}`);
  }
  for (let i = 0; i < g.triangles.length; i++) {
    const v = g.triangles[i]!;
    if (v < 0 || v >= n) throw new Error(`${label}: triangle index ${v}`);
  }
}
