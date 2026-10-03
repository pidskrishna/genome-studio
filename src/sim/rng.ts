import { mul32, rotl } from './bits';

// The simulation's only source of randomness: xoshiro128** (Blackman and Vigna, 2018), seeded from
// the seed gene through splitmix32. Integer arithmetic only, so every machine gets the same sequence.

const TWO_POW_32 = 4294967296;
const TWO_POW_53 = 9007199254740992;

function splitmix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) >>> 0;
  let z = state.s;
  z = mul32(z ^ (z >>> 16), 0x85ebca6b);
  z = mul32(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  /**
   * @param seed the seed gene value (any non-negative integer below 2^32)
   * @param stream separates independent sequences drawn from the same seed, such as attraction
   *   points and starting noise (0 to 255)
   */
  constructor(seed: number, stream = 0) {
    const state = { s: (seed + stream * 0x1000000) >>> 0 };
    this.s0 = splitmix32(state);
    this.s1 = splitmix32(state);
    this.s2 = splitmix32(state);
    this.s3 = splitmix32(state);
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Next unsigned 32-bit integer. */
  nextUint32(): number {
    const result = mul32(rotl(mul32(this.s1, 5), 7), 9);
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform in [0, 1), with 53 random bits. */
  next(): number {
    const high = this.nextUint32() >>> 5; // 27 bits
    const low = this.nextUint32() >>> 6; // 26 bits
    return (high * 67108864 + low) / TWO_POW_53;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Uniform integer in [0, n), for 1 ≤ n ≤ 2^32. */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Uniform in [0, 1) from a single 32-bit draw, for speed where 32 bits are enough. */
  nextFast(): number {
    return this.nextUint32() / TWO_POW_32;
  }
}

