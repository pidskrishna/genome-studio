import { describe, expect, it } from 'vitest';
import { decodeGenome, speciesAOf, wildType } from '../../src/genome';
import { mulberry32, randomGenome } from '../../src/genome/test-helpers';
import { DRAFT_SCALE, draftParamsA, draftParamsB, speciesADraft, speciesBDraft } from '../../src/sim/draft';
import { speciesAParams } from '../../src/sim/speciesA/params';
import { speciesBParams, splitLength } from '../../src/sim/speciesB/params';
import { assertSound as soundA, grow as growA, runToEnd } from './speciesA/helpers';
import { assertSound as soundB, grow as growB } from './speciesB/helpers';

// Milestone 11: the draft (clarification 3) is a low-resolution run of the same code with the same
// algorithm. These tests check its parameters, that it is deterministic and coarser than the
// organism, that it is quick for both wild types, and that random codes draft without error or NaN.

const draftA = (code: string) => runToEnd(speciesADraft({ code })).output;
const draftB = (code: string) => runToEnd(speciesBDraft({ code })).output;

describe('species A draft parameters', () => {
  it('double D and use an eighth of the points, so the point spacing in D (and the sensing range) is unchanged', () => {
    const rand = mulberry32(31);
    for (let n = 0; n < 40; n++) {
      const code = randomGenome('A', rand);
      const full = speciesAParams(code);
      const draft = draftParamsA(full);
      expect(draft.segmentLength).toBe(full.segmentLength * DRAFT_SCALE);
      expect(Math.abs(draft.pointCount - full.pointCount / 8)).toBeLessThanOrEqual(Math.max(0.5, 24 - full.pointCount / 8));
      expect(draft.sensingRange).toBe(full.sensingRange);
      expect(draft.seed).toBe(full.seed);
      // Physical twig sizes are kept: halved in the doubled D.
      expect(draft.tipRadius).toBeCloseTo(full.tipRadius / 2, 12);
      expect(draft.shedLength).toBeCloseTo(full.shedLength / 2, 12);
      // The kill distance keeps its D length, within the smaller envelope's limit (clarification 5).
      const radius = speciesAOf(decodeGenome(code)).radius / DRAFT_SCALE;
      expect(draft.killDistance).toBeLessThanOrEqual(full.killDistance);
      expect(draft.killDistance).toBeLessThanOrEqual(0.25 * radius + 1e-12);
    }
  });
});

describe('species B draft parameters', () => {
  it('double the cell size and change nothing else', () => {
    const full = speciesBParams(wildType('B'));
    const draft = draftParamsB(full);
    expect(draft.cellSize).toBe(full.cellSize * DRAFT_SCALE);
    expect(splitLength(draft)).toBeCloseTo(splitLength(full) * DRAFT_SCALE, 12);
    expect({ ...draft, cellSize: full.cellSize }).toEqual(full);
  });
});

describe('drafts', () => {
  it('are deterministic and coarser than the organism, for both wild types', () => {
    const a1 = draftA(wildType('A'));
    const a2 = draftA(wildType('A'));
    const fullA = growA(wildType('A'));
    expect(a1.hash).toBe(a2.hash);
    expect(a1.hash).not.toBe(fullA.hash);
    expect(a1.parents.length).toBeLessThan(fullA.parents.length);
    const b1 = draftB(wildType('B'));
    const b2 = draftB(wildType('B'));
    const fullB = growB(wildType('B'));
    expect(b1.hash).toBe(b2.hash);
    expect(b1.hash).not.toBe(fullB.hash);
    expect(b1.stats.vertices).toBeLessThan(fullB.stats.vertices / 2);
  });

  it('take well under a second for both wild types (the browser check is in NOTES.md)', () => {
    for (const run of [() => draftA(wildType('A')), () => draftB(wildType('B'))]) {
      const t = performance.now();
      run();
      expect(performance.now() - t).toBeLessThan(1000);
    }
  });

  it('grow soundly from random codes of both species', () => {
    const rand = mulberry32(77);
    for (let n = 0; n < 12; n++) soundA(draftA(randomGenome('A', rand)), `A draft ${n}`);
    for (let n = 0; n < 6; n++) soundB(draftB(randomGenome('B', rand)), `B draft ${n}`);
  });
});
