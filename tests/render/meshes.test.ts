import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { branchChains, buildBranchMesh, TUBE_SIDES } from '../../src/render/branch-mesh';
import { boundaryEdges, buildSheetMesh } from '../../src/render/sheet-mesh';
import { BODY_PLANS } from '../../src/sim/speciesB/params';
import { wildA, wildB } from './fixtures';

function arrays(g: BufferGeometry) {
  return {
    pos: g.getAttribute('position').array as Float32Array,
    nor: g.getAttribute('normal').array as Float32Array,
    idx: g.getIndex()!.array as Uint16Array | Uint32Array,
  };
}

function expectFiniteUnitNormals(g: BufferGeometry): void {
  const { pos, nor, idx } = arrays(g);
  const n = pos.length / 3;
  for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i])).toBe(true);
  let worst = 0;
  for (let v = 0; v < n; v++) {
    const l = Math.hypot(nor[v * 3]!, nor[v * 3 + 1]!, nor[v * 3 + 2]!);
    worst = Math.max(worst, Math.abs(l - 1));
  }
  expect(worst).toBeLessThan(1e-5);
  for (let i = 0; i < idx.length; i++) expect(idx[i]!).toBeLessThan(n);
}

/**
 * Every undirected edge is used by exactly two triangles, once in each direction: a closed,
 * consistently wound solid. Rims and caps carry their own normals, so they repeat skin vertices;
 * vertices at exactly the same position are welded first.
 */
function expectClosedAndConsistent(g: BufferGeometry): void {
  const { pos, idx } = arrays(g);
  const n = pos.length / 3;
  const ids = new Map<string, number>();
  const weld = new Int32Array(n);
  for (let v = 0; v < n; v++) {
    const key = `${pos[v * 3]},${pos[v * 3 + 1]},${pos[v * 3 + 2]}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    weld[v] = ids.get(key)!;
  }
  const directed = new Map<number, number>();
  for (let t = 0; t < idx.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = weld[idx[t + k]!]!;
      const b = weld[idx[t + ((k + 1) % 3)]!]!;
      directed.set(a * n + b, (directed.get(a * n + b) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const [key, count] of directed) {
    const a = Math.floor(key / n);
    const b = key % n;
    if (count !== 1 || directed.get(b * n + a) !== 1) bad++;
  }
  expect(bad).toBe(0);
}

/** Signed volume of a closed mesh; positive when its triangles face outward. */
function signedVolume(g: BufferGeometry): number {
  const { pos, idx } = arrays(g);
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t]! * 3, idx[t + 1]! * 3, idx[t + 2]! * 3];
    v +=
      pos[a]! * (pos[b + 1]! * pos[c + 2]! - pos[b + 2]! * pos[c + 1]!) -
      pos[a + 1]! * (pos[b]! * pos[c + 2]! - pos[b + 2]! * pos[c]!) +
      pos[a + 2]! * (pos[b]! * pos[c + 1]! - pos[b + 1]! * pos[c]!);
  }
  return v / 6;
}

describe('species A tubes', () => {
  it('splits the tree into chains that use every branch segment exactly once', () => {
    const g = wildA();
    const seen = new Set<number>();
    for (const chain of branchChains(g)) {
      for (let i = 1; i < chain.length; i++) {
        const child = chain[i]!;
        expect(g.parents[child]).toBe(chain[i - 1]);
        expect(seen.has(child)).toBe(false);
        seen.add(child);
      }
    }
    let segments = 0;
    for (let v = 0; v < g.parents.length; v++) if (g.parents[v]! >= 0) segments++;
    expect(seen.size).toBe(segments);
  });

  it('builds finite geometry with unit normals and valid indices', () => {
    expectFiniteUnitNormals(buildBranchMesh(wildA()));
  });

  it('winds every tube wall triangle to face outward', () => {
    const { pos, nor, idx } = arrays(buildBranchMesh(wildA()));
    let inward = 0;
    let total = 0;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t]! * 3, idx[t + 1]! * 3, idx[t + 2]! * 3];
      const ux = pos[b]! - pos[a]!, uy = pos[b + 1]! - pos[a + 1]!, uz = pos[b + 2]! - pos[a + 2]!;
      const vx = pos[c]! - pos[a]!, vy = pos[c + 1]! - pos[a + 1]!, vz = pos[c + 2]! - pos[a + 2]!;
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (Math.hypot(fx, fy, fz) < 1e-9) continue;
      const nx = nor[a]! + nor[b]! + nor[c]!, ny = nor[a + 1]! + nor[b + 1]! + nor[c + 1]!, nz = nor[a + 2]! + nor[b + 2]! + nor[c + 2]!;
      total++;
      if (fx * nx + fy * ny + fz * nz < 0) inward++;
    }
    // Sharp bends can fold a few wall triangles on the inside of the bend; there must be almost none.
    expect(total).toBeGreaterThan(1000);
    expect(inward / total).toBeLessThan(0.001);
  });

  it('encloses every node with its radius, and nothing further out', () => {
    const g = wildA();
    const mesh = buildBranchMesh(g);
    const box = mesh.boundingBox!;
    let maxR = 0;
    for (let v = 0; v < g.parents.length; v++) {
      maxR = Math.max(maxR, g.radii[v]!);
      for (let k = 0; k < 3; k++) {
        const p = g.positions[v * 3 + k]!;
        expect(p).toBeGreaterThanOrEqual(box.min.getComponent(k) - 1e-3);
        expect(p).toBeLessThanOrEqual(box.max.getComponent(k) + 1e-3);
      }
    }
    for (let k = 0; k < 3; k++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let v = 0; v < g.parents.length; v++) {
        lo = Math.min(lo, g.positions[v * 3 + k]!);
        hi = Math.max(hi, g.positions[v * 3 + k]!);
      }
      expect(box.min.getComponent(k)).toBeGreaterThanOrEqual(lo - maxR - 1e-3);
      expect(box.max.getComponent(k)).toBeLessThanOrEqual(hi + maxR + 1e-3);
    }
  });

  it('draws a single straight segment as a closed tube of the right radius', () => {
    const mesh = buildBranchMesh({ positions: new Float64Array([0, 0, 0, 0, 1, 0]), parents: new Int32Array([-1, 0]), radii: new Float64Array([0.2, 0.2]) });
    expectClosedAndConsistent(mesh);
    // An octagonal prism of circumradius 0.2 and length 1.
    const area = (TUBE_SIDES / 2) * 0.2 * 0.2 * Math.sin((2 * Math.PI) / TUBE_SIDES);
    expect(signedVolume(mesh)).toBeCloseTo(area, 5);
  });
});

describe('species B sheet with thickness', () => {
  it('a single triangle becomes a closed, outward-facing prism of the drawn thickness', () => {
    const positions = new Float64Array([0, 0, 0, 1, 0, 0, 0, 0, -1]);
    const triangles = new Int32Array([0, 1, 2]); // normal +y
    const mesh = buildSheetMesh({ positions, triangles, drawnThickness: 0.1 });
    expectClosedAndConsistent(mesh);
    expect(signedVolume(mesh)).toBeCloseTo(0.5 * 0.1, 6);
  });

  it('a closed surface gets no rim', () => {
    // Tetrahedron with outward winding.
    const positions = new Float64Array([1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1]);
    const triangles = new Int32Array([0, 1, 3, 0, 2, 1, 0, 3, 2, 1, 2, 3]);
    expect(boundaryEdges(4, triangles)).toEqual([]);
    const mesh = buildSheetMesh({ positions, triangles, drawnThickness: 0.05 });
    expect(mesh.getAttribute('position').count).toBe(8);
    expectClosedAndConsistent(mesh);
  });

  for (const plan of BODY_PLANS) {
    it(`${plan}: a closed solid, wound outward, with the drawn thickness between its skins`, () => {
      const g = wildB(plan);
      const mesh = buildSheetMesh(g);
      expectFiniteUnitNormals(mesh);
      expectClosedAndConsistent(mesh);
      expect(signedVolume(mesh)).toBeGreaterThan(0);
      const pos = mesh.getAttribute('position').array as Float32Array;
      const n = g.positions.length / 3;
      for (let v = 0; v < n; v += 97) {
        const d = Math.hypot(pos[v * 3]! - pos[(n + v) * 3]!, pos[v * 3 + 1]! - pos[(n + v) * 3 + 1]!, pos[v * 3 + 2]! - pos[(n + v) * 3 + 2]!);
        expect(d).toBeCloseTo(g.drawnThickness, 5);
      }
      expect(boundaryEdges(n, g.triangles).length === 0).toBe(plan === 'sphere');
    });
  }
});
