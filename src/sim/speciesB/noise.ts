import { mul32 } from '../bits';

// Smooth value noise on the starting shape's material coordinates, for growth patches. A square
// lattice with the given spacing holds hashed values in [−1, 1], blended with a smoothstep.

function latticeValue(i: number, j: number, seed: number): number {
  let h = mul32((i | 0) >>> 0, 0x8da6b343) ^ mul32((j | 0) >>> 0, 0xd8163841) ^ mul32(seed >>> 0, 0xcb1ab31f);
  h = mul32(h ^ (h >>> 15), 0x2c1b3c6d);
  h = mul32(h ^ (h >>> 12), 0x297a2d39);
  h = (h ^ (h >>> 15)) >>> 0;
  return (h / 4294967296) * 2 - 1;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function patchNoise(u: number, v: number, spacing: number, seed: number): number {
  const fu = u / spacing;
  const fv = v / spacing;
  const i = Math.floor(fu);
  const j = Math.floor(fv);
  const su = smooth(fu - i);
  const sv = smooth(fv - j);
  const a = latticeValue(i, j, seed);
  const b = latticeValue(i + 1, j, seed);
  const c = latticeValue(i, j + 1, seed);
  const d = latticeValue(i + 1, j + 1, seed);
  return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
}
