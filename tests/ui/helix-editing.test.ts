import { describe, expect, it } from 'vitest';
import {
  CHECKSUM_START,
  decodeGenome,
  geneAt,
  geneSpan,
  nextBase,
  readGene,
  wildType,
  type SpeciesId,
} from '../../src/genome';
import { mulberry32, randomGenome } from '../../src/genome/test-helpers';
import { codeGroups } from '../../src/ui/code-bar';
import { Editor } from '../../src/ui/editor';
import { HelixControls, locusOfPosition } from '../../src/ui/helix-controls';
import { bandMiddle } from '../../src/ui/helix-geometry';
import { HelixScene } from '../../src/ui/helix-scene';
import { inspectorValues } from '../../src/ui/inspector';

// Milestone 8 check: clicking a base on the helix cycles it through A, C, G, T and updates the slider
// and the code bar. The click goes through the real helix scene (three.js picking, no WebGL): the
// base is turned to face the viewer, its screen point is picked, and the pick drives the editor. The
// slider and code bar values are what the inspector and code bar draw on every editor event.

interface Shown {
  slider: string;
  inspectorBases: string;
  codeBar: string;
  focus: number | null;
}

function setup(code: string, species: SpeciesId) {
  const editor = new Editor({ code, random: mulberry32(5) });
  const controls = new HelixControls(editor);
  const scene = new HelixScene();
  scene.setCode(code, species);
  scene.setSize(420, 760);
  const shown: Shown[] = [];
  const quiet: boolean[] = [];
  let lastFocus: number | null = null;
  editor.subscribe((change) => {
    // As the helix view does: redraw the bases, and note whether a focus change should turn the helix.
    scene.setCode(editor.code, editor.species);
    if (editor.focus !== lastFocus) {
      quiet.push(controls.isQuietFocus(editor.focus));
      lastFocus = editor.focus;
    }
    if (change.type !== 'code' || editor.focus === null) return;
    const def = geneAt(editor.species, editor.focus);
    const values = inspectorValues(editor.code, def, decodeGenome(editor.code));
    shown.push({
      slider: values.slider,
      inspectorBases: values.bases.join(''),
      codeBar: codeGroups(editor.code, editor.species).find((g) => g.locus === editor.focus)!.text,
      focus: editor.focus,
    });
  });
  /** Clicks the code half of a base's rung where it shows on screen. */
  const clickBase = (position: number): void => {
    const view = scene.viewFor(position - 1);
    scene.setView(view.travel, view.spin);
    const point = scene.basePoint(position - 1);
    expect(point.visible).toBe(true);
    const pick = scene.pick(point.x, point.y);
    expect(pick).toEqual({ kind: 'base', index: position - 1 });
    controls.click(pick);
  };
  return { editor, controls, scene, shown, quiet, clickBase };
}

describe('clicking a base on the helix', () => {
  it('cycles it through A, C, G, T and updates the slider and the code bar', () => {
    const rand = mulberry32(88);
    const cases: { code: string; species: SpeciesId; position: number }[] = [
      { code: wildType('A'), species: 'A', position: 7 },
      { code: wildType('B'), species: 'B', position: 100 },
      { code: randomGenome('A', rand), species: 'A', position: 151 },
      { code: randomGenome('B', rand), species: 'B', position: CHECKSUM_START },
    ];
    for (let n = 0; n < 6; n++) {
      const species: SpeciesId = n % 2 ? 'B' : 'A';
      cases.push({ code: randomGenome(species, rand), species, position: 7 + Math.floor(rand() * 150) });
    }
    for (const { code, species, position } of cases) {
      const { editor, controls, shown, clickBase } = setup(code, species);
      const locus = locusOfPosition(position)!;
      const { start, length } = geneSpan(locus);
      const offset = position - 1 - start;
      let expected = code.charAt(position - 1);
      for (let click = 1; click <= 4; click++) {
        clickBase(position);
        expected = nextBase(expected);
        expect(editor.code.charAt(position - 1)).toBe(expected);
        expect(controls.selected).toBe(position);
        expect(editor.focus).toBe(locus);
        const now = shown[shown.length - 1]!;
        expect(shown).toHaveLength(click);
        expect(now.focus).toBe(locus);
        expect(now.slider).toBe(String(readGene(editor.code, locus)));
        expect(now.inspectorBases.charAt(offset)).toBe(expected);
        expect(now.codeBar).toBe(editor.code.slice(start, start + length));
        expect(now.codeBar.charAt(offset)).toBe(expected);
        // Only that base and the checksum changed.
        for (let i = 0; i < CHECKSUM_START; i++) if (i !== position - 1) expect(editor.code[i]).toBe(code[i]);
      }
      // Four clicks go once round A, C, G, T and back to the start.
      expect(editor.code).toBe(code);
      const sliders = shown.map((s) => Number(s.slider));
      expect(new Set(sliders).size).toBe(4);
    }
  });

  it('follows A → C → G → T → A', () => {
    const code = wildType('A');
    const position = 40;
    const { editor, clickBase } = setup(code, 'A');
    editor.setBase(position, 'A');
    const seen: string[] = [editor.code.charAt(position - 1)];
    for (let k = 0; k < 4; k++) {
      clickBase(position);
      seen.push(editor.code.charAt(position - 1));
    }
    expect(seen.join('')).toBe('ACGTA');
  });

  it('focuses the base’s gene without turning the helix, and lets a typed letter set it', () => {
    const { editor, controls, quiet, clickBase, shown } = setup(wildType('A'), 'A');
    clickBase(20); // locus 3
    expect(editor.focus).toBe(3);
    expect(quiet).toEqual([true]);
    expect(controls.key('t')).toBe(true);
    expect(editor.code.charAt(19)).toBe('T');
    expect(controls.selected).toBe(21);
    expect(shown[shown.length - 1]!.slider).toBe(String(readGene(editor.code, 3)));
    expect(controls.key('ArrowLeft')).toBe(true);
    expect(controls.selected).toBe(20);
    expect(controls.key('x')).toBe(false);
    expect(controls.key('Escape')).toBe(true);
    expect(controls.selected).toBe(null);
  });

  it('leaves header and checksum bases alone (clarification 10)', () => {
    const code = wildType('B');
    for (const position of [1, 2, 6, CHECKSUM_START + 1, 160]) {
      const { editor, scene, controls } = setup(code, 'B');
      const view = scene.viewFor(position - 1);
      scene.setView(view.travel, view.spin);
      const point = scene.basePoint(position - 1);
      const pick = scene.pick(point.x, point.y);
      expect(pick).toEqual({ kind: 'base', index: position - 1 });
      expect(controls.click(pick)).toBe(false);
      expect(editor.code).toBe(code);
      expect(controls.selected).toBe(null);
    }
  });
});

describe('clicking a gene band on the helix', () => {
  it('focuses the gene and asks the helix to turn; clicking again closes it', () => {
    const { editor, scene, controls, quiet } = setup(wildType('A'), 'A');
    for (const locus of [1, 9, 16, 24]) {
      const band = scene.bands.find((b) => b.locus === locus)!;
      const view = scene.viewFor(bandMiddle(band));
      scene.setView(view.travel, view.spin);
      const point = scene.bandPoint(band);
      expect(point.visible).toBe(true);
      const pick = scene.pick(point.x, point.y);
      expect(pick).toEqual({ kind: 'gene', locus });
      controls.click(pick);
      expect(editor.focus).toBe(locus);
      expect(quiet[quiet.length - 1]).toBe(false);
    }
    const band = scene.bands.find((b) => b.locus === 24)!;
    const point = scene.bandPoint(band);
    controls.click(scene.pick(point.x, point.y));
    expect(editor.focus).toBe(null);
  });

  it('shows the header and checksum bands as not editable', () => {
    const { scene, controls, editor } = setup(wildType('A'), 'A');
    for (const kind of ['header', 'checksum'] as const) {
      const band = scene.bands.find((b) => b.kind === kind)!;
      const view = scene.viewFor(bandMiddle(band));
      scene.setView(view.travel, view.spin);
      const point = scene.bandPoint(band);
      const pick = scene.pick(point.x, point.y);
      expect(pick).toEqual({ kind: 'fixed', part: kind });
      expect(controls.click(pick)).toBe(false);
      expect(editor.focus).toBe(null);
    }
  });
});
