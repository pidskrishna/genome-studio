import { describe, expect, it } from 'vitest';
import { GeometryHash } from '../../src/sim/hash';

const sample = () => new GeometryHash().addFloat64Array([0, 1, -2.5, Math.PI]).addIntArray([3, 1, 4]);

describe('geometry hash', () => {
  it('gives fixed, recorded digests', () => {
    expect(sample().digest()).toBe('d7982d43c369071a');
    expect(new GeometryHash().digest()).toBe('3b079dd514a55f17');
  });

  it('is 16 hex digits and repeatable', () => {
    expect(sample().digest()).toMatch(/^[0-9a-f]{16}$/);
    expect(sample().digest()).toBe(sample().digest());
  });

  it('changes when any single bit of a value changes', () => {
    const base = sample().digest();
    const seen = new Set([base]);
    const view = new DataView(new ArrayBuffer(8));
    for (let bit = 0; bit < 64; bit++) {
      view.setFloat64(0, Math.PI);
      const word = bit < 32 ? 4 : 0;
      view.setUint32(word, view.getUint32(word) ^ (1 << (bit % 32)));
      const flipped = view.getFloat64(0);
      const digest = new GeometryHash().addFloat64Array([0, 1, -2.5, flipped]).addIntArray([3, 1, 4]).digest();
      seen.add(digest);
    }
    expect(seen.size).toBe(65);
  });

  it('distinguishes 0 from −0, order, and how values are grouped', () => {
    const h = (f: (g: GeometryHash) => void) => {
      const g = new GeometryHash();
      f(g);
      return g.digest();
    };
    expect(h((g) => g.addFloat64(0))).not.toBe(h((g) => g.addFloat64(-0)));
    expect(h((g) => g.addFloat64Array([1, 2]))).not.toBe(h((g) => g.addFloat64Array([2, 1])));
    expect(h((g) => g.addFloat64Array([1, 2]).addFloat64Array([3]))).not.toBe(
      h((g) => g.addFloat64Array([1]).addFloat64Array([2, 3])),
    );
    expect(h((g) => g.addFloat32Array(new Float32Array([1.5])))).not.toBe(h((g) => g.addFloat64Array([1.5])));
  });
});
