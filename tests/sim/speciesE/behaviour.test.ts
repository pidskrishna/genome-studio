import { describe, expect, it } from 'vitest';
import { wildType } from '../../../src/genome';
import { speciesE } from '../../../src/sim/speciesE';
import { LATTICE, VERTEX_CAP } from '../../../src/sim/speciesE/constants';
import { NutrientField, voxelise } from '../../../src/sim/speciesE/field';
import { speciesEParams, type SpeciesEParams } from '../../../src/sim/speciesE/params';
import { startingMesh } from '../../../src/sim/speciesE/start';
import { assertSound, grow, growParams, runToEnd, withGenes } from './helpers';
import { branchTips, compactness, enclosedVolume } from './measure';

// Recorded from the wild type. If a constant of the encoding version or the wild type changes, this
// is re-recorded (spec clarification 2).
const WILD_TYPE_HASH = '7898a90fc62cd3bb';

const wild = wildType('E');

/** The wild type without corallites, for measuring the colony's form. */
function bare(over: Partial<SpeciesEParams> = {}): SpeciesEParams {
  return { ...speciesEParams(wild), coralliteDepth: 0, coralliteRim: 0, ...over };
}

describe('determinism', () => {
  it('the same code grown twice gives the same geometry hash', () => {
    const a = grow(wild);
    const b = grow(wild);
    expect(a.hash).toBe(b.hash);
    expect(a.positions).toEqual(b.positions);
  });

  it('the wild type has its recorded hash, through the worker job too', () => {
    const done = runToEnd(speciesE({ code: wild }));
    expect(done.output.hash).toBe(WILD_TYPE_HASH);
    expect(done.transfer).toHaveLength(3);
  });

  it('a different seed gives a different organism', () => {
    expect(grow(withGenes(wild, { 24: 99 })).hash).not.toBe(grow(wild).hash);
  });
});

describe('the nutrient field', () => {
  it('fills a closed mesh into the lattice with the volume it encloses', () => {
    const p = bare({ startingForm: 0, startingSize: 12, polypSpacing: 1.5 });
    const mesh = startingMesh(p, LATTICE);
    const solid = new Uint8Array(LATTICE ** 3);
    voxelise(LATTICE, mesh.positions, mesh.triangles, mesh.triangleCount, solid);
    let count = 0;
    for (const s of solid) count += s;
    const volume = enclosedVolume(mesh.positions, mesh.triangles);
    expect(Math.abs(count - volume) / volume).toBeLessThan(0.05);
  });

  it('with growth very slow against transport, the field reaches the steady (Laplace) state', () => {
    const p = bare({ startingSize: 12 });
    const mesh = startingMesh(p, LATTICE);
    const solid = new Uint8Array(LATTICE ** 3);
    voxelise(LATTICE, mesh.positions, mesh.triangles, mesh.triangleCount, solid);
    // Ten growth steps at the gene's smallest growth to transport, as the colony would see them.
    const field = new NutrientField(LATTICE);
    field.setSolid(solid);
    const s = p.layerThickness;
    for (let k = 0; k < 10; k++) field.step((s * s) / 0.001);
    const reference = new NutrientField(LATTICE);
    reference.setSolid(solid);
    reference.settle(200);
    let worst = 0;
    for (let i = 0; i < field.values.length; i++) worst = Math.max(worst, Math.abs(field.values[i]! - reference.values[i]!));
    expect(worst).toBeLessThan(2e-3);
    // The reference itself satisfies Laplace's equation at free nodes.
    const n = LATTICE;
    const u = reference.values;
    let residual = 0;
    for (let y = 1; y < n - 1; y++) {
      for (let z = 0; z < n; z++) {
        for (let x = 0; x < n; x++) {
          const i = (y * n + z) * n + x;
          if (solid[i] === 1) continue;
          const sum = u[(y * n + z) * n + ((x + 1) % n)]! + u[(y * n + z) * n + ((x + n - 1) % n)]! + u[(y * n + ((z + 1) % n)) * n + x]! + u[(y * n + ((z + n - 1) % n)) * n + x]! + u[i + n * n]! + u[i - n * n]!;
          residual = Math.max(residual, Math.abs(sum - 6 * u[i]!));
        }
      }
    }
    expect(residual).toBeLessThan(1e-6);
  });
});

describe('form (Merks et al. 2003; Kaandorp et al. 2005)', () => {
  it('with the curvature rule off, the wild type branches: more than one branch tip', () => {
    const g = growParams(bare());
    expect(speciesEParams(wild).curvatureRule).toBe(0);
    expect(branchTips(g.positions, 6).length).toBeGreaterThan(1);
  });

  it('compactness rises as growth to transport rises', () => {
    // Below about 0.01 the field is already near steady and compactness no longer changes (NOTES.md).
    const values = [0.01, 0.1, 1, 5].map((growthToTransport) => {
      const g = growParams(bare({ growthToTransport }));
      return compactness(g.positions, g.triangles);
    });
    for (let k = 1; k < values.length; k++) expect(values[k]!).toBeGreaterThan(values[k - 1]!);
    expect(values[3]! - values[0]!).toBeGreaterThan(0.2);
  }, 120_000);

  it('a coarser polyp spacing gives a more compact colony, with thicker branches', () => {
    const at = (polypSpacing: number) => {
      const g = growParams(bare({ polypSpacing, growthToTransport: 0.003 }));
      return compactness(g.positions, g.triangles);
    };
    expect(at(4)).toBeGreaterThan(at(1.9) + 0.02);
  }, 120_000);
});

describe('caps and soundness', () => {
  it('the wild type is sound, inside the vertex cap, and its drivers are finite with height as the fourth', () => {
    const g = grow(wild);
    assertSound(g, 'wild type');
    expect(g.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
    for (let v = 0; v < g.stats.vertices; v++) expect(g.drivers[v * 4 + 3]).toBe(g.positions[v * 3 + 1]);
    expect(g.stats.levels).toBe(2);
  });

  it('extremes stay sound and inside the caps', () => {
    const cases: Partial<SpeciesEParams>[] = [
      { polypSpacing: 1, startingSize: 16, startingForm: 2, coralliteDepth: 0.5, coralliteRim: 0.5, septa: 24 },
      { polypSpacing: 4, startingSize: 4, layerThickness: 0.25, growthToTransport: 5 },
      { startingForm: 3, startingSize: 16, curvatureRule: 1, growthThreshold: 0.3, uptakeResponse: 2 },
      { startingForm: 1, startingSize: 16, smoothing: 1, irregularity: 0.3, uptakeResponse: 0.5, layerThickness: 1.25 },
    ];
    for (const over of cases) {
      const g = growParams({ ...speciesEParams(wild), ...over });
      assertSound(g, JSON.stringify(over));
      expect(g.stats.vertices).toBeLessThanOrEqual(VERTEX_CAP);
    }
  }, 300_000);
});
