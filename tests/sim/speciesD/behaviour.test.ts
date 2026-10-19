import { describe, expect, it } from 'vitest';
import { wildType } from '../../../src/genome';
import { speciesD } from '../../../src/sim/speciesD';
import { VERTEX_CAP } from '../../../src/sim/speciesD/constants';
import { speciesDParams, type SpeciesDParams } from '../../../src/sim/speciesD/params';
import { assertSound, grow, growParams, runToEnd, withGenes } from './helpers';

// Recorded from the wild type. If a constant of the encoding version or the wild type changes, this
// is re-recorded (spec clarification 2).
const WILD_TYPE_HASH = 'f28ebaf03093a6d5';

const wild = wildType('D');

/** The wild type with ornament, flare, irregularity and tilt off: Raup's bare model. */
function bare(over: Partial<SpeciesDParams> = {}): SpeciesDParams {
  return { ...speciesDParams(wild), ribHeight: 0, cordHeight: 0, nodules: 0, flare: 0, irregularity: 0, tilt: 0, ...over };
}

describe('determinism', () => {
  it('the same code grown twice gives the same geometry hash', () => {
    const a = grow(wild);
    const b = grow(wild);
    expect(a.hash).toBe(b.hash);
    expect(a.positions).toEqual(b.positions);
  });

  it('the wild type has its recorded hash, through the worker job too', () => {
    const done = runToEnd(speciesD({ code: wild }));
    expect(done.output.hash).toBe(WILD_TYPE_HASH);
    expect(done.transfer).toHaveLength(3);
  });

  it('a different seed gives a different organism', () => {
    expect(grow(withGenes(wild, { 24: 99 })).hash).not.toBe(grow(wild).hash);
  });
});

describe("Raup's model, with ornament off", () => {
  it('the generating curve grows by W per turn', () => {
    for (const expansion of [1.3, 2.5, 40, 1000]) {
      const g = growParams(bare({ expansion }));
      const { rings, points, whorls } = g.stats;
      const radial = (k: number) => Math.hypot(g.positions[k * points * 3]!, g.positions[k * points * 3 + 2]!);
      for (let k = 1; k < rings; k += 37) {
        const turns = (whorls * k) / (rings - 1);
        expect(Math.abs(radial(k) / radial(0) / Math.pow(expansion, turns) - 1)).toBeLessThan(1e-9);
      }
    }
  });

  it('a translation of 0 puts every whorl in one plane', () => {
    const g = growParams(bare({ translation: 0 }));
    const { rings, points } = g.stats;
    // The curve's outer point lies at its centre's height.
    for (let k = 0; k < rings; k++) expect(Math.abs(g.positions[k * points * 3 + 1]!)).toBeLessThan(1e-12);
  });

  it('a distance from the axis of 0 closes the umbilicus: the inner edge touches the axis', () => {
    const g = growParams(bare({ axisDistance: 0 }));
    const { rings, points } = g.stats;
    for (let k = 0; k < rings; k += 11) {
      const v = (k * points + points / 2) * 3;
      expect(Math.hypot(g.positions[v]!, g.positions[v + 2]!)).toBeLessThan(1e-12);
    }
  });

  it('the left-handed shell is the right-handed one mirrored, vertex for vertex', () => {
    const p = speciesDParams(wild);
    const right = growParams({ ...p, left: false });
    const left = growParams({ ...p, left: true });
    expect(left.positions.length).toBe(right.positions.length);
    for (let v = 0; v < right.positions.length; v += 3) {
      expect(left.positions[v]).toBe(right.positions[v]);
      expect(left.positions[v + 1]).toBe(right.positions[v + 1]);
      expect(left.positions[v + 2]).toBe(-right.positions[v + 2]!);
    }
    for (let t = 0; t < right.triangles.length; t += 3) {
      expect(left.triangles[t]).toBe(right.triangles[t]);
      expect(left.triangles[t + 1]).toBe(right.triangles[t + 2]);
      expect(left.triangles[t + 2]).toBe(right.triangles[t + 1]);
    }
    expect(left.drivers).toEqual(right.drivers);
  });
});

describe('edge pattern (clarification 24)', () => {
  function lastRing(code: string): number[] {
    const g = grow(code);
    const { rings, points } = g.stats;
    const out: number[] = [];
    for (let j = 0; j < points; j++) out.push(g.drivers[((rings - 1) * points + j) * 4 + 3]!);
    return out;
  }

  it('forms stripes along the growth direction on the wild type', () => {
    const a = lastRing(wild);
    const max = Math.max(...a);
    const min = Math.min(...a);
    expect(max / min).toBeGreaterThan(10);
    let peaks = 0;
    for (let j = 0; j < a.length; j++) {
      const l = a[(j + a.length - 1) % a.length]!;
      const r = a[(j + 1) % a.length]!;
      if (a[j]! > l && a[j]! >= r && a[j]! > (max + min) / 2) peaks++;
    }
    expect(peaks).toBeGreaterThanOrEqual(8);
  });

  it('changes with the seed', () => {
    expect(lastRing(withGenes(wild, { 24: 99 }))).not.toEqual(lastRing(wild));
  });
});

describe('the grown shell', () => {
  it('extreme genomes are sound and inside the vertex cap', () => {
    const cases: Record<number, number>[] = [
      {},
      { 1: 1.3, 2: 8, 3: 0, 4: 4, 5: 60 },
      { 1: 1000, 2: 0, 3: 0.9, 4: 0.25, 5: -60 },
      { 1: 1.3, 2: 0, 3: 0, 4: 0.25 },
      { 7: 40, 8: 0.4, 9: 0.05, 10: 32, 11: 0.2, 12: 1, 13: 1, 14: 0.2, 15: 1 },
      { 6: 1, 7: 40, 9: 0.5, 13: 1, 15: 1 },
    ];
    for (const genes of cases) {
      const code = withGenes(wild, genes);
      const g = grow(code);
      assertSound(g, code);
      expect(g.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
    }
  });

  it('every vertex carries growth lines, position around the curve, relief and pattern', () => {
    const g = grow(wild);
    const n = g.positions.length / 3;
    const { points } = g.stats;
    for (let v = 0; v < n - 1; v++) {
      expect(g.drivers[v * 4]).toBe(Math.floor(v / points));
      expect(g.drivers[v * 4 + 1]).toBe((v % points) / points);
      expect(g.drivers[v * 4 + 2]).toBeGreaterThanOrEqual(0);
      expect(g.drivers[v * 4 + 3]).toBeGreaterThanOrEqual(0);
    }
  });
});
