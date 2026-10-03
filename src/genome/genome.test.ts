import { describe, expect, it } from 'vitest';
import { basesToValue, cleanCode, valueToBases } from './bases';
import { checksumOf } from './checksum';
import { binCount, decodeValue, encodeValue, rawMax } from './decode';
import { geneTable, type SpeciesId } from './genes';
import {
  CHECKSUM_START,
  GENOME_LENGTH,
  clearanceIsLimited,
  decodeGenome,
  geneBases,
  hasValidChecksum,
  makeGenome,
  parseGenome,
  readGene,
  valueById,
  writeBase,
  writeGene,
  writeModelValue,
} from './genome';
import { mulberry32, randomGenome } from './test-helpers';
import { wildType } from './wildtype';

const SPECIES: SpeciesId[] = ['A', 'B'];

describe('gene values and bases', () => {
  it('every value 0 to 4,095 survives value → bases → value', () => {
    for (let v = 0; v <= 4095; v++) {
      const bases = valueToBases(v, 6);
      expect(bases).toHaveLength(6);
      expect(basesToValue(bases)).toBe(v);
    }
  });

  it('moving a slider and typing its bases back gives the same slider value', () => {
    for (const species of SPECIES) {
      let code = wildType(species);
      for (const def of geneTable(species)) {
        if (def.kind === 'seed') continue;
        for (const v of [0, 1, 2047, 2048, 4094, 4095]) {
          code = writeGene(code, def.locus, v);
          expect(readGene(code, def.locus)).toBe(v);
          // Type the same bases in one at a time.
          let typed = wildType(species);
          [...geneBases(code, def.locus)].forEach((b, i) => {
            const position = 7 + (def.locus - 1) * 6 + i;
            typed = writeBase(typed, position, b);
          });
          expect(readGene(typed, def.locus)).toBe(v);
        }
      }
    }
  });

  it('the seed gene holds 24 bits', () => {
    const code = writeGene(wildType('A'), 24, 16_777_215);
    expect(readGene(code, 24)).toBe(16_777_215);
    expect(geneBases(code, 24)).toBe('TTTTTTTTTTTT');
  });

  it('header and checksum bases cannot be edited with writeBase', () => {
    const code = wildType('A');
    for (const position of [1, 3, 4, 6, 157, 160]) {
      expect(() => writeBase(code, position, 'G')).toThrow(RangeError);
    }
  });
});

describe('random codes decode inside their ranges', () => {
  for (const species of SPECIES) {
    it(`10,000 random species ${species} codes`, () => {
      const rand = mulberry32(species === 'A' ? 11 : 22);
      const table = geneTable(species);
      for (let n = 0; n < 10_000; n++) {
        const decoded = decodeGenome(randomGenome(species, rand));
        expect(decoded.values).toHaveLength(24);
        table.forEach((def, i) => {
          const v = decoded.values[i] as number;
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(def.min);
          expect(v).toBeLessThanOrEqual(def.max);
          if (def.kind === 'int' || def.kind === 'choice' || def.kind === 'seed') {
            expect(Number.isInteger(v)).toBe(true);
          }
        });
      }
    });
  }

  it('the extremes of every gene decode inside their ranges', () => {
    for (const species of SPECIES) {
      for (const def of geneTable(species)) {
        for (const raw of [0, rawMax(def)]) {
          const v = decodeValue(def, raw);
          expect(v).toBeGreaterThanOrEqual(def.min);
          expect(v).toBeLessThanOrEqual(def.max);
        }
      }
    }
  });

  it('log genes reach both ends of their range and rise with the slider', () => {
    for (const species of SPECIES) {
      for (const def of geneTable(species).filter((g) => g.kind === 'log')) {
        expect(decodeValue(def, 0)).toBe(def.min);
        expect(decodeValue(def, 4095)).toBe(def.max);
        let previous = -Infinity;
        for (let raw = 0; raw <= 4095; raw++) {
          const v = decodeValue(def, raw);
          expect(v).toBeGreaterThan(previous);
          previous = v;
        }
        // The geometric midpoint, within the accuracy of the power function.
        const mid = decodeValue(def, 2047.5);
        expect(Math.abs(mid / Math.sqrt(def.min * def.max) - 1)).toBeLessThan(2e-3);
      }
    }
  });
});

describe('checksum', () => {
  it('catches every single-base change in positions 1 to 156, in 100 random genomes', () => {
    const rand = mulberry32(2026);
    for (let n = 0; n < 100; n++) {
      const species = SPECIES[n % 2] as SpeciesId;
      const code = randomGenome(species, rand);
      expect(hasValidChecksum(code)).toBe(true);
      for (let i = 0; i < CHECKSUM_START; i++) {
        for (const base of 'ACGT') {
          if (base === code[i]) continue;
          const mutated = code.slice(0, i) + base + code.slice(i + 1);
          expect(checksumOf(mutated.slice(0, CHECKSUM_START))).not.toBe(code.slice(CHECKSUM_START));
          expect(hasValidChecksum(mutated)).toBe(false);
        }
      }
    }
  });

  it('a code with a wrong checksum loads, warns of a typo and comes back corrected', () => {
    const good = wildType('A');
    const bad = good.slice(0, CHECKSUM_START) + (good.endsWith('AAAA') ? 'CCCC' : 'AAAA');
    const result = parseGenome(bad);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toMatch(/typo/);
    expect(result.code).toBe(good);
    expect(hasValidChecksum(result.code)).toBe(true);
  });

  it('one mistyped letter loads with a typo warning', () => {
    const good = wildType('B');
    const i = 50;
    const mistyped = good.slice(0, i) + (good[i] === 'A' ? 'C' : 'A') + good.slice(i + 1);
    const result = parseGenome(mistyped);
    expect(result.ok && result.warning).toBeTruthy();
  });

  it('a good code has no warning', () => {
    const result = parseGenome(wildType('A'));
    expect(result).toEqual({ ok: true, code: wildType('A'), species: 'A' });
  });

  it('editing a gene or base keeps the checksum right', () => {
    let code = wildType('A');
    code = writeGene(code, 3, 1000);
    expect(hasValidChecksum(code)).toBe(true);
    code = writeBase(code, 100, code[99] === 'T' ? 'A' : 'T');
    expect(hasValidChecksum(code)).toBe(true);
  });
});

describe('input cleaning', () => {
  const code = wildType('A');

  it('accepts lower case, spaces and line breaks', () => {
    const messy = code.toLowerCase().replace(/(.{10})/g, '$1 ').replace(/(.{41})/g, '$1\n');
    expect(cleanCode(messy)).toEqual({ ok: true, code });
    expect(parseGenome(messy)).toEqual({ ok: true, code, species: 'A' });
    expect(parseGenome(`\r\n  ${code}\t\n`)).toEqual({ ok: true, code, species: 'A' });
  });

  it('rejects other letters with a message', () => {
    for (const bad of ['X', 'U', 'n', '1', '-']) {
      const dirty = bad + code.slice(1);
      const clean = cleanCode(dirty);
      expect(clean.ok).toBe(false);
      const parsed = parseGenome(dirty);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.message).toContain(bad.toUpperCase());
    }
  });

  it('rejects codes of the wrong length with a message', () => {
    const short = parseGenome(code.slice(1));
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.message).toMatch(/160/);
    expect(parseGenome(code + 'A').ok).toBe(false);
    expect(parseGenome('').ok).toBe(false);
  });
});

describe('header', () => {
  it('species AAA and AAC with version AAA decode', () => {
    for (const [species, field] of [['A', 'AAA'], ['B', 'AAC']] as const) {
      const code = makeGenome(species, geneTable(species).map(() => 0));
      expect(code.slice(0, 6)).toBe(`${field}AAA`);
      const result = parseGenome(code);
      expect(result).toEqual({ ok: true, code, species });
      expect(decodeGenome(code).species).toBe(species);
    }
  });

  it('any other species or version is rejected with a message', () => {
    const base = wildType('A');
    const fields = ['AAG', 'AAT', 'ACA', 'TTT'];
    for (const field of fields) {
      const result = parseGenome(field + base.slice(3));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain(field);
    }
    for (const version of ['AAC', 'AAT', 'CAA', 'TTT']) {
      const result = parseGenome(base.slice(0, 3) + version + base.slice(6));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain(version);
    }
    expect(() => decodeGenome('TTT' + base.slice(3))).toThrow();
  });
});

describe('kill distance clamp', () => {
  it('never exceeds 0.8 × sensing range, over 10,000 random codes', () => {
    const rand = mulberry32(5);
    for (let n = 0; n < 10_000; n++) {
      const d = decodeGenome(randomGenome('A', rand));
      expect(valueById(d, 'clearance')).toBeLessThanOrEqual(0.8 * valueById(d, 'sensingRange'));
      expect(valueById(d, 'clearance')).toBeGreaterThanOrEqual(1);
    }
  });

  it('is limited at the largest clearance and the smallest sensing range', () => {
    let code = writeGene(wildType('A'), 5, 4095);
    code = writeGene(code, 4, 0);
    const d = decodeGenome(code);
    expect(valueById(d, 'sensingRange')).toBe(4);
    expect(valueById(d, 'clearance')).toBeCloseTo(3.2, 12);
    expect(clearanceIsLimited(d)).toBe(true);
  });

  it('is not limited when the sensing range is generous', () => {
    let code = writeGene(wildType('A'), 5, 0);
    code = writeGene(code, 4, 4095);
    const d = decodeGenome(code);
    expect(valueById(d, 'clearance')).toBe(1);
    expect(clearanceIsLimited(d)).toBe(false);
  });
});

describe('whole-number and multiple-choice genes', () => {
  it('a model value written through the number field lands on its bin centre and reads back the same', () => {
    for (const species of SPECIES) {
      for (const def of geneTable(species).filter((g) => g.kind === 'int' || g.kind === 'choice')) {
        for (let model = def.min; model <= def.max; model++) {
          const code = writeModelValue(wildType(species), def.locus, model);
          const raw = readGene(code, def.locus);
          expect(decodeValue(def, raw)).toBe(model);
          expect(decodeGenome(code).values[def.locus - 1]).toBe(model);
          // Bin centre: equally far, within a step, from both bin edges.
          const n = binCount(def);
          const k = model - def.min;
          expect(raw).toBe(Math.floor(((2 * k + 1) * 4096) / (2 * n)));
          expect(Math.abs((raw + 0.5) / 4096 - (k + 0.5) / n)).toBeLessThanOrEqual(1 / 4096);
        }
      }
    }
  });

  it('the bins are equal in width and cover every slider value', () => {
    for (const species of SPECIES) {
      for (const def of geneTable(species).filter((g) => g.kind === 'int' || g.kind === 'choice')) {
        const counts = new Array<number>(binCount(def)).fill(0);
        for (let raw = 0; raw <= 4095; raw++) {
          const k = decodeValue(def, raw) - def.min;
          counts[k] = (counts[k] ?? 0) + 1;
        }
        expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
        expect(Math.min(...counts)).toBeGreaterThan(0);
      }
    }
  });

  it('out-of-range model values are clamped to the nearest setting', () => {
    const def = geneTable('A')[9]!;
    expect(decodeValue(def, encodeValue(def, 99))).toBe(6);
    expect(decodeValue(def, encodeValue(def, -5))).toBe(1);
  });
});

describe('wild types', () => {
  it('decode without a warning and have the right length', () => {
    for (const species of SPECIES) {
      const code = wildType(species);
      expect(code).toHaveLength(GENOME_LENGTH);
      const parsed = parseGenome(code);
      expect(parsed).toEqual({ ok: true, code, species });
      expect(decodeGenome(code).checksumOk).toBe(true);
    }
  });

  it('sit at the model values they were written from', () => {
    const d = decodeGenome(wildType('A'));
    expect(valueById(d, 'origins')).toBe(1);
    expect(valueById(d, 'limbSmoothing')).toBe(2);
    expect(valueById(d, 'surfaceSeeking')).toBeCloseTo(0, 3);
    expect(valueById(d, 'spaceDensity') / 8000).toBeGreaterThan(0.99);
    expect(valueById(d, 'spaceDensity') / 8000).toBeLessThan(1.01);
    const b = decodeGenome(wildType('B'));
    expect(valueById(b, 'bodyPlan')).toBe(0);
    expect(valueById(b, 'patchContrast')).toBeCloseTo(0, 3);
    expect(valueById(b, 'lift')).toBeCloseTo(0, 3);
    expect(valueById(b, 'anisotropy')).toBeCloseTo(0, 3);
  });
});
