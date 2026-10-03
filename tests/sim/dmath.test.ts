import { describe, expect, it } from 'vitest';
import * as d from '../../src/sim/dmath';
import { mulberry32 } from '../../src/genome/test-helpers';

// Each deterministic function is compared with the browser's own over the ranges stated below.
// Pass: relative error ≤ 1e-12, or absolute error ≤ 1e-15 where the true value is near zero.
// Special values (NaN, infinities, signed zeros) must match exactly.
//
// Stated ranges
//   sin, cos   |x| ≤ 10, 1e3, 1e6 and 1e9 (large arguments); points next to multiples of π/2 up to
//              k = 6e8; tiny and subnormal x
//   tan        |x| ≤ 1.5 and |x| ≤ 1e3
//   atan2      all four quadrants with magnitudes from 1e-10 to 1e10, both axes, signed zeros, infinities
//   exp        |x| ≤ 1; −700 to 709.78; overflow above 709.78; underflow from −708.4 to −745.2
//   log        (0, 10]; 1e-300 to 1e300; within 1e-3 of 1; values near zero down to the smallest subnormal
//   pow        x from 1e-3 to 1e3 with y from −50 to 50; negative x with integer y; special cases

const REL = 1e-12;
const ABS = 1e-15;

function check(name: string, actual: number, expected: number, input: unknown): void {
  if (Number.isNaN(expected) || !Number.isFinite(expected) || expected === 0) {
    if (!Object.is(actual, expected) && !(expected === 0 && Math.abs(actual) <= ABS)) {
      throw new Error(`${name}(${String(input)}) = ${actual}, expected ${expected}`);
    }
    return;
  }
  const err = Math.abs(actual - expected);
  if (err > Math.max(REL * Math.abs(expected), ABS)) {
    throw new Error(`${name}(${String(input)}) = ${actual}, expected ${expected} (error ${err})`);
  }
}

function sweep(name: string, f: (x: number) => number, g: (x: number) => number, xs: Iterable<number>): number {
  let count = 0;
  for (const x of xs) {
    check(name, f(x), g(x), x);
    count++;
  }
  return count;
}

function* uniform(seed: number, n: number, lo: number, hi: number): Generator<number> {
  const rand = mulberry32(seed);
  for (let i = 0; i < n; i++) yield lo + (hi - lo) * rand();
}

function* logUniform(seed: number, n: number, lo: number, hi: number): Generator<number> {
  const rand = mulberry32(seed);
  const a = Math.log(lo);
  const b = Math.log(hi);
  for (let i = 0; i < n; i++) yield Math.exp(a + (b - a) * rand());
}

function nextUp(x: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  view.setBigUint64(0, view.getBigUint64(0) + (x >= 0 ? 1n : -1n));
  return view.getFloat64(0);
}

describe('sin and cos', () => {
  const ranges: [string, number][] = [['10', 10], ['1e3', 1e3], ['1e6', 1e6], ['1e9', 1e9]];
  for (const [label, r] of ranges) {
    it(`match the built-ins for |x| ≤ ${label}`, () => {
      sweep('sin', d.sin, Math.sin, uniform(1, 40_000, -r, r));
      sweep('cos', d.cos, Math.cos, uniform(2, 40_000, -r, r));
    });
  }

  it('match next to multiples of π/2, where reduction is hardest', () => {
    const points: number[] = [];
    const rand = mulberry32(3);
    for (let k = 1; k <= 20_000; k++) points.push(k);
    for (let i = 0; i < 20_000; i++) points.push(Math.floor(rand() * 6e8));
    for (const k of points) {
      const x = k * (Math.PI / 2);
      for (const p of [x, nextUp(x), -x]) {
        check('sin', d.sin(p), Math.sin(p), p);
        check('cos', d.cos(p), Math.cos(p), p);
      }
    }
  });

  it('match for tiny and special arguments', () => {
    const xs = [0, -0, 5e-324, -5e-324, 1e-300, 1e-20, 1e-9, 7.450580596923828e-9, Math.PI / 4, -Math.PI / 4, Math.PI, Math.PI / 2, 3 * Math.PI / 4];
    sweep('sin', d.sin, Math.sin, xs);
    sweep('cos', d.cos, Math.cos, xs);
    expect(Object.is(d.sin(-0), -0)).toBe(true);
    for (const x of [NaN, Infinity, -Infinity]) {
      expect(d.sin(x)).toBeNaN();
      expect(d.cos(x)).toBeNaN();
    }
  });

  it('stay finite and within [−1, 1] for huge arguments', () => {
    for (const x of [1e15, -1e15, 2 ** 60, 1e100, 1e300, -1.7976931348623157e308]) {
      for (const v of [d.sin(x), d.cos(x)]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('tan', () => {
  it('matches the built-in for |x| ≤ 1.5 and |x| ≤ 1e3', () => {
    sweep('tan', d.tan, Math.tan, uniform(4, 40_000, -1.5, 1.5));
    sweep('tan', d.tan, Math.tan, uniform(5, 40_000, -1e3, 1e3));
  });
});

describe('atan2', () => {
  it('matches the built-in in all four quadrants', () => {
    const rand = mulberry32(6);
    for (let i = 0; i < 100_000; i++) {
      const y = (rand() < 0.5 ? -1 : 1) * 10 ** (rand() * 20 - 10);
      const x = (rand() < 0.5 ? -1 : 1) * 10 ** (rand() * 20 - 10);
      check('atan2', d.atan2(y, x), Math.atan2(y, x), [y, x]);
    }
  });

  it('matches near the axes and the diagonals', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 20_000; i++) {
      const a = rand() * 2 - 1;
      const tiny = (rand() - 0.5) * 1e-12;
      for (const [y, x] of [[tiny, a], [a, tiny], [a, a + tiny], [a, -a + tiny], [1, 1e-30], [-1, -1e-30], [1e-30, -1]]) {
        check('atan2', d.atan2(y as number, x as number), Math.atan2(y as number, x as number), [y, x]);
      }
    }
  });

  it('matches exactly for zeros, infinities and NaN', () => {
    const specials = [0, -0, 1, -1, Infinity, -Infinity, NaN, 5e-324, -5e-324, 1e308, -1e308];
    for (const y of specials) {
      for (const x of specials) {
        const expected = Math.atan2(y, x);
        const actual = d.atan2(y, x);
        if (Number.isNaN(expected) || expected === 0 || !Number.isFinite(expected)) {
          expect(Object.is(actual, expected), `atan2(${y}, ${x})`).toBe(true);
        } else {
          check('atan2', actual, expected, [y, x]);
        }
      }
    }
  });

  it('atan matches the built-in', () => {
    sweep('atan', d.atan, Math.atan, logUniform(8, 20_000, 1e-12, 1e25));
    sweep('atan', d.atan, Math.atan, uniform(9, 20_000, -3, 3));
  });
});

describe('exp', () => {
  it('matches the built-in for |x| ≤ 1 and from −700 to 709.78', () => {
    sweep('exp', d.exp, Math.exp, uniform(10, 40_000, -1, 1));
    sweep('exp', d.exp, Math.exp, uniform(11, 40_000, -700, 709.78));
    sweep('exp', d.exp, Math.exp, [0, -0, 1e-20, -1e-20, 1e-300, 709.78, 709.782712893384, -708.39]);
  });

  it('overflows to infinity like the built-in', () => {
    for (const x of [709.7827128933841, 709.79, 710, 1000, 1e308, Infinity]) {
      expect(d.exp(x)).toBe(Infinity);
      expect(Math.exp(x)).toBe(Infinity);
    }
  });

  it('underflows like the built-in, through the subnormal range to zero', () => {
    sweep('exp', d.exp, Math.exp, uniform(12, 20_000, -745.2, -708.4));
    for (const x of [-745.2, -746, -1000, -Infinity]) expect(d.exp(x)).toBe(0);
    expect(d.exp(NaN)).toBeNaN();
  });
});

describe('log', () => {
  it('matches the built-in on (0, 10] and from 1e-300 to 1e300', () => {
    sweep('log', d.log, Math.log, uniform(13, 40_000, 1e-9, 10));
    sweep('log', d.log, Math.log, logUniform(14, 40_000, 1e-300, 1e300));
  });

  it('matches within 1e-3 of 1, where the result is near zero', () => {
    const rand = mulberry32(15);
    for (let i = 0; i < 40_000; i++) {
      const x = 1 + (rand() - 0.5) * 2 * 10 ** (-3 - rand() * 13);
      check('log', d.log(x), Math.log(x), x);
    }
    for (const x of [1, nextUp(1), 1 - 1.1102230246251565e-16]) check('log', d.log(x), Math.log(x), x);
  });

  it('matches near zero, down to the smallest subnormal', () => {
    sweep('log', d.log, Math.log, logUniform(16, 20_000, 5e-324, 2.2250738585072014e-308));
    sweep('log', d.log, Math.log, [5e-324, 1e-323, 2.2250738585072014e-308, 2.225073858507201e-308]);
  });

  it('handles special values like the built-in', () => {
    expect(d.log(0)).toBe(-Infinity);
    expect(d.log(-0)).toBe(-Infinity);
    expect(d.log(-1)).toBeNaN();
    expect(d.log(NaN)).toBeNaN();
    expect(d.log(Infinity)).toBe(Infinity);
    expect(d.log(1.7976931348623157e308)).toBeCloseTo(Math.log(1.7976931348623157e308), 10);
  });
});

describe('pow', () => {
  it('matches the built-in for x from 1e-3 to 1e3 and y from −50 to 50', () => {
    const rand = mulberry32(17);
    let compared = 0;
    for (let i = 0; i < 100_000; i++) {
      const x = 10 ** (rand() * 6 - 3);
      const y = rand() * 100 - 50;
      const expected = Math.pow(x, y);
      if (!Number.isFinite(expected) || expected < 2.2250738585072014e-308) continue;
      check('pow', d.pow(x, y), expected, [x, y]);
      compared++;
    }
    expect(compared).toBeGreaterThan(90_000);
  });

  it('matches for negative x with integer y', () => {
    const rand = mulberry32(18);
    for (let i = 0; i < 20_000; i++) {
      const x = -(10 ** (rand() * 4 - 2));
      const y = Math.floor(rand() * 61) - 30;
      check('pow', d.pow(x, y), Math.pow(x, y), [x, y]);
    }
  });

  it('matches the built-in on special cases', () => {
    const values = [0, -0, 1, -1, 2, -2, 0.5, -0.5, 3, -3, Infinity, -Infinity, NaN];
    for (const x of values) {
      for (const y of values) {
        const expected = Math.pow(x, y);
        const actual = d.pow(x, y);
        if (Number.isNaN(expected) || expected === 0 || !Number.isFinite(expected)) {
          expect(Object.is(actual, expected), `pow(${x}, ${y})`).toBe(true);
        } else {
          check('pow', actual, expected, [x, y]);
        }
      }
    }
  });
});

describe('determinism', () => {
  it('constants match the built-ins', () => {
    expect(d.PI).toBe(Math.PI);
  });
});
