import { atan2, cos } from '../dmath';
import { CORALLITE_LEVELS, RIM_WIDTH, SEPTA_RELIEF, VERTEX_CAP } from './constants';
import type { CoralMesh } from './mesh';
import type { SpeciesEParams } from './params';

// Corallites, the cups the polyps sit in, drawn as relief on the finished colony (section 4c). They
// do not affect growth. The mesh is subdivided as far as the vertex cap allows; each new vertex
// belongs to the nearer of its two parents' polyps, so every polyp gets a patch around it. In that
// patch the surface is pushed in by a cup, ridged by the septa and raised by a rim at its edge.

export interface Relief {
  /** For each vertex, the mean curvature carried from the colony before relief. */
  curvature: number[];
  /** Subdivision passes made. */
  levels: number;
}

export function addCorallites(mesh: CoralMesh, p: SpeciesEParams, curvature: Float64Array): Relief {
  const curve = Array.from(curvature);
  const plain = p.coralliteDepth === 0 && p.coralliteRim === 0;
  let levels = 0;
  while (!plain && levels < CORALLITE_LEVELS && mesh.vertexCount * (1 << (2 * (levels + 1))) <= VERTEX_CAP) levels++;
  if (levels === 0) return { curvature: curve, levels };

  const polyps = mesh.vertexCount;
  const centres = mesh.positions.slice();
  const polypNormals = mesh.normals();
  const owner: number[] = [];
  for (let v = 0; v < polyps; v++) owner.push(v);
  const distance2 = (v: number, polyp: number) => {
    let sum = 0;
    for (let d = 0; d < 3; d++) sum += (mesh.positions[v * 3 + d]! - centres[polyp * 3 + d]!) ** 2;
    return sum;
  };
  for (let l = 0; l < levels; l++) {
    mesh.split(-1, -1, (v, a, b) => {
      const oa = owner[a]!;
      const ob = owner[b]!;
      const da = distance2(v, oa);
      const db = distance2(v, ob);
      owner.push(da < db || (da === db && oa < ob) ? oa : ob);
      curve.push((curve[a]! + curve[b]!) / 2);
    });
  }

  const normals = mesh.normals();
  const radius = (p.coralliteSize * p.polypSpacing) / 2;
  const depth = p.coralliteDepth * 2 * radius;
  const rim = p.coralliteRim * 2 * radius;
  const relief = new Float64Array(mesh.vertexCount);
  for (let v = 0; v < mesh.vertexCount; v++) {
    const o = owner[v]!;
    const dx = mesh.positions[v * 3]! - centres[o * 3]!;
    const dy = mesh.positions[v * 3 + 1]! - centres[o * 3 + 1]!;
    const dz = mesh.positions[v * 3 + 2]! - centres[o * 3 + 2]!;
    const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
    let h = 0;
    if (t < 1) {
      const bowl = 1 - t * t;
      h -= depth * bowl;
      if (p.septa > 0) {
        // Angle around the polyp, in a tangent frame built from its normal.
        const nx = polypNormals[o * 3]!;
        const ny = polypNormals[o * 3 + 1]!;
        const nz = polypNormals[o * 3 + 2]!;
        // e1 = n × axis, with the axis least aligned with n.
        let ax = 0;
        let ay = 0;
        let az = 0;
        if (Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz)) ax = 1;
        else if (Math.abs(ny) <= Math.abs(nz)) ay = 1;
        else az = 1;
        let e1x = ny * az - nz * ay;
        let e1y = nz * ax - nx * az;
        let e1z = nx * ay - ny * ax;
        const len = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
        e1x /= len;
        e1y /= len;
        e1z /= len;
        const e2x = ny * e1z - nz * e1y;
        const e2y = nz * e1x - nx * e1z;
        const e2z = nx * e1y - ny * e1x;
        const theta = atan2(dx * e2x + dy * e2y + dz * e2z, dx * e1x + dy * e1y + dz * e1z);
        const c = Math.max(0, cos(p.septa * theta));
        h += SEPTA_RELIEF * depth * bowl * c * c * c * c;
      }
    }
    const off = (t - 1) / RIM_WIDTH;
    if (off > -1 && off < 1) {
      const b = 1 - off * off;
      h += rim * b * b;
    }
    relief[v] = h;
  }
  for (let v = 0; v < mesh.vertexCount; v++) {
    for (let d = 0; d < 3; d++) mesh.positions[v * 3 + d] = mesh.positions[v * 3 + d]! + relief[v]! * normals[v * 3 + d]!;
    if (mesh.positions[v * 3 + 1]! < 0) mesh.positions[v * 3 + 1] = 0;
  }
  return { curvature: curve, levels };
}
