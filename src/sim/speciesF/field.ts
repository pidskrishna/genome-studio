import { LEAF_SIZE, SOFTENING, THETA } from './constants';

// The fields of the Neighbour-Sensing model (Meškauskas, McNulty and Moore 2004), summed with a
// Barnes–Hut octree (clarification 29). Every point of the mycelium carries a weight, lc divided
// by the number of points in its section (eq. 3, so each section counts once), its section and the
// unit direction of the segment ending at it. At a tip the tree returns:
// - the density field N = Σ w / (d² + ε²) (eq. 3) and its gradient;
// - the gradient of the long-range field M = Σ w / (d² + ε²)^(1/4), falling with the square root of
//   distance (eq. 5, clarification 34);
// - the parallel (galvanotropic) field: each segment points to its apical end with strength 1 / h,
//   h the distance from the segment, where the point lies beside it (eq. 9).
// A tip does not sense its own section (eq. 4): the tree sums every point, distant cells as one
// point at their weighted centre and nearer ones point by point, and the own section's points are
// then subtracted exactly.


export interface FieldPoints {
  count: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  weight: Float64Array;
  section: Int32Array;
  tx: Float64Array;
  ty: Float64Array;
  tz: Float64Array;
}

export interface FieldSample {
  density: number;
  /** ∇N. */
  dx: number;
  dy: number;
  dz: number;
  /** ∇M. */
  mx: number;
  my: number;
  mz: number;
  /** The parallel field. */
  px: number;
  py: number;
  pz: number;
}

const EPS2 = SOFTENING * SOFTENING;

export class FieldTree {
  private readonly order: Int32Array;
  // Per tree node: centre and half size of its cube, total weight, weighted centre, summed segment
  // directions, first child (−1 for a leaf), and the range of `order` it covers.
  private cx: number[] = [];
  private cy: number[] = [];
  private cz: number[] = [];
  private half: number[] = [];
  private w: number[] = [];
  private wx: number[] = [];
  private wy: number[] = [];
  private wz: number[] = [];
  private sx: number[] = [];
  private sy: number[] = [];
  private sz: number[] = [];
  private child: number[] = [];
  private from: number[] = [];
  private to: number[] = [];

  constructor(private readonly pts: FieldPoints) {
    const n = pts.count;
    this.order = new Int32Array(n);
    for (let i = 0; i < n; i++) this.order[i] = i;
    if (n === 0) return;
    let lo = [Infinity, Infinity, Infinity];
    let hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      lo = [Math.min(lo[0]!, pts.x[i]!), Math.min(lo[1]!, pts.y[i]!), Math.min(lo[2]!, pts.z[i]!)];
      hi = [Math.max(hi[0]!, pts.x[i]!), Math.max(hi[1]!, pts.y[i]!), Math.max(hi[2]!, pts.z[i]!)];
    }
    const half = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2 + 1e-9;
    this.build(0, n, (lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2, half, 0);
  }

  private build(start: number, end: number, cx: number, cy: number, cz: number, half: number, depth: number): number {
    const id = this.cx.length;
    const p = this.pts;
    let w = 0;
    let wx = 0;
    let wy = 0;
    let wz = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let k = start; k < end; k++) {
      const i = this.order[k]!;
      const wi = p.weight[i]!;
      w += wi;
      wx += wi * p.x[i]!;
      wy += wi * p.y[i]!;
      wz += wi * p.z[i]!;
      sx += p.tx[i]!;
      sy += p.ty[i]!;
      sz += p.tz[i]!;
    }
    this.cx.push(cx);
    this.cy.push(cy);
    this.cz.push(cz);
    this.half.push(half);
    this.w.push(w);
    this.wx.push(w > 0 ? wx / w : cx);
    this.wy.push(w > 0 ? wy / w : cy);
    this.wz.push(w > 0 ? wz / w : cz);
    this.sx.push(sx);
    this.sy.push(sy);
    this.sz.push(sz);
    this.child.push(-1);
    this.from.push(start);
    this.to.push(end);
    if (end - start <= LEAF_SIZE || depth >= 24) return id;
    // Partition into octants by counting, keeping the original order within each.
    const octant = (i: number) => (p.x[i]! >= cx ? 1 : 0) + (p.y[i]! >= cy ? 2 : 0) + (p.z[i]! >= cz ? 4 : 0);
    const counts = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = start; k < end; k++) counts[octant(this.order[k]!)]!++;
    const starts = [start];
    for (let o = 1; o < 8; o++) starts.push(starts[o - 1]! + counts[o - 1]!);
    const sorted = new Int32Array(end - start);
    const next = starts.slice();
    for (let k = start; k < end; k++) {
      const i = this.order[k]!;
      const o = octant(i);
      sorted[next[o]! - start] = i;
      next[o]!++;
    }
    this.order.set(sorted, start);
    const h = half / 2;
    const children: number[] = [];
    for (let o = 0; o < 8; o++) {
      const s = starts[o]!;
      const e = s + counts[o]!;
      if (e === s) {
        children.push(-1);
        continue;
      }
      children.push(this.build(s, e, cx + (o & 1 ? h : -h), cy + (o & 2 ? h : -h), cz + (o & 4 ? h : -h), h, depth + 1));
    }
    // Children are stored as a block of 8 ids after this node's own entry.
    this.child[id] = this.childBlock.length;
    this.childBlock.push(...children);
    return id;
  }

  private childBlock: number[] = [];

  /** The fields at (x, y, z), leaving out the points listed in `own` (a tip's own section). */
  sample(x: number, y: number, z: number, own: ArrayLike<number>, out: FieldSample): FieldSample {
    out.density = 0;
    out.dx = out.dy = out.dz = 0;
    out.mx = out.my = out.mz = 0;
    out.px = out.py = out.pz = 0;
    if (this.pts.count === 0) return out;
    const p = this.pts;
    const stack = [0];
    const theta2 = THETA * THETA;
    while (stack.length > 0) {
      const node = stack.pop()!;
      const ex = x - this.wx[node]!;
      const ey = y - this.wy[node]!;
      const ez = z - this.wz[node]!;
      const d2 = ex * ex + ey * ey + ez * ez;
      const size = 2 * this.half[node]!;
      if (this.child[node] !== -1 && size * size < theta2 * d2) {
        add(out, this.w[node]!, ex, ey, ez, d2);
        const d = Math.sqrt(d2);
        out.px += this.sx[node]! / d;
        out.py += this.sy[node]! / d;
        out.pz += this.sz[node]! / d;
        continue;
      }
      if (this.child[node] === -1) {
        for (let k = this.from[node]!; k < this.to[node]!; k++) point(out, p, this.order[k]!, x, y, z, 1);
        continue;
      }
      const block = this.child[node]!;
      for (let o = 7; o >= 0; o--) {
        const c = this.childBlock[block + o]!;
        if (c >= 0) stack.push(c);
      }
    }
    for (let k = 0; k < own.length; k++) point(out, p, own[k]!, x, y, z, -1);
    return out;
  }
}

/** Adds (sign 1) or removes (sign −1) one point's exact contribution to every field. */
function point(out: FieldSample, p: FieldPoints, i: number, x: number, y: number, z: number, sign: number): void {
  const fx = x - p.x[i]!;
  const fy = y - p.y[i]!;
  const fz = z - p.z[i]!;
  add(out, sign * p.weight[i]!, fx, fy, fz, fx * fx + fy * fy + fz * fz);
  // Beside the unit segment that ends at the point, pointing to that end (eq. 9).
  const tx = p.tx[i]!;
  const ty = p.ty[i]!;
  const tz = p.tz[i]!;
  const along = fx * tx + fy * ty + fz * tz;
  if (along > 0 || along < -1) return;
  const h = Math.sqrt(Math.max(fx * fx + fy * fy + fz * fz - along * along, EPS2));
  out.px += (sign * tx) / h;
  out.py += (sign * ty) / h;
  out.pz += (sign * tz) / h;
}

/** Adds one source of weight w at offset (ex, ey, ez) from the sample point, d2 = |e|². */
function add(out: FieldSample, w: number, ex: number, ey: number, ez: number, d2: number): void {
  const s = d2 + EPS2;
  const n = w / s;
  out.density += n;
  // ∇ (w / s) = −2 w e / s².
  const g = (-2 * n) / s;
  out.dx += g * ex;
  out.dy += g * ey;
  out.dz += g * ez;
  // M = w s^(−1/4): ∇M = −(1/2) w e s^(−5/4).
  const q = Math.sqrt(Math.sqrt(s));
  const m = (-0.5 * w) / (s * q);
  out.mx += m * ex;
  out.my += m * ey;
  out.mz += m * ez;
}
