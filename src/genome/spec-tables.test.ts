import { describe, expect, it } from 'vitest';
import specText from '../../SPEC.md?raw';
import { SPECIES_A_GENES, SPECIES_B_GENES, type GeneDef } from './genes';

interface Row {
  loci: number[];
  name: string;
  parameter: string;
  range: string;
  basis: string;
}

function sectionRows(heading: string): Row[] {
  const start = specText.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = specText.indexOf('\n## ', start + heading.length);
  const rows: Row[] = [];
  for (const line of specText.slice(start, end).split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const locus = /^(\d+)(?: to (\d+))?$/.exec(cells[1] ?? '');
    if (!locus) continue;
    const first = Number(locus[1]);
    const last = Number(locus[2] ?? locus[1]);
    const loci: number[] = [];
    for (let l = first; l <= last; l++) loci.push(l);
    rows.push({ loci, name: cells[2] ?? '', parameter: cells[3] ?? '', range: cells[4] ?? '', basis: cells[5] ?? '' });
  }
  return rows;
}

/** Reads a range cell such as "0.4% to 2%, log" or "−0.5 to +0.5". */
function parseRange(text: string): { min: number; max: number; log: boolean } | { choices: number } | 'seed' | 'shared' {
  if (text.startsWith('As species A')) return 'shared';
  if (text.includes('million')) return 'seed';
  const choices = /^(\d+) choices$/.exec(text);
  if (choices) return { choices: Number(choices[1]) };
  const [first, second] = (text.replace(/−/g, '-').replace(/,(?=\d)/g, '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(first).not.toBeUndefined();
  expect(second).not.toBeUndefined();
  const scale = text.includes('%') ? 100 : 1;
  return { min: (first as number) / scale, max: (second as number) / scale, log: /, log/.test(text) };
}

function checkAgainst(table: readonly GeneDef[], rows: Row[], aliasOf?: readonly GeneDef[]) {
  const byLocus = new Map<number, Row>();
  for (const row of rows) for (const l of row.loci) byLocus.set(l, row);
  expect([...byLocus.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  expect(table).toHaveLength(24);

  table.forEach((def, i) => {
    const locus = i + 1;
    const row = byLocus.get(locus) as Row;
    const label = `locus ${locus} (${def.name})`;
    expect(def.locus, label).toBe(locus);
    const range = parseRange(row.range);

    if (range === 'shared') {
      // Same eight genes as species A: name, kind and range must be identical.
      const a = (aliasOf as readonly GeneDef[])[i] as GeneDef;
      expect(def.name, label).toBe(a.name);
      expect(def.kind, label).toBe(a.kind);
      expect([def.min, def.max], label).toEqual([a.min, a.max]);
      expect(def.basis, label).toBe(row.basis);
      return;
    }
    expect(def.name, label).toBe(row.name);
    expect(def.parameter, label).toBe(row.parameter);
    expect(def.basis, label).toBe(row.basis);
    expect(def.designed, label).toBe(row.basis.startsWith('Designed'));

    if (range === 'seed') {
      expect(def.kind, label).toBe('seed');
      expect(def.max, label).toBe(2 ** 24 - 1);
    } else if ('choices' in range) {
      expect(def.kind, label).toBe('choice');
      expect(def.choices, label).toHaveLength(range.choices);
      expect([def.min, def.max], label).toEqual([0, range.choices - 1]);
    } else {
      expect([def.min, def.max], label).toEqual([range.min, range.max]);
      if (range.log) expect(def.kind, label).toBe('log');
      else expect(['linear', 'int'], label).toContain(def.kind);
    }
  });
}

describe('gene tables match SPEC.md locus by locus', () => {
  it('species A', () => {
    checkAgainst(SPECIES_A_GENES, sectionRows('## 3. Species A'));
  });

  it('species B', () => {
    checkAgainst(SPECIES_B_GENES, sectionRows('## 4. Species B'), SPECIES_A_GENES);
  });

  it('whole-number genes are exactly the ones whose range is a count', () => {
    expect(SPECIES_A_GENES.filter((g) => g.kind === 'int').map((g) => g.name)).toEqual(['Origins', 'Limb smoothing']);
    expect(SPECIES_B_GENES.filter((g) => g.kind === 'int').map((g) => g.name)).toEqual(['Relaxation']);
    expect(SPECIES_A_GENES.filter((g) => g.kind === 'choice').map((g) => g.name)).toEqual(['Gradient driver']);
    expect(SPECIES_B_GENES.filter((g) => g.kind === 'choice').map((g) => g.name)).toEqual(['Body plan', 'Gradient driver']);
  });

  it('gradient driver choices follow the spec wording', () => {
    expect(SPECIES_A_GENES[19]?.choices).toEqual(['Distance from base', 'Branch radius', 'Branch order', 'Height']);
    expect(SPECIES_B_GENES[19]?.choices).toEqual(['Distance from margin', 'Curvature', 'Order of growth', 'Height']);
    expect(SPECIES_B_GENES[0]?.choices).toEqual(['Disc', 'Ring', 'Tube', 'Closed sphere']);
  });

  it('pigment genes are loci 16 to 23, the seed is 24, the rest are form genes', () => {
    for (const table of [SPECIES_A_GENES, SPECIES_B_GENES]) {
      for (const def of table) {
        const expected = def.locus === 24 ? 'seed' : def.locus >= 16 ? 'pigment' : 'form';
        expect(def.group).toBe(expected);
      }
    }
  });

  it('no gene is named after a real biological gene', () => {
    // Names describe the model parameter; spot-check against common real gene symbols.
    const real = /\b(CYC|DIV|RAD|TCP|CIN|KNOX|WUS|CLV|AG|LFY|FLC)\b/;
    for (const def of [...SPECIES_A_GENES, ...SPECIES_B_GENES]) expect(def.name).not.toMatch(real);
  });
});
