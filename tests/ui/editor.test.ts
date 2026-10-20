import { describe, expect, it } from 'vitest';
import {
  CHECKSUM_START,
  GENE_COUNT,
  decodeGenome,
  encodeValue,
  geneAt,
  geneBases,
  geneSpan,
  geneTable,
  hasValidChecksum,
  rawMax,
  readGene,
  valueToBases,
  wildType,
  type SpeciesId,
} from '../../src/genome';
import { mulberry32, randomGenome } from '../../src/genome/test-helpers';
import { Editor, type EditorChange } from '../../src/ui/editor';

// The editor state on its own, with no DOM: slider and bases in sync, randomise and locks, undo and
// redo, the protected header and checksum, and the species switch.

const SPECIES: readonly SpeciesId[] = ['A', 'B', 'C', 'D'];

function editorWith(code: string, seed = 1): Editor {
  return new Editor({ code, random: mulberry32(seed) });
}

function geneValues(code: string): number[] {
  return Array.from({ length: GENE_COUNT }, (_, i) => readGene(code, i + 1));
}

describe('slider and bases stay in sync', () => {
  it('moving a slider rewrites exactly that gene’s bases and the checksum', () => {
    const rand = mulberry32(7);
    for (const species of SPECIES) {
      for (let n = 0; n < 200; n++) {
        const editor = editorWith(randomGenome(species, rand));
        const before = editor.code;
        const locus = 1 + Math.floor(rand() * GENE_COUNT);
        const def = geneAt(species, locus);
        const raw = Math.floor(rand() * (rawMax(def) + 1));
        editor.setGene(locus, raw);
        const { start, length } = geneSpan(locus);
        expect(geneBases(editor.code, locus)).toBe(valueToBases(raw, length));
        expect(editor.code.slice(0, start)).toBe(before.slice(0, start));
        expect(editor.code.slice(start + length, CHECKSUM_START)).toBe(before.slice(start + length, CHECKSUM_START));
        expect(hasValidChecksum(editor.code)).toBe(true);
        expect(readGene(editor.code, locus)).toBe(raw);
      }
    }
  });

  it('typing the bases a slider wrote gives back the same slider value, for every gene', () => {
    const rand = mulberry32(11);
    for (const species of SPECIES) {
      for (const def of geneTable(species)) {
        for (let n = 0; n < 20; n++) {
          const raw = Math.floor(rand() * (rawMax(def) + 1));
          const slid = editorWith(wildType(species));
          slid.setGene(def.locus, raw);
          const bases = geneBases(slid.code, def.locus);

          const typed = editorWith(randomGenome(species, rand));
          const { start } = geneSpan(def.locus);
          [...bases].forEach((base, i) => expect(typed.setBase(start + i + 1, base)).toBe(true));
          expect(readGene(typed.code, def.locus)).toBe(raw);
          expect(hasValidChecksum(typed.code)).toBe(true);
        }
      }
    }
  });

  it('cycling a base moves the slider by that digit’s place value', () => {
    const editor = editorWith(wildType('A'));
    const { start } = geneSpan(3);
    for (let i = 0; i < 6; i++) {
      const position = start + i + 1;
      const before = readGene(editor.code, 3);
      const base = editor.code.charAt(position - 1);
      expect(editor.cycleBase(position)).toBe(true);
      const place = 4 ** (5 - i);
      const expected = base === 'T' ? before - 3 * place : before + place;
      expect(readGene(editor.code, 3)).toBe(expected);
    }
  });

  it('cycling goes A, C, G, T and back to A', () => {
    const editor = editorWith(wildType('B'));
    const position = 40;
    editor.setBase(position, 'A');
    const seen = [editor.code.charAt(position - 1)];
    for (let i = 0; i < 4; i++) {
      editor.cycleBase(position);
      seen.push(editor.code.charAt(position - 1));
    }
    expect(seen.join('')).toBe('ACGTA');
  });

  it('a typed letter may be lower case; anything but a base is refused', () => {
    const editor = editorWith(wildType('A'));
    expect(editor.setBase(20, 'g')).toBe(true);
    expect(editor.code.charAt(19)).toBe('G');
    const before = editor.code;
    for (const bad of ['X', 'U', '1', '', 'AC']) expect(editor.setBase(20, bad)).toBe(false);
    expect(editor.code).toBe(before);
  });

  it('the number field writes the model value, and whole-number genes land on their bin centre', () => {
    for (const species of SPECIES) {
      for (const def of geneTable(species)) {
        if (def.kind !== 'int' && def.kind !== 'choice') continue;
        for (let model = def.min; model <= def.max; model++) {
          const editor = editorWith(wildType(species));
          editor.setModelValue(def.locus, model);
          expect(readGene(editor.code, def.locus)).toBe(encodeValue(def, model));
          expect(decodeGenome(editor.code).values[def.locus - 1]).toBe(model);
        }
      }
    }
    const editor = editorWith(wildType('A'));
    editor.setModelValue(2, 0.25);
    expect(decodeGenome(editor.code).values[1]).toBeCloseTo(0.25, 3);
  });
});

describe('randomise', () => {
  it('randomise-all changes every unlocked gene and no locked gene', () => {
    const rand = mulberry32(3);
    for (const species of SPECIES) {
      for (let n = 0; n < 300; n++) {
        const editor = editorWith(randomGenome(species, rand), n + 1);
        if (n % 2 === 1) editor.switchSpecies(species === 'A' ? 'B' : 'A');
        const lockedNow = new Set<number>();
        for (let locus = 1; locus <= GENE_COUNT; locus++) {
          if (rand() < 0.3) {
            editor.toggleLock(locus);
            lockedNow.add(locus);
          }
        }
        const before = geneValues(editor.code);
        const header = editor.code.slice(0, 6);
        editor.randomiseAll();
        const after = geneValues(editor.code);
        for (let locus = 1; locus <= GENE_COUNT; locus++) {
          if (lockedNow.has(locus)) expect(after[locus - 1]).toBe(before[locus - 1]);
          else expect(after[locus - 1]).not.toBe(before[locus - 1]);
        }
        expect(editor.code.slice(0, 6)).toBe(header);
        expect(hasValidChecksum(editor.code)).toBe(true);
      }
    }
  });

  it('randomise-all reaches the ends of every gene’s range', () => {
    // A generator that returns 0 and then values just under 1: every gene goes to 0 or its maximum.
    for (const species of SPECIES) {
      const low = new Editor({ code: wildType(species), random: () => 0 });
      low.randomiseAll();
      const high = new Editor({ code: wildType(species), random: () => 1 - 2 ** -53 });
      high.randomiseAll();
      for (const def of geneTable(species)) {
        const wild = readGene(wildType(species), def.locus);
        expect(readGene(low.code, def.locus)).toBe(wild === 0 ? 1 : 0);
        expect(readGene(high.code, def.locus)).toBe(wild === rawMax(def) ? rawMax(def) - 1 : rawMax(def));
      }
    }
  });

  it('randomise-gene changes only the focused gene, and leaves a locked gene alone', () => {
    const editor = editorWith(wildType('B'));
    editor.randomiseGene();
    expect(editor.code).toBe(wildType('B'));
    editor.focusGene(4);
    const before = geneValues(editor.code);
    editor.randomiseGene();
    const after = geneValues(editor.code);
    after.forEach((v, i) => (i === 3 ? expect(v).not.toBe(before[i]) : expect(v).toBe(before[i])));
    editor.toggleLock();
    const locked = editor.code;
    editor.randomiseGene();
    expect(editor.code).toBe(locked);
  });

  it('locks belong to a species and survive switching away and back', () => {
    const editor = editorWith(wildType('A'));
    editor.toggleLock(5);
    expect(editor.isLocked(5)).toBe(true);
    editor.switchSpecies('B');
    expect(editor.isLocked(5)).toBe(false);
    editor.switchSpecies('A');
    expect(editor.isLocked(5)).toBe(true);
    editor.toggleLock(5);
    expect(editor.isLocked(5)).toBe(false);
  });
});

describe('undo and redo', () => {
  it('restore exact codes, step by step, in both directions', () => {
    const rand = mulberry32(5);
    const editor = editorWith(wildType('A'), 9);
    const history = [editor.code];
    const actions = [
      () => editor.setGene(1 + Math.floor(rand() * 23), Math.floor(rand() * 4096)),
      () => editor.cycleBase(7 + Math.floor(rand() * 150)),
      () => editor.randomiseAll(),
      () => {
        editor.focusGene(1 + Math.floor(rand() * 24));
        editor.randomiseGene();
      },
      () => editor.paste(randomGenome(rand() < 0.5 ? 'A' : 'B', rand)),
      () => editor.switchSpecies(editor.species === 'A' ? 'B' : 'A'),
      () => editor.setModelValue(2, rand() - 0.5),
      () => editor.resetWildType(),
    ];
    for (let n = 0; n < 60; n++) {
      const before = editor.code;
      actions[n % actions.length]!();
      if (editor.code !== before) history.push(editor.code);
    }
    for (let i = history.length - 1; i > 0; i--) {
      expect(editor.code).toBe(history[i]);
      editor.undo();
    }
    expect(editor.code).toBe(history[0]);
    expect(editor.canUndo).toBe(false);
    for (let i = 1; i < history.length; i++) {
      editor.redo();
      expect(editor.code).toBe(history[i]);
    }
    expect(editor.canRedo).toBe(false);
  });

  it('a new edit after undo clears redo', () => {
    const editor = editorWith(wildType('A'));
    editor.setGene(2, 100);
    editor.setGene(2, 200);
    editor.undo();
    expect(editor.canRedo).toBe(true);
    editor.setGene(3, 300);
    expect(editor.canRedo).toBe(false);
    editor.undo();
    editor.undo();
    expect(editor.code).toBe(wildType('A'));
  });

  it('one slider drag is one undo step', () => {
    const editor = editorWith(wildType('A'));
    for (let v = 0; v <= 4095; v += 455) editor.setGene(2, v, 'drag-1');
    editor.setGene(2, 4095, 'drag-1');
    for (let v = 4095; v >= 0; v -= 1000) editor.setGene(3, v, 'drag-2');
    const afterSecond = editor.code;
    editor.undo();
    expect(readGene(editor.code, 2)).toBe(4095);
    expect(readGene(editor.code, 3)).toBe(readGene(wildType('A'), 3));
    editor.undo();
    expect(editor.code).toBe(wildType('A'));
    editor.redo();
    editor.redo();
    expect(editor.code).toBe(afterSecond);
  });

  it('a drag that starts on the current value still makes its undo step', () => {
    const editor = editorWith(wildType('A'));
    const wild = readGene(wildType('A'), 2);
    editor.setGene(2, wild, 'drag');
    editor.setGene(2, wild + 1, 'drag');
    editor.setGene(2, wild + 2, 'drag');
    editor.undo();
    expect(editor.code).toBe(wildType('A'));
  });

  it('undo can cross a species switch', () => {
    const editor = editorWith(wildType('A'));
    editor.setGene(1, 10);
    const edited = editor.code;
    editor.switchSpecies('B');
    expect(editor.species).toBe('B');
    editor.undo();
    expect(editor.species).toBe('A');
    expect(editor.code).toBe(edited);
  });
});

describe('header and checksum (clarification 10)', () => {
  it('header and checksum bases cannot be edited', () => {
    for (const species of SPECIES) {
      const editor = editorWith(wildType(species));
      const changes: EditorChange[] = [];
      editor.subscribe((c) => changes.push(c));
      for (const position of [1, 2, 3, 4, 5, 6, 157, 158, 159, 160]) {
        for (const base of 'ACGT') expect(editor.setBase(position, base)).toBe(false);
        expect(editor.cycleBase(position)).toBe(false);
        expect(Editor.isEditable(position)).toBe(false);
      }
      expect(editor.code).toBe(wildType(species));
      expect(editor.canUndo).toBe(false);
      expect(changes).toHaveLength(0);
    }
  });

  it('every gene and seed base can be edited', () => {
    const editor = editorWith(wildType('A'));
    for (let position = 7; position <= 156; position++) {
      expect(Editor.isEditable(position)).toBe(true);
      const before = editor.code;
      expect(editor.cycleBase(position)).toBe(true);
      expect(editor.code.slice(0, 6)).toBe(before.slice(0, 6));
      expect(editor.code).not.toBe(before);
    }
  });

  it('positions outside the code are refused', () => {
    const editor = editorWith(wildType('A'));
    for (const position of [0, -1, 161, 7.5, NaN]) expect(editor.setBase(position, 'A')).toBe(false);
  });
});

describe('species switch and wild type', () => {
  it('switching species loads that species’ wild type', () => {
    const rand = mulberry32(13);
    const editor = editorWith(randomGenome('A', rand));
    editor.switchSpecies('B');
    expect(editor.code).toBe(wildType('B'));
    expect(editor.species).toBe('B');
    editor.randomiseAll();
    editor.switchSpecies('A');
    expect(editor.code).toBe(wildType('A'));
  });

  it('switching to the species already shown changes nothing', () => {
    const editor = editorWith(wildType('A'));
    editor.setGene(2, 1);
    const code = editor.code;
    editor.switchSpecies('A');
    expect(editor.code).toBe(code);
  });

  it('reset to wild type keeps the species', () => {
    const rand = mulberry32(17);
    const editor = editorWith(randomGenome('B', rand));
    editor.resetWildType();
    expect(editor.code).toBe(wildType('B'));
  });
});

describe('pasting', () => {
  it('a valid code replaces the current one', () => {
    const rand = mulberry32(19);
    const editor = editorWith(wildType('A'));
    const code = randomGenome('B', rand);
    expect(editor.paste(code.toLowerCase().replace(/(.{8})/g, '$1 '))).toMatchObject({ ok: true, code });
    expect(editor.code).toBe(code);
    expect(editor.message).toBeNull();
  });

  it('a rejected code leaves the code as it was and says why', () => {
    const editor = editorWith(wildType('A'));
    const result = editor.paste('ACGTX');
    expect(result.ok).toBe(false);
    expect(editor.code).toBe(wildType('A'));
    expect(editor.canUndo).toBe(false);
    expect(editor.message?.tone).toBe('error');
    const unknown = editor.paste('GGG' + wildType('A').slice(3));
    expect(unknown.ok).toBe(false);
    expect(editor.message?.text).toMatch(/Unknown species/);
  });

  it('species C and D codes load (milestone 17)', () => {
    const editor = editorWith(wildType('A'));
    for (const species of ['C', 'D'] as const) {
      const result = editor.paste(wildType(species));
      expect(result.ok).toBe(true);
      expect(editor.code).toBe(wildType(species));
      expect(editor.species).toBe(species);
    }
  });

  it('a wrong checksum loads corrected, with a typo warning that stays until the next edit', () => {
    const good = wildType('B');
    const typo = good.slice(0, 157) + (good[157] === 'A' ? 'C' : 'A') + good.slice(158);
    const editor = editorWith(wildType('A'));
    editor.paste(typo);
    expect(editor.code).toBe(good);
    expect(editor.message?.tone).toBe('warning');
    editor.focusGene(3);
    expect(editor.message?.tone).toBe('warning');
    editor.setGene(3, 5);
    expect(editor.message).toBeNull();
  });

  it('a typo in a gene base is caught and the checksum corrected at once', () => {
    const good = wildType('A');
    const typo = good.slice(0, 30) + (good[30] === 'A' ? 'G' : 'A') + good.slice(31);
    const editor = editorWith(good);
    const result = editor.paste(typo);
    expect(result.ok && result.warning).toBeTruthy();
    expect(hasValidChecksum(editor.code)).toBe(true);
    expect(editor.code.slice(0, 156)).toBe(typo.slice(0, 156));
  });
});

describe('change events', () => {
  it('report the cause, the old code and the new one; focus and locks report state only', () => {
    const editor = editorWith(wildType('A'));
    const changes: EditorChange[] = [];
    editor.subscribe((c) => changes.push(c));
    editor.focusGene(2);
    editor.toggleLock();
    editor.setGene(2, 7);
    editor.undo();
    expect(changes.map((c) => (c.type === 'code' ? c.cause : 'state'))).toEqual(['state', 'state', 'gene', 'undo']);
    const gene = changes[2]!;
    expect(gene.type === 'code' && gene.previous).toBe(wildType('A'));
  });

  it('an edit that leaves the code unchanged makes no undo step', () => {
    const editor = editorWith(wildType('A'));
    editor.setGene(2, readGene(wildType('A'), 2));
    editor.resetWildType();
    expect(editor.canUndo).toBe(false);
  });
});
