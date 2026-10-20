import { cos, PI, sin } from '../dmath';
import { Rng } from '../rng';
import { FUSE_FACTOR, SPLIT_FACTOR, SPLIT_PASSES, START_JITTER } from './constants';
import { CoralMesh } from './mesh';
import type { SpeciesEParams } from './params';

// The starting objects of species E (locus 1), each a closed mesh with edges near the polyp spacing,
// standing on the floor at the centre of the growth space. Kaandorp et al. and Merks et al. start
// from a small sphere; the four forms here are designed. Each is jittered slightly from the seed
// (stream 2), so that the colony is not perfectly symmetric.

/** A unit icosphere, subdivided `level` times. */
function icosphere(level: number): { positions: number[]; triangles: number[] } {
  const g = (1 + Math.sqrt(5)) / 2;
  const positions = [-1, g, 0, 1, g, 0, -1, -g, 0, 1, -g, 0, 0, -1, g, 0, 1, g, 0, -1, -g, 0, 1, -g, g, 0, -1, g, 0, 1, -g, 0, -1, -g, 0, 1];
  let triangles = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  const normalise = (v: number) => {
    const len = Math.sqrt(positions[v * 3]! ** 2 + positions[v * 3 + 1]! ** 2 + positions[v * 3 + 2]! ** 2);
    for (let d = 0; d < 3; d++) positions[v * 3 + d] = positions[v * 3 + d]! / len;
  };
  for (let v = 0; v < 12; v++) normalise(v);
  for (let l = 0; l < level; l++) {
    const midpoints = new Map<number, number>();
    const span = 1 << 20;
    const mid = (a: number, b: number) => {
      const key = a < b ? a * span + b : b * span + a;
      const known = midpoints.get(key);
      if (known !== undefined) return known;
      const v = positions.length / 3;
      for (let d = 0; d < 3; d++) positions.push((positions[a * 3 + d]! + positions[b * 3 + d]!) / 2);
      normalise(v);
      midpoints.set(key, v);
      return v;
    };
    const next: number[] = [];
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t]!;
      const b = triangles[t + 1]!;
      const c = triangles[t + 2]!;
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    triangles = next;
  }
  return { positions, triangles };
}

/** A torus lying flat, of major radius `major` and minor radius `minor`, about the origin. */
function torus(major: number, minor: number, spacing: number): { positions: number[]; triangles: number[] } {
  const nu = Math.max(8, -Math.floor((-2 * PI * major) / spacing));
  const nv = Math.max(6, -Math.floor((-2 * PI * minor) / spacing));
  const positions: number[] = [];
  const triangles: number[] = [];
  for (let i = 0; i < nu; i++) {
    const u = (2 * PI * i) / nu;
    for (let j = 0; j < nv; j++) {
      const v = (2 * PI * j) / nv;
      const r = major + minor * cos(v);
      positions.push(r * cos(u), minor * sin(v), r * sin(u));
    }
  }
  const at = (i: number, j: number) => (i % nu) * nv + (j % nv);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      triangles.push(a, c, b, a, d, c);
    }
  }
  return { positions, triangles };
}

/** Six times the signed volume enclosed, positive when triangles face outward. */
function signedVolume(p: number[], t: number[]): number {
  let sum = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k]! * 3;
    const b = t[k + 1]! * 3;
    const c = t[k + 2]! * 3;
    sum += p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  }
  return sum;
}

/** The starting colony for locus 1 and the starting size, centred in a growth space of n l.u. */
export function startingMesh(p: SpeciesEParams, n: number): CoralMesh {
  const r = p.startingSize;
  const spacing = p.polypSpacing;
  let shape: { positions: number[]; triangles: number[] };
  // Semi-axes of the ellipsoid forms, and the height of their centre above the floor.
  let axes: [number, number, number] = [r, r, r];
  let lift = 0.5 * r;
  if (p.startingForm === 2) {
    shape = torus(2 * r, 0.5 * r, spacing);
    axes = [1, 1, 1];
    lift = 0.25 * r;
  } else {
    if (p.startingForm === 1) axes = [2.5 * r, r, r];
    if (p.startingForm === 3) {
      axes = [2 * r, 0.35 * r, 2 * r];
      lift = 0;
    }
    // Subdivide until the sphere's edges (about 1.05 × its radius at level 0) are below the spacing.
    let level = 0;
    while (level < 6 && (1.05 * r) / (1 << level) > spacing) level++;
    shape = icosphere(level);
  }
  const jitter = new Rng(p.seed, 2);
  const mesh = new CoralMesh();
  const centre = n / 2;
  for (let v = 0; v < shape.positions.length / 3; v++) {
    const x = shape.positions[v * 3]! * axes[0] + START_JITTER * spacing * (2 * jitter.next() - 1);
    const y = shape.positions[v * 3 + 1]! * axes[1] + START_JITTER * spacing * (2 * jitter.next() - 1);
    const z = shape.positions[v * 3 + 2]! * axes[2] + START_JITTER * spacing * (2 * jitter.next() - 1);
    mesh.addVertex(centre + x, Math.max(0, y + lift), centre + z, 0, 0);
  }
  mesh.triangles = shape.triangles.slice();
  if (signedVolume(mesh.positions, mesh.triangles) < 0) {
    for (let t = 0; t < mesh.triangles.length; t += 3) {
      const b = mesh.triangles[t + 1]!;
      mesh.triangles[t + 1] = mesh.triangles[t + 2]!;
      mesh.triangles[t + 2] = b;
    }
  }
  // Bring the edges to the polyp spacing: stretched forms need splits, flattened ones fusions.
  for (let pass = 0; pass < SPLIT_PASSES; pass++) if (mesh.split(SPLIT_FACTOR * spacing, 0) === 0) break;
  mesh.fuse(FUSE_FACTOR * spacing, 0, 0);
  return mesh;
}
