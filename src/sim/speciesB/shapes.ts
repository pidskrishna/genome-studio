import { cos, PI, sin } from '../dmath';
import { Rng } from '../rng';
import { RING_INNER_RADIUS, START_RADIUS, TUBE_LENGTH } from './constants';
import { buildEdges, GrowingMesh } from './mesh';
import type { BodyPlan } from './params';

// Starting shapes for the four body plans (spec section 4, clarification 7). Lengths are in starting
// radii. All lie centred on the origin with y up:
//  - disc: radius 1 in the plane y = 0; its margin is the rim;
//  - ring: the annulus between RING_INNER_RADIUS and 1 in the plane y = 0; both edges are margins;
//  - tube: an open cylinder of radius 1 and length TUBE_LENGTH about the y axis; both open ends
//    are margins;
//  - sphere: closed, radius 1; it has no margin, so its growth patches serve as one (see grow.ts).
// Margin distances are measured here, once, on the starting shape. The sphere's are filled in later.

/** Area of each starting shape, used to set the final size and so the cell size. */
export function startArea(plan: BodyPlan): number {
  const r = START_RADIUS;
  switch (plan) {
    case 'disc':
      return PI * r * r;
    case 'ring':
      return PI * (r * r - RING_INNER_RADIUS * RING_INNER_RADIUS);
    case 'tube':
      return 2 * PI * r * TUBE_LENGTH;
    case 'sphere':
      return 4 * PI * r * r;
  }
}

type Outward = (x: number, y: number, z: number) => [number, number, number];

/** Adds triangle (a, b, c), swapping b and c if needed so its normal points along `outward`. */
function orient(mesh: GrowingMesh, triangles: number[], outward: Outward, a: number, b: number, c: number): void {
  const ax = mesh.mx[a]!;
  const ay = mesh.my[a]!;
  const az = mesh.mz[a]!;
  const ux = mesh.mx[b]! - ax;
  const uy = mesh.my[b]! - ay;
  const uz = mesh.mz[b]! - az;
  const vx = mesh.mx[c]! - ax;
  const vy = mesh.my[c]! - ay;
  const vz = mesh.mz[c]! - az;
  const [ox, oy, oz] = outward((ax + mesh.mx[b]! + mesh.mx[c]!) / 3, (ay + mesh.my[b]! + mesh.my[c]!) / 3, (az + mesh.mz[b]! + mesh.mz[c]!) / 3);
  const dot = (uy * vz - uz * vy) * ox + (uz * vx - ux * vz) * oy + (ux * vy - uy * vx) * oz;
  if (dot >= 0) triangles.push(a, b, c);
  else triangles.push(a, c, b);
}

interface Loop {
  /** Vertex indices around the loop. */
  ids: number[];
  /** Angle of each, as a fraction of a turn, increasing. */
  turns: number[];
}

/** Joins two neighbouring loops into a band of triangles, advancing on whichever side comes next. */
function zip(mesh: GrowingMesh, triangles: number[], outward: Outward, inner: Loop, outer: Loop): void {
  const n0 = inner.ids.length;
  const n1 = outer.ids.length;
  if (n0 === 1) {
    for (let j = 0; j < n1; j++) orient(mesh, triangles, outward, inner.ids[0]!, outer.ids[j]!, outer.ids[(j + 1) % n1]!);
    return;
  }
  const turnAt = (loop: Loop, n: number, i: number) => loop.turns[i % n]! + Math.floor(i / n);
  let a = 0;
  let b = 0;
  while (a < n0 || b < n1) {
    const nextA = a < n0 ? turnAt(inner, n0, a + 1) : Infinity;
    const nextB = b < n1 ? turnAt(outer, n1, b + 1) : Infinity;
    if (b >= n1 || (a < n0 && nextA <= nextB)) {
      orient(mesh, triangles, outward, inner.ids[a % n0]!, inner.ids[(a + 1) % n0]!, outer.ids[b % n1]!);
      a++;
    } else {
      orient(mesh, triangles, outward, inner.ids[a % n0]!, outer.ids[b % n1]!, outer.ids[(b + 1) % n1]!);
      b++;
    }
  }
}

/** A loop of vertices on a circle of the given radius at height y, staggered by half a step on odd rows. */
function circle(mesh: GrowingMesh, radius: number, y: number, count: number, row: number, margin: number): Loop {
  const ids: number[] = [];
  const turns: number[] = [];
  const offset = row % 2 === 0 ? 0 : 0.5;
  for (let j = 0; j < count; j++) {
    const turn = (j + offset) / count;
    const angle = 2 * PI * turn;
    const x = count === 1 ? 0 : radius * cos(angle);
    const z = count === 1 ? 0 : radius * sin(angle);
    ids.push(mesh.addVertex(x, y, z, x, y, z, margin, 0));
    turns.push(turn);
  }
  return { ids, turns };
}

const UP: Outward = () => [0, 1, 0];
const RADIAL: Outward = (x, _y, z) => [x, 0, z];
const FROM_CENTRE: Outward = (x, y, z) => [x, y, z];

function buildFlat(mesh: GrowingMesh, edgeLength: number, inner: number): void {
  const rings = Math.max(2, Math.floor((START_RADIUS - inner) / edgeLength + 0.5));
  const step = (START_RADIUS - inner) / rings;
  const loops: Loop[] = [];
  for (let k = 0; k <= rings; k++) {
    const radius = inner + k * step;
    const count = radius === 0 ? 1 : Math.max(6, Math.floor((2 * PI * radius) / step + 0.5));
    // The rim (and the inner edge of a ring) sits exactly on the margin: distance zero.
    const fromOuter = k === rings ? 0 : START_RADIUS - radius;
    const fromInner = inner > 0 ? (k === 0 ? 0 : radius - inner) : Infinity;
    loops.push(circle(mesh, radius, 0, count, k, Math.min(fromOuter, fromInner)));
  }
  const triangles: number[] = [];
  for (let k = 1; k <= rings; k++) zip(mesh, triangles, UP, loops[k - 1]!, loops[k]!);
  buildEdges(mesh, triangles);
}

function buildTube(mesh: GrowingMesh, edgeLength: number): void {
  const count = Math.max(6, Math.floor((2 * PI * START_RADIUS) / edgeLength + 0.5));
  // Rows about (√3 / 2) of an edge apart give near-equilateral triangles with the half-step stagger.
  const rows = Math.max(2, Math.floor(TUBE_LENGTH / (edgeLength * 0.8660254037844386) + 0.5));
  const loops: Loop[] = [];
  for (let k = 0; k <= rows; k++) {
    const y = -TUBE_LENGTH / 2 + (k * TUBE_LENGTH) / rows;
    const margin = k === 0 || k === rows ? 0 : Math.min(y + TUBE_LENGTH / 2, TUBE_LENGTH / 2 - y);
    loops.push(circle(mesh, START_RADIUS, y, count, k, margin));
  }
  const triangles: number[] = [];
  for (let k = 1; k <= rows; k++) zip(mesh, triangles, RADIAL, loops[k - 1]!, loops[k]!);
  buildEdges(mesh, triangles);
}

const T = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON_VERTICES = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
] as const;
const ICOSAHEDRON_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
] as const;
/** Edge length of an icosahedron inscribed in the unit sphere. */
const ICOSAHEDRON_EDGE = 1.0514622242382672;

/**
 * A geodesic sphere: each icosahedron face is divided into a triangular grid of the given frequency
 * and projected onto the sphere. Points on shared icosahedron edges are made once per edge, from its
 * lower-numbered end, so neighbouring faces share them exactly.
 */
function buildSphere(mesh: GrowingMesh, edgeLength: number): void {
  const n = Math.max(1, Math.floor(ICOSAHEDRON_EDGE / edgeLength + 0.5));
  const onSphere = (x: number, y: number, z: number) => {
    const l = Math.sqrt(x * x + y * y + z * z);
    const px = (START_RADIUS * x) / l;
    const py = (START_RADIUS * y) / l;
    const pz = (START_RADIUS * z) / l;
    return mesh.addVertex(px, py, pz, px, py, pz, Infinity, 0);
  };
  const corner = ICOSAHEDRON_VERTICES.map(([x, y, z]) => onSphere(x, y, z));
  const edgePoints = new Map<number, number[]>();
  const pointsOn = (a: number, b: number): number[] => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * 16 + hi;
    let pts = edgePoints.get(key);
    if (!pts) {
      pts = [corner[lo]!];
      const [lx, ly, lz] = ICOSAHEDRON_VERTICES[lo]!;
      const [hx, hy, hz] = ICOSAHEDRON_VERTICES[hi]!;
      for (let i = 1; i < n; i++) pts.push(onSphere(lx + ((hx - lx) * i) / n, ly + ((hy - ly) * i) / n, lz + ((hz - lz) * i) / n));
      pts.push(corner[hi]!);
      edgePoints.set(key, pts);
    }
    // Index i counts from a.
    return a === lo ? pts : pts.slice().reverse();
  };
  const triangles: number[] = [];
  for (const [a, b, c] of ICOSAHEDRON_FACES) {
    const ab = pointsOn(a, b);
    const ac = pointsOn(a, c);
    const bc = pointsOn(b, c);
    const [ax, ay, az] = ICOSAHEDRON_VERTICES[a];
    const [bx, by, bz] = ICOSAHEDRON_VERTICES[b];
    const [cx, cy, cz] = ICOSAHEDRON_VERTICES[c];
    // Grid point (i, j) = a + (b − a) i / n + (c − a) j / n.
    const grid: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const row: number[] = [];
      for (let j = 0; j <= n - i; j++) {
        if (j === 0) row.push(ab[i]!);
        else if (i === 0) row.push(ac[j]!);
        else if (i + j === n) row.push(bc[j]!);
        else row.push(onSphere(ax + ((bx - ax) * i + (cx - ax) * j) / n, ay + ((by - ay) * i + (cy - ay) * j) / n, az + ((bz - az) * i + (cz - az) * j) / n));
      }
      grid.push(row);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        orient(mesh, triangles, FROM_CENTRE, grid[i]![j]!, grid[i + 1]![j]!, grid[i]![j + 1]!);
        if (i + j < n - 1) orient(mesh, triangles, FROM_CENTRE, grid[i + 1]![j]!, grid[i + 1]![j + 1]!, grid[i]![j + 1]!);
      }
    }
  }
  buildEdges(mesh, triangles);
}

/**
 * Builds the starting shape for a body plan with edges about edgeLength long, then moves every
 * vertex along the shape's normal by roughness × a uniform random number in [−1, 1].
 */
export function startShape(plan: BodyPlan, mesh: GrowingMesh, edgeLength: number, roughness: number, rng: Rng): void {
  if (plan === 'disc') buildFlat(mesh, edgeLength, 0);
  else if (plan === 'ring') buildFlat(mesh, edgeLength, RING_INNER_RADIUS);
  else if (plan === 'tube') buildTube(mesh, edgeLength);
  else buildSphere(mesh, edgeLength);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const offset = roughness * (2 * rng.next() - 1);
    const [nx, ny, nz] = plan === 'tube' ? RADIAL(mesh.x[i]!, 0, mesh.z[i]!) : plan === 'sphere' ? FROM_CENTRE(mesh.x[i]!, mesh.y[i]!, mesh.z[i]!) : UP(0, 0, 0);
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    mesh.x[i] = mesh.x[i]! + (offset * nx) / l;
    mesh.y[i] = mesh.y[i]! + (offset * ny) / l;
    mesh.z[i] = mesh.z[i]! + (offset * nz) / l;
  }
}

/**
 * The closed sphere's margin distances (clarification 7): its growth patches are its margin. Every
 * vertex where the patch field is positive is on the margin (distance 0); if there is none, the
 * vertex with the largest value is. Every other vertex gets its shortest distance to the margin along
 * the starting mesh's edges (Dijkstra's algorithm; ties broken by vertex index).
 */
export function patchMargins(mesh: GrowingMesh): void {
  const n = mesh.vertexCount;
  const dist = new Float64Array(n).fill(Infinity);
  let best = 0;
  for (let i = 0; i < n; i++) {
    if (mesh.patch[i]! > 0) dist[i] = 0;
    if (mesh.patch[i]! > mesh.patch[best]!) best = i;
  }
  if (!dist.includes(0)) dist[best] = 0;

  // Adjacency from the edges.
  const start = new Int32Array(n + 1);
  for (let e = 0; e < mesh.edgeCount; e++) {
    start[mesh.edgeA[e]! + 1] = start[mesh.edgeA[e]! + 1]! + 1;
    start[mesh.edgeB[e]! + 1] = start[mesh.edgeB[e]! + 1]! + 1;
  }
  for (let i = 0; i < n; i++) start[i + 1] = start[i + 1]! + start[i]!;
  const fill = start.slice(0, n);
  const nbr = new Int32Array(start[n]!);
  const len = new Float64Array(start[n]!);
  for (let e = 0; e < mesh.edgeCount; e++) {
    const a = mesh.edgeA[e]!;
    const b = mesh.edgeB[e]!;
    nbr[fill[a]!] = b;
    len[fill[a]!] = mesh.rest[e]!;
    fill[a] = fill[a]! + 1;
    nbr[fill[b]!] = a;
    len[fill[b]!] = mesh.rest[e]!;
    fill[b] = fill[b]! + 1;
  }

  // Binary heap of (distance, vertex), smallest distance first, then lowest vertex.
  const heapD: number[] = [];
  const heapV: number[] = [];
  const less = (i: number, j: number) => heapD[i]! < heapD[j]! || (heapD[i] === heapD[j] && heapV[i]! < heapV[j]!);
  const swap = (i: number, j: number) => {
    [heapD[i], heapD[j]] = [heapD[j]!, heapD[i]!];
    [heapV[i], heapV[j]] = [heapV[j]!, heapV[i]!];
  };
  const push = (d: number, v: number) => {
    heapD.push(d);
    heapV.push(v);
    let i = heapD.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(i, p)) break;
      swap(i, p);
      i = p;
    }
  };
  const pop = () => {
    const d = heapD[0]!;
    const v = heapV[0]!;
    const lastD = heapD.pop()!;
    const lastV = heapV.pop()!;
    if (heapD.length > 0) {
      heapD[0] = lastD;
      heapV[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heapD.length && less(l, m)) m = l;
        if (r < heapD.length && less(r, m)) m = r;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    return [d, v] as const;
  };
  for (let i = 0; i < n; i++) if (dist[i] === 0) push(0, i);
  while (heapD.length > 0) {
    const [d, v] = pop();
    if (d > dist[v]!) continue;
    for (let k = start[v]!; k < start[v + 1]!; k++) {
      const u = nbr[k]!;
      const nd = d + len[k]!;
      if (nd < dist[u]!) {
        dist[u] = nd;
        push(nd, u);
      }
    }
  }
  for (let i = 0; i < n; i++) mesh.margin[i] = dist[i]!;
}
