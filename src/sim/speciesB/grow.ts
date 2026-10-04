import { mul32 } from '../bits';
import { log } from '../dmath';
import { Rng } from '../rng';
import {
  AREA_MULTIPLE,
  BEND_SCALE,
  FLATTEN_PER_STEP,
  MIN_HINGE_HEIGHT,
  MIN_ROUGHNESS,
  REPULSION_SCALE,
  REPULSION_SHEET_SEPARATION,
  RISE_PER_STEP,
  START_EDGE_FRACTION,
  STEP_CAP,
  STRETCH_SCALE,
  VERTEX_CAP,
} from './constants';
import { startDisc } from './disc';
import { GrowingMesh } from './mesh';
import { patchNoise } from './noise';
import { splitLength, type SpeciesBParams } from './params';

// Differential growth of a thin sheet (Nath et al. 2003; Sharon and Efrati 2010), as a spring mesh.
// Each step does three things in a fixed order (spec section 4):
//
//  1. Grow: every edge's rest length increases by an amount set by its distance from the margin,
//     its direction relative to the margin (anisotropy) and the growth patches. The amounts are
//     scaled so their mean, weighted by rest length, is the growth rate.
//  2. Relax: the mesh settles under stretch resistance, bending resistance and short-range repulsion.
//     First the whole mesh is scaled by the mean growth, so relaxation only has to take up the
//     uneven part; a sheet that grows evenly stays exactly at rest, and so stays flat. Then each
//     pass moves every vertex to the average of the corrections its constraints ask for, each
//     correction being a fraction k / (1 + k) of the full one. Averaged partial corrections can
//     never overshoot, so relaxation is stable for every stiffness and thickness.
//  3. Divide: edges whose rest length exceeds the split length are split, longest first.
//
// Growth stops when the total rest area reaches AREA_MULTIPLE × the starting area, or when another
// split would pass the vertex cap (clarification 1).

export type StopReason = 'area-multiple' | 'vertex-cap' | 'step-cap';

export interface GrownSheet {
  mesh: GrowingMesh;
  steps: number;
  stopReason: StopReason;
  startArea: number;
  restArea: number;
  /** Split length in starting radii (one cell width). */
  cellWidth: number;
}

function fraction(k: number): number {
  return k / (1 + k);
}

export function* growSheet(params: SpeciesBParams): Generator<number, GrownSheet> {
  if (params.bodyPlan !== 'disc') throw new Error(`The ${params.bodyPlan} body plan arrives in milestone 5`);
  const cell = splitLength(params);
  const mesh = new GrowingMesh(VERTEX_CAP);
  const rng = new Rng(params.seed, 0);
  startDisc(mesh, START_EDGE_FRACTION * cell, Math.max(MIN_ROUGHNESS, params.startingRoughness), rng);
  // Each vertex's growth-patch value depends only on its material coordinates, so it is computed
  // once, when the vertex is born.
  const patchSeed = mul32(params.seed >>> 0, 0x9e3779b1) ^ 0x5bd1e995;
  mesh.patchField = (u, v) => patchNoise(u, v, params.patchSize, patchSeed);
  for (let i = 0; i < mesh.vertexCount; i++) mesh.patch[i] = mesh.patchField(mesh.u[i]!, mesh.v[i]!);

  const startArea = mesh.totalRestArea();
  const targetArea = AREA_MULTIPLE * startArea;
  let restArea = startArea;

  const stretchF = fraction(params.stiffness * params.thickness * STRETCH_SCALE);
  const bendF = fraction(params.stiffness * params.thickness ** 3 * BEND_SCALE);
  const repelF = fraction(params.repulsion * REPULSION_SCALE);
  const personal = params.personalSpace * cell;
  const passes = params.relaxation;
  const zone = params.growthZone;
  const bias = params.marginBias;

  // Scratch arrays for relaxation, sized for the cap.
  const dx = new Float64Array(VERTEX_CAP);
  const dy = new Float64Array(VERTEX_CAP);
  const dz = new Float64Array(VERTEX_CAP);
  const count = new Float64Array(VERTEX_CAP);
  const rise = new Float64Array(VERTEX_CAP);

  let steps = 0;
  let stopReason: StopReason = 'step-cap';
  let progress = 0;

  while (steps < STEP_CAP) {
    if (restArea >= targetArea) {
      stopReason = 'area-multiple';
      break;
    }
    steps++;

    // ---- 1. Grow
    const edges: number[] = [];
    for (let e = 0; e < mesh.edgeCount; e++) if (mesh.alive[e] === 1) edges.push(e);
    const gradient2 = params.anisotropy !== 0 ? marginGradients(mesh) : null;
    const factor = new Float64Array(edges.length);
    let weighted = 0;
    let lengthSum = 0;
    for (let n = 0; n < edges.length; n++) {
      const e = edges[n]!;
      const a = mesh.edgeA[e]!;
      const b = mesh.edgeB[e]!;
      const margin = (mesh.margin[a]! + mesh.margin[b]!) / 2;
      const w = margin >= zone ? 0 : (1 - margin / zone) * (1 - margin / zone);
      let f = 1 + (bias - 1) * w;
      // Anisotropy: growth along the margin versus toward it. How nearly the edge points toward the
      // margin, measured in the rest geometry: cos² of the angle between the edge and the gradient
      // of margin distance is Δm² / (L² |∇m|²). Measuring it in the rest geometry, not on the
      // starting shape, keeps the three edges of a triangle growing by one growth tensor.
      if (gradient2) {
        const g2 = (gradient2[mesh.edgeT0[e]!]! + (mesh.edgeT1[e]! >= 0 ? gradient2[mesh.edgeT1[e]!]! : gradient2[mesh.edgeT0[e]!]!)) / 2;
        const dm = mesh.margin[a]! - mesh.margin[b]!;
        const rest = mesh.rest[e]!;
        const toward = g2 > 0 ? Math.min(1, (dm * dm) / (rest * rest * g2)) : 0.5;
        f *= Math.max(0, 1 + params.anisotropy * (1 - 2 * toward));
      }
      if (params.patchContrast > 0) f *= Math.max(0, 1 + (params.patchContrast * (mesh.patch[a]! + mesh.patch[b]!)) / 2);
      factor[n] = f;
      const rest = mesh.rest[e]!;
      weighted += rest * f;
      lengthSum += rest;
    }
    const mean = weighted / lengthSum;
    const scale = mean > 0 ? params.growthRate / mean : 0;
    for (let n = 0; n < edges.length; n++) {
      const e = edges[n]!;
      mesh.rest[e] = mesh.rest[e]! * (1 + scale * factor[n]!);
    }
    // If every factor was zero (possible only at the extremes of anisotropy and patches), grow evenly.
    if (scale === 0) for (const e of edges) mesh.rest[e] = mesh.rest[e]! * (1 + params.growthRate);
    const newArea = mesh.totalRestArea();

    // ---- 2. Relax
    // Scale about the origin by the mean linear growth.
    const s = Math.sqrt(newArea / restArea);
    restArea = newArea;
    const vn = mesh.vertexCount;
    for (let i = 0; i < vn; i++) {
      mesh.x[i] = mesh.x[i]! * s;
      mesh.y[i] = mesh.y[i]! * s;
      mesh.z[i] = mesh.z[i]! * s;
    }

    // Live edges as flat arrays for the passes.
    const ne = edges.length;
    const endA = new Int32Array(ne);
    const endB = new Int32Array(ne);
    const restOf = new Float64Array(ne);
    for (let n = 0; n < ne; n++) {
      const e = edges[n]!;
      endA[n] = mesh.edgeA[e]!;
      endB[n] = mesh.edgeB[e]!;
      restOf[n] = mesh.rest[e]!;
    }
    const hinges = buildHinges(mesh, edges);
    const pairs = repulsionPairs(mesh, personal, Math.sqrt(restArea / startArea));
    const zoneWeight = (i: number) => {
      const m = mesh.margin[i]!;
      return m >= zone ? 0 : (1 - m / zone) * (1 - m / zone);
    };
    if (params.lift > 0) for (let i = 0; i < vn; i++) rise[i] = (params.lift * RISE_PER_STEP * cell * zoneWeight(i)) / passes;
    const flatten = params.lift < 0 ? 1 - (-params.lift * FLATTEN_PER_STEP) / passes : 1;

    const X = mesh.x;
    const Y = mesh.y;
    const Z = mesh.z;
    for (let pass = 0; pass < passes; pass++) {
      dx.fill(0, 0, vn);
      dy.fill(0, 0, vn);
      dz.fill(0, 0, vn);
      count.fill(0, 0, vn);

      // Stretch: each edge toward its rest length.
      for (let n = 0; n < ne; n++) {
        const a = endA[n]!;
        const b = endB[n]!;
        const ex = X[b]! - X[a]!;
        const ey = Y[b]! - Y[a]!;
        const ez = Z[b]! - Z[a]!;
        const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (len === 0) continue;
        const c = (stretchF * 0.5 * (len - restOf[n]!)) / len;
        dx[a] = dx[a]! + c * ex;
        dy[a] = dy[a]! + c * ey;
        dz[a] = dz[a]! + c * ez;
        dx[b] = dx[b]! - c * ex;
        dy[b] = dy[b]! - c * ey;
        dz[b] = dz[b]! - c * ez;
        count[a] = count[a]! + 1;
        count[b] = count[b]! + 1;
      }

      // Bending: each hinge toward its flat unfolding (l as a fixed affine mix of i, j and k).
      const hv = hinges.vertices;
      const hc = hinges.coefficients;
      for (let h = 0; h < hinges.count; h++) {
        const i = hv[4 * h]!;
        const j = hv[4 * h + 1]!;
        const k = hv[4 * h + 2]!;
        const l = hv[4 * h + 3]!;
        const al = hc[3 * h]!;
        const be = hc[3 * h + 1]!;
        const ga = hc[3 * h + 2]!;
        const cx = al * X[i]! + be * X[j]! + ga * X[k]! - X[l]!;
        const cy = al * Y[i]! + be * Y[j]! + ga * Y[k]! - Y[l]!;
        const cz = al * Z[i]! + be * Z[j]! + ga * Z[k]! - Z[l]!;
        const norm = al * al + be * be + ga * ga + 1;
        const fx = (bendF * cx) / norm;
        const fy = (bendF * cy) / norm;
        const fz = (bendF * cz) / norm;
        dx[i] = dx[i]! - al * fx;
        dy[i] = dy[i]! - al * fy;
        dz[i] = dz[i]! - al * fz;
        dx[j] = dx[j]! - be * fx;
        dy[j] = dy[j]! - be * fy;
        dz[j] = dz[j]! - be * fz;
        dx[k] = dx[k]! - ga * fx;
        dy[k] = dy[k]! - ga * fy;
        dz[k] = dz[k]! - ga * fz;
        dx[l] = dx[l]! + fx;
        dy[l] = dy[l]! + fy;
        dz[l] = dz[l]! + fz;
        count[i] = count[i]! + 1;
        count[j] = count[j]! + 1;
        count[k] = count[k]! + 1;
        count[l] = count[l]! + 1;
      }

      // Repulsion: parts of the sheet far apart along it push apart when closer than personal space.
      for (let p = 0; p < pairs.length; p += 2) {
        const a = pairs[p]!;
        const b = pairs[p + 1]!;
        const ex = X[b]! - X[a]!;
        const ey = Y[b]! - Y[a]!;
        const ez = Z[b]! - Z[a]!;
        const len = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (len >= personal || len === 0) continue;
        const c = (repelF * 0.5 * (len - personal)) / len;
        dx[a] = dx[a]! + c * ex;
        dy[a] = dy[a]! + c * ey;
        dz[a] = dz[a]! + c * ez;
        dx[b] = dx[b]! - c * ex;
        dy[b] = dy[b]! - c * ey;
        dz[b] = dz[b]! - c * ez;
        count[a] = count[a]! + 1;
        count[b] = count[b]! + 1;
      }

      for (let i = 0; i < vn; i++) {
        const n = count[i]!;
        if (n > 0) {
          X[i] = X[i]! + dx[i]! / n;
          Y[i] = Y[i]! + dy[i]! / n;
          Z[i] = Z[i]! + dz[i]! / n;
        }
        if (params.lift > 0) Y[i] = Y[i]! + rise[i]!;
        else if (params.lift < 0) Y[i] = Y[i]! * flatten;
      }
    }

    // ---- 3. Divide
    const capped = divide(mesh, cell, steps);

    progress = Math.max(progress, Math.min(1, log(restArea / startArea) / log(AREA_MULTIPLE)));
    yield progress;
    if (capped) {
      stopReason = 'vertex-cap';
      break;
    }
  }

  return { mesh, steps, stopReason, startArea, restArea, cellWidth: cell };
}

/**
 * The squared gradient of margin distance over each triangle, measured in its rest geometry: the
 * triangle is laid flat from its three rest lengths and margin distance is interpolated linearly.
 */
function marginGradients(mesh: GrowingMesh): Float64Array {
  const out = new Float64Array(mesh.triangleCount);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const p = mesh.tri[3 * t]!;
    const q = mesh.tri[3 * t + 1]!;
    const k = mesh.tri[3 * t + 2]!;
    const c = mesh.rest[mesh.triEdge[3 * t]!]!; // p–q
    const a = mesh.rest[mesh.triEdge[3 * t + 1]!]!; // q–k
    const b = mesh.rest[mesh.triEdge[3 * t + 2]!]!; // k–p
    // p at (0, 0), q at (c, 0), k at (xk, yk).
    const xk = (c * c + b * b - a * a) / (2 * c);
    const yk = Math.sqrt(Math.max(0, b * b - xk * xk));
    if (!(c > 0) || !(yk > 0)) continue;
    const mp = mesh.margin[p]!;
    const gx = (mesh.margin[q]! - mp) / c;
    const gy = (mesh.margin[k]! - mp - gx * xk) / yk;
    out[t] = gx * gx + gy * gy;
  }
  return out;
}

/**
 * Splits every edge whose rest length exceeds the split length, longest first (lower index on a
 * tie), repeating until none is left. Returns true if the vertex cap stopped it.
 */
function divide(mesh: GrowingMesh, cell: number, step: number): boolean {
  for (;;) {
    const long: number[] = [];
    for (let e = 0; e < mesh.edgeCount; e++) if (mesh.alive[e] === 1 && mesh.rest[e]! > cell) long.push(e);
    if (long.length === 0) return false;
    long.sort((a, b) => mesh.rest[b]! - mesh.rest[a]! || a - b);
    for (const e of long) {
      if (mesh.alive[e] !== 1 || !(mesh.rest[e]! > cell)) continue;
      if (mesh.vertexCount >= mesh.vertexCapacity) return true;
      mesh.split(e, step);
    }
  }
}

interface Hinges {
  count: number;
  /** i, j (the shared edge), k, l (the opposite corners) per hinge. */
  vertices: Int32Array;
  /** α, β, γ per hinge: in the flat unfolding, l = α i + β j + γ k. */
  coefficients: Float64Array;
}

/** One hinge per interior edge, with its flat-unfolding coefficients from the current rest lengths. */
function buildHinges(mesh: GrowingMesh, edges: readonly number[]): Hinges {
  const vertices = new Int32Array(4 * edges.length);
  const coefficients = new Float64Array(3 * edges.length);
  let count = 0;
  for (const e of edges) {
    const t0 = mesh.edgeT0[e]!;
    const t1 = mesh.edgeT1[e]!;
    if (t0 < 0 || t1 < 0) continue;
    const r0 = mesh.edgeSlot(t0, e);
    const i = mesh.tri[3 * t0 + r0]!;
    const j = mesh.tri[3 * t0 + ((r0 + 1) % 3)]!;
    const k = mesh.tri[3 * t0 + ((r0 + 2) % 3)]!;
    const a1 = mesh.rest[mesh.triEdge[3 * t0 + ((r0 + 1) % 3)]!]!; // j–k
    const b1 = mesh.rest[mesh.triEdge[3 * t0 + ((r0 + 2) % 3)]!]!; // k–i
    const r1 = mesh.edgeSlot(t1, e);
    // In t1 the shared edge runs j → i.
    const l = mesh.tri[3 * t1 + ((r1 + 2) % 3)]!;
    const b2 = mesh.rest[mesh.triEdge[3 * t1 + ((r1 + 1) % 3)]!]!; // i–l
    const a2 = mesh.rest[mesh.triEdge[3 * t1 + ((r1 + 2) % 3)]!]!; // l–j
    const c = mesh.rest[e]!;
    // Unfold: i at (0, 0), j at (c, 0), k above the axis, l below it.
    const xk = (c * c + b1 * b1 - a1 * a1) / (2 * c);
    const yk = Math.sqrt(Math.max(0, b1 * b1 - xk * xk));
    const xl = (c * c + b2 * b2 - a2 * a2) / (2 * c);
    const yl = -Math.sqrt(Math.max(0, b2 * b2 - xl * xl));
    if (yk < MIN_HINGE_HEIGHT * c || -yl < MIN_HINGE_HEIGHT * c) continue;
    const gamma = yl / yk;
    const beta = (xl - gamma * xk) / c;
    const alpha = 1 - beta - gamma;
    vertices[4 * count] = i;
    vertices[4 * count + 1] = j;
    vertices[4 * count + 2] = k;
    vertices[4 * count + 3] = l;
    coefficients[3 * count] = alpha;
    coefficients[3 * count + 1] = beta;
    coefficients[3 * count + 2] = gamma;
    count++;
  }
  return { count, vertices, coefficients };
}

/**
 * Pairs of vertices closer in space than the personal space, but far apart along the sheet: their
 * material distance times the mean linear growth is at least REPULSION_SHEET_SEPARATION personal
 * spaces. Found once per growth step with a uniform grid over x and z, cells one personal space
 * wide; each cell is compared with itself and four of its neighbours, so each pair is seen once.
 */
function repulsionPairs(mesh: GrowingMesh, personal: number, growth: number): number[] {
  const n = mesh.vertexCount;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, mesh.x[i]!);
    maxX = Math.max(maxX, mesh.x[i]!);
    minZ = Math.min(minZ, mesh.z[i]!);
    maxZ = Math.max(maxZ, mesh.z[i]!);
  }
  const nx = Math.floor((maxX - minX) / personal) + 1;
  const nz = Math.floor((maxZ - minZ) / personal) + 1;
  const cells = nx * nz;
  const cellOf = new Int32Array(n);
  const start = new Int32Array(cells + 1);
  for (let i = 0; i < n; i++) {
    const c = Math.floor((mesh.z[i]! - minZ) / personal) * nx + Math.floor((mesh.x[i]! - minX) / personal);
    cellOf[i] = c;
    start[c + 1] = start[c + 1]! + 1;
  }
  for (let c = 0; c < cells; c++) start[c + 1] = start[c + 1]! + start[c]!;
  const fill = start.slice(0, cells);
  const items = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const c = cellOf[i]!;
    items[fill[c]!] = i;
    fill[c] = fill[c]! + 1;
  }

  const pairs: number[] = [];
  const personal2 = personal * personal;
  const separation = (REPULSION_SHEET_SEPARATION * personal) / growth;
  const separation2 = separation * separation;
  const test = (i: number, j: number) => {
    const ex = mesh.x[j]! - mesh.x[i]!;
    const ez = mesh.z[j]! - mesh.z[i]!;
    const exz = ex * ex + ez * ez;
    if (exz >= personal2) return;
    const ey = mesh.y[j]! - mesh.y[i]!;
    if (exz + ey * ey >= personal2) return;
    const du = mesh.u[j]! - mesh.u[i]!;
    const dv = mesh.v[j]! - mesh.v[i]!;
    if (du * du + dv * dv < separation2) return;
    if (i < j) pairs.push(i, j);
    else pairs.push(j, i);
  };
  // Forward neighbours: (+1, 0), (−1, +1), (0, +1), (+1, +1).
  const offsets = [
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
  ] as const;
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      const c = cz * nx + cx;
      const s0 = start[c]!;
      const e0 = start[c + 1]!;
      for (let a = s0; a < e0; a++) for (let b = a + 1; b < e0; b++) test(items[a]!, items[b]!);
      for (const [ox, oz] of offsets) {
        const qx = cx + ox;
        const qz = cz + oz;
        if (qx < 0 || qx >= nx || qz >= nz) continue;
        const d = qz * nx + qx;
        const s1 = start[d]!;
        const e1 = start[d + 1]!;
        for (let a = s0; a < e0; a++) for (let b = s1; b < e1; b++) test(items[a]!, items[b]!);
      }
    }
  }
  return pairs;
}
