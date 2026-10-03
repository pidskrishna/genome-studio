import { mul32, rotl } from './bits';

// Geometry hash: two independent 32-bit lanes of MurmurHash3-style mixing over the exact bytes of
// the data. Doubles are read as little-endian bit patterns, so 0 and −0 differ, as bit-identical
// geometry requires. Each array is prefixed with its length, so [1, 2] + [3] and [1] + [2, 3] differ.

const scratch = new DataView(new ArrayBuffer(8));

function fmix(h: number): number {
  let x = h >>> 0;
  x = mul32(x ^ (x >>> 16), 0x85ebca6b);
  x = mul32(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

function hex(x: number): string {
  return (x >>> 0).toString(16).padStart(8, '0');
}

export class GeometryHash {
  private a = 0x2f6b9d3e;
  private b = 0x9c5e2a71;
  private words = 0;

  addUint32(word: number): this {
    let k = mul32(word >>> 0, 0xcc9e2d51);
    k = mul32(rotl(k, 15), 0x1b873593);
    this.a = (mul32(rotl((this.a ^ k) >>> 0, 13), 5) + 0xe6546b64) >>> 0;

    let j = mul32(word >>> 0, 0x85ebca77);
    j = mul32(rotl(j, 17), 0xc2b2ae3d);
    this.b = (mul32(rotl((this.b ^ j) >>> 0, 19), 9) + 0x27d4eb2f) >>> 0;

    this.words++;
    return this;
  }

  addInt(value: number): this {
    return this.addUint32(value | 0);
  }

  addFloat64(value: number): this {
    scratch.setFloat64(0, value, true);
    return this.addUint32(scratch.getUint32(0, true)).addUint32(scratch.getUint32(4, true));
  }

  addFloat64Array(values: ArrayLike<number>): this {
    this.addUint32(values.length);
    for (let i = 0; i < values.length; i++) this.addFloat64(values[i] as number);
    return this;
  }

  addFloat32Array(values: Float32Array): this {
    this.addUint32(values.length);
    for (let i = 0; i < values.length; i++) {
      scratch.setFloat32(0, values[i] as number, true);
      this.addUint32(scratch.getUint32(0, true));
    }
    return this;
  }

  addIntArray(values: ArrayLike<number>): this {
    this.addUint32(values.length);
    for (let i = 0; i < values.length; i++) this.addInt(values[i] as number);
    return this;
  }

  /** 16 hex digits. Does not change the state, so more data can still be added. */
  digest(): string {
    const a = fmix(this.a ^ this.words);
    const b = fmix(this.b ^ mul32(this.words, 0x9e3779b1));
    return hex(fmix(a ^ rotl(b, 16))) + hex(fmix(b ^ a));
  }
}
