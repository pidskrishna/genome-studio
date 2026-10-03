import { baseToDigit, valueToBases } from './bases';

export const CHECKSUM_BASES = 4;

/**
 * Weighted sum of the digits modulo 256, written as four bases. Every weight is odd, and a single
 * base change alters a digit by 1, 2 or 3, so the sum always changes: no single-base typo in the
 * covered bases can slip through.
 */
export function checksumOf(covered: string): string {
  let sum = 0x5a;
  for (let i = 0; i < covered.length; i++) {
    const weight = ((i * 97 + 31) | 1) & 255;
    sum = (sum + weight * baseToDigit(covered.charAt(i))) % 256;
  }
  return valueToBases(sum, CHECKSUM_BASES);
}
