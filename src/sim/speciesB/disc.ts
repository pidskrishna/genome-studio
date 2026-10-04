import { cos, PI, sin } from '../dmath';
import { Rng } from '../rng';
import { START_RADIUS } from './constants';
import { buildEdges, GrowingMesh } from './mesh';

/**
 * A flat disc of radius START_RADIUS in the plane y = 0, made of concentric rings about edgeLength
 * apart, joined into triangles. Material coordinates are (x, z). The margin distance of each vertex
 * is its distance from the rim. Each vertex is raised by roughness × a uniform random number in
 * [−1, 1].
 */
export function startDisc(mesh: GrowingMesh, edgeLength: number, roughness: number, rng: Rng): void {
  const rings = Math.max(2, Math.floor(START_RADIUS / edgeLength + 0.5));
  const ringStart: number[] = [];
  const ringSize: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const radius = (START_RADIUS * k) / rings;
    const count = k === 0 ? 1 : Math.max(6, Math.floor((2 * PI * k) + 0.5));
    ringStart.push(mesh.vertexCount);
    ringSize.push(count);
    const offset = k % 2 === 0 ? 0 : 0.5;
    for (let j = 0; j < count; j++) {
      const angle = (2 * PI * (j + offset)) / count;
      const px = k === 0 ? 0 : radius * cos(angle);
      const pz = k === 0 ? 0 : radius * sin(angle);
      // The rim sits exactly at the starting radius, so its margin distance is exactly zero.
      const margin = k === rings ? 0 : START_RADIUS - radius;
      mesh.addVertex(px, roughness * (2 * rng.next() - 1), pz, px, pz, margin, 0);
    }
  }

  // Zip each pair of neighbouring rings together, always advancing on the side whose next vertex
  // comes first by angle. Triangles are counter-clockwise seen from +y in (x, z): we list them so
  // that they run (inner, outer, ...) consistently, then fix the winding by the sign of the area.
  const triangles: number[] = [];
  const angleOf = (k: number, j: number) => (j + (k % 2 === 0 ? 0 : 0.5)) / ringSize[k]!;
  const push = (a: number, b: number, c: number) => {
    const ax = mesh.u[a]!;
    const az = mesh.v[a]!;
    const cross = (mesh.u[b]! - ax) * (mesh.v[c]! - az) - (mesh.v[b]! - az) * (mesh.u[c]! - ax);
    if (cross > 0) triangles.push(a, b, c);
    else triangles.push(a, c, b);
  };
  for (let k = 1; k <= rings; k++) {
    const inner = k - 1;
    const n0 = ringSize[inner]!;
    const n1 = ringSize[k]!;
    const s0 = ringStart[inner]!;
    const s1 = ringStart[k]!;
    if (n0 === 1) {
      for (let j = 0; j < n1; j++) push(s0, s1 + j, s1 + ((j + 1) % n1));
      continue;
    }
    let a = 0;
    let b = 0;
    while (a < n0 || b < n1) {
      const nextA = a < n0 ? angleOf(inner, a + 1) : Infinity;
      const nextB = b < n1 ? angleOf(k, b + 1) : Infinity;
      if (b >= n1 || (a < n0 && nextA <= nextB)) {
        push(s0 + (a % n0), s0 + ((a + 1) % n0), s1 + (b % n1));
        a++;
      } else {
        push(s0 + (a % n0), s1 + (b % n1), s1 + ((b + 1) % n1));
        b++;
      }
    }
  }
  buildEdges(mesh, triangles);
}
