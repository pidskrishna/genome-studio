import { describe, expect, it } from 'vitest';
import { decodeGenome, speciesAOf, valueById, wildType } from '../../../src/genome';
import { mulberry32, randomGenome } from '../../../src/genome/test-helpers';
import { speciesA, type BranchGeometry } from '../../../src/sim/speciesA';
import { colonise, type ColoniseConfig } from '../../../src/sim/speciesA/colonise';
import { STEP_CAP } from '../../../src/sim/speciesA/constants';
import { shedTwigs } from '../../../src/sim/speciesA/postprocess';
import { assertSound, grow, runToEnd, withGenes } from './helpers';

// Recorded from the wild type. If a constant of the encoding version or the wild type changes,
// this is re-recorded (spec clarification 2).
const WILD_TYPE_HASH = '642a289e51e48070';

function childCounts(g: BranchGeometry): Int32Array {
  const kids = new Int32Array(g.parents.length);
  for (const p of g.parents) if (p >= 0) kids[p] = (kids[p] as number) + 1;
  return kids;
}

function centre(g: BranchGeometry): [number, number, number] {
  const n = g.parents.length;
  let x = 0;
  let y = 0;
  let z = 0;
  for (let v = 0; v < n; v++) {
    x += g.positions[v * 3] as number;
    y += g.positions[v * 3 + 1] as number;
    z += g.positions[v * 3 + 2] as number;
  }
  return [x / n, y / n, z / n];
}

const wild = wildType('A');

describe('determinism', () => {
  it('the same code grown twice gives the same geometry hash', () => {
    const rand = mulberry32(31);
    for (const code of [wild, randomGenome('A', rand), randomGenome('A', rand), randomGenome('A', rand)]) {
      const a = grow(code);
      const b = grow(code);
      expect(a.hash).toBe(b.hash);
      expect(a.positions).toEqual(b.positions);
    }
  });

  it('the wild type has its recorded hash', () => {
    expect(grow(wild).hash).toBe(WILD_TYPE_HASH);
  });

  it('the worker job gives the same geometry as growing directly', () => {
    const done = runToEnd(speciesA({ code: wild }));
    expect(done.output.hash).toBe(WILD_TYPE_HASH);
    expect(done.transfer).toHaveLength(4);
  });

  it('a different seed gives a different organism', () => {
    expect(grow(withGenes(wild, { 24: 99 })).hash).not.toBe(grow(wild).hash);
  });
});

describe('pipe model', () => {
  it('at every branching point, r^n is the sum of r^n over all children', () => {
    const rand = mulberry32(41);
    const codes = [wild, ...Array.from({ length: 30 }, () => randomGenome('A', rand))];
    let checked = 0;
    for (const code of codes) {
      const g = grow(code);
      const n = valueById(decodeGenome(code), 'pipeExponent');
      const tip = valueById(decodeGenome(code), 'tipRadius');
      const sums = new Float64Array(g.parents.length);
      const kids = childCounts(g);
      g.parents.forEach((p, v) => {
        if (p >= 0) sums[p] = (sums[p] as number) + Math.pow(g.radii[v] as number, n);
      });
      for (let v = 0; v < g.parents.length; v++) {
        const r = g.radii[v] as number;
        if ((kids[v] as number) === 0) {
          expect(r).toBe(tip);
        } else if ((kids[v] as number) >= 2) {
          const lhs = Math.pow(r, n);
          expect(Math.abs(lhs - (sums[v] as number)) / lhs).toBeLessThan(1e-9);
          checked++;
        } else {
          expect(Math.abs(Math.pow(r, n) - (sums[v] as number)) / (sums[v] as number)).toBeLessThan(1e-9);
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('crown shape', () => {
  it('no tropism and uniform points give a roughly symmetric crown', () => {
    const g = grow(withGenes(wild, { 2: 0, 7: 0 }));
    const [cx, , cz] = centre(g);
    const radius = g.envelope.radius;
    expect(Math.abs(cx)).toBeLessThan(0.05 * radius);
    expect(Math.abs(cz)).toBeLessThan(0.05 * radius);
    // Nodes are spread evenly between the four quarters around the axis.
    const quarters = [0, 0, 0, 0];
    for (let v = 0; v < g.parents.length; v++) {
      const x = g.positions[v * 3] as number;
      const z = g.positions[v * 3 + 2] as number;
      if (x === 0 && z === 0) continue;
      quarters[(x >= 0 ? 0 : 1) + (z >= 0 ? 0 : 2)]! += 1;
    }
    const mean = quarters.reduce((a, b) => a + b, 0) / 4;
    for (const q of quarters) expect(Math.abs(q - mean) / mean).toBeLessThan(0.15);
  });

  it('tropism bends a branch up or down: its centre of mass rises with positive and falls with negative tropism', () => {
    // One starting node and one attraction point straight out to the side.
    const centreY = (tropism: number) => {
      const grown = runToEnd(
        colonise({
          points: new Float64Array([40, 0, 0]),
          origins: new Float64Array([0, 0, 0]),
          sensingRange: 64,
          killDistance: 2,
          tropism,
          stepCap: STEP_CAP,
        }),
      );
      expect(grown.stopReason).toBe('all-points-removed');
      return grown.y.reduce((a, b) => a + b, 0) / grown.y.length;
    };
    expect(centreY(0)).toBe(0);
    expect(centreY(0.25)).toBeGreaterThan(0.5);
    expect(centreY(0.5)).toBeGreaterThan(centreY(0.25));
    expect(centreY(-0.25)).toBeLessThan(-0.5);
    expect(centreY(-0.5)).toBeLessThan(centreY(-0.25));
  });
});

describe('clear stem (clarification 4)', () => {
  it('with clear stem at its maximum and sensing range at its minimum, a trunk grows into the envelope and branches', () => {
    const code = withGenes(wild, { 9: 0.5, 4: 2.5 });
    const d = decodeGenome(code);
    expect(valueById(d, 'clearStem')).toBe(0.5);
    expect(valueById(d, 'sensingRange')).toBe(2.5);
    const reach = speciesAOf(d).sensingRange;
    const g = grow(code);
    assertSound(g, code);
    const kids = childCounts(g);
    const bottom = g.envelope.bottom;
    expect(bottom).toBeGreaterThan(20);
    // The trunk is a single unbranched stem from the base up to the envelope...
    let topOfTrunk = 0;
    for (let v = 0; (kids[v] as number) === 1; ) {
      v = g.parents.indexOf(v);
      topOfTrunk = g.positions[v * 3 + 1] as number;
    }
    expect(topOfTrunk).toBeGreaterThan(bottom - reach - 1);
    // ...and the organism branches inside the envelope.
    const branchHeights = [...kids.keys()].filter((v) => (kids[v] as number) >= 2).map((v) => g.positions[v * 3 + 1] as number);
    expect(branchHeights.length).toBeGreaterThan(50);
    expect(Math.min(...branchHeights)).toBeGreaterThan(bottom - reach - 1);
  });
});

describe('kill distance limited by sensing range (clarification 5)', () => {
  it('a genome whose clearance is clamped grows past its first step', () => {
    const code = withGenes(wild, { 5: 20, 4: 2.5 });
    const d = decodeGenome(code);
    expect(speciesAOf(d).killLimitedBy).not.toBeNull();
    expect(valueById(d, 'clearance')).toBeLessThan(20);
    const g = grow(code);
    assertSound(g, code);
    expect(g.stats.steps).toBeGreaterThan(1);
    expect(g.stats.grownNodes).toBeGreaterThan(2);
  });
});

describe('stopping (clarification 15)', () => {
  const base: Omit<ColoniseConfig, 'points'> = {
    origins: new Float64Array([0, 0, 0]),
    sensingRange: 10,
    killDistance: 1,
    tropism: 0,
    stepCap: STEP_CAP,
  };

  it('two exactly opposing points do not hang: the zero rule stops growth', () => {
    const grown = runToEnd(colonise({ ...base, points: new Float64Array([5, 0, 0, -5, 0, 0]) }));
    expect(grown.stopReason).toBe('stalled');
    expect(grown.x).toHaveLength(1);
    expect(grown.pointsLeft).toBe(2);
  });

  it('nearly opposing points with tropism do not hang', () => {
    for (const tropism of [-0.5, -0.1, 0, 0.1, 0.5]) {
      for (const offset of [1e-12, 1e-6, 1e-3, 0.1]) {
        const grown = runToEnd(colonise({ ...base, tropism, points: new Float64Array([5, 0, 0, -5, offset, 0]) }));
        expect(['stalled', 'all-points-removed', 'step-cap', 'out-of-range']).toContain(grown.stopReason);
        expect(grown.steps).toBeLessThanOrEqual(STEP_CAP);
      }
    }
  });

  it('growth stops at the step cap', () => {
    // Points far above a short sensing range keep the trunk climbing.
    const grown = runToEnd(colonise({ ...base, stepCap: 25, points: new Float64Array([0, 1000, 0]) }));
    expect(grown.stopReason).toBe('step-cap');
    expect(grown.steps).toBe(25);
    expect(grown.x).toHaveLength(26);
  });

  it('a stem that touches a point and passes it keeps climbing until the organism branches', () => {
    // One point near the base, then a cluster high above: after the first point is removed, the stem
    // climbs again (clarification 4) instead of stopping as out of range.
    const cluster = [0.5, 40, 0.3, 5, 45, 1, -4, 47, 2, 1, 44, -6, 2, 50, 3];
    const grown = runToEnd(colonise({ ...base, points: new Float64Array([0, 5, 0, ...cluster]) }));
    expect(grown.pointsLeft).toBe(0);
    const kids = new Int32Array(grown.parent.length);
    for (const p of grown.parent) if (p >= 0) kids[p] = (kids[p] as number) + 1;
    expect(kids.some((k) => k >= 2)).toBe(true);
    expect(Math.max(...grown.y)).toBeGreaterThan(35);
  });

  it('a trunk that passes every point stops, out of range', () => {
    const grown = runToEnd(colonise({ ...base, points: new Float64Array([50, 20, 0]) }));
    expect(grown.stopReason).toBe('out-of-range');
    expect(Math.max(...grown.y)).toBeLessThanOrEqual(20 + 10 + 1);
  });
});

describe('gradient-driver attributes', () => {
  it('every node carries all four, with no NaN', () => {
    const rand = mulberry32(51);
    for (const code of [wild, ...Array.from({ length: 30 }, () => randomGenome('A', rand))]) {
      const g = grow(code);
      const n = g.parents.length;
      expect(g.drivers).toHaveLength(n * 4);
      const problems: string[] = [];
      for (let v = 0; v < n && problems.length < 5; v++) {
        const [distance, radius, order, height] = [0, 1, 2, 3].map((k) => g.drivers[v * 4 + k] as number) as [number, number, number, number];
        if (![distance, radius, order, height].every(Number.isFinite)) problems.push(`${v}: not finite`);
        if (radius !== g.radii[v]) problems.push(`${v}: radius`);
        if (height !== g.positions[v * 3 + 1]) problems.push(`${v}: height`);
        if (!Number.isInteger(order) || order < 0) problems.push(`${v}: order ${order}`);
        const p = g.parents[v] as number;
        if (p < 0) {
          if (distance !== 0 || order !== 0) problems.push(`${v}: root distance or order`);
        } else {
          if (!(distance > (g.drivers[p * 4] as number))) problems.push(`${v}: distance does not increase`);
          const step = order - (g.drivers[p * 4 + 2] as number);
          if (step !== 0 && step !== 1) problems.push(`${v}: order step ${step}`);
        }
      }
      expect(problems, code).toEqual([]);
    }
  });
});

describe('twig shedding', () => {
  it('removes short twigs, shortest first, but never the last branching point', () => {
    // Stem 0-1-2-3-4-5 with twigs: 6 off node 1 (length 1), 7-8 off node 3 (length 2).
    const tree = {
      x: [0, 0, 0, 0, 0, 0, 1, 1, 2],
      y: [0, 1, 2, 3, 4, 5, 1, 3, 3],
      z: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      parent: [-1, 0, 1, 2, 3, 4, 1, 3, 7],
    };
    const branching = (t: { parent: number[] }) => {
      const kids = new Int32Array(t.parent.length);
      for (const p of t.parent) if (p >= 0) kids[p] = (kids[p] as number) + 1;
      return kids.filter((k) => k >= 2).length;
    };
    // Threshold 1.5: only the shortest twig goes.
    expect(shedTwigs(tree, 1.5).parent).toHaveLength(8);
    // Threshold 10: every terminal branch is short (the stem above node 3 is 2 long), but the last
    // removal that would leave no branching point is skipped.
    const shed = shedTwigs(tree, 10);
    expect(branching(shed)).toBe(1);
    expect(shed.parent.length).toBeLessThan(9);
    // The full stem from a starting node is never removed.
    expect(shedTwigs({ x: [0, 0], y: [0, 1], z: [0, 0], parent: [-1, 0] }, 10).parent).toHaveLength(2);
  });
});
