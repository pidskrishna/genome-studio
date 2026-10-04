// A growing triangle mesh. Every vertex carries its position, its material coordinates (u, v) on the
// starting shape, its distance from the margin measured on the starting shape (clarification 7) and
// the step it was born. Every edge carries a rest length. Every triangle stores its three vertices,
// counter-clockwise in material coordinates, and the three edges between them: edge 0 joins vertex 0
// to 1, edge 1 joins 1 to 2, edge 2 joins 2 to 0. Capacities are fixed up front from the vertex cap.

export class GrowingMesh {
  vertexCount = 0;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly margin: Float64Array;
  readonly birth: Int32Array;
  /** Growth-patch value of each vertex, from its material coordinates. */
  readonly patch: Float64Array;
  /** Gives the growth-patch value at material coordinates; set before the first split. */
  patchField: (u: number, v: number) => number = () => 0;

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
    this.u = new Float64Array(v);
    this.v = new Float64Array(v);
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

  addVertex(x: number, y: number, z: number, u: number, v: number, margin: number, birth: number): number {
    const i = this.vertexCount++;
    if (i >= this.vertexCapacity) throw new Error('Vertex capacity exceeded');
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.u[i] = u;
    this.v[i] = v;
    this.margin[i] = margin;
    this.birth[i] = birth;
    this.patch[i] = this.patchField(u, v);
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
      (this.u[i]! + this.u[j]!) / 2,
      (this.v[i]! + this.v[j]!) / 2,
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
 * Builds the mesh from triangles given as vertex triples (counter-clockwise in material
 * coordinates). Rest lengths are the material-coordinate lengths.
 */
export function buildEdges(mesh: GrowingMesh, triangles: readonly number[]): void {
  const lookup = new Map<number, number>();
  const edgeOf = (a: number, b: number) => {
    const key = Math.min(a, b) * 65536 + Math.max(a, b);
    let e = lookup.get(key);
    if (e === undefined) {
      const du = mesh.u[a]! - mesh.u[b]!;
      const dv = mesh.v[a]! - mesh.v[b]!;
      e = mesh.addEdge(a, b, Math.sqrt(du * du + dv * dv));
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
