// Base-4 helpers: A = 0, C = 1, G = 2, T = 3.

export const BASES = 'ACGT';

const COMPLEMENT: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A' };

export function baseToDigit(base: string): number {
  return BASES.indexOf(base);
}

export function digitToBase(digit: number): string {
  const base = BASES[digit];
  if (base === undefined) throw new RangeError(`Not a base digit: ${digit}`);
  return base;
}

/** Writes a non-negative integer as exactly `length` bases, most significant first. */
export function valueToBases(value: number, length: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 4 ** length) {
    throw new RangeError(`${value} does not fit in ${length} bases`);
  }
  let out = '';
  let rest = value;
  for (let i = 0; i < length; i++) {
    out = digitToBase(rest % 4) + out;
    rest = Math.floor(rest / 4);
  }
  return out;
}

/** Reads bases (upper case, A/C/G/T only) as a base-4 number. */
export function basesToValue(bases: string): number {
  let value = 0;
  for (const base of bases) {
    const digit = baseToDigit(base);
    if (digit < 0) throw new RangeError(`Not a base: ${base}`);
    value = value * 4 + digit;
  }
  return value;
}

/** The complementary strand, read in the same direction. Derived for display, never stored. */
export function complementStrand(code: string): string {
  let out = '';
  for (const base of code) out += COMPLEMENT[base] ?? '';
  return out;
}

export type CleanResult = { ok: true; code: string } | { ok: false; message: string };

/**
 * Accepts lower case, spaces and line breaks; rejects anything else that is not a base.
 * The result is upper case with no spaces.
 */
export function cleanCode(input: string): CleanResult {
  const code = input.replace(/\s+/g, '').toUpperCase();
  const bad: string[] = [];
  for (const ch of code) {
    if (baseToDigit(ch) < 0 && !bad.includes(ch)) bad.push(ch);
  }
  if (bad.length > 0) {
    const shown = bad
      .slice(0, 5)
      .map((ch) => `"${ch}"`)
      .join(', ');
    return {
      ok: false,
      message: `The code contains ${shown}, which ${bad.length === 1 ? 'is' : 'are'} not ${bad.length === 1 ? 'a base' : 'bases'}. A genome code uses only A, C, G and T.`,
    };
  }
  return { ok: true, code };
}
