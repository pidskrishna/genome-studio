import { describe, expect, it } from 'vitest';
import { decodeGenome, valueById, wildType } from '../../../src/genome';
import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { speciesB } from '../../../src/sim/speciesB';
import { VERTEX_CAP } from '../../../src/sim/speciesB/constants';
import { GrowingMesh, buildEdges } from '../../../src/sim/speciesB/mesh';
import { assertSound, grow, outOfPlane, runToEnd, withGenes } from './helpers';

// Recorded from the disc wild type. If a constant of the encoding version or the wild type changes,
// this is re-recorded (spec clarification 2).
const WILD_TYPE_HASH = 'b6d5491896fbba36';

const wild = wildType('B');

describe('determinism', () => {
  it('the same code grown twice gives the same geometry hash', () => {
    const rand = mulberry32(61);
    for (const code of [wild, withGenes(randomGenome('B', rand), { 1: 0 })]) {
      const a = grow(code);
      const b = grow(code);
      expect(a.hash).toBe(b.hash);
      expect(a.positions).toEqual(b.positions);
    }
  }, 60_000);

  it('the disc wild type has its recorded hash, through the worker job too', () => {
    expect(valueById(decodeGenome(wild), 'bodyPlan')).toBe(0);
    const done = runToEnd(speciesB({ code: wild }));
    expect(done.output.hash).toBe(WILD_TYPE_HASH);
    expect(done.transfer).toHaveLength(3);
  }, 60_000);

  it('a different seed gives a different organism', () => {
    expect(grow(withGenes(wild, { 24: 99 })).hash).not.toBe(grow(wild).hash);
  }, 60_000);
});

describe('flat test (clarification 8)', () => {
  // Disc wild type with anisotropy, patch contrast and lift at their neutral values.
  const neutral = withGenes(wild, { 6: 0, 12: 0, 13: 0 });
  const roughness = valueById(decodeGenome(neutral), 'startingRoughness');

  it('with margin bias at its minimum the sheet stays flat, within the starting roughness', () => {
    const code = withGenes(neutral, { 2: 1 });
    expect(valueById(decodeGenome(code), 'marginBias')).toBe(1);
    const g = grow(code);
    expect(g.stats.stopReason).toBe('area-multiple');
    expect(outOfPlane(g)).toBeLessThanOrEqual(roughness);
  }, 60_000);

  it('the out-of-plane deviation rises as margin bias rises', () => {
    const deviations = [1, 2, 6, 20].map((bias) => outOfPlane(grow(withGenes(neutral, { 2: bias }))));
    for (let i = 1; i < deviations.length; i++) expect(deviations[i]).toBeGreaterThan(deviations[i - 1]!);
    expect(deviations[3]).toBeGreaterThan(2 * roughness);
  }, 120_000);
});

describe('maturity (clarification 1)', () => {
  it('grows to the area multiple, or stops at the vertex cap, never above it', () => {
    const fine = grow(withGenes(wild, { 15: 0.005 }));
    expect(fine.stats.stopReason).toBe('vertex-cap');
    expect(fine.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
    expect(fine.positions.length / 3).toBe(fine.stats.vertices);
    const coarse = grow(withGenes(wild, { 15: 0.02 }));
    expect(coarse.stats.stopReason).toBe('area-multiple');
    expect(coarse.stats.areaMultiple).toBeGreaterThanOrEqual(4);
    expect(coarse.stats.areaMultiple).toBeLessThan(4.2);
    expect(coarse.stats.vertices).toBeLessThan(fine.stats.vertices);
  }, 120_000);
});

describe('relaxation is stable under every stiffness and thickness', () => {
  it('the extremes of stiffness, thickness, relaxation passes and repulsion grow soundly', () => {
    for (const stiffness of [0.1, 10]) {
      for (const thickness of [0.2, 3]) {
        for (const extra of [{ 14: 1 }, { 14: 20, 9: 10, 8: 4 }] as Record<number, number>[]) {
          const code = withGenes(wild, { 7: stiffness, 3: thickness, ...extra });
          const g = grow(code);
          assertSound(g, code);
          let extent = 0;
          for (const p of g.positions) extent = Math.max(extent, Math.abs(p));
          // An area multiple of 4 doubles the starting radius of 1.
          expect(extent).toBeGreaterThan(1.5);
          expect(extent).toBeLessThan(3);
        }
      }
    }
  }, 120_000);
});

describe('margin distance (clarification 7)', () => {
  it('is measured on the starting disc and carried through splits as the mean of the edge ends', () => {
    const mesh = new GrowingMesh(16);
    // Two triangles on the unit square, margins as if measured on some starting shape.
    mesh.addVertex(0, 0, 0, 0, 0, 0.1, 0);
    mesh.addVertex(1, 0, 0, 1, 0, 0.5, 0);
    mesh.addVertex(1, 0, 1, 1, 1, 0.3, 0);
    mesh.addVertex(0, 0, 1, 0, 1, 0.7, 0);
    buildEdges(mesh, [0, 1, 2, 0, 2, 3]);
    const diagonal = [...Array(mesh.edgeCount).keys()].find((e) => mesh.edgeT1[e]! >= 0)!;
    const m = mesh.split(diagonal, 5);
    expect(mesh.margin[m]).toBeCloseTo((0.1 + 0.3) / 2, 15);
    expect(mesh.birth[m]).toBe(5);
    expect(mesh.triangleCount).toBe(4);
    // Rest area is preserved by the split.
    expect(mesh.totalRestArea()).toBeCloseTo(1, 12);
  });

  it('the rim of the grown wild type keeps margin distance 0 and the centre keeps 1', () => {
    const g = grow(wild);
    const n = g.positions.length / 3;
    let rim = 0;
    let centre = 0;
    for (let v = 0; v < n; v++) {
      const m = g.drivers[v * 4]!;
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      if (m === 0) rim++;
      if (m === 1) centre++;
    }
    expect(rim).toBeGreaterThan(100);
    expect(centre).toBe(1);
  }, 60_000);
});

describe('gradient-driver attributes', () => {
  it('every vertex carries all four, with no NaN', () => {
    const rand = mulberry32(71);
    for (const code of [wild, withGenes(randomGenome('B', rand), { 1: 0 }), withGenes(randomGenome('B', rand), { 1: 0 })]) {
      const g = grow(code);
      const n = g.positions.length / 3;
      expect(g.drivers).toHaveLength(n * 4);
      const problems: string[] = [];
      for (let v = 0; v < n && problems.length < 5; v++) {
        const [margin, curvature, order, height] = [0, 1, 2, 3].map((k) => g.drivers[v * 4 + k]!) as [number, number, number, number];
        if (![margin, curvature, order, height].every(Number.isFinite)) problems.push(`${v}: not finite`);
        if (margin < 0 || margin > 1) problems.push(`${v}: margin ${margin}`);
        if (!Number.isInteger(order) || order < 0 || order > g.stats.steps) problems.push(`${v}: order ${order}`);
        if (height !== g.positions[v * 3 + 1]) problems.push(`${v}: height`);
      }
      expect(problems, code).toEqual([]);
    }
  }, 120_000);
});
