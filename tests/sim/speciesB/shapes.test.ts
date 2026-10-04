import { describe, expect, it } from 'vitest';
import { wildType } from '../../../src/genome';
import { Rng } from '../../../src/sim/rng';
import { RING_INNER_RADIUS, TUBE_LENGTH } from '../../../src/sim/speciesB/constants';
import { GrowingMesh } from '../../../src/sim/speciesB/mesh';
import { patchNoise } from '../../../src/sim/speciesB/noise';
import { BODY_PLANS, type BodyPlan } from '../../../src/sim/speciesB/params';
import { patchMargins, startArea, startShape } from '../../../src/sim/speciesB/shapes';
import { grow, PLAN_TOPOLOGY, topology, withGenes } from './helpers';

function start(plan: BodyPlan, edge = 0.06, roughness = 0): GrowingMesh {
  const mesh = new GrowingMesh(40_000);
  startShape(plan, mesh, edge, roughness, new Rng(1));
  return mesh;
}

function trianglesOf(mesh: GrowingMesh): Int32Array {
  return mesh.tri.slice(0, 3 * mesh.triangleCount);
}

describe('each body plan grows from the right starting shape (clarification 7)', () => {
  it('disc: radius 1 in the plane, one rim, margin distance 1 − r', () => {
    const m = start('disc');
    expect(topology(trianglesOf(m), m.vertexCount)).toMatchObject({ ...PLAN_TOPOLOGY.disc, nonManifoldEdges: 0, misoriented: 0 });
    for (let i = 0; i < m.vertexCount; i++) {
      const r = Math.hypot(m.x[i]!, m.z[i]!);
      expect(m.y[i]).toBe(0);
      expect(r).toBeLessThanOrEqual(1 + 1e-12);
      expect(m.margin[i]).toBeCloseTo(1 - r, 12);
    }
  });

  it('ring: the annulus between the inner radius and 1; both edges are margins', () => {
    const m = start('ring');
    expect(topology(trianglesOf(m), m.vertexCount)).toMatchObject({ ...PLAN_TOPOLOGY.ring, nonManifoldEdges: 0, misoriented: 0 });
    let inner = 0;
    let outer = 0;
    for (let i = 0; i < m.vertexCount; i++) {
      const r = Math.hypot(m.x[i]!, m.z[i]!);
      expect(r).toBeGreaterThanOrEqual(RING_INNER_RADIUS - 1e-12);
      expect(r).toBeLessThanOrEqual(1 + 1e-12);
      expect(m.margin[i]).toBeCloseTo(Math.min(r - RING_INNER_RADIUS, 1 - r), 12);
      if (Math.abs(r - RING_INNER_RADIUS) < 1e-9) inner++;
      if (Math.abs(r - 1) < 1e-9) outer++;
    }
    expect(inner).toBeGreaterThan(20);
    expect(outer).toBeGreaterThan(inner);
  });

  it('tube: an open cylinder of radius 1 about the vertical axis; both open ends are margins', () => {
    const m = start('tube');
    expect(topology(trianglesOf(m), m.vertexCount)).toMatchObject({ ...PLAN_TOPOLOGY.tube, nonManifoldEdges: 0, misoriented: 0 });
    for (let i = 0; i < m.vertexCount; i++) {
      expect(Math.hypot(m.x[i]!, m.z[i]!)).toBeCloseTo(1, 12);
      expect(Math.abs(m.y[i]!)).toBeLessThanOrEqual(TUBE_LENGTH / 2 + 1e-12);
      expect(m.margin[i]).toBeCloseTo(TUBE_LENGTH / 2 - Math.abs(m.y[i]!), 12);
    }
  });

  it('closed sphere: radius 1 with no boundary; its growth patches are its margin', () => {
    const m = start('sphere');
    expect(topology(trianglesOf(m), m.vertexCount)).toMatchObject({ ...PLAN_TOPOLOGY.sphere, boundaryEdges: 0, nonManifoldEdges: 0, misoriented: 0 });
    for (let i = 0; i < m.vertexCount; i++) expect(Math.hypot(m.x[i]!, m.y[i]!, m.z[i]!)).toBeCloseTo(1, 12);
    // Patches from the noise field: positive patch value is margin (distance 0), the rest get a
    // positive distance along the sphere.
    for (let i = 0; i < m.vertexCount; i++) m.patch[i] = patchNoise(m.mx[i]!, m.my[i]!, m.mz[i]!, 0.4, 7);
    patchMargins(m);
    let onMargin = 0;
    for (let i = 0; i < m.vertexCount; i++) {
      if (m.patch[i]! > 0) expect(m.margin[i]).toBe(0);
      else expect(m.margin[i]).toBeGreaterThan(0);
      expect(Number.isFinite(m.margin[i])).toBe(true);
      expect(m.margin[i]).toBeLessThan(Math.PI);
      if (m.margin[i] === 0) onMargin++;
    }
    expect(onMargin).toBeGreaterThan(0);
    expect(onMargin).toBeLessThan(m.vertexCount);
  });

  it('a sphere whose patch field is nowhere positive still gets a margin at its highest point', () => {
    const m = start('sphere', 0.2);
    for (let i = 0; i < m.vertexCount; i++) m.patch[i] = -1 - m.y[i]!;
    patchMargins(m);
    const zeros = [...m.margin.subarray(0, m.vertexCount)].filter((d) => d === 0);
    expect(zeros).toHaveLength(1);
  });

  it('starting areas match the meshes, and the rough start moves vertices only along the normal', () => {
    for (const plan of BODY_PLANS) {
      const m = start(plan, 0.03);
      expect(m.totalRestArea() / startArea(plan)).toBeGreaterThan(0.98);
      expect(m.totalRestArea() / startArea(plan)).toBeLessThanOrEqual(1);
      const rough = start(plan, 0.03, 0.05);
      for (let i = 0; i < rough.vertexCount; i++) {
        const along = plan === 'tube' ? Math.hypot(rough.x[i]!, rough.z[i]!) - 1 : plan === 'sphere' ? Math.hypot(rough.x[i]!, rough.y[i]!, rough.z[i]!) - 1 : rough.y[i]!;
        expect(Math.abs(along)).toBeLessThanOrEqual(0.05 + 1e-12);
      }
    }
  });
});

describe('every body plan grows soundly and keeps its topology', () => {
  for (const [index, plan] of BODY_PLANS.entries()) {
    it(`${plan}: same code, same hash; topology kept${plan === 'sphere' ? '; the sphere stays closed' : ''}`, () => {
      const code = withGenes(wildType('B'), { 1: index });
      const a = grow(code);
      const b = grow(code);
      expect(a.hash).toBe(b.hash);
      expect(a.stats.stopReason).toBe('area-multiple');
      const top = topology(a.triangles, a.positions.length / 3);
      expect(top).toMatchObject({ ...PLAN_TOPOLOGY[plan], nonManifoldEdges: 0, misoriented: 0 });
      if (plan === 'sphere') expect(top.boundaryEdges).toBe(0);
    });
  }
});
