import { mul32 } from '../bits';
import { log } from '../dmath';
import { Rng } from '../rng';
import {
  AREA_MULTIPLE,
  LIFT_WEIGHT,
  ANISOTROPY_STRENGTH,
  CAP_ANGLE_COSINE,
  FLIP_MIN_FOLD_COSINE,
  FLIP_SWEEPS,
  MIN_HINGE_HEIGHT,
  MIN_ROUGHNESS,
  REPULSION_STEP,
  SETTLE_PASSES,
  SHAPE_GUARD_COSINE,
  SHAPE_GUARD_WEIGHT,
  REPULSION_WEIGHT,
  REPULSION_SHEET_SEPARATION,
  LIFT_PER_PASS,
  MAX_REST_ANGLE_COSINE,
  START_EDGE_FRACTION,
  STEP_CAP,
  VERTEX_CAP,
} from './constants';
import { patchMargins, startShape } from './shapes';
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
//     pass moves every vertex to the weighted average of the full corrections its constraints ask
//     for. Stretch has weight 1, bending h² / 12 and repulsion r / (1 + r) with r = repulsion ÷
//     stiffness, each push capped at REPULSION_STEP personal spaces. A weighted
//     average of corrections can never overshoot, so relaxation is stable for every stiffness and
//     thickness, and the weights alone set the balance the sheet settles into.
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

export function* growSheet(params: SpeciesBParams): Generator<number, GrownSheet> {
  const cell = splitLength(params);
  const mesh = new GrowingMesh(VERTEX_CAP);
  const rng = new Rng(params.seed, 0);
  startShape(params.bodyPlan, mesh, START_EDGE_FRACTION * cell, Math.max(MIN_ROUGHNESS, params.startingRoughness), rng);
  // Each vertex's growth-patch value depends only on its material coordinates, so it is computed
  // once, when the vertex is born.
  const patchSeed = mul32(params.seed >>> 0, 0x9e3779b1) ^ 0x5bd1e995;
  mesh.patchField = (mx, my, mz) => patchNoise(mx, my, mz, params.patchSize, patchSeed);
  for (let i = 0; i < mesh.vertexCount; i++) mesh.patch[i] = mesh.patchField(mesh.mx[i]!, mesh.my[i]!, mesh.mz[i]!);
  // The closed sphere has no margin: its growth patches are its margin (clarification 7).
  if (params.bodyPlan === 'sphere') patchMargins(mesh);

  const startArea = mesh.totalRestArea();
  const targetArea = AREA_MULTIPLE * startArea;
  let restArea = startArea;

  // Constraint weights, relative to stretch. Bending over stretch stiffness is (h³ / 12) / h for a
  // plate of thickness h (in cell widths); the modulus cancels between them and only sets the
  // sheet's resistance to repulsion and lift.
  const bendW = (params.thickness * params.thickness) / 12;
  // Repulsion against stiffness, saturating so that it never outweighs stretch.
  const repelRatio = (REPULSION_WEIGHT * params.repulsion) / params.stiffness;
  const repelW = repelRatio / (1 + repelRatio);
  const personal = params.personalSpace * cell;
  const repelStep = REPULSION_STEP * personal;
  const passes = params.relaxation;
  const zone = params.growthZone;
  const bias = params.marginBias;

  // Scratch arrays for relaxation, sized for the cap.
  const dx = new Float64Array(VERTEX_CAP);
  const dy = new Float64Array(VERTEX_CAP);
  const dz = new Float64Array(VERTEX_CAP);
  const count = new Float64Array(VERTEX_CAP);
  const pushX = new Float64Array(VERTEX_CAP);
  const pushY = new Float64Array(VERTEX_CAP);
  const pushZ = new Float64Array(VERTEX_CAP);

  /**
   * Runs relaxation passes on the mesh as it stands: stretch, bending, repulsion and lift, each
   * vertex moving to the weighted average of the corrections asked of it.
   */
  function relax(passCount: number): void {
    const vn = mesh.vertexCount;
    const edges: number[] = [];
    for (let e = 0; e < mesh.edgeCount; e++) if (mesh.alive[e] === 1) edges.push(e);
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
    const guarded = thinTriangles(mesh);
    const zoneWeight = (i: number) => {
      const m = mesh.margin[i]!;
      return m >= zone ? 0 : (1 - m / zone) * (1 - m / zone);
    };
    // Lift is one more vote in each vertex's weighted average, a push on the growing margin of
    // LIFT_PER_PASS cell widths per pass: straight up when rising (lift > 0); when spreading flat
    // (lift < 0), outward along the sheet itself, away from the interior, which puts the margin
    // under tension and smooths its ruffles. Its weight works against stiffness and saturates below
    // LIFT_WEIGHT, so lift biases the shape without ever overpowering stretch.
    const liftRatio = Math.abs(params.lift) / params.stiffness;
    const liftW = (LIFT_WEIGHT * liftRatio) / (1 + liftRatio);
    if (params.lift > 0) {
      for (let i = 0; i < vn; i++) {
        pushX[i] = 0;
        pushY[i] = LIFT_PER_PASS * cell * zoneWeight(i);
        pushZ[i] = 0;
      }
    } else if (params.lift < 0) {
      // Outward along the sheet: the sum over neighbours of (their margin distance − ours) × (our
      // position − theirs), normalised. It points from deeper in the sheet toward the margin.
      pushX.fill(0, 0, vn);
      pushY.fill(0, 0, vn);
      pushZ.fill(0, 0, vn);
      for (let n = 0; n < ne; n++) {
        const a = endA[n]!;
        const b = endB[n]!;
        const dm = mesh.margin[b]! - mesh.margin[a]!;
        const ex = mesh.x[a]! - mesh.x[b]!;
        const ey = mesh.y[a]! - mesh.y[b]!;
        const ez = mesh.z[a]! - mesh.z[b]!;
        pushX[a] = pushX[a]! + dm * ex;
        pushY[a] = pushY[a]! + dm * ey;
        pushZ[a] = pushZ[a]! + dm * ez;
        pushX[b] = pushX[b]! + dm * ex;
        pushY[b] = pushY[b]! + dm * ey;
        pushZ[b] = pushZ[b]! + dm * ez;
      }
      for (let i = 0; i < vn; i++) {
        const l = Math.sqrt(pushX[i]! * pushX[i]! + pushY[i]! * pushY[i]! + pushZ[i]! * pushZ[i]!);
        const f = l > 0 ? (LIFT_PER_PASS * cell * zoneWeight(i)) / l : 0;
        pushX[i] = pushX[i]! * f;
        pushY[i] = pushY[i]! * f;
        pushZ[i] = pushZ[i]! * f;
      }
    }

    const X = mesh.x;
    const Y = mesh.y;
    const Z = mesh.z;
    for (let pass = 0; pass < passCount; pass++) {
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
        const c = (0.5 * (len - restOf[n]!)) / len;
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
        const fx = (bendW * cx) / norm;
        const fy = (bendW * cy) / norm;
        const fz = (bendW * cz) / norm;
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
        count[i] = count[i]! + bendW;
        count[j] = count[j]! + bendW;
        count[k] = count[k]! + bendW;
        count[l] = count[l]! + bendW;
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
        const c = (repelW * Math.max(-repelStep, 0.5 * (len - personal))) / len;
        dx[a] = dx[a]! + c * ex;
        dy[a] = dy[a]! + c * ey;
        dz[a] = dz[a]! + c * ez;
        dx[b] = dx[b]! - c * ex;
        dy[b] = dy[b]! - c * ey;
        dz[b] = dz[b]! - c * ez;
        count[a] = count[a]! + repelW;
        count[b] = count[b]! + repelW;
      }

      // Shape guard: each thin triangle asks to return to its rest shape, laid in its current plane.
      for (const t of guarded) shapeVote(mesh, t, dx, dy, dz, count);

      for (let i = 0; i < vn; i++) {
        let n = count[i]!;
        let lx = dx[i]!;
        let ly = dy[i]!;
        let lz = dz[i]!;
        if (liftW > 0) {
          lx += liftW * pushX[i]!;
          ly += liftW * pushY[i]!;
          lz += liftW * pushZ[i]!;
          n += liftW;
        }
        if (n > 0) {
          X[i] = X[i]! + lx / n;
          Y[i] = Y[i]! + ly / n;
          Z[i] = Z[i]! + lz / n;
        }
      }
    }
  }

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
        f *= Math.max(0, 1 + ANISOTROPY_STRENGTH * params.anisotropy * (1 - 2 * toward));
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
    clampRestCaps(mesh);
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

    relax(passes);

    // ---- 3. Divide, then keep the rest triangles well shaped
    const capped = divide(mesh, cell, steps);
    flipEdges(mesh);

    progress = Math.max(progress, Math.min(1, log(restArea / startArea) / log(AREA_MULTIPLE)));
    yield progress;
    if (capped) {
      stopReason = 'vertex-cap';
      break;
    }
  }

  // At maturity the sheet settles: SETTLE_PASSES more passes with no growth, so the last splits and
  // flips relax like every earlier one did.
  relax(SETTLE_PASSES);
  // Then any triangle folded flat across a crease is re-triangulated (no vertex moves).
  flipCaps(mesh);

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
    const h = mesh.unfold(e);
    if (!h) continue;
    const { c, xk, yk, xl, yl } = h;
    if (yk < MIN_HINGE_HEIGHT * c || -yl < MIN_HINGE_HEIGHT * c) continue;
    const gamma = yl / yk;
    const beta = (xl - gamma * xk) / c;
    const alpha = 1 - beta - gamma;
    vertices[4 * count] = h.p;
    vertices[4 * count + 1] = h.q;
    vertices[4 * count + 2] = h.k;
    vertices[4 * count + 3] = h.l;
    coefficients[3 * count] = alpha;
    coefficients[3 * count + 1] = beta;
    coefficients[3 * count + 2] = gamma;
    count++;
  }
  return { count, vertices, coefficients };
}

/** Smallest angle's cosine and largest angle's cosine of the current triangle (a, b, c). */
function angleCosines(mesh: GrowingMesh, a: number, b: number, c: number): { minCos: number; maxCos: number } {
  const d2 = (i: number, j: number) => {
    const ex = mesh.x[i]! - mesh.x[j]!;
    const ey = mesh.y[i]! - mesh.y[j]!;
    const ez = mesh.z[i]! - mesh.z[j]!;
    return ex * ex + ey * ey + ez * ez;
  };
  const s = [d2(b, c), d2(c, a), d2(a, b)];
  let minCos = 1;
  let maxCos = -1;
  for (let k = 0; k < 3; k++) {
    const o = s[k]!;
    const p = s[(k + 1) % 3]!;
    const q = s[(k + 2) % 3]!;
    const den = 2 * Math.sqrt(p * q);
    const cos = den > 0 ? (p + q - o) / den : 1;
    minCos = Math.min(minCos, cos);
    maxCos = Math.max(maxCos, cos);
  }
  // The largest angle has the smallest cosine and the smallest angle the largest.
  return { minCos: maxCos, maxCos: minCos };
}

/**
 * Final clean-up at maturity: a triangle whose largest angle exceeds CAP_ANGLE has been folded flat
 * across a crease, its corner lying on its longest side. That side is flipped to the other
 * diagonal whenever both new triangles have a larger smallest angle than the cap, and no edge would
 * be duplicated. Vertices do not move, so the shape is unchanged. Up to FLIP_SWEEPS sweeps.
 */
function flipCaps(mesh: GrowingMesh): void {
  const key = (a: number, b: number) => Math.min(a, b) * 65536 + Math.max(a, b);
  const existing = new Set<number>();
  for (let e = 0; e < mesh.edgeCount; e++) if (mesh.alive[e] === 1) existing.add(key(mesh.edgeA[e]!, mesh.edgeB[e]!));
  for (let sweep = 0; sweep < FLIP_SWEEPS; sweep++) {
    let flips = 0;
    for (let t = 0; t < mesh.triangleCount; t++) {
      const a = mesh.tri[3 * t]!;
      const b = mesh.tri[3 * t + 1]!;
      const c = mesh.tri[3 * t + 2]!;
      const here = angleCosines(mesh, a, b, c);
      if (here.maxCos > CAP_ANGLE_COSINE) continue;
      // Longest side: the one opposite the largest angle.
      let longest = mesh.triEdge[3 * t]!;
      let length = -1;
      for (let k = 0; k < 3; k++) {
        const e = mesh.triEdge[3 * t + k]!;
        const ex = mesh.x[mesh.edgeA[e]!]! - mesh.x[mesh.edgeB[e]!]!;
        const ey = mesh.y[mesh.edgeA[e]!]! - mesh.y[mesh.edgeB[e]!]!;
        const ez = mesh.z[mesh.edgeA[e]!]! - mesh.z[mesh.edgeB[e]!]!;
        const l = ex * ex + ey * ey + ez * ez;
        if (l > length) {
          length = l;
          longest = e;
        }
      }
      const t0 = mesh.edgeT0[longest]!;
      const t1 = mesh.edgeT1[longest]!;
      if (t0 < 0 || t1 < 0) continue;
      const r0 = mesh.edgeSlot(t0, longest);
      const r1 = mesh.edgeSlot(t1, longest);
      const p = mesh.tri[3 * t0 + r0]!;
      const q = mesh.tri[3 * t0 + ((r0 + 1) % 3)]!;
      const k = mesh.tri[3 * t0 + ((r0 + 2) % 3)]!;
      const l = mesh.tri[3 * t1 + ((r1 + 2) % 3)]!;
      if (existing.has(key(k, l))) continue;
      // Both new triangles must beat the cap's smallest angle (have a smaller largest cosine).
      const n0 = angleCosines(mesh, p, l, k);
      const n1 = angleCosines(mesh, l, q, k);
      const old = Math.max(here.minCos, angleCosines(mesh, q, p, l).minCos);
      if (!(n0.minCos < old && n1.minCos < old)) continue;
      const h = mesh.unfold(longest);
      const restKL = h ? Math.sqrt((h.xk - h.xl) * (h.xk - h.xl) + (h.yk - h.yl) * (h.yk - h.yl)) : Math.sqrt(length);
      existing.delete(key(p, q));
      existing.add(key(k, l));
      mesh.flip(longest, restKL);
      flips++;
    }
    if (flips === 0) break;
  }
}

/**
 * Keeps every rest triangle a real triangle. Growth is set edge by edge, so where it changes
 * sharply within one cell (a narrow growth zone with a high margin bias) one side can outgrow the
 * other two. Wherever a rest triangle's largest angle would exceed MAX_REST_ANGLE, its longest side
 * is shortened until that angle is exactly MAX_REST_ANGLE: c² = a² + b² − 2ab cos(MAX_REST_ANGLE).
 * Triangles are visited in index order.
 */
function clampRestCaps(mesh: GrowingMesh): void {
  for (let t = 0; t < mesh.triangleCount; t++) {
    const e0 = mesh.triEdge[3 * t]!;
    const e1 = mesh.triEdge[3 * t + 1]!;
    const e2 = mesh.triEdge[3 * t + 2]!;
    const r0 = mesh.rest[e0]!;
    const r1 = mesh.rest[e1]!;
    const r2 = mesh.rest[e2]!;
    const longest = r0 >= r1 && r0 >= r2 ? e0 : r1 >= r2 ? e1 : e2;
    const a = longest === e0 ? r1 : r0;
    const b = longest === e2 ? r1 : r2;
    const limit = Math.sqrt(a * a + b * b - 2 * a * b * MAX_REST_ANGLE_COSINE);
    if (mesh.rest[longest]! > limit) mesh.rest[longest] = limit;
  }
}

/**
 * Triangles whose smallest current angle is below the guard angle: the angle opposite the shortest
 * side has cosine (b² + c² − a²) / 2bc, compared against cos(SHAPE_GUARD_ANGLE).
 */
function thinTriangles(mesh: GrowingMesh): number[] {
  const out: number[] = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const p = mesh.tri[3 * t]!;
    const q = mesh.tri[3 * t + 1]!;
    const r = mesh.tri[3 * t + 2]!;
    const d2 = (a: number, b: number) => {
      const ex = mesh.x[a]! - mesh.x[b]!;
      const ey = mesh.y[a]! - mesh.y[b]!;
      const ez = mesh.z[a]! - mesh.z[b]!;
      return ex * ex + ey * ey + ez * ez;
    };
    const s0 = d2(p, q);
    const s1 = d2(q, r);
    const s2 = d2(r, p);
    const a2 = Math.min(s0, s1, s2);
    const b2 = a2 === s0 ? s1 : s0;
    const c2 = a2 === s2 ? s1 : s2;
    const bc = Math.sqrt(b2 * c2);
    if (bc === 0 || (b2 + c2 - a2) / (2 * bc) > SHAPE_GUARD_COSINE) out.push(t);
  }
  return out;
}

/**
 * One shape-matching vote for triangle t: its rest triangle (laid flat from its rest lengths) is
 * rotated to fit the current corners best, within the current plane of the triangle, and each corner
 * is asked to move to its place in that fit. The best rotation comes from the sums of dot and cross
 * products between rest and current corner offsets, with no trigonometry.
 */
function shapeVote(
  mesh: GrowingMesh,
  t: number,
  dx: Float64Array,
  dy: Float64Array,
  dz: Float64Array,
  count: Float64Array,
): void {
  const v = [mesh.tri[3 * t]!, mesh.tri[3 * t + 1]!, mesh.tri[3 * t + 2]!] as const;
  // Rest corners in 2D: v0 at (0, 0), v1 at (c, 0), v2 above the axis (counter-clockwise).
  const c = mesh.rest[mesh.triEdge[3 * t]!]!;
  const a = mesh.rest[mesh.triEdge[3 * t + 1]!]!;
  const b = mesh.rest[mesh.triEdge[3 * t + 2]!]!;
  if (!(c > 0)) return;
  const x2 = (c * c + b * b - a * a) / (2 * c);
  const y2 = Math.sqrt(Math.max(0, b * b - x2 * x2));
  const rx = [0, c, x2];
  const ry = [0, 0, y2];
  // Current frame: e1 along v0 → v1, n the outward normal, e2 = n × e1.
  const px = v.map((i) => mesh.x[i]!);
  const py = v.map((i) => mesh.y[i]!);
  const pz = v.map((i) => mesh.z[i]!);
  let e1x = px[1]! - px[0]!;
  let e1y = py[1]! - py[0]!;
  let e1z = pz[1]! - pz[0]!;
  const fx = px[2]! - px[0]!;
  const fy = py[2]! - py[0]!;
  const fz = pz[2]! - pz[0]!;
  let nx = e1y * fz - e1z * fy;
  let ny = e1z * fx - e1x * fz;
  let nz = e1x * fy - e1y * fx;
  const l1 = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
  const ln = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (l1 === 0 || ln === 0) return;
  e1x /= l1;
  e1y /= l1;
  e1z /= l1;
  nx /= ln;
  ny /= ln;
  nz /= ln;
  const e2x = ny * e1z - nz * e1y;
  const e2y = nz * e1x - nx * e1z;
  const e2z = nx * e1y - ny * e1x;
  // Current corners in that frame, and both sets of corners about their centroids.
  const cx = (px[0]! + px[1]! + px[2]!) / 3;
  const cy = (py[0]! + py[1]! + py[2]!) / 3;
  const cz = (pz[0]! + pz[1]! + pz[2]!) / 3;
  const rcx = (rx[0]! + rx[1]! + rx[2]!) / 3;
  const rcy = (ry[0]! + ry[1]! + ry[2]!) / 3;
  let dot = 0;
  let cross = 0;
  const ux: number[] = [];
  const uy: number[] = [];
  for (let k = 0; k < 3; k++) {
    const ox = px[k]! - cx;
    const oy = py[k]! - cy;
    const oz = pz[k]! - cz;
    ux.push(ox * e1x + oy * e1y + oz * e1z);
    uy.push(ox * e2x + oy * e2y + oz * e2z);
    const sx = rx[k]! - rcx;
    const sy = ry[k]! - rcy;
    dot += sx * ux[k]! + sy * uy[k]!;
    cross += sx * uy[k]! - sy * ux[k]!;
  }
  const norm = Math.sqrt(dot * dot + cross * cross);
  if (norm === 0) return;
  const cs = dot / norm;
  const sn = cross / norm;
  for (let k = 0; k < 3; k++) {
    const sx = rx[k]! - rcx;
    const sy = ry[k]! - rcy;
    const tu = cs * sx - sn * sy;
    const tv = sn * sx + cs * sy;
    const i = v[k]!;
    const w = SHAPE_GUARD_WEIGHT;
    dx[i] = dx[i]! + w * (cx + tu * e1x + tv * e2x - px[k]!);
    dy[i] = dy[i]! + w * (cy + tu * e1y + tv * e2y - py[k]!);
    dz[i] = dz[i]! + w * (cz + tu * e1z + tv * e2z - pz[k]!);
    count[i] = count[i]! + w;
  }
}

/** Cosine of the angle between the current normals of triangles (p, q, k) and (q, p, l). */
function foldCosine(mesh: GrowingMesh, p: number, q: number, k: number, l: number): number {
  const ex = mesh.x[q]! - mesh.x[p]!;
  const ey = mesh.y[q]! - mesh.y[p]!;
  const ez = mesh.z[q]! - mesh.z[p]!;
  const kx = mesh.x[k]! - mesh.x[p]!;
  const ky = mesh.y[k]! - mesh.y[p]!;
  const kz = mesh.z[k]! - mesh.z[p]!;
  const lx = mesh.x[l]! - mesh.x[p]!;
  const ly = mesh.y[l]! - mesh.y[p]!;
  const lz = mesh.z[l]! - mesh.z[p]!;
  // n0 = e × k for (p, q, k); n1 = l × e for (q, p, l), both outward.
  const ax = ey * kz - ez * ky;
  const ay = ez * kx - ex * kz;
  const az = ex * ky - ey * kx;
  const bx = ly * ez - lz * ey;
  const by = lz * ex - lx * ez;
  const bz = lx * ey - ly * ex;
  const la = Math.sqrt(ax * ax + ay * ay + az * az);
  const lb = Math.sqrt(bx * bx + by * by + bz * bz);
  if (la === 0 || lb === 0) return -1;
  return (ax * bx + ay * by + az * bz) / (la * lb);
}

/**
 * Keeps the rest triangles well shaped: every interior edge whose two opposite angles in the flat
 * unfolding sum to more than 180 degrees is flipped to the other diagonal (a Delaunay flip in the rest
 * geometry), in edge order, sweeping until none is left or FLIP_SWEEPS sweeps have run. A flip that
 * would duplicate an existing edge, or cut across a fold sharper than FLIP_MIN_FOLD_COSINE, is skipped.
 */
function flipEdges(mesh: GrowingMesh): void {
  const key = (a: number, b: number) => Math.min(a, b) * 65536 + Math.max(a, b);
  const existing = new Set<number>();
  for (let e = 0; e < mesh.edgeCount; e++) if (mesh.alive[e] === 1) existing.add(key(mesh.edgeA[e]!, mesh.edgeB[e]!));
  for (let sweep = 0; sweep < FLIP_SWEEPS; sweep++) {
    let flips = 0;
    for (let e = 0; e < mesh.edgeCount; e++) {
      if (mesh.alive[e] !== 1) continue;
      const h = mesh.unfold(e);
      if (!h) continue;
      const { c, xk, yk, xl, yl } = h;
      // Angles at k and l, from the vectors to p (0, 0) and q (c, 0).
      const kpx = -xk;
      const kpy = -yk;
      const kqx = c - xk;
      const kqy = -yk;
      const lpx = -xl;
      const lpy = -yl;
      const lqx = c - xl;
      const lqy = -yl;
      // sin and cos of each angle, unnormalised: cross and dot products.
      const sinK = Math.abs(kpx * kqy - kpy * kqx);
      const cosK = kpx * kqx + kpy * kqy;
      const sinL = Math.abs(lpx * lqy - lpy * lqx);
      const cosL = lpx * lqx + lpy * lqy;
      // angle K + angle L > 180° exactly when sin(K + L) < 0.
      if (sinK * cosL + cosK * sinL >= 0) continue;
      // Never flip across a sharp fold: the new diagonal would cut through it and leave two slivers.
      if (foldCosine(mesh, h.p, h.q, h.k, h.l) < FLIP_MIN_FOLD_COSINE) continue;
      const kl = key(h.k, h.l);
      if (existing.has(kl)) continue;
      existing.delete(key(h.p, h.q));
      existing.add(kl);
      const dx = xk - xl;
      const dy = yk - yl;
      mesh.flip(e, Math.sqrt(dx * dx + dy * dy));
      flips++;
    }
    if (flips === 0) break;
  }
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
    const mx = mesh.mx[j]! - mesh.mx[i]!;
    const my = mesh.my[j]! - mesh.my[i]!;
    const mz = mesh.mz[j]! - mesh.mz[i]!;
    if (mx * mx + my * my + mz * mz < separation2) return;
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
