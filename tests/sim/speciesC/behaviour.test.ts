import { describe, expect, it } from 'vitest';
import { wildType } from '../../../src/genome';
import { speciesC } from '../../../src/sim/speciesC';
import { CONICITY, ORGAN_CAP, VERTEX_CAP } from '../../../src/sim/speciesC/constants';
import { speciesCParams, type SpeciesCParams } from '../../../src/sim/speciesC/params';
import { gammaLaw, gammaStart, type PlaneResult } from '../../../src/sim/speciesC/plane';
import { profile, Receptacle } from '../../../src/sim/speciesC/receptacle';
import { assertSound, divergences, grow, mean, plane, runToEnd, withGenes } from './helpers';

// Recorded from the wild type. If a constant of the encoding version or the wild type changes, this
// is re-recorded (spec clarification 2).
const WILD_TYPE_HASH = 'd4155445483dd395';

const wild = wildType('C');
const GOLDEN_ANGLE = 360 * (1 - 1 / ((1 + Math.sqrt(5)) / 2));

/** Model parameters written directly, starting from the wild type's. */
function params(over: Partial<SpeciesCParams>): SpeciesCParams {
  return { ...speciesCParams(wild), initiationNoise: 0, ...over };
}

/**
 * Parastichy counts near the apex: for each of the younger organs, the index difference to its two
 * nearest older neighbours (on the plane, by the cone distance). The two commonest differences are
 * the numbers of spirals in each direction.
 */
function parastichies(r: PlaneResult, n: number): [number, number] {
  const counts = new Map<number, number>();
  const radius = (i: number) => Math.exp(r.endTime - r.birth[i]!);
  for (let i = r.count - 160; i < r.count - 10; i++) {
    const near: [number, number][] = [];
    for (let j = Math.max(0, i - 120); j < i; j++) {
      const ri = radius(i);
      const rj = radius(j);
      const d2 = (ri - rj) ** 2 / n + 2 * n * ri * rj * (1 - Math.cos(r.angle[i]! - r.angle[j]!));
      near.push([d2, i - j]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (const [, diff] of near.slice(0, 2)) counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([d]) => d);
  return [Math.min(top[0]!, top[1]!), Math.max(top[0]!, top[1]!)];
}

describe('determinism', () => {
  it('the same code grown twice gives the same geometry hash', () => {
    const a = grow(wild);
    const b = grow(wild);
    expect(a.hash).toBe(b.hash);
    expect(a.positions).toEqual(b.positions);
  }, 120_000);

  it('the wild type has its recorded hash, through the worker job too', () => {
    const done = runToEnd(speciesC({ code: wild }));
    expect(done.output.hash).toBe(WILD_TYPE_HASH);
    expect(done.transfer).toHaveLength(3);
  }, 120_000);

  it('a different seed gives a different organism', () => {
    expect(grow(withGenes(wild, { 24: 99 })).hash).not.toBe(grow(wild).hash);
  }, 120_000);
});

describe('arrangement (Douady and Couder 1996)', () => {
  it('a spiral settles within 1° of the golden angle, with Fibonacci numbers of spirals near the apex', () => {
    const r = plane(params({ bodyPlan: 'head', gamma: 0.3, falloff: 5, startingOrgans: 1 }));
    expect(Math.abs(mean(divergences(r, 40)) - GOLDEN_ANGLE)).toBeLessThan(1);
    const [a, b] = parastichies(r, 1);
    const fib = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    expect(fib).toContain(a);
    expect(fib.indexOf(b)).toBe(fib.indexOf(a) + 1);
  }, 120_000);

  it('raising the inhibition range moves the arrangement toward alternate (180°)', () => {
    const low = mean(divergences(plane(params({ bodyPlan: 'column', gamma: 0.5, falloff: 3 })), 20));
    const high = mean(divergences(plane(params({ bodyPlan: 'column', gamma: 2, falloff: 3 })), 20));
    expect(Math.abs(low - GOLDEN_ANGLE)).toBeLessThan(2);
    expect(180 - high).toBeLessThan(180 - low - 10);
  }, 120_000);

  it('on the cone with stiff falloff, two starting organs give opposite pairs at right angles', () => {
    for (const gamma of [1.6, 1.7]) {
      const d = divergences(plane(params({ bodyPlan: 'cone', gamma, falloff: 17, startingOrgans: 2 })), 20);
      // Alternately the second organ of a pair (180°) and the first of the next pair (90°).
      const sorted = [...d].sort((x, y) => x - y);
      for (const x of sorted.slice(0, 10)) expect(Math.abs(x - 90)).toBeLessThan(3);
      for (const x of sorted.slice(10)) expect(Math.abs(x - 180)).toBeLessThan(3);
    }
  }, 120_000);

  it('Γ falls from Γi to the gene value by part III eq. 1 (clarification 23)', () => {
    expect(gammaStart(1, 0.3)).toBe(2.4);
    expect(gammaStart(2, 0.3)).toBeCloseTo(1.8, 12);
    expect(gammaStart(3, 0.3)).toBeCloseTo(1.8 * Math.sin(Math.PI / 3), 12);
    expect(gammaStart(1, 2)).toBe(2.4);
    expect(gammaStart(4, 2)).toBe(2);
    const law = gammaLaw(2.4, 0.3);
    expect(law(0)).toBeGreaterThan(2.35);
    expect(law(6)).toBeCloseTo(1.35, 12);
    expect(law(20)).toBeLessThan(0.301);
    for (let t = 0; t < 20; t += 0.5) expect(law(t + 0.5)).toBeLessThanOrEqual(law(t));
  });
});

describe('receptacle', () => {
  it('keeps each organ\'s angle around the axis', () => {
    for (const plan of ['head', 'dome', 'cone', 'column'] as const) {
      const rec = new Receptacle(plan, 1.3);
      for (const theta of [0.3, 1.7, 3.1, 4.4, 6.0]) {
        const f = rec.frame(0.6, theta);
        expect(Math.atan2(f.z, f.x)).toBeCloseTo(theta > Math.PI ? theta - 2 * Math.PI : theta, 12);
      }
    }
  });

  it('on the column, organs climb at a constant pitch: height is linear in log-radius', () => {
    // Organs sit at g = ρ / ρmax on the column; its height is linear in g below the rounded tip.
    for (const g of [0.2, 0.4, 0.6, 0.8]) {
      const a = profile('column', 2, g);
      const b = profile('column', 2, g + 0.1);
      expect(b.y - a.y).toBeCloseTo(-0.2, 12);
      expect(a.rho).toBe(1);
    }
    expect(CONICITY).toEqual([1, 2, 3, 6]);
  });
});

describe('the grown organism', () => {
  it('the wild type and each body plan and organ form are sound, with drivers on every vertex', () => {
    const codes = [wild];
    for (let plan = 0; plan < 4; plan++) codes.push(withGenes(wild, { 1: plan, 3: plan, 2: 0.6 }));
    for (const code of codes) {
      const g = grow(code);
      assertSound(g, code);
      expect(g.drivers.length).toBe((g.positions.length / 3) * 4);
      expect(g.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
      expect(g.stats.organs).toBeLessThanOrEqual(ORGAN_CAP);
    }
  }, 300_000);

  it('a dense column stops at the organ cap and stays inside the vertex cap', () => {
    const code = withGenes(wild, { 1: 3, 2: 0.1, 4: 17 });
    const g = grow(code);
    assertSound(g, code);
    expect(g.stats.organs).toBe(ORGAN_CAP);
    expect(g.stats.stopReason).toBe('organ cap');
    expect(g.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
  }, 300_000);

  it('position along the organ runs from 0 at the base to 1 at the tip, and is 0 on the receptacle', () => {
    const g = grow(wild);
    let ones = 0;
    for (let v = 0; v < g.positions.length / 3; v++) {
      const along = g.drivers[v * 4 + 2]!;
      expect(along).toBeGreaterThanOrEqual(0);
      expect(along).toBeLessThanOrEqual(1);
      if (along === 1) ones++;
    }
    expect(ones).toBe(g.stats.organs);
  }, 120_000);
});
