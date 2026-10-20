import { describe, expect, it } from 'vitest';
import { wildType } from '../../../src/genome';
import { buildBranchMesh } from '../../../src/render/branch-mesh';
import { speciesF } from '../../../src/sim/speciesF';
import { SEGMENT_CAP, SOFTENING, TIP_CAP, VERTEX_CAP } from '../../../src/sim/speciesF/constants';
import { FieldTree, type FieldPoints, type FieldSample } from '../../../src/sim/speciesF/field';
import { speciesFParams, type SpeciesFParams } from '../../../src/sim/speciesF/params';
import { mulberry32 } from '../../../src/genome/test-helpers';
import { assertSound, grow, growParams, phaseRadius, runToEnd, withGenes } from './helpers';

// Recorded from the wild type. If a constant of the encoding version or the wild type changes, this
// is re-recorded (spec clarification 2).
const WILD_TYPE_HASH = '6cc98c4a173c059f';

const wild = wildType('F');
const base = (over: Partial<SpeciesFParams> = {}): SpeciesFParams => ({ ...speciesFParams(wild), ...over });

/** Square root of the ratio of the largest to the smallest variance of the end points' positions. */
function axisRatio(positions: Float64Array, parents: Int32Array): number {
  const n = positions.length / 3;
  const isParent = new Uint8Array(n);
  for (let v = 1; v < n; v++) isParent[parents[v]!] = 1;
  const pts: number[][] = [];
  for (let v = 0; v < n; v++) if (!isParent[v]) pts.push([positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!]);
  const mean = [0, 1, 2].map((d) => pts.reduce((a, p) => a + p[d]!, 0) / pts.length);
  const a = [0, 1, 2].map(() => [0, 0, 0]);
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) a[i]![j] = a[i]![j]! + ((p[i]! - mean[i]!) * (p[j]! - mean[j]!)) / pts.length;
  // Jacobi rotations to diagonalise the covariance.
  for (let sweep = 0; sweep < 50; sweep++) {
    let p = 0;
    let q = 1;
    let largest = 0;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.abs(a[i]![j]!) > largest) [largest, p, q] = [Math.abs(a[i]![j]!), i, j];
    if (largest < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p]![q]!, a[q]![q]! - a[p]![p]!);
    const c = Math.cos(th);
    const s = Math.sin(th);
    for (let k = 0; k < 3; k++) [a[k]![p], a[k]![q]] = [c * a[k]![p]! - s * a[k]![q]!, s * a[k]![p]! + c * a[k]![q]!];
    for (let k = 0; k < 3; k++) [a[p]![k], a[q]![k]] = [c * a[p]![k]! - s * a[q]![k]!, s * a[p]![k]! + c * a[q]![k]!];
  }
  const values = [a[0]![0]!, a[1]![1]!, a[2]![2]!].sort((x, y) => x - y);
  return Math.sqrt(values[2]! / values[0]!);
}

describe('determinism', () => {
  it('the same code grown twice gives the same geometry hash', () => {
    const a = grow(wild);
    const b = grow(wild);
    expect(a.hash).toBe(b.hash);
    expect(a.positions).toEqual(b.positions);
  });

  it('the wild type has its recorded hash, through the worker job too', () => {
    const done = runToEnd(speciesF({ code: wild }));
    expect(done.output.hash).toBe(WILD_TYPE_HASH);
    expect(done.transfer).toHaveLength(4);
  });

  it('a different seed gives a different organism', () => {
    expect(grow(withGenes(wild, { 24: 99 })).hash).not.toBe(grow(wild).hash);
  });
});

describe('the fields', () => {
  it('on a small mycelium, the tree agrees with the direct sum over every point', () => {
    const rand = mulberry32(5);
    const count = 3000;
    const pts: FieldPoints = {
      count,
      x: new Float64Array(count),
      y: new Float64Array(count),
      z: new Float64Array(count),
      weight: new Float64Array(count),
      section: new Int32Array(count),
      tx: new Float64Array(count),
      ty: new Float64Array(count),
      tz: new Float64Array(count),
    };
    // Sixty random walks of fifty unit steps: sections of a mycelium.
    for (let s = 0; s < 60; s++) {
      let [x, y, z] = [rand() * 80 - 40, rand() * 80 - 40, rand() * 80 - 40];
      for (let k = 0; k < 50; k++) {
        const i = s * 50 + k;
        const [dx, dy, dz] = [rand() - 0.5, rand() - 0.5, rand() - 0.5];
        const l = Math.hypot(dx, dy, dz);
        [x, y, z] = [x + dx / l, y + dy / l, z + dz / l];
        pts.x[i] = x;
        pts.y[i] = y;
        pts.z[i] = z;
        pts.section[i] = s;
        pts.weight[i] = 0.5 / 50;
        pts.tx[i] = dx / l;
        pts.ty[i] = dy / l;
        pts.tz[i] = dz / l;
      }
    }
    const tree = new FieldTree(pts);
    const members = (section: number) => [...pts.section.keys()].filter((i) => pts.section[i] === section);
    const e2 = SOFTENING * SOFTENING;
    // Probes at points of the mycelium, leaving out their own section.
    for (let probe = 0; probe < 40; probe++) {
      const at = probe * 73;
      const [px, py, pz] = [pts.x[at]!, pts.y[at]!, pts.z[at]!];
      const own = pts.section[at]!;
      const tolerance = 0.05;
      const got: FieldSample = tree.sample(px, py, pz, members(own), { density: 0, dx: 0, dy: 0, dz: 0, mx: 0, my: 0, mz: 0, px: 0, py: 0, pz: 0 });
      let density = 0;
      const dn = [0, 0, 0];
      const dm = [0, 0, 0];
      for (let i = 0; i < count; i++) {
        if (pts.section[i] === own) continue;
        const e = [px - pts.x[i]!, py - pts.y[i]!, pz - pts.z[i]!];
        const s = e[0]! ** 2 + e[1]! ** 2 + e[2]! ** 2 + e2;
        density += pts.weight[i]! / s;
        for (let d = 0; d < 3; d++) {
          dn[d] = dn[d]! + (-2 * pts.weight[i]! * e[d]!) / (s * s);
          dm[d] = dm[d]! + -0.5 * pts.weight[i]! * e[d]! * s ** -1.25;
        }
      }
      expect(Math.abs(got.density - density) / density).toBeLessThan(tolerance);
      const rel = (g: number[], h: number[]) => Math.hypot(g[0]! - h[0]!, g[1]! - h[1]!, g[2]! - h[2]!) / Math.hypot(h[0]!, h[1]!, h[2]!);
      expect(rel([got.dx, got.dy, got.dz], dn)).toBeLessThan(tolerance);
      expect(rel([got.mx, got.my, got.mz], dm)).toBeLessThan(tolerance);
    }
  });
});

describe('form (Meškauskas, McNulty and Moore 2004)', () => {
  it('colony programme: the mycelium is close to spherical', () => {
    // Denser colonies, as in most of the paper's settings; the sparsest are more irregular.
    for (const seed of [1, 2]) {
      const g = growParams(base({ programme: 0, branchingThreshold: 0.05, seed }));
      expect(axisRatio(g.positions, g.parents)).toBeLessThan(1.5);
    }
  });

  it('colony programme: lowering the branching threshold gives fewer tips and longer sections (figures 3 and 4)', () => {
    const stats = [0.05, 0.012, 0.006].map((branchingThreshold) => growParams(base({ programme: 0, branchingThreshold })).stats);
    for (let k = 1; k < stats.length; k++) {
      expect(stats[k]!.tips).toBeLessThan(stats[k - 1]!.tips);
      // A binary tree with t tips has 2t − 1 sections.
      expect(stats[k]!.segments / (2 * stats[k]!.tips - 1)).toBeGreaterThan(stats[k - 1]!.segments / (2 * stats[k - 1]!.tips - 1));
    }
  });

  it('cup programme: a slice through the axis is hollow (figure 5B)', () => {
    const g = growParams(base({ programme: 1 }));
    const n = g.positions.length / 3;
    const heights: number[] = [];
    for (let v = 0; v < n; v++) if (g.drivers[v * 4 + 2] === 1) heights.push(g.positions[v * 3 + 1]!);
    heights.sort((a, b) => a - b);
    const mid = heights[Math.floor(heights.length / 2)]!;
    const band: [number, number][] = [];
    for (let v = 0; v < n; v++) if (Math.abs(g.positions[v * 3 + 1]! - mid) <= 5) band.push([g.positions[v * 3]!, g.positions[v * 3 + 2]!]);
    const radii = band.map(([x, z]) => Math.hypot(x, z)).sort((a, b) => a - b);
    const rim = radii[Math.floor(radii.length / 2)]!;
    const disc = 10;
    const onAxis = band.filter(([x, z]) => Math.hypot(x, z) < disc).length;
    let atRim = 0;
    for (let k = 0; k < 8; k++) {
      const [cx, cz] = [rim * Math.cos((k * Math.PI) / 4), rim * Math.sin((k * Math.PI) / 4)];
      atRim += band.filter(([x, z]) => Math.hypot(x - cx, z - cz) < disc).length / 8;
    }
    expect(onAxis).toBeLessThan(atRim);
  });

  it('mushroom programme: the cap is more than twice as wide as the stem', () => {
    // Phases of the mushroom: 0 flat colony, 1 cup, 2 closing, 3 neck, 4 stem, 5 cap.
    const g = grow(wild);
    expect(speciesFParams(wild).programme).toBe(4);
    expect(phaseRadius(g, 5)).toBeGreaterThan(2 * phaseRadius(g, 4));
  });
});

describe('caps and soundness', () => {
  it('the wild type is sound, its drivers are finite, and height is the fourth', () => {
    const g = grow(wild);
    assertSound(g, 'wild type');
    for (let v = 0; v < g.stats.nodes; v++) expect(g.drivers[v * 4 + 3]).toBe(g.positions[v * 3 + 1]);
  });

  it('the tip, segment and vertex caps hold, counting the vertices the renderer draws', () => {
    const cases: Partial<SpeciesFParams>[] = [
      { programme: 0, branchingThreshold: 0.5, branchingProbability: 1, selfAvoidance: 0 },
      { programme: 4, branchingThreshold: 0.5, branchingProbability: 1, stemLength: 300 },
      { programme: 3, branchingThreshold: 0.005, branchingProbability: 0.01, persistence: 0 },
    ];
    for (const over of cases) {
      const g = growParams(base(over));
      assertSound(g, JSON.stringify(over));
      expect(g.stats.tips).toBeLessThanOrEqual(TIP_CAP);
      expect(g.stats.segments).toBeLessThanOrEqual(SEGMENT_CAP);
      const mesh = buildBranchMesh(g);
      expect(mesh.getAttribute('position').count).toBeLessThanOrEqual(VERTEX_CAP);
    }
  }, 120_000);
});
