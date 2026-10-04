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

export interface Topology {
  vertices: number;
  edges: number;
  faces: number;
  /** V − E + F: 1 for a disc, 0 for a ring or tube, 2 for a closed sphere. */
  euler: number;
  /** Edges on one triangle only. */
  boundaryEdges: number;
  /** Separate closed loops of boundary edges. */
  boundaryLoops: number;
  /** Edges on more than two triangles. */
  nonManifoldEdges: number;
  /** Interior edges whose two triangles run the same way along them (inconsistent orientation). */
  misoriented: number;
}

/** Topology of a triangle list over n vertices. */
export function topology(triangles: ArrayLike<number>, n: number): Topology {
  const uses = new Map<number, number>();
  const directed = new Map<number, number>();
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k]!;
      const b = triangles[t + ((k + 1) % 3)]!;
      const key = Math.min(a, b) * 65536 + Math.max(a, b);
      uses.set(key, (uses.get(key) ?? 0) + 1);
      const dkey = a * 65536 + b;
      directed.set(dkey, (directed.get(dkey) ?? 0) + 1);
    }
  }
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let misoriented = 0;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const onBoundary = new Set<number>();
  for (const [key, count] of uses) {
    const a = Math.floor(key / 65536);
    const b = key % 65536;
    if (count === 1) {
      boundaryEdges++;
      onBoundary.add(a);
      onBoundary.add(b);
      parent[find(a)] = find(b);
    } else if (count > 2) nonManifoldEdges++;
    if (count === 2 && ((directed.get(a * 65536 + b) ?? 0) !== 1 || (directed.get(b * 65536 + a) ?? 0) !== 1)) misoriented++;
  }
  const roots = new Set<number>();
  for (const v of onBoundary) roots.add(find(v));
  const faces = triangles.length / 3;
  return { vertices: n, edges: uses.size, faces, euler: n - uses.size + faces, boundaryEdges, boundaryLoops: roots.size, nonManifoldEdges, misoriented };
}

/** Expected topology of each body plan: Euler characteristic and number of boundary loops. */
export const PLAN_TOPOLOGY = {
  disc: { euler: 1, boundaryLoops: 1 },
  ring: { euler: 0, boundaryLoops: 2 },
  tube: { euler: 0, boundaryLoops: 2 },
  sphere: { euler: 2, boundaryLoops: 0 },
} as const;

/** Smallest angle (degrees) and smallest area over all triangles, from the current positions. */
export function triangleQuality(g: SheetGeometry): { minAngle: number; minArea: number } {
  const P = g.positions;
  let minAngle = 180;
  let minArea = Infinity;
  for (let t = 0; t < g.triangles.length; t += 3) {
    const v = [g.triangles[t]!, g.triangles[t + 1]!, g.triangles[t + 2]!];
    const d = (a: number, b: number) => Math.hypot(P[a * 3]! - P[b * 3]!, P[a * 3 + 1]! - P[b * 3 + 1]!, P[a * 3 + 2]! - P[b * 3 + 2]!);
    const L = [d(v[0]!, v[1]!), d(v[1]!, v[2]!), d(v[2]!, v[0]!)];
    for (let k = 0; k < 3; k++) {
      const a = L[k]!;
      const b = L[(k + 1) % 3]!;
      const c = L[(k + 2) % 3]!;
      const cos = (a * a + b * b - c * c) / (2 * a * b);
      minAngle = Math.min(minAngle, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
    }
    const s = (L[0]! + L[1]! + L[2]!) / 2;
    minArea = Math.min(minArea, Math.sqrt(Math.max(0, s * (s - L[0]!) * (s - L[1]!) * (s - L[2]!))));
  }
  return { minAngle, minArea };
}

/** The stated threshold: no triangle at maturity has an angle below this many degrees. */
export const MIN_TRIANGLE_ANGLE = 0.5;
