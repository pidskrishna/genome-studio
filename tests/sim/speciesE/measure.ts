// Measurements of a grown colony, for the species E tests: enclosed volume, convex hull volume,
// compactness (Kaandorp et al. 2005; Merks et al. 2003) and branch tips.

/** Volume enclosed by a closed, outward-facing triangle mesh (divergence theorem). */
export function enclosedVolume(p: ArrayLike<number>, t: ArrayLike<number>): number {
  let sum = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k]! * 3;
    const b = t[k + 1]! * 3;
    const c = t[k + 2]! * 3;
    sum += p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  }
  return sum / 6;
}

type Vec = [number, number, number];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Volume of the convex hull of the points, by incremental construction. */
export function hullVolume(p: ArrayLike<number>): number {
  const n = p.length / 3;
  const pt = (i: number): Vec => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
  // Starting tetrahedron from extreme points.
  let i0 = 0;
  let i1 = 0;
  for (let i = 0; i < n; i++) {
    if (p[i * 3]! < p[i0 * 3]!) i0 = i;
    if (p[i * 3]! > p[i1 * 3]!) i1 = i;
  }
  let i2 = -1;
  let best = 0;
  for (let i = 0; i < n; i++) {
    const c = cross(sub(pt(i1), pt(i0)), sub(pt(i), pt(i0)));
    const d = dot(c, c);
    if (d > best) {
      best = d;
      i2 = i;
    }
  }
  const normal0 = cross(sub(pt(i1), pt(i0)), sub(pt(i2), pt(i0)));
  let i3 = -1;
  best = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(dot(normal0, sub(pt(i), pt(i0))));
    if (d > best) {
      best = d;
      i3 = i;
    }
  }
  let faces: [number, number, number][] = [];
  const centre: Vec = [0, 1, 2].map((d) => (pt(i0)[d]! + pt(i1)[d]! + pt(i2)[d]! + pt(i3)[d]!) / 4) as Vec;
  const addFace = (a: number, b: number, c: number) => {
    const nrm = cross(sub(pt(b), pt(a)), sub(pt(c), pt(a)));
    if (dot(nrm, sub(pt(a), centre)) < 0) faces.push([a, c, b]);
    else faces.push([a, b, c]);
  };
  addFace(i0, i1, i2);
  addFace(i0, i1, i3);
  addFace(i0, i2, i3);
  addFace(i1, i2, i3);
  const eps = 1e-9;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1 || i === i2 || i === i3) continue;
    const q = pt(i);
    const visible: boolean[] = faces.map(([a, b, c]) => dot(cross(sub(pt(b), pt(a)), sub(pt(c), pt(a))), sub(q, pt(a))) > eps);
    if (!visible.some(Boolean)) continue;
    const edges = new Map<string, [number, number]>();
    faces.forEach((f, k) => {
      if (!visible[k]) return;
      for (let j = 0; j < 3; j++) {
        const a = f[j]!;
        const b = f[(j + 1) % 3]!;
        const back = `${b},${a}`;
        if (edges.has(back)) edges.delete(back);
        else edges.set(`${a},${b}`, [a, b]);
      }
    });
    faces = faces.filter((_, k) => !visible[k]);
    for (const [a, b] of edges.values()) faces.push([a, b, i]);
  }
  let volume = 0;
  for (const [a, b, c] of faces) volume += dot(pt(a), cross(pt(b), pt(c)));
  return volume / 6;
}

/** Fraction of the convex hull the colony fills. */
export function compactness(positions: ArrayLike<number>, triangles: ArrayLike<number>): number {
  return enclosedVolume(positions, triangles) / hullVolume(positions);
}

/**
 * Branch tips: vertices in the upper half of the colony that are the highest point within a
 * horizontal radius `radius`, at least `separation` from another such tip.
 */
export function branchTips(positions: ArrayLike<number>, radius: number): number[][] {
  const n = positions.length / 3;
  let top = 0;
  for (let v = 0; v < n; v++) top = Math.max(top, positions[v * 3 + 1]!);
  const cell = radius;
  const grid = new Map<string, number[]>();
  const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < n; v++) {
    const k = key(positions[v * 3]!, positions[v * 3 + 2]!);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(v);
  }
  const tips: number[][] = [];
  for (let v = 0; v < n; v++) {
    const x = positions[v * 3]!;
    const y = positions[v * 3 + 1]!;
    const z = positions[v * 3 + 2]!;
    if (y < top / 2) continue;
    let highest = true;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1 && highest; dx++) {
      for (let dz = -1; dz <= 1 && highest; dz++) {
        for (const w of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
          if (w === v) continue;
          const ex = positions[w * 3]! - x;
          const ez = positions[w * 3 + 2]! - z;
          if (ex * ex + ez * ez <= radius * radius && (positions[w * 3 + 1]! > y || (positions[w * 3 + 1]! === y && w < v))) {
            highest = false;
            break;
          }
        }
      }
    }
    if (highest) tips.push([x, y, z]);
  }
  return tips;
}
