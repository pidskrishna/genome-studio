import { describe, expect, it } from 'vitest';
import { GENOME_LENGTH } from '../../src/genome';
import { detent, facingSpin, nearestSpin, TWIST } from '../../src/ui/helix-geometry';
import { LABEL_REACH, labelOpacity } from '../../src/ui/helix-ruler';

// Milestone 10b: a released drag settles so a base pair faces the viewer (the detent), and gene names
// on the margin ruler fade in as the pointer approaches.

describe('detent', () => {
  it('lands on a spin at which a base pair faces the viewer', () => {
    for (let k = 0; k < 500; k++) {
      const spin = -40 + k * 0.173;
      const d = detent(spin);
      // Some whole base index t has facingSpin(t) equal to d, modulo a full turn.
      let match = false;
      for (let t = 0; t < 21 && !match; t++) {
        if (Math.abs(nearestSpin(d, facingSpin(t)) - d) < 1e-9) match = true;
      }
      expect(match, `spin ${spin}`).toBe(true);
    }
  });

  it('is the nearest such spin: never more than half a twist away', () => {
    for (let k = 0; k < 500; k++) {
      const spin = -40 + k * 0.173;
      expect(Math.abs(detent(spin) - spin)).toBeLessThanOrEqual(TWIST / 2 + 1e-9);
    }
  });

  it('leaves a facing spin where it is', () => {
    for (let t = 0; t < GENOME_LENGTH; t += 7) {
      const s = facingSpin(t);
      expect(detent(s)).toBeCloseTo(s, 9);
      expect(detent(detent(s + 0.2))).toBeCloseTo(detent(s + 0.2), 9);
    }
  });
});

describe('ruler label fading', () => {
  it('is fully shown for the focused or hovered gene, wherever the pointer is', () => {
    expect(labelOpacity(null, 100, true)).toBe(1);
    expect(labelOpacity(900, 100, true)).toBe(1);
  });

  it('is hidden with no pointer, and fades linearly over the reach', () => {
    expect(labelOpacity(null, 100, false)).toBe(0);
    expect(labelOpacity(100, 100, false)).toBe(1);
    expect(labelOpacity(100 + LABEL_REACH / 2, 100, false)).toBeCloseTo(0.5, 9);
    expect(labelOpacity(100 - LABEL_REACH / 2, 100, false)).toBeCloseTo(0.5, 9);
    expect(labelOpacity(100 + LABEL_REACH, 100, false)).toBe(0);
    expect(labelOpacity(100 + LABEL_REACH * 3, 100, false)).toBe(0);
  });

  it('reaches 70 pixels, as DESIGN.md sets', () => {
    expect(LABEL_REACH).toBe(70);
  });
});
