import { mul32 } from '../bits';

// Smooth value noise over material coordinates (positions on the starting shape), for growth
// patches. A cubic lattice with the given spacing holds hashed values in [−1, 1], blended with a
// smoothstep. Being defined in space, it has no seams on the tube or the sphere.

function latticeValue(i: number, j: number, k: number, seed: number): number {
  let h =
    mul32((i | 0) >>> 0, 0x8da6b343) ^ mul32((j | 0) >>> 0, 0xd8163841) ^ mul32((k | 0) >>> 0, 0xcb1ab31f) ^ mul32(seed >>> 0, 0x165667b1);
  h = mul32(h ^ (h >>> 15), 0x2c1b3c6d);
  h = mul32(h ^ (h >>> 12), 0x297a2d39);
  h = (h ^ (h >>> 15)) >>> 0;
  return (h / 4294967296) * 2 - 1;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function patchNoise(x: number, y: number, z: number, spacing: number, seed: number): number {
  const fx = x / spacing;
  const fy = y / spacing;
  const fz = z / spacing;
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const k = Math.floor(fz);
  const sx = smooth(fx - i);
  const sy = smooth(fy - j);
  const sz = smooth(fz - k);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const plane = (kk: number) =>
    lerp(
      lerp(latticeValue(i, j, kk, seed), latticeValue(i + 1, j, kk, seed), sx),
      lerp(latticeValue(i, j + 1, kk, seed), latticeValue(i + 1, j + 1, kk, seed), sx),
      sy,
    );
  return lerp(plane(k), plane(k + 1), sz);
}
