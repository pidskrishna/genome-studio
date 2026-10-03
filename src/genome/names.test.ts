import { describe, expect, it } from 'vitest';
import { valueToBases } from './bases';
import { readGene, writeGene } from './genome';
import { specimenName } from './names';
import { mulberry32, randomGenome } from './test-helpers';
import { wildType } from './wildtype';

describe('specimen names', () => {
  const wild = wildType('A');

  it('same leading bases give the same name', () => {
    const rand = mulberry32(8);
    for (let n = 0; n < 200; n++) {
      const a = randomGenome('A', rand);
      let b = randomGenome('A', rand);
      // Give b the leading bases of a's first three genes; everything else stays different.
      for (const locus of [1, 2, 3]) {
        const start = 6 + (locus - 1) * 6;
        const low = readGene(b, locus) % 256;
        b = writeGene(b, locus, leadValue(a.slice(start, start + 2)) * 256 + low);
      }
      expect(specimenName(b).full).toBe(specimenName(a).full);
    }
  });

  it('a fine change keeps the name', () => {
    for (const locus of [1, 2, 3]) {
      const start = 6 + (locus - 1) * 6;
      const lead = wild.slice(start, start + 2);
      for (const fine of [0, 1, 77, 128, 255]) {
        const code = writeGene(wild, locus, leadValue(lead) * 256 + fine);
        expect(specimenName(code).full).toBe(specimenName(wild).full);
      }
    }
    // Genes other than the first three never change the name.
    for (let locus = 4; locus <= 24; locus++) {
      expect(specimenName(writeGene(wild, locus, 0)).full).toBe(specimenName(wild).full);
    }
  });

  it('a coarse change to gene 1, 2 or 3 changes the name', () => {
    for (const locus of [1, 2, 3]) {
      const start = 6 + (locus - 1) * 6;
      const lead = leadValue(wild.slice(start, start + 2));
      for (let other = 0; other < 16; other++) {
        if (other === lead) continue;
        const code = writeGene(wild, locus, other * 256 + 100);
        expect(specimenName(code).full).not.toBe(specimenName(wild).full);
      }
    }
  });

  it('gives 4,096 different epithets per genus, all pronounceable', () => {
    const seen = new Set<string>();
    for (let n = 0; n < 4096; n++) {
      let code = wild;
      code = writeGene(code, 1, (n >> 8) * 256);
      code = writeGene(code, 2, ((n >> 4) & 15) * 256);
      code = writeGene(code, 3, (n & 15) * 256);
      const { epithet } = specimenName(code);
      expect(epithet).toMatch(/^[a-z]+$/);
      expect(epithet).not.toMatch(/[^aeiou]{3}/);
      seen.add(epithet);
    }
    expect(seen.size).toBe(4096);
  });

  it('shares one genus across a species, and each of the 64 species fields has its own', () => {
    const rand = mulberry32(3);
    const genusA = specimenName(wild).genus;
    for (let n = 0; n < 50; n++) expect(specimenName(randomGenome('A', rand)).genus).toBe(genusA);
    const genera = new Set<string>();
    for (let s = 0; s < 64; s++) genera.add(specimenName(valueToBases(s, 3) + wild.slice(3)).genus);
    expect(genera.size).toBe(64);
    expect(specimenName(wildType('B')).genus).not.toBe(genusA);
  });

  it('is fixed: the wild types keep their genus', () => {
    expect(specimenName(wildType('A')).genus).toBe('Ramula');
    expect(specimenName(wildType('B')).genus).toBe('Plicula');
  });
});

function leadValue(bases: string): number {
  return [...bases].reduce((v, c) => v * 4 + 'ACGT'.indexOf(c), 0);
}
