import { describe, expect, it } from 'vitest';
import { ALL_SPECIES, decodeGenome, geneTable, wildType } from '../../src/genome';
import { fieldUnit, formatValue, referenceOf, SPECIES_NAMES } from '../../src/ui/gene-info';

// What the inspector says about every gene of every species (milestone 17).

describe('inspector text for every species', () => {
  it('every gene has a written reference, not just its basis', () => {
    for (const species of ALL_SPECIES) {
      for (const def of geneTable(species)) {
        const ref = referenceOf(def);
        expect(ref, `${species} ${def.name}`).not.toBe(def.basis);
        expect(ref.endsWith('.'), `${species} ${def.name}`).toBe(true);
      }
    }
  });

  it('every gene of the wild types reads as a value with a sensible unit', () => {
    for (const species of ALL_SPECIES) {
      const decoded = decodeGenome(wildType(species));
      for (const def of geneTable(species)) {
        const text = formatValue(def, decoded.values[def.locus - 1]!);
        expect(text, `${species} ${def.name}`).not.toMatch(/NaN|undefined/);
        // Percent units are shown as percentages, never as a raw fraction with a unit name.
        const { scale, unit } = fieldUnit(def);
        if (scale === 100) expect(unit.startsWith('%'), `${species} ${def.name}`).toBe(true);
      }
    }
  });

  it('names all six species', () => {
    expect(SPECIES_NAMES).toEqual({ A: 'Branching and venation', B: 'Differential growth', C: 'Phyllotaxis', D: 'Seashell', E: 'Coral', F: 'Fungal fruit body' });
  });

  it('whole numbers take a singular unit at one', () => {
    const starting = geneTable('C').find((g) => g.id === 'startingOrgans')!;
    expect(formatValue(starting, 1)).toBe('1 organ');
    expect(formatValue(starting, 3)).toBe('3 organs');
    const cords = geneTable('D').find((g) => g.id === 'cordCount')!;
    expect(formatValue(cords, 1)).toBe('1 cord');
  });
});
