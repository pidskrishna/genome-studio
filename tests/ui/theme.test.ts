import { describe, expect, it } from 'vitest';
import { pigmentsOf, wildType, writeGene } from '../../src/genome';
import { LOOKS } from '../../src/render/colour';
import { BACKGROUNDS } from '../../src/render/looks';
import { applyLook, applyPigmentHues, BACKDROP_HEX, LOOK_TOKENS, pigmentHues, TOKEN_NAMES, type StyleTarget } from '../../src/ui/theme';

// Design tokens (DESIGN.md sections 2 and 3, milestone 10a).

function fakeRoot(): StyleTarget & { props: Map<string, string> } {
  const props = new Map<string, string>();
  return { props, dataset: {}, style: { setProperty: (name: string, value: string | null) => void props.set(name, value ?? '') } };
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const sixDigit = (css: string): string => (css === '#000' ? '#000000' : css);

describe('look tokens', () => {
  it('every look defines every token, and nothing else', () => {
    for (const look of LOOKS) {
      expect(Object.keys(LOOK_TOKENS[look]).sort()).toEqual([...TOKEN_NAMES].sort());
      for (const name of TOKEN_NAMES) expect(LOOK_TOKENS[look][name].trim(), `${look} ${name}`).not.toBe('');
    }
  });

  it('the stage token is the colour the renderer draws behind the organism', () => {
    for (const look of LOOKS) expect(sixDigit(LOOK_TOKENS[look].stage)).toBe(hex(BACKGROUNDS[look]));
  });

  it('the helix scene backdrop matches the helix column token', () => {
    for (const look of LOOKS) expect(sixDigit(LOOK_TOKENS[look].backdrop)).toBe(hex(BACKDROP_HEX[look]));
  });

  it('applying a look writes every token to the root and names the look', () => {
    const root = fakeRoot();
    applyLook(root, 'plate');
    expect(root.dataset.look).toBe('plate');
    for (const name of TOKEN_NAMES) expect(root.props.get(`--${name}`)).toBe(LOOK_TOKENS.plate[name]);
  });

  it('only the fluorescence look takes its accents from the pigment hues', () => {
    expect(LOOK_TOKENS.fluorescence.accent).toContain('var(--hue)');
    expect(LOOK_TOKENS.fluorescence['g-pigment']).toContain('var(--hue-b)');
    for (const look of ['plate', 'glossy'] as const) {
      for (const name of TOKEN_NAMES) expect(LOOK_TOKENS[look][name]).not.toContain('var(--hue');
    }
  });
});

describe('pigment hues', () => {
  it('follow pigment A and pigment B of the code', () => {
    const code = wildType('A');
    const p = pigmentsOf(code);
    expect(pigmentHues(p)).toEqual({ a: Math.round(p.hueA) % 360, b: Math.round(p.hueB) % 360 });
  });

  it('change when a pigment gene changes, and are written as --hue and --hue-b', () => {
    const before = wildType('A');
    const after = writeGene(before, 16, 0);
    const root = fakeRoot();
    applyPigmentHues(root, pigmentsOf(before));
    const first = root.props.get('--hue');
    applyPigmentHues(root, pigmentsOf(after));
    expect(root.props.get('--hue')).toBe('0');
    expect(root.props.get('--hue')).not.toBe(first);
    expect(root.props.get('--hue-b')).toBe(String(pigmentHues(pigmentsOf(after)).b));
  });

  it('wrap to whole degrees from 0 to 359', () => {
    expect(pigmentHues({ hueA: 360, hueB: 359.6 })).toEqual({ a: 0, b: 0 });
    expect(pigmentHues({ hueA: -0.2, hueB: 12.4 })).toEqual({ a: 0, b: 12 });
  });
});
