import { describe, expect, it } from 'vitest';
import { mul32, rotl } from '../../src/sim/bits';
import { Rng } from '../../src/sim/rng';
import { mulberry32 } from '../../src/genome/test-helpers';

/** Reference xoshiro128** with splitmix32 seeding, written with Math.imul for comparison. */
function reference(seed: number, stream: number, count: number): number[] {
  let sm = (seed + stream * 0x1000000) >>> 0;
  const split = () => {
    sm = (sm + 0x9e3779b9) >>> 0;
    let z = sm;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let [a, b, c, d] = [split(), split(), split(), split()];
  const rot = (x: number, k: number) => (x << k) | (x >>> (32 - k));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.imul(rot(Math.imul(b, 5), 7), 9) >>> 0);
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rot(d, 11);
  }
  return out;
}

describe('seeded generator', () => {
  it('gives the fixed, recorded sequence for a fixed seed', () => {
    const rng = new Rng(1234567);
    expect(Array.from({ length: 8 }, () => rng.nextUint32())).toEqual([
      2583353998, 1030132134, 1991296242, 2739479683, 722143280, 2841950074, 996732146, 2934212015,
    ]);
    expect(Array.from({ length: 4 }, () => rng.next())).toEqual([
      0.5556891130222739, 0.7326632653279681, 0.18804578104244596, 0.8085685882372298,
    ]);
    const stream = new Rng(0, 3);
    expect(Array.from({ length: 4 }, () => stream.nextUint32())).toEqual([1927795865, 4033562833, 226366724, 967584560]);
  });

  it('matches a reference xoshiro128** over many seeds', () => {
    for (const seed of [0, 1, 2, 4095, 1234567, 16_777_215]) {
      for (const stream of [0, 1, 255]) {
        const rng = new Rng(seed, stream);
        const ours = Array.from({ length: 1000 }, () => rng.nextUint32());
        expect(ours).toEqual(reference(seed, stream, 1000));
      }
    }
  });

  it('the same seed gives the same sequence; different seeds and streams differ', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
    expect(new Rng(42).nextUint32()).not.toBe(new Rng(43).nextUint32());
    expect(new Rng(42, 0).nextUint32()).not.toBe(new Rng(42, 1).nextUint32());
  });

  it('draws lie in their ranges and are roughly uniform', () => {
    const rng = new Rng(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const k = Math.floor(x * 10);
      buckets[k] = (buckets[k] ?? 0) + 1;
      const n = rng.int(6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
      const r = rng.range(-3, 5);
      expect(r >= -3 && r < 5).toBe(true);
      const f = rng.nextFast();
      expect(f >= 0 && f < 1).toBe(true);
    }
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(500);
  });
});

describe('32-bit helpers', () => {
  it('mul32 matches Math.imul', () => {
    const rand = mulberry32(1);
    const edge = [0, 1, 0xffff, 0x10000, 0x7fffffff, 0x80000000, 0xffffffff];
    for (const a of edge) for (const b of edge) expect(mul32(a, b)).toBe(Math.imul(a, b) >>> 0);
    for (let i = 0; i < 100_000; i++) {
      const a = Math.floor(rand() * 4294967296);
      const b = Math.floor(rand() * 4294967296);
      expect(mul32(a, b)).toBe(Math.imul(a, b) >>> 0);
    }
  });

  it('rotl rotates', () => {
    expect(rotl(0x80000001, 1)).toBe(0x00000003);
    expect(rotl(0x12345678, 8)).toBe(0x34567812);
  });
});
