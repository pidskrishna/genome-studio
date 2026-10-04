// A growing triangle mesh. Every vertex carries its position, its material coordinates (its position
// on the starting shape, interpolated through splits), its distance from the margin measured on the
// starting shape (clarification 7) and the step it was born. Every edge carries a rest length. Every
// triangle stores its three vertices, ordered so that (b − a) × (c − a) points out of the starting
// shape, and the three edges between them: edge 0 joins vertex 0 to 1, edge 1 joins 1 to 2, edge 2
// joins 2 to 0. Capacities are fixed up front from the vertex cap.

export class GrowingMesh {
  vertexCount = 0;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Material coordinates: position on the starting shape. */
  readonly mx: Float64Array;
  readonly my: Float64Array;
  readonly mz: Float64Array;
  readonly margin: Float64Array;
  readonly birth: Int32Array;
  /** Growth-patch value of each vertex, from its material coordinates. */
  readonly patch: Float64Array;
  /** Gives the growth-patch value at material coordinates; set before the first split. */
  patchField: (mx: number, my: number, mz: number) => number = () => 0;

  triangleCount = 0;
  readonly tri: Int32Array;
  readonly triEdge: Int32Array;

  edgeCount = 0;
  readonly edgeA: Int32Array;
  readonly edgeB: Int32Array;
  readonly rest: Float64Array;
  /** The one or two triangles on an edge; −1 for none. */
  readonly edgeT0: Int32Array;
  readonly edgeT1: Int32Array;
  readonly alive: Uint8Array;

  constructor(readonly vertexCapacity: number) {
    const v = vertexCapacity;
    const t = 2 * v + 64;
    const e = 5 * v + 64;
    this.x = new Float64Array(v);
    this.y = new Float64Array(v);
    this.z = new Float64Array(v);
    this.mx = new Float64Array(v);
    this.my = new Float64Array(v);
    this.mz = new Float64Array(v);
    this.margin = new Float64Array(v);
    this.birth = new Int32Array(v);
    this.patch = new Float64Array(v);
    this.tri = new Int32Array(3 * t);
    this.triEdge = new Int32Array(3 * t);
    this.edgeA = new Int32Array(e);
    this.edgeB = new Int32Array(e);
    this.rest = new Float64Array(e);
    this.edgeT0 = new Int32Array(e);
    this.edgeT1 = new Int32Array(e);
    this.alive = new Uint8Array(e);
  }

  addVertex(x: number, y: number, z: number, mx: number, my: number, mz: number, margin: number, birth: number): number {
    const i = this.vertexCount++;
    if (i >= this.vertexCapacity) throw new Error('Vertex capacity exceeded');
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.mx[i] = mx;
    this.my[i] = my;
    this.mz[i] = mz;
    this.margin[i] = margin;
    this.birth[i] = birth;
    this.patch[i] = this.patchField(mx, my, mz);
    return i;
  }

  addEdge(a: number, b: number, rest: number): number {
    const e = this.edgeCount++;
    this.edgeA[e] = a;
    this.edgeB[e] = b;
    this.rest[e] = rest;
    this.edgeT0[e] = -1;
    this.edgeT1[e] = -1;
    this.alive[e] = 1;
    return e;
  }

  attach(e: number, t: number): void {
    if (this.edgeT0[e]! < 0) this.edgeT0[e] = t;
    else this.edgeT1[e] = t;
  }

  replaceTriangle(e: number, from: number, to: number): void {
    if (this.edgeT0[e] === from) this.edgeT0[e] = to;
    else if (this.edgeT1[e] === from) this.edgeT1[e] = to;
  }

  setTriangle(t: number, a: number, b: number, c: number, eab: number, ebc: number, eca: number): void {
    this.tri[3 * t] = a;
    this.tri[3 * t + 1] = b;
    this.tri[3 * t + 2] = c;
    this.triEdge[3 * t] = eab;
    this.triEdge[3 * t + 1] = ebc;
    this.triEdge[3 * t + 2] = eca;
  }

  addTriangle(a: number, b: number, c: number, eab: number, ebc: number, eca: number): number {
    const t = this.triangleCount++;
    this.setTriangle(t, a, b, c, eab, ebc, eca);
    return t;
  }

  /** Position (0, 1 or 2) of edge e within triangle t. */
  edgeSlot(t: number, e: number): number {
    if (this.triEdge[3 * t] === e) return 0;
    if (this.triEdge[3 * t + 1] === e) return 1;
    return 2;
  }

  /**
   * Splits edge e at its midpoint. The new vertex takes the mean of its ends' positions, material
   * coordinates and margin distances. Each triangle on the edge becomes two; the new edge to the
   * opposite corner gets the rest length of the triangle's median, computed from its rest lengths.
   */
  split(e: number, step: number): number {
    const i = this.edgeA[e]!;
    const j = this.edgeB[e]!;
    const c = this.rest[e]!;
    const t0 = this.edgeT0[e]!;
    const t1 = this.edgeT1[e]!;
    const m = this.addVertex(
      (this.x[i]! + this.x[j]!) / 2,
      (this.y[i]! + this.y[j]!) / 2,
      (this.z[i]! + this.z[j]!) / 2,
      (this.mx[i]! + this.mx[j]!) / 2,
      (this.my[i]! + this.my[j]!) / 2,
      (this.mz[i]! + this.mz[j]!) / 2,
      (this.margin[i]! + this.margin[j]!) / 2,
      step,
    );
    this.alive[e] = 0;
    const eIM = this.addEdge(i, m, c / 2);
    const eMJ = this.addEdge(m, j, c / 2);
    for (const t of [t0, t1]) {
      if (t < 0) continue;
      const r = this.edgeSlot(t, e);
      const p = this.tri[3 * t + r]!;
      const q = this.tri[3 * t + ((r + 1) % 3)]!;
      const k = this.tri[3 * t + ((r + 2) % 3)]!;
      const eQK = this.triEdge[3 * t + ((r + 1) % 3)]!;
      const eKP = this.triEdge[3 * t + ((r + 2) % 3)]!;
      const rpk = this.rest[eKP]!;
      const rqk = this.rest[eQK]!;
      const median = Math.sqrt(Math.max(1e-24, (2 * rpk * rpk + 2 * rqk * rqk - c * c) / 4));
      const ePM = p === i ? eIM : eMJ;
      const eMQ = p === i ? eMJ : eIM;
      const eMK = this.addEdge(m, k, median);
      // t becomes (p, m, k); the new triangle is (m, q, k).
      this.setTriangle(t, p, m, k, ePM, eMK, eKP);
      const t2 = this.addTriangle(m, q, k, eMQ, eQK, eMK);
      this.attach(ePM, t);
      this.attach(eMQ, t2);
      this.attach(eMK, t);
      this.attach(eMK, t2);
      this.replaceTriangle(eQK, t, t2);
    }
    return m;
  }

  /**
   * The hinge on interior edge e laid flat from rest lengths: its two triangles unfolded into the
   * plane with p at (0, 0) and q at (c, 0), the opposite corners k above and l below. Returns null
   * for a boundary edge or a flat (degenerate) triangle.
   */
  unfold(e: number): { p: number; q: number; k: number; l: number; c: number; xk: number; yk: number; xl: number; yl: number } | null {
    const t0 = this.edgeT0[e]!;
    const t1 = this.edgeT1[e]!;
    if (t0 < 0 || t1 < 0) return null;
    const r0 = this.edgeSlot(t0, e);
    const p = this.tri[3 * t0 + r0]!;
    const q = this.tri[3 * t0 + ((r0 + 1) % 3)]!;
    const k = this.tri[3 * t0 + ((r0 + 2) % 3)]!;
    const qk = this.rest[this.triEdge[3 * t0 + ((r0 + 1) % 3)]!]!;
    const kp = this.rest[this.triEdge[3 * t0 + ((r0 + 2) % 3)]!]!;
    const r1 = this.edgeSlot(t1, e);
    // In t1 the shared edge runs q → p.
    const l = this.tri[3 * t1 + ((r1 + 2) % 3)]!;
    const pl = this.rest[this.triEdge[3 * t1 + ((r1 + 1) % 3)]!]!;
    const lq = this.rest[this.triEdge[3 * t1 + ((r1 + 2) % 3)]!]!;
    const c = this.rest[e]!;
    if (!(c > 0)) return null;
    const xk = (c * c + kp * kp - qk * qk) / (2 * c);
    const yk = Math.sqrt(Math.max(0, kp * kp - xk * xk));
    const xl = (c * c + pl * pl - lq * lq) / (2 * c);
    const yl = -Math.sqrt(Math.max(0, pl * pl - xl * xl));
    if (!(yk > 0) || !(yl < 0)) return null;
    return { p, q, k, l, c, xk, yk, xl, yl };
  }

  /**
   * Replaces interior edge e, between triangles (p, q, k) and (q, p, l), with the other diagonal
   * k–l, whose rest length is its length in the flat unfolding. Orientation is kept.
   */
  flip(e: number, restKL: number): void {
    const t0 = this.edgeT0[e]!;
    const t1 = this.edgeT1[e]!;
    const r0 = this.edgeSlot(t0, e);
    const r1 = this.edgeSlot(t1, e);
    const p = this.tri[3 * t0 + r0]!;
    const q = this.tri[3 * t0 + ((r0 + 1) % 3)]!;
    const k = this.tri[3 * t0 + ((r0 + 2) % 3)]!;
    const eQK = this.triEdge[3 * t0 + ((r0 + 1) % 3)]!;
    const eKP = this.triEdge[3 * t0 + ((r0 + 2) % 3)]!;
    const l = this.tri[3 * t1 + ((r1 + 2) % 3)]!;
    const ePL = this.triEdge[3 * t1 + ((r1 + 1) % 3)]!;
    const eLQ = this.triEdge[3 * t1 + ((r1 + 2) % 3)]!;
    this.edgeA[e] = k;
    this.edgeB[e] = l;
    this.rest[e] = restKL;
    // t0 becomes (p, l, k) and t1 becomes (l, q, k).
    this.setTriangle(t0, p, l, k, ePL, e, eKP);
    this.setTriangle(t1, l, q, k, eLQ, eQK, e);
    this.replaceTriangle(ePL, t1, t0);
    this.replaceTriangle(eQK, t0, t1);
  }

  /** Rest area of triangle t from its rest lengths (Heron's formula). */
  restArea(t: number): number {
    const a = this.rest[this.triEdge[3 * t]!]!;
    const b = this.rest[this.triEdge[3 * t + 1]!]!;
    const c = this.rest[this.triEdge[3 * t + 2]!]!;
    const s = (a + b + c) / 2;
    return Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  }

  totalRestArea(): number {
    let sum = 0;
    for (let t = 0; t < this.triangleCount; t++) sum += this.restArea(t);
    return sum;
  }
}

/**
 * Builds the mesh from triangles given as vertex triples, oriented as the class describes. Rest
 * lengths are the straight-line distances between material coordinates on the starting shape.
 */
export function buildEdges(mesh: GrowingMesh, triangles: readonly number[]): void {
  const lookup = new Map<number, number>();
  const edgeOf = (a: number, b: number) => {
    const key = Math.min(a, b) * 65536 + Math.max(a, b);
    let e = lookup.get(key);
    if (e === undefined) {
      const dx = mesh.mx[a]! - mesh.mx[b]!;
      const dy = mesh.my[a]! - mesh.my[b]!;
      const dz = mesh.mz[a]! - mesh.mz[b]!;
      e = mesh.addEdge(a, b, Math.sqrt(dx * dx + dy * dy + dz * dz));
      lookup.set(key, e);
    }
    return e;
  };
  for (let n = 0; n < triangles.length; n += 3) {
    const a = triangles[n]!;
    const b = triangles[n + 1]!;
    const c = triangles[n + 2]!;
    const eab = edgeOf(a, b);
    const ebc = edgeOf(b, c);
    const eca = edgeOf(c, a);
    const t = mesh.addTriangle(a, b, c, eab, ebc, eca);
    mesh.attach(eab, t);
    mesh.attach(ebc, t);
    mesh.attach(eca, t);
  }
}
