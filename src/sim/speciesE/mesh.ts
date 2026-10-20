import { atan2, PI } from '../dmath';

// The colony surface of species E: a closed triangle mesh whose vertices are polyps (spec section
// 4c). Triangles wind counter-clockwise seen from outside. Refinement follows Merks et al. (2003):
// an edge splits when it is too long, with the new vertex placed by third-order interpolation
// between the two vertex normals (their figure 4.4) and the triangles around it divided by the
// insertion rules of their figure 4.5; two vertices fuse at their midpoint when their edge is too
// short; a triangle too small is removed by fusing its shortest edge. Fusion keeps the surface
// manifold: it is skipped where it would pinch the surface or turn a triangle over.

export class CoralMesh {
  /** x, y, z per vertex. */
  positions: number[] = [];
  /** Three vertex indices per triangle. */
  triangles: number[] = [];
  /** The growth step each vertex appeared in. */
  birth: number[] = [];
  /** Each vertex's last normalised uptake. */
  uptake: number[] = [];

  get vertexCount(): number {
    return this.birth.length;
  }

  get triangleCount(): number {
    return this.triangles.length / 3;
  }

  addVertex(x: number, y: number, z: number, birth: number, uptake: number): number {
    this.positions.push(x, y, z);
    this.birth.push(birth);
    this.uptake.push(uptake);
    return this.birth.length - 1;
  }

  /** Area-weighted vertex normals, unit length; (0, 1, 0) where they vanish. */
  normals(): Float64Array {
    const p = this.positions;
    const t = this.triangles;
    const out = new Float64Array(p.length);
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i]! * 3;
      const b = t[i + 1]! * 3;
      const c = t[i + 2]! * 3;
      const ux = p[b]! - p[a]!;
      const uy = p[b + 1]! - p[a + 1]!;
      const uz = p[b + 2]! - p[a + 2]!;
      const vx = p[c]! - p[a]!;
      const vy = p[c + 1]! - p[a + 1]!;
      const vz = p[c + 2]! - p[a + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) {
        out[v] = out[v]! + nx;
        out[v + 1] = out[v + 1]! + ny;
        out[v + 2] = out[v + 2]! + nz;
      }
    }
    for (let v = 0; v < out.length; v += 3) {
      const len = Math.sqrt(out[v]! * out[v]! + out[v + 1]! * out[v + 1]! + out[v + 2]! * out[v + 2]!);
      if (len > 0) {
        out[v] = out[v]! / len;
        out[v + 1] = out[v + 1]! / len;
        out[v + 2] = out[v + 2]! / len;
      } else {
        out[v] = 0;
        out[v + 1] = 1;
        out[v + 2] = 0;
      }
    }
    return out;
  }

  /**
   * Unique edges. `triEdge[3t + k]` is the edge from corner k to corner k + 1 of triangle t. Edges
   * are numbered in order of their (lower, higher) vertex pair, so the numbering is the same on
   * every machine.
   */
  edges(): { a: Int32Array; b: Int32Array; triEdge: Int32Array } {
    const t = this.triangles;
    const slots = t.length;
    const span = this.vertexCount;
    const keys = new Float64Array(slots);
    for (let s = 0; s < slots; s++) {
      const p = t[s]!;
      const q = t[s - (s % 3) + ((s % 3) + 1) % 3]!;
      keys[s] = p < q ? p * span + q : q * span + p;
    }
    const order = new Int32Array(slots);
    for (let s = 0; s < slots; s++) order[s] = s;
    order.sort((i, j) => keys[i]! - keys[j]! || i - j);
    const triEdge = new Int32Array(slots);
    const ea: number[] = [];
    const eb: number[] = [];
    let last = -1;
    for (let k = 0; k < slots; k++) {
      const s = order[k]!;
      const key = keys[s]!;
      if (key !== last) {
        last = key;
        const lo = Math.floor(key / span);
        ea.push(lo);
        eb.push(key - lo * span);
      }
      triEdge[s] = ea.length - 1;
    }
    return { a: Int32Array.from(ea), b: Int32Array.from(eb), triEdge };
  }

  length(a: number, b: number): number {
    const p = this.positions;
    const dx = p[b * 3]! - p[a * 3]!;
    const dy = p[b * 3 + 1]! - p[a * 3 + 1]!;
    const dz = p[b * 3 + 2]! - p[a * 3 + 2]!;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Splits every edge longer than `limit` (or every edge, with `limit` −1), placing each new vertex
   * by cubic interpolation along the edge between the end normals. Returns the number of new
   * vertices. `onVertex` lets a caller give the new vertex more attributes.
   */
  split(limit: number, birth: number, onVertex?: (v: number, a: number, b: number) => void): number {
    const { a: ea, b: eb, triEdge } = this.edges();
    const normals = this.normals();
    const mid = new Int32Array(ea.length).fill(-1);
    let added = 0;
    for (let e = 0; e < ea.length; e++) {
      const a = ea[e]!;
      const b = eb[e]!;
      if (limit >= 0 && !(this.length(a, b) > limit)) continue;
      const [x, y, z] = hermiteMidpoint(this.positions, normals, a, b);
      mid[e] = this.addVertex(x, y, z, birth < 0 ? (this.birth[a]! + this.birth[b]!) / 2 : birth, (this.uptake[a]! + this.uptake[b]!) / 2);
      onVertex?.(mid[e]!, a, b);
      added++;
    }
    if (added === 0) return 0;
    const old = this.triangles;
    const out: number[] = [];
    const p = this.positions;
    const dist2 = (u: number, v: number) => {
      const dx = p[u * 3]! - p[v * 3]!;
      const dy = p[u * 3 + 1]! - p[v * 3 + 1]!;
      const dz = p[u * 3 + 2]! - p[v * 3 + 2]!;
      return dx * dx + dy * dy + dz * dz;
    };
    // Two marked edges, ab and bc: the corner triangle at b, then the quad a, mab, mbc, c split
    // along its shorter diagonal.
    const two = (a: number, b: number, c: number, mab: number, mbc: number) => {
      out.push(mab, b, mbc);
      if (dist2(a, mbc) <= dist2(mab, c)) out.push(a, mab, mbc, a, mbc, c);
      else out.push(a, mab, c, mab, mbc, c);
    };
    for (let t = 0; t < old.length; t += 3) {
      const a = old[t]!;
      const b = old[t + 1]!;
      const c = old[t + 2]!;
      const m0 = mid[triEdge[t]!]!;
      const m1 = mid[triEdge[t + 1]!]!;
      const m2 = mid[triEdge[t + 2]!]!;
      const marks = (m0 >= 0 ? 1 : 0) + (m1 >= 0 ? 1 : 0) + (m2 >= 0 ? 1 : 0);
      if (marks === 0) out.push(a, b, c);
      else if (marks === 3) out.push(a, m0, m2, m0, b, m1, m2, m1, c, m0, m1, m2);
      else if (marks === 1) {
        if (m0 >= 0) out.push(a, m0, c, m0, b, c);
        else if (m1 >= 0) out.push(b, m1, a, m1, c, a);
        else out.push(c, m2, b, m2, a, b);
      } else if (m2 < 0) two(a, b, c, m0, m1);
      else if (m0 < 0) two(b, c, a, m1, m2);
      else two(c, a, b, m2, m0);
    }
    this.triangles = out;
    return added;
  }

  /**
   * Fuses vertices joined by an edge shorter than `limit`, and removes triangles smaller than
   * `minArea` by fusing their shortest edge, shortest edges first. Returns the number of fusions.
   */
  fuse(limit: number, minArea: number, floor: number): number {
    const t = this.triangles;
    const V = this.vertexCount;
    const T = this.triangleCount;
    if (V <= 6) return 0;
    const { a: ea, b: eb, triEdge } = this.edges();
    const lengths = new Float64Array(ea.length);
    for (let e = 0; e < ea.length; e++) lengths[e] = this.length(ea[e]!, eb[e]!);
    const wanted = new Uint8Array(ea.length);
    for (let e = 0; e < ea.length; e++) if (lengths[e]! < limit) wanted[e] = 1;
    for (let k = 0; k < T; k++) {
      if (!(triangleArea(this.positions, t[k * 3]!, t[k * 3 + 1]!, t[k * 3 + 2]!) < minArea)) continue;
      let best = triEdge[k * 3]!;
      for (let j = 1; j < 3; j++) if (lengths[triEdge[k * 3 + j]!]! < lengths[best]!) best = triEdge[k * 3 + j]!;
      wanted[best] = 1;
    }
    const candidates: number[] = [];
    for (let e = 0; e < ea.length; e++) if (wanted[e] === 1) candidates.push(e);
    if (candidates.length === 0) return 0;
    candidates.sort((i, j) => lengths[i]! - lengths[j]! || i - j);

    // Vertex → triangles.
    const start = new Int32Array(V + 1);
    for (let s = 0; s < t.length; s++) start[t[s]! + 1] = start[t[s]! + 1]! + 1;
    for (let v = 0; v < V; v++) start[v + 1] = start[v + 1]! + start[v]!;
    const fill = start.slice(0, V);
    const around = new Int32Array(t.length);
    for (let s = 0; s < t.length; s++) {
      const v = t[s]!;
      around[fill[v]!] = (s - (s % 3)) / 3;
      fill[v] = fill[v]! + 1;
    }

    const deadTri = new Uint8Array(T);
    const deadVertex = new Uint8Array(V);
    const locked = new Uint8Array(V);
    const p = this.positions;
    let fused = 0;
    let alive = V;
    for (const e of candidates) {
      if (alive <= 6) break;
      const a = ea[e]!;
      const b = eb[e]!;
      if (locked[a] === 1 || locked[b] === 1) continue;
      const shared: number[] = [];
      const others: number[] = [];
      for (const v of [a, b]) {
        for (let k = start[v]!; k < start[v + 1]!; k++) {
          const tri = around[k]!;
          if (deadTri[tri] === 1) continue;
          const has = (w: number) => t[tri * 3] === w || t[tri * 3 + 1] === w || t[tri * 3 + 2] === w;
          if (has(a) && has(b)) {
            if (v === a) shared.push(tri);
          } else others.push(tri);
        }
      }
      if (shared.length !== 2) continue;
      // Link condition: a and b may share only the two vertices opposite their edge.
      const ringA = ring(t, around, start, deadTri, a);
      const ringB = ring(t, around, start, deadTri, b);
      let common = 0;
      for (const v of ringA) if (ringB.includes(v)) common++;
      if (common !== 2) continue;
      const mx = (p[a * 3]! + p[b * 3]!) / 2;
      const my = Math.max(floor, (p[a * 3 + 1]! + p[b * 3 + 1]!) / 2);
      const mz = (p[a * 3 + 2]! + p[b * 3 + 2]!) / 2;
      let ok = true;
      for (const tri of others) {
        const before = faceNormal(p, t[tri * 3]!, t[tri * 3 + 1]!, t[tri * 3 + 2]!, -1, 0, 0, 0);
        const after = faceNormal(p, t[tri * 3]!, t[tri * 3 + 1]!, t[tri * 3 + 2]!, a, mx, my, mz, b);
        const dot = before[0] * after[0] + before[1] * after[1] + before[2] * after[2];
        const area2 = after[0] * after[0] + after[1] * after[1] + after[2] * after[2];
        if (!(dot > 0) || !(area2 > 1e-18)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      p[a * 3] = mx;
      p[a * 3 + 1] = my;
      p[a * 3 + 2] = mz;
      this.birth[a] = (this.birth[a]! + this.birth[b]!) / 2;
      this.uptake[a] = (this.uptake[a]! + this.uptake[b]!) / 2;
      for (const tri of others) for (let j = 0; j < 3; j++) if (t[tri * 3 + j] === b) t[tri * 3 + j] = a;
      for (const tri of shared) deadTri[tri] = 1;
      deadVertex[b] = 1;
      for (const v of ringA) locked[v] = 1;
      for (const v of ringB) locked[v] = 1;
      locked[a] = 1;
      locked[b] = 1;
      fused++;
      alive--;
    }
    if (fused > 0) this.compact(deadVertex, deadTri);
    return fused;
  }

  /** Drops dead vertices and triangles and renumbers what is left, keeping order. */
  private compact(deadVertex: Uint8Array, deadTri: Uint8Array): void {
    const V = this.vertexCount;
    const map = new Int32Array(V);
    const positions: number[] = [];
    const birth: number[] = [];
    const uptake: number[] = [];
    let next = 0;
    for (let v = 0; v < V; v++) {
      if (deadVertex[v] === 1) {
        map[v] = -1;
        continue;
      }
      map[v] = next++;
      positions.push(this.positions[v * 3]!, this.positions[v * 3 + 1]!, this.positions[v * 3 + 2]!);
      birth.push(this.birth[v]!);
      uptake.push(this.uptake[v]!);
    }
    const triangles: number[] = [];
    for (let k = 0; k < this.triangleCount; k++) {
      if (deadTri[k] === 1) continue;
      triangles.push(map[this.triangles[k * 3]!]!, map[this.triangles[k * 3 + 1]!]!, map[this.triangles[k * 3 + 2]!]!);
    }
    this.positions = positions;
    this.birth = birth;
    this.uptake = uptake;
    this.triangles = triangles;
  }

  /** Removes every triangle of zero area, by fusion where it can and by deletion where it cannot. */
  removeDegenerate(floor: number): void {
    this.fuse(0, 1e-12, floor);
    const keep: number[] = [];
    for (let k = 0; k < this.triangleCount; k++) {
      const [a, b, c] = [this.triangles[k * 3]!, this.triangles[k * 3 + 1]!, this.triangles[k * 3 + 2]!];
      if (a !== b && b !== c && c !== a && triangleArea(this.positions, a, b, c) > 0) keep.push(a, b, c);
    }
    this.triangles = keep;
  }

  /** Moves each vertex `gain` of the way to the mean of its neighbours. */
  smooth(gain: number): void {
    if (!(gain > 0)) return;
    const { a: ea, b: eb } = this.edges();
    const V = this.vertexCount;
    const sum = new Float64Array(V * 3);
    const count = new Float64Array(V);
    const p = this.positions;
    for (let e = 0; e < ea.length; e++) {
      const a = ea[e]!;
      const b = eb[e]!;
      for (let j = 0; j < 3; j++) {
        sum[a * 3 + j] = sum[a * 3 + j]! + p[b * 3 + j]!;
        sum[b * 3 + j] = sum[b * 3 + j]! + p[a * 3 + j]!;
      }
      count[a] = count[a]! + 1;
      count[b] = count[b]! + 1;
    }
    for (let v = 0; v < V; v++) {
      if (count[v] === 0) continue;
      for (let j = 0; j < 3; j++) p[v * 3 + j] = p[v * 3 + j]! + gain * (sum[v * 3 + j]! / count[v]! - p[v * 3 + j]!);
    }
  }

  /**
   * Curvature at each vertex by the discrete operators of Meyer et al. (2002), with a third of the
   * area of the triangles around it: mean curvature H from the cotangent Laplacian (positive where
   * the surface is convex) and Gaussian curvature K from the angle deficit. The principal curvatures
   * are H ± √(H² − K); `low` is the smaller.
   */
  curvature(): { mean: Float64Array; low: Float64Array } {
    const p = this.positions;
    const t = this.triangles;
    const V = this.vertexCount;
    const hx = new Float64Array(V * 3);
    const area = new Float64Array(V);
    const angle = new Float64Array(V);
    const normals = this.normals();
    for (let k = 0; k < t.length; k += 3) {
      const corners = [t[k]!, t[k + 1]!, t[k + 2]!];
      const a3 = triangleArea(p, corners[0]!, corners[1]!, corners[2]!) / 3;
      for (let j = 0; j < 3; j++) {
        const i = corners[j]!;
        const u = corners[(j + 1) % 3]!;
        const w = corners[(j + 2) % 3]!;
        area[i] = area[i]! + a3;
        const ux = p[u * 3]! - p[i * 3]!;
        const uy = p[u * 3 + 1]! - p[i * 3 + 1]!;
        const uz = p[u * 3 + 2]! - p[i * 3 + 2]!;
        const wx = p[w * 3]! - p[i * 3]!;
        const wy = p[w * 3 + 1]! - p[i * 3 + 1]!;
        const wz = p[w * 3 + 2]! - p[i * 3 + 2]!;
        const cx = uy * wz - uz * wy;
        const cy = uz * wx - ux * wz;
        const cz = ux * wy - uy * wx;
        const cross = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const dot = ux * wx + uy * wy + uz * wz;
        angle[i] = angle[i]! + atan2(cross, dot);
        // The angle at i is opposite the edge u–w: its cotangent weights that edge.
        if (cross > 0) {
          const cot = dot / cross;
          for (const [s, o] of [[u, w], [w, u]] as const) {
            for (let d = 0; d < 3; d++) hx[s * 3 + d] = hx[s * 3 + d]! + cot * (p[s * 3 + d]! - p[o * 3 + d]!);
          }
        }
      }
    }
    const mean = new Float64Array(V);
    const low = new Float64Array(V);
    for (let v = 0; v < V; v++) {
      const A = area[v]!;
      if (!(A > 0)) continue;
      const h = (hx[v * 3]! * normals[v * 3]! + hx[v * 3 + 1]! * normals[v * 3 + 1]! + hx[v * 3 + 2]! * normals[v * 3 + 2]!) / (4 * A);
      const k = (2 * PI - angle[v]!) / A;
      mean[v] = h;
      low[v] = h - Math.sqrt(Math.max(h * h - k, 0));
    }
    return { mean, low };
  }
}

/** The vertices around v, in no particular order. */
function ring(t: number[], around: Int32Array, start: Int32Array, deadTri: Uint8Array, v: number): number[] {
  const out: number[] = [];
  for (let k = start[v]!; k < start[v + 1]!; k++) {
    const tri = around[k]!;
    if (deadTri[tri] === 1) continue;
    for (let j = 0; j < 3; j++) {
      const w = t[tri * 3 + j]!;
      if (w !== v && !out.includes(w)) out.push(w);
    }
  }
  return out;
}

export function triangleArea(p: ArrayLike<number>, a: number, b: number, c: number): number {
  const ux = p[b * 3]! - p[a * 3]!;
  const uy = p[b * 3 + 1]! - p[a * 3 + 1]!;
  const uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
  const vx = p[c * 3]! - p[a * 3]!;
  const vy = p[c * 3 + 1]! - p[a * 3 + 1]!;
  const vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
}

/** A triangle's unnormalised normal, with vertices `from` (and `also`) moved to (x, y, z). */
function faceNormal(p: number[], a: number, b: number, c: number, from: number, x: number, y: number, z: number, also = -2): [number, number, number] {
  const at = (v: number, d: number) => (v === from || v === also ? [x, y, z][d]! : p[v * 3 + d]!);
  const ux = at(b, 0) - at(a, 0);
  const uy = at(b, 1) - at(a, 1);
  const uz = at(b, 2) - at(a, 2);
  const vx = at(c, 0) - at(a, 0);
  const vy = at(c, 1) - at(a, 1);
  const vz = at(c, 2) - at(a, 2);
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

/**
 * The midpoint of the cubic between a and b whose tangents at each end lie in that end's tangent
 * plane (Merks et al. 2003, figure 4.4): (a + b) / 2 + (t_a − t_b) / 8, each tangent the edge
 * projected onto the plane at that end and scaled back to the edge's length.
 */
export function hermiteMidpoint(p: ArrayLike<number>, normals: ArrayLike<number>, a: number, b: number): [number, number, number] {
  const dx = p[b * 3]! - p[a * 3]!;
  const dy = p[b * 3 + 1]! - p[a * 3 + 1]!;
  const dz = p[b * 3 + 2]! - p[a * 3 + 2]!;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const tangent = (v: number): [number, number, number] => {
    const nx = normals[v * 3]!;
    const ny = normals[v * 3 + 1]!;
    const nz = normals[v * 3 + 2]!;
    const d = dx * nx + dy * ny + dz * nz;
    let tx = dx - d * nx;
    let ty = dy - d * ny;
    let tz = dz - d * nz;
    const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (!(len > 0)) return [dx, dy, dz];
    tx *= length / len;
    ty *= length / len;
    tz *= length / len;
    return [tx, ty, tz];
  };
  const ta = tangent(a);
  const tb = tangent(b);
  return [
    (p[a * 3]! + p[b * 3]!) / 2 + (ta[0] - tb[0]) / 8,
    (p[a * 3 + 1]! + p[b * 3 + 1]!) / 2 + (ta[1] - tb[1]) / 8,
    (p[a * 3 + 2]! + p[b * 3 + 2]!) / 2 + (ta[2] - tb[2]) / 8,
  ];
}
