import { describe, expect, it } from 'vitest';
import { ALL_SPECIES, geneTable } from '../../src/genome';
import { ENCODING_NOTES, geneRows, GROUNDING, SPECIES_A, SPECIES_B, SPECIES_C, SPECIES_D, SPECIES_E, SPECIES_F } from '../../src/ui/methods-content';

// Milestone 13: the Methods page states which parts are published models and which are designed
// (spec section 12), lists every gene with its range and scale, and the additions to the procedures.

describe('Methods page content', () => {
  it('says which parts are published models and which are designed', () => {
    const statuses = GROUNDING.map((g) => g.status);
    expect(statuses).toContain('Published model');
    expect(statuses).toContain('Designed abstraction');
    expect(statuses).toContain('Designed extension');
    for (const part of ['Branching growth', 'Branch thickness', 'Ruffling', 'Organ arrangement', 'Receptacles and organ shapes', 'Shell coiling', 'Shell ribs and cords', 'Shell edge pattern', 'Helix', 'Genome to parameter mapping']) {
      expect(GROUNDING.some((g) => g.part.startsWith(part))).toBe(true);
    }
  });

  it('lists every gene of every species with its range, scale and status', () => {
    for (const species of ALL_SPECIES) {
      const rows = geneRows(species);
      expect(rows).toHaveLength(24);
      for (const def of geneTable(species)) {
        const row = rows[def.locus - 1]!;
        expect(row.name).toBe(def.name);
        expect(row.range.length).toBeGreaterThan(2);
        expect(row.scale).toBe({ linear: 'Linear', log: 'Logarithmic', int: 'Whole numbers', choice: 'Choice', seed: 'Seed' }[def.kind]);
        // A gene the spec marks designed is never presented as a published model.
        if (def.designed) expect(row.status.startsWith('Designed')).toBe(true);
        if (def.basis.startsWith('Paper') || def.basis.startsWith('Douady and Couder') || def.basis === 'Raup 1966') expect(row.status).toBe('Published model');
        if (def.basis.startsWith('Prusinkiewicz and Lindenmayer') || def.basis === 'Fowler et al. 1992') expect(row.status).toBe('Published method');
      }
    }
  });

  it('states the additions to the paper’s procedure (clarifications 4 and 15)', () => {
    const text = SPECIES_A.additions.map((a) => a.text).join(' ');
    expect(text).toContain('Clear stem (clarification 4)');
    expect(text).toContain('not a step of the paper');
    expect(text).toContain('Stopping (clarification 15)');
    expect(text).toContain('4,000 steps');
    expect(text).toContain('existing children');
    expect(SPECIES_A.additions.every((a) => a.status !== 'Published model')).toBe(true);
  });

  it('marks every species B decision as designed or numerical, and states the accuracy limits', () => {
    expect(SPECIES_B.additions.length).toBeGreaterThan(4);
    for (const a of SPECIES_B.additions) expect(['Designed', 'Designed extension', 'Numerical choice']).toContain(a.status);
    expect(SPECIES_B.limits.join(' ')).toContain('not a quantitative model');
  });

  it('explains that the genome is an addressing scheme and how to compare hashes', () => {
    const text = ENCODING_NOTES.join(' ');
    expect(text).toContain('addressing scheme, not a model of gene expression');
    expect(text).toContain('geometry hash');
  });

  it('states the species C model, its growth over time and its additions (clarifications 22 and 23)', () => {
    const text = [...SPECIES_C.procedure, ...SPECIES_C.equations].join(' ');
    expect(text).toContain('part II, eq. 6');
    expect(text).toContain('part III, eq. 1');
    expect(text).toContain('tanh((t − 6) / 3)');
    const additions = SPECIES_C.additions.map((a) => a.text).join(' ');
    expect(additions).toContain('Γi = 2.4');
    expect(additions).toContain('head 1, dome 2, cone 3, column 6');
    for (const a of SPECIES_C.additions) expect(['Designed', 'Designed extension', 'Numerical choice']).toContain(a.status);
    expect(SPECIES_C.limits.join(' ')).toContain('does not model the chemistry');
  });

  it('states the species D model, the pattern constants and its additions (clarification 24)', () => {
    const text = SPECIES_D.equations.join(' ');
    expect(text).toContain('W^(θ / 2π)');
    expect(text).toContain('ρ = 0.01 ± 2.5%');
    expect(text).toContain('Dₛ = 0.4');
    for (const a of SPECIES_D.additions) expect(['Designed', 'Designed extension', 'Numerical choice']).toContain(a.status);
    expect(SPECIES_D.additions.map((a) => a.text).join(' ')).toContain('4 forward Euler steps');
    expect(SPECIES_D.limits.join(' ')).toContain('not the biology of the mantle');
  });

  it('states which parts of species E and F are published and which are designed (spec section 12, v0.3)', () => {
    for (const part of ['Coral accretive growth', 'Coral nutrient field', 'Corallites', 'Hyphal growth and branching', 'Fruit body programmes']) {
      expect(GROUNDING.some((g) => g.part.startsWith(part))).toBe(true);
    }
    expect(GROUNDING.find((g) => g.part.startsWith('Corallites'))!.status).toBe('Designed extension');
    for (const section of [SPECIES_E, SPECIES_F]) {
      expect(section.additions.length).toBeGreaterThan(3);
      for (const a of section.additions) expect(['Designed', 'Designed extension', 'Numerical choice']).toContain(a.status);
    }
    // Every gene but the seed has a status of its own, not the fallback.
    for (const species of ['E', 'F'] as const) {
      for (const row of geneRows(species)) if (row.locus !== 24) expect(row.status, `${species} ${row.name}`).not.toBe('Encoding');
    }
  });

  it('states the species E model, its solver and its limits (clarifications 29, 31 and 32)', () => {
    const text = [...SPECIES_E.procedure, ...SPECIES_E.equations].join(' ');
    expect(text).toContain('s² / (D Δt)');
    expect(text).toContain('eq. 2.3');
    expect(text).toContain('Laplace');
    expect(SPECIES_E.additions.map((a) => a.text).join(' ')).toContain('multigrid');
    expect(SPECIES_E.limits.join(' ')).toContain('abiotic');
    expect(SPECIES_E.limits.join(' ')).toContain('figure 1c');
  });

  it('states the species F model, its calibration and programmes (clarifications 34 and 35)', () => {
    const text = [...SPECIES_F.procedure, ...SPECIES_F.equations].join(' ');
    expect(text).toContain('eq. 3');
    expect(text).toContain('eq. 5');
    expect(text).toContain('eq. 13');
    expect(text).toContain('Mushroom');
    expect(SPECIES_F.additions.map((a) => a.text).join(' ')).toContain('clarification 35');
    expect(SPECIES_F.limits.join(' ')).toContain('Gills and spores are not modelled');
  });

  it('cites every species\' references', () => {
    expect(SPECIES_E.references.join(' ')).toContain('Merks, Hoekstra, Kaandorp and Sloot (2003)');
    expect(SPECIES_E.references.join(' ')).toContain('Kaandorp and Sloot (2001)');
    expect(SPECIES_F.references.join(' ')).toContain('Meškauskas, McNulty and Moore (2004)');
    expect(SPECIES_C.references.join(' ')).toContain('Douady and Couder (1996)');
    expect(SPECIES_C.references.join(' ')).toContain('Prusinkiewicz and Lindenmayer (1990)');
    expect(SPECIES_D.references.join(' ')).toContain('Raup (1966)');
    expect(SPECIES_D.references.join(' ')).toContain('Fowler, Meinhardt and Prusinkiewicz (1992)');
    expect(SPECIES_D.references.join(' ')).toContain('Meinhardt and Klingler (1987)');
  });
});
