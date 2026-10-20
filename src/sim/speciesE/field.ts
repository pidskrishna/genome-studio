import { COARSE_SWEEPS, CYCLES, SMOOTH } from './constants';

// The nutrient field of species E (spec section 4c, clarifications 29 and 32). R lives on a cubic
// lattice of n × n × n nodes at integer coordinates, index (y n + z) n + x, y up. The top plane
// (y = n − 1) is held at R = 1; the floor (y = 0) and the colony are solid, R = 0; the four sides
// wrap around. Each growth step advances diffusion by one backward Euler step,
// (1 − α∇²) R = R_previous with α = D Δt in l.u.², solved by a fixed number of multigrid V-cycles
// started from the previous field. As α grows the step reaches the steady (Laplace) field.

/** One grid of the multigrid hierarchy. Level 0 holds R itself; coarser levels hold corrections. */
interface Level {
  n: number;
  /** α / h², h the node spacing in lattice units. */
  scale: number;
  /** 1 where the value is fixed (solid, floor or top), 0 where it is solved for. */
  fixed: Uint8Array;
  u: Float64Array;
  f: Float64Array;
  r: Float64Array;
}

export class NutrientField {
  readonly n: number;
  private readonly levels: Level[] = [];

  constructor(n: number) {
    this.n = n;
    let size = n;
    for (;;) {
      const count = size * size * size;
      this.levels.push({ n: size, scale: 0, fixed: new Uint8Array(count), u: new Float64Array(count), f: new Float64Array(count), r: new Float64Array(count) });
      if (size % 2 !== 0 || size <= 6) break;
      size /= 2;
    }
    // Start from a linear field, as Merks et al. do.
    const top = this.levels[0]!;
    for (let y = 0; y < n; y++) {
      const value = y / (n - 1);
      for (let i = y * n * n; i < (y + 1) * n * n; i++) top.u[i] = value;
    }
  }

  /** R at level 0, read only. */
  get values(): Float64Array {
    return this.levels[0]!.u;
  }

  /**
   * Sets the solid nodes from a mask over level 0 (1 for colony), adds the floor and top, sets
   * fixed values, and rebuilds the coarse masks. A coarse node is fixed when at least half of its
   * eight children are.
   */
  setSolid(colony: Uint8Array): void {
    const n = this.n;
    const top = this.levels[0]!;
    const plane = n * n;
    for (let i = 0; i < top.u.length; i++) {
      const y = Math.floor(i / plane);
      if (y === n - 1) {
        top.fixed[i] = 1;
        top.u[i] = 1;
      } else if (y === 0 || colony[i] === 1) {
        top.fixed[i] = 1;
        top.u[i] = 0;
      } else {
        top.fixed[i] = 0;
      }
    }
    for (let l = 1; l < this.levels.length; l++) {
      const fine = this.levels[l - 1]!;
      const coarse = this.levels[l]!;
      const m = coarse.n;
      const fn = fine.n;
      for (let y = 0; y < m; y++) {
        for (let z = 0; z < m; z++) {
          for (let x = 0; x < m; x++) {
            let count = 0;
            for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) count += fine.fixed[((2 * y + dy) * fn + 2 * z + dz) * fn + 2 * x + dx]!;
            const edge = y === 0 || y === m - 1;
            coarse.fixed[(y * m + z) * m + x] = edge || count >= 4 ? 1 : 0;
          }
        }
      }
    }
  }

  /** Advances the field by one backward Euler step of α = D Δt (l.u.²). */
  step(alpha: number): void {
    const top = this.levels[0]!;
    for (let l = 0; l < this.levels.length; l++) {
      const h = 1 << l;
      this.levels[l]!.scale = alpha / (h * h);
    }
    top.f.set(top.u);
    for (let c = 0; c < CYCLES; c++) this.cycle(0);
  }

  /** Solves to near the steady (Laplace) state, for tests: many cycles of a very long step. */
  settle(cycles: number): void {
    for (let c = 0; c < cycles; c++) this.step(1e9);
  }

  private cycle(l: number): void {
    const level = this.levels[l]!;
    const coarsest = l === this.levels.length - 1;
    if (coarsest) {
      for (let s = 0; s < COARSE_SWEEPS; s++) sweep(level);
      return;
    }
    for (let s = 0; s < SMOOTH; s++) sweep(level);
    residual(level);
    const coarse = this.levels[l + 1]!;
    restrict(level, coarse);
    coarse.u.fill(0);
    this.cycle(l + 1);
    prolong(coarse, level);
    for (let s = 0; s < SMOOTH; s++) sweep(level);
  }

  /** R at a point, by trilinear interpolation; above the lattice R = 1, below it 0; sides wrap. */
  sample(x: number, y: number, z: number): number {
    const n = this.n;
    if (y >= n - 1) return 1;
    if (y <= 0) return 0;
    const u = this.levels[0]!.u;
    const wrap = (v: number) => ((v % n) + n) % n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = x - x0;
    const fy = y - y0;
    const fz = z - z0;
    const xa = wrap(x0);
    const xb = wrap(x0 + 1);
    const za = wrap(z0);
    const zb = wrap(z0 + 1);
    const at = (yy: number, zz: number, xx: number) => u[(yy * n + zz) * n + xx]!;
    const c00 = at(y0, za, xa) * (1 - fx) + at(y0, za, xb) * fx;
    const c01 = at(y0, zb, xa) * (1 - fx) + at(y0, zb, xb) * fx;
    const c10 = at(y0 + 1, za, xa) * (1 - fx) + at(y0 + 1, za, xb) * fx;
    const c11 = at(y0 + 1, zb, xa) * (1 - fx) + at(y0 + 1, zb, xb) * fx;
    const c0 = c00 * (1 - fz) + c01 * fz;
    const c1 = c10 * (1 - fz) + c11 * fz;
    return c0 * (1 - fy) + c1 * fy;
  }
}

/** One red-black Gauss–Seidel sweep of (1 + 6a) u − a Σ neighbours = f over the free nodes. */
function sweep(level: Level): void {
  const { n, scale: a, fixed, u, f } = level;
  const plane = n * n;
  const diagonal = 1 + 6 * a;
  for (let colour = 0; colour < 2; colour++) {
    for (let y = 1; y < n - 1; y++) {
      for (let z = 0; z < n; z++) {
        const row = (y * n + z) * n;
        const zm = (y * n + (z === 0 ? n - 1 : z - 1)) * n;
        const zp = (y * n + (z === n - 1 ? 0 : z + 1)) * n;
        for (let x = (y + z + colour) & 1; x < n; x += 2) {
          const i = row + x;
          if (fixed[i] === 1) continue;
          const xm = x === 0 ? n - 1 : x - 1;
          const xp = x === n - 1 ? 0 : x + 1;
          const sum = u[row + xm]! + u[row + xp]! + u[zm + x]! + u[zp + x]! + u[i - plane]! + u[i + plane]!;
          u[i] = (f[i]! + a * sum) / diagonal;
        }
      }
    }
  }
}

function residual(level: Level): void {
  const { n, scale: a, fixed, u, f, r } = level;
  const plane = n * n;
  const diagonal = 1 + 6 * a;
  r.fill(0);
  for (let y = 1; y < n - 1; y++) {
    for (let z = 0; z < n; z++) {
      const row = (y * n + z) * n;
      const zm = (y * n + (z === 0 ? n - 1 : z - 1)) * n;
      const zp = (y * n + (z === n - 1 ? 0 : z + 1)) * n;
      for (let x = 0; x < n; x++) {
        const i = row + x;
        if (fixed[i] === 1) continue;
        const xm = x === 0 ? n - 1 : x - 1;
        const xp = x === n - 1 ? 0 : x + 1;
        const sum = u[row + xm]! + u[row + xp]! + u[zm + x]! + u[zp + x]! + u[i - plane]! + u[i + plane]!;
        r[i] = f[i]! - (diagonal * u[i]! - a * sum);
      }
    }
  }
}

/** The coarse right-hand side: the mean of the eight children's residuals, on free coarse nodes. */
function restrict(fine: Level, coarse: Level): void {
  const m = coarse.n;
  const fn = fine.n;
  for (let y = 0; y < m; y++) {
    for (let z = 0; z < m; z++) {
      for (let x = 0; x < m; x++) {
        const c = (y * m + z) * m + x;
        if (coarse.fixed[c] === 1) {
          coarse.f[c] = 0;
          continue;
        }
        let sum = 0;
        for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) sum += fine.r[((2 * y + dy) * fn + 2 * z + dz) * fn + 2 * x + dx]!;
        coarse.f[c] = sum / 8;
      }
    }
  }
}

/** Adds each coarse correction to its eight children, on free fine nodes. */
function prolong(coarse: Level, fine: Level): void {
  const m = coarse.n;
  const fn = fine.n;
  for (let y = 0; y < fn; y++) {
    for (let z = 0; z < fn; z++) {
      const crow = ((y >> 1) * m + (z >> 1)) * m;
      const frow = (y * fn + z) * fn;
      for (let x = 0; x < fn; x++) {
        const i = frow + x;
        if (fine.fixed[i] === 1) continue;
        fine.u[i] = fine.u[i]! + coarse.u[crow + (x >> 1)]!;
      }
    }
  }
}

/**
 * Marks the lattice nodes inside a closed triangle mesh, by the winding number along vertical rays
 * through each column (x, z). A face whose normal points down is entered going up (+1), one whose
 * normal points up is left (−1); a node is inside where the running sum is not 0, so overlapping
 * branches stay solid. Columns use the top-left rule, so a ray through a shared edge counts once.
 */
export function voxelise(n: number, positions: ArrayLike<number>, triangles: ArrayLike<number>, triangleCount: number, out: Uint8Array): void {
  out.fill(0);
  const columns = n * n;
  const counts = new Int32Array(columns + 1);
  // Two passes: count crossings per column, then fill them.
  for (let pass = 0; pass < 2; pass++) {
    const starts = pass === 1 ? prefix(counts) : null;
    const heights = pass === 1 ? new Float64Array(starts![columns]!) : null;
    const signs = pass === 1 ? new Int8Array(starts![columns]!) : null;
    const fill = pass === 1 ? new Int32Array(columns) : null;
    for (let t = 0; t < triangleCount; t++) {
      const a = triangles[t * 3]!;
      const b = triangles[t * 3 + 1]!;
      const c = triangles[t * 3 + 2]!;
      const ax = positions[a * 3]!;
      const ay = positions[a * 3 + 1]!;
      const az = positions[a * 3 + 2]!;
      let bx = positions[b * 3]!;
      let by = positions[b * 3 + 1]!;
      let bz = positions[b * 3 + 2]!;
      let cx = positions[c * 3]!;
      let cy = positions[c * 3 + 1]!;
      let cz = positions[c * 3 + 2]!;
      // Normal's y component: (b − a) × (c − a), y part.
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      if (ny === 0) continue;
      const sign = ny < 0 ? 1 : -1;
      // Orient the projection counter-clockwise in (x, z).
      if (ny > 0) {
        [bx, cx] = [cx, bx];
        [by, cy] = [cy, by];
        [bz, cz] = [cz, bz];
      }
      const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (!(area > 0)) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(n - 1, Math.floor(Math.max(ax, bx, cx)) + 1);
      const z0 = Math.max(0, Math.floor(Math.min(az, bz, cz)));
      const z1 = Math.min(n - 1, Math.floor(Math.max(az, bz, cz)) + 1);
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const w0 = edge(bx, bz, cx, cz, x, z);
          const w1 = edge(cx, cz, ax, az, x, z);
          const w2 = edge(ax, az, bx, bz, x, z);
          if (!covers(w0, bx, bz, cx, cz) || !covers(w1, cx, cz, ax, az) || !covers(w2, ax, az, bx, bz)) continue;
          const col = z * n + x;
          if (pass === 0) {
            counts[col] = counts[col]! + 1;
          } else {
            const k = starts![col]! + fill![col]!;
            fill![col] = fill![col]! + 1;
            heights![k] = (w0 * ay + w1 * by + w2 * cy) / area;
            signs![k] = sign;
          }
        }
      }
    }
    if (pass === 1) {
      for (let col = 0; col < columns; col++) {
        const s = starts![col]!;
        const e = starts![col + 1]!;
        if (e - s < 2) continue;
        // Insertion sort by height, then sign, so equal heights resolve the same way every time.
        for (let i = s + 1; i < e; i++) {
          const h = heights![i]!;
          const g = signs![i]!;
          let j = i - 1;
          while (j >= s && (heights![j]! > h || (heights![j]! === h && signs![j]! < g))) {
            heights![j + 1] = heights![j]!;
            signs![j + 1] = signs![j]!;
            j--;
          }
          heights![j + 1] = h;
          signs![j + 1] = g;
        }
        let winding = 0;
        const x = col % n;
        const z = (col - x) / n;
        for (let i = s; i < e - 1; i++) {
          winding += signs![i]!;
          if (winding === 0) continue;
          const from = Math.max(0, -Math.floor(-heights![i]!));
          const to = Math.min(n - 1, -Math.floor(-heights![i + 1]!) - 1);
          for (let y = from; y <= to; y++) out[(y * n + z) * n + x] = 1;
        }
      }
    }
  }
}

function prefix(counts: Int32Array): Int32Array {
  const starts = new Int32Array(counts.length);
  let total = 0;
  for (let i = 0; i < counts.length - 1; i++) {
    starts[i] = total;
    total += counts[i]!;
  }
  starts[counts.length - 1] = total;
  return starts;
}

/** Twice the signed area of (p, q, point), positive when the point is left of p → q. */
function edge(px: number, pz: number, qx: number, qz: number, x: number, z: number): number {
  return (qx - px) * (z - pz) - (qz - pz) * (x - px);
}

/** Inside an edge, with the top-left rule deciding points exactly on it. */
function covers(w: number, px: number, pz: number, qx: number, qz: number): boolean {
  if (w > 0) return true;
  if (w < 0) return false;
  const dx = qx - px;
  const dz = qz - pz;
  return dz < 0 || (dz === 0 && dx > 0);
}
