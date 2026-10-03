// 32-bit integer helpers built from plain arithmetic and bit operators.

/** (a × b) mod 2^32, unsigned. Every partial product stays below 2^53, so it is exact. */
export function mul32(a: number, b: number): number {
  const lowA = a & 0xffff;
  const highA = a >>> 16;
  const bu = b >>> 0;
  return (lowA * bu + (((highA * bu) & 0xffff) << 16)) >>> 0;
}

/** Rotates a 32-bit value left by r bits. */
export function rotl(x: number, r: number): number {
  return ((x << r) | (x >>> (32 - r))) >>> 0;
}
