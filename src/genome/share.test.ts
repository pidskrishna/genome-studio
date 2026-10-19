import { describe, expect, it } from 'vitest';
import { parseGenome } from './genome';
import { codeToHash, parseHash, shareLink } from './share';
import { mulberry32, randomGenome } from './test-helpers';
import { wildType } from './wildtype';

describe('link sharing', () => {
  it('a code written into the page address parses back to the same code', () => {
    const rand = mulberry32(99);
    for (let n = 0; n < 100; n++) {
      const code = randomGenome((['A', 'B', 'C', 'D'] as const)[n % 4]!, rand);
      const link = shareLink('https://studio.example/app/?x=1', code);
      expect(new URL(link).hash).toBe(codeToHash(code));
      const parsed = parseHash(new URL(link).hash);
      expect(parsed).toEqual(parseGenome(code));
      expect(parsed && parsed.ok && parsed.code).toBe(code);
    }
  });

  it('replaces an existing fragment', () => {
    const code = wildType('B');
    expect(shareLink('https://studio.example/#old', code)).toBe(`https://studio.example/#${code}`);
  });

  it('reads a code with encoded spaces and lower case', () => {
    const code = wildType('A');
    const hash = '#' + encodeURIComponent(code.toLowerCase().replace(/(.{20})/g, '$1 '));
    expect(parseHash(hash)).toEqual({ ok: true, code, species: 'A' });
  });

  it('returns null when the address carries no code, and a message for a bad one', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    const bad = parseHash('#hello');
    expect(bad && bad.ok).toBe(false);
  });
});
