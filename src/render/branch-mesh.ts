import { BufferAttribute, BufferGeometry } from 'three';
import type { BranchGeometry } from '../sim/speciesA';

// Species A drawn as tubes. The tree is split into chains: each chain starts at a starting node or
// at a side child of a branching point, and continues through the thickest child until a tip. Each
// chain is one smooth tube with a ring of vertices per node, oriented by parallel transport so the
// tube does not twist. A side chain's first ring sits at its parent node, with the child's radius,
// so it grows out of the limb it branches from. Tips and starting nodes are closed with flat caps.

/** Vertices around each ring. */
export const TUBE_SIDES = 8;

type Branch = Pick<BranchGeometry, 'positions' | 'parents' | 'radii'>;

/** Chains of node indices. A side chain begins with its parent node. */
export function branchChains(g: Branch): number[][] {
  const n = g.parents.length;
  // The main child of each node is its thickest child; ties go to the lowest index.
  const main = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) {
    const p = g.parents[v]!;
    if (p < 0) continue;
    const m = main[p]!;
    if (m < 0 || g.radii[v]! > g.radii[m]!) main[p] = v;
  }
  const chains: number[][] = [];
  for (let v = 0; v < n; v++) {
    const p = g.parents[v]!;
    if (p >= 0 && main[p] === v) continue;
    const chain = p >= 0 ? [p, v] : [v];
    let u = v;
    while (main[u]! >= 0) {
      u = main[u]!;
      chain.push(u);
    }
    chains.push(chain);
  }
  return chains;
}

/** Builds the tube mesh: positions, smooth normals and triangles, in the simulation's units (D). */
export function buildBranchMesh(g: Branch, sides = TUBE_SIDES): BufferGeometry {
  const chains = branchChains(g);
  let ringCount = 0;
  let capCount = 0;
  for (const chain of chains) {
    ringCount += chain.length;
    capCount += g.parents[chain[0]!]! < 0 ? 2 : 1;
  }
  const vertexCount = ringCount * sides + capCount * (sides + 1);
  const pos = new Float32Array(vertexCount * 3);
  const nor = new Float32Array(vertexCount * 3);
  let segmentCount = 0;
  for (const chain of chains) segmentCount += chain.length - 1;
  const indexCount = segmentCount * sides * 6 + capCount * sides * 3;
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  const P = g.positions;
  let vo = 0;
  let io = 0;
  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number): number => {
    pos[vo * 3] = x;
    pos[vo * 3 + 1] = y;
    pos[vo * 3 + 2] = z;
    nor[vo * 3] = nx;
    nor[vo * 3 + 1] = ny;
    nor[vo * 3 + 2] = nz;
    return vo++;
  };
  const cosA = new Float64Array(sides);
  const sinA = new Float64Array(sides);
  for (let k = 0; k < sides; k++) {
    cosA[k] = Math.cos((2 * Math.PI * k) / sides);
    sinA[k] = Math.sin((2 * Math.PI * k) / sides);
  }

  for (const chain of chains) {
    const m = chain.length;
    const side = g.parents[chain[0]!]! >= 0;
    // Tangents: central differences, one-sided at the ends, carried over where points coincide.
    const tx = new Float64Array(m);
    const ty = new Float64Array(m);
    const tz = new Float64Array(m);
    let lx = 0;
    let ly = 1;
    let lz = 0;
    for (let i = 0; i < m; i++) {
      const a = chain[Math.max(0, i - 1)]!;
      const b = chain[Math.min(m - 1, i + 1)]!;
      let dx = P[b * 3]! - P[a * 3]!;
      let dy = P[b * 3 + 1]! - P[a * 3 + 1]!;
      let dz = P[b * 3 + 2]! - P[a * 3 + 2]!;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-12) {
        dx /= len;
        dy /= len;
        dz /= len;
        lx = dx;
        ly = dy;
        lz = dz;
      } else {
        dx = lx;
        dy = ly;
        dz = lz;
      }
      tx[i] = dx;
      ty[i] = dy;
      tz[i] = dz;
    }
    // Parallel transport of a normal vector along the chain.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    {
      const ax = Math.abs(tx[0]!) < 0.9 ? 1 : 0;
      const ay = ax === 1 ? 0 : 1;
      // n = normalize(a − (a·t) t)
      const d = ax * tx[0]! + ay * ty[0]!;
      nx = ax - d * tx[0]!;
      ny = ay - d * ty[0]!;
      nz = -d * tz[0]!;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l;
      ny /= l;
      nz /= l;
    }
    const firstRing = vo;
    for (let i = 0; i < m; i++) {
      const t0 = tx[i]!;
      const t1 = ty[i]!;
      const t2 = tz[i]!;
      const d = nx * t0 + ny * t1 + nz * t2;
      let qx = nx - d * t0;
      let qy = ny - d * t1;
      let qz = nz - d * t2;
      const ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
      if (ql > 1e-9) {
        qx /= ql;
        qy /= ql;
        qz /= ql;
        nx = qx;
        ny = qy;
        nz = qz;
      }
      // b = t × n
      const bx = t1 * nz - t2 * ny;
      const by = t2 * nx - t0 * nz;
      const bz = t0 * ny - t1 * nx;
      const node = chain[i]!;
      // A side chain's first ring takes the radius of the child it leads to.
      const r = g.radii[side && i === 0 ? chain[1]! : node]!;
      const cx = P[node * 3]!;
      const cy = P[node * 3 + 1]!;
      const cz = P[node * 3 + 2]!;
      for (let k = 0; k < sides; k++) {
        const ux = cosA[k]! * nx + sinA[k]! * bx;
        const uy = cosA[k]! * ny + sinA[k]! * by;
        const uz = cosA[k]! * nz + sinA[k]! * bz;
        put(cx + r * ux, cy + r * uy, cz + r * uz, ux, uy, uz);
      }
    }
    for (let i = 0; i + 1 < m; i++) {
      const a = firstRing + i * sides;
      const b = a + sides;
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        // Counter-clockwise seen from outside, given b = t × n.
        index[io++] = a + k;
        index[io++] = a + k1;
        index[io++] = b + k;
        index[io++] = b + k;
        index[io++] = a + k1;
        index[io++] = b + k1;
      }
    }
    // Caps: the tip always; the base only for a starting node.
    const cap = (ring: number, node: number, dir: number, i: number): void => {
      const cnx = tx[i]! * dir;
      const cny = ty[i]! * dir;
      const cnz = tz[i]! * dir;
      const centre = put(P[node * 3]!, P[node * 3 + 1]!, P[node * 3 + 2]!, cnx, cny, cnz);
      const first = vo;
      for (let k = 0; k < sides; k++) {
        const s = (ring + k) * 3;
        put(pos[s]!, pos[s + 1]!, pos[s + 2]!, cnx, cny, cnz);
      }
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        index[io++] = centre;
        if (dir > 0) {
          index[io++] = first + k;
          index[io++] = first + k1;
        } else {
          index[io++] = first + k1;
          index[io++] = first + k;
        }
      }
    };
    cap(firstRing + (m - 1) * sides, chain[m - 1]!, 1, m - 1);
    if (!side) cap(firstRing, chain[0]!, -1, 0);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new BufferAttribute(nor, 3));
  geometry.setIndex(new BufferAttribute(index, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
