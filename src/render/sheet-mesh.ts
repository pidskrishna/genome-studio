import { BufferAttribute, BufferGeometry } from 'three';
import type { SheetGeometry } from '../sim/speciesB';

// Species B drawn as a surface with thickness. The sheet is offset by half the drawn thickness to
// each side along its smooth vertex normals, giving an outer and an inner skin. Open edges (the
// margins of the disc, ring and tube) are closed by a rim joining the two skins, so the sheet reads
// as a solid with the drawn thickness of clarification 14. A closed sphere has no rim.

type Sheet = Pick<SheetGeometry, 'positions' | 'triangles' | 'drawnThickness'>;

/** Area-weighted vertex normals, normalised; a vertex with no area gets +y. */
export function sheetNormals(positions: ArrayLike<number>, triangles: ArrayLike<number>): Float64Array {
  const n = positions.length / 3;
  const out = new Float64Array(n * 3);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!;
    const b = triangles[t + 1]!;
    const c = triangles[t + 2]!;
    const ux = positions[b * 3]! - positions[a * 3]!;
    const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
    const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const vx = positions[c * 3]! - positions[a * 3]!;
    const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
    const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      out[v * 3] = out[v * 3]! + cx;
      out[v * 3 + 1] = out[v * 3 + 1]! + cy;
      out[v * 3 + 2] = out[v * 3 + 2]! + cz;
    }
  }
  for (let v = 0; v < n; v++) {
    const x = out[v * 3]!;
    const y = out[v * 3 + 1]!;
    const z = out[v * 3 + 2]!;
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 0) {
      out[v * 3] = x / l;
      out[v * 3 + 1] = y / l;
      out[v * 3 + 2] = z / l;
    } else {
      out[v * 3] = 0;
      out[v * 3 + 1] = 1;
      out[v * 3 + 2] = 0;
    }
  }
  return out;
}

/** Directed edges a → b that belong to exactly one triangle, in triangle winding order. */
export function boundaryEdges(vertexCount: number, triangles: ArrayLike<number>): number[] {
  const count = new Map<number, number>();
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k]!;
      const b = triangles[t + ((k + 1) % 3)]!;
      const key = Math.min(a, b) * vertexCount + Math.max(a, b);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  const out: number[] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k]!;
      const b = triangles[t + ((k + 1) % 3)]!;
      if (count.get(Math.min(a, b) * vertexCount + Math.max(a, b)) === 1) out.push(a, b);
    }
  }
  return out;
}

/** Builds the thick sheet: outer skin, inner skin and rim, in starting radii. `userData.source` maps mesh to sheet vertices. */
export function buildSheetMesh(g: Sheet): BufferGeometry {
  const P = g.positions;
  const T = g.triangles;
  const n = P.length / 3;
  const half = g.drawnThickness / 2;
  const N = sheetNormals(P, T);
  const rim = boundaryEdges(n, T);

  // Rim vertices: one outer and one inner copy per boundary vertex, with a normal pointing out of
  // the sheet's edge (the edge direction crossed with the surface normal, averaged).
  const rimSlot = new Map<number, number>();
  for (const v of rim) if (!rimSlot.has(v)) rimSlot.set(v, rimSlot.size);
  const rimCount = rimSlot.size;
  const rimNormal = new Float64Array(rimCount * 3);
  for (let e = 0; e < rim.length; e += 2) {
    const a = rim[e]!;
    const b = rim[e + 1]!;
    const dx = P[b * 3]! - P[a * 3]!;
    const dy = P[b * 3 + 1]! - P[a * 3 + 1]!;
    const dz = P[b * 3 + 2]! - P[a * 3 + 2]!;
    for (const v of [a, b]) {
      const nx = N[v * 3]!;
      const ny = N[v * 3 + 1]!;
      const nz = N[v * 3 + 2]!;
      const s = rimSlot.get(v)! * 3;
      rimNormal[s] = rimNormal[s]! + (dy * nz - dz * ny);
      rimNormal[s + 1] = rimNormal[s + 1]! + (dz * nx - dx * nz);
      rimNormal[s + 2] = rimNormal[s + 2]! + (dx * ny - dy * nx);
    }
  }

  const vertexCount = 2 * n + 2 * rimCount;
  const pos = new Float32Array(vertexCount * 3);
  const nor = new Float32Array(vertexCount * 3);
  // The sheet vertex each mesh vertex was built from, for the pigment gradient (colour.ts).
  const source = new Uint32Array(vertexCount);
  for (let v = 0; v < n; v++) {
    source[v] = v;
    source[n + v] = v;
    for (let k = 0; k < 3; k++) {
      const p = P[v * 3 + k]!;
      const q = N[v * 3 + k]!;
      pos[v * 3 + k] = p + half * q;
      nor[v * 3 + k] = q;
      pos[(n + v) * 3 + k] = p - half * q;
      nor[(n + v) * 3 + k] = -q;
    }
  }
  for (const [v, slot] of rimSlot) {
    const s = slot * 3;
    const x = rimNormal[s]!;
    const y = rimNormal[s + 1]!;
    const z = rimNormal[s + 2]!;
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    const outer = 2 * n + slot;
    const inner = 2 * n + rimCount + slot;
    source[outer] = v;
    source[inner] = v;
    for (let k = 0; k < 3; k++) {
      pos[outer * 3 + k] = pos[v * 3 + k]!;
      pos[inner * 3 + k] = pos[(n + v) * 3 + k]!;
    }
    for (const w of [outer, inner]) {
      nor[w * 3] = x / l;
      nor[w * 3 + 1] = y / l;
      nor[w * 3 + 2] = z / l;
    }
  }

  const indexCount = 2 * T.length + 3 * rim.length;
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let io = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t]!;
    const b = T[t + 1]!;
    const c = T[t + 2]!;
    index[io++] = a;
    index[io++] = b;
    index[io++] = c;
    // The inner skin faces the other way.
    index[io++] = n + a;
    index[io++] = n + c;
    index[io++] = n + b;
  }
  for (let e = 0; e < rim.length; e += 2) {
    // The sheet lies to the left of a → b seen from its outer side, so the rim quad
    // (outer a, inner a, outer b, inner b) wound this way faces away from the sheet.
    const oa = 2 * n + rimSlot.get(rim[e]!)!;
    const ob = 2 * n + rimSlot.get(rim[e + 1]!)!;
    const ia = oa + rimCount;
    const ib = ob + rimCount;
    index[io++] = oa;
    index[io++] = ia;
    index[io++] = ob;
    index[io++] = ob;
    index[io++] = ia;
    index[io++] = ib;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.userData.source = source;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
