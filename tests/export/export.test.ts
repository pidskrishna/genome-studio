import { describe, expect, it } from 'vitest';
import { decodeGenome, geneTable, wildType, specimenName } from '../../src/genome';
import { methodsText } from '../../src/export/methods';
import { crc32, encodePng, readPng } from '../../src/export/png';
import { cleanFileName, exportFileName, exportSize, printedSize, PRESETS } from '../../src/export/sizes';

// Milestone 12: export sizes, file names, the PNG writer and its metadata, and the methods file.

describe('export sizes (spec section 9, clarification 13)', () => {
  it('A2 is exactly 4,961 × 7,016 pixels', () => {
    expect(exportSize('A2', 'portrait')).toEqual({ width: 4961, height: 7016 });
    expect(exportSize('A2', 'landscape')).toEqual({ width: 7016, height: 4961 });
  });

  it('A4 square is 2,480 × 2,480: the short edge on both sides', () => {
    expect(exportSize('A4', 'square')).toEqual({ width: 2480, height: 2480 });
    expect(exportSize('A3', 'square')).toEqual({ width: 3508, height: 3508 });
  });

  it('every preset matches the spec table at 300 dpi', () => {
    expect(PRESETS).toEqual({ A4: { width: 2480, height: 3508 }, A3: { width: 3508, height: 4961 }, A2: { width: 4961, height: 7016 } });
    expect(printedSize(2480, 3508)).toEqual({ width: 210, height: 297 });
  });

  it('custom sizes are whole pixels within limits', () => {
    expect(exportSize('custom', 'portrait', { width: 1000.4, height: 600 })).toEqual({ width: 1000, height: 600 });
    expect(exportSize('custom', 'square', { width: 1000, height: 600 })).toEqual({ width: 600, height: 600 });
    expect(exportSize('custom', 'portrait', { width: -5, height: Number.NaN })).toEqual({ width: 1, height: 1 });
  });
});

describe('file name (clarification 12)', () => {
  it('is the specimen name and the start of the code', () => {
    const code = wildType('A');
    const name = specimenName(code).full.replace(' ', '-');
    expect(exportFileName(code)).toBe(`${name}-${code.slice(0, 12)}`);
  });

  it('a typed name is kept safe, and an empty one falls back', () => {
    expect(cleanFileName('  my/plate:1.png ', 'x')).toBe('my-plate-1');
    expect(cleanFileName('   ', 'fallback')).toBe('fallback');
  });
});

/** Inflates zlib data with the platform's own decompressor. */
async function inflate(parts: Uint8Array[]): Promise<Uint8Array> {
  const stream = new Blob(parts.map((p) => new Uint8Array(p))).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('PNG writer', () => {
  const image = (w: number, h: number) => {
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 7)) & 255;
    return { width: w, height: h, data };
  };

  it('writes a valid PNG whose pixels decode exactly, with the code in its metadata', async () => {
    const img = image(37, 23);
    const code = wildType('B');
    const blob = await encodePng(img, { text: { 'Genome code': code, Title: 'Test' }, rowsPerBatch: 5 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const info = readPng(bytes);
    expect(info).toMatchObject({ width: 37, height: 23, crcOk: true });
    expect(info.text['Genome code']).toBe(code);
    // Undo the Sub filter on the inflated rows and compare every byte.
    const idat: Uint8Array[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    for (let p = 8; p < bytes.length; ) {
      const len = view.getUint32(p);
      const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
      if (type === 'IDAT') idat.push(bytes.subarray(p + 8, p + 8 + len));
      p += 12 + len;
    }
    const raw = await inflate(idat);
    const stride = 37 * 4;
    const out = new Uint8Array(37 * 23 * 4);
    for (let y = 0; y < 23; y++) {
      expect(raw[y * (stride + 1)]).toBe(1);
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? out[y * stride + i - 4]! : 0;
        out[y * stride + i] = (raw[y * (stride + 1) + 1 + i]! + left) & 255;
      }
    }
    expect(out.every((v, i) => v === img.data[i])).toBe(true);
  });

  it('computes the standard CRC-32', () => {
    expect(crc32([new TextEncoder().encode('123456789')])).toBe(0xcbf43926);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(encodePng(image(8, 8), { signal: controller.signal })).rejects.toThrow('cancelled');
  });
});

describe('methods file', () => {
  it('lists the code, species, version and all 24 decoded values', () => {
    for (const species of ['A', 'B'] as const) {
      const code = wildType(species);
      const text = methodsText(code, { hash: 'abc123' });
      expect(text).toContain(`Code: ${code}`);
      expect(text).toMatch(/Species: .+ \(header AA[AC]\)/);
      expect(text).toContain('Encoding version: 1');
      expect(text).toContain('Geometry hash: abc123');
      const decoded = decodeGenome(code);
      const geneLines = text.split('\n').filter((l) => /^\s?\d+\t/.test(l));
      expect(geneLines).toHaveLength(24);
      for (const def of geneTable(species)) {
        const line = geneLines[def.locus - 1]!.split('\t');
        expect(Number(line[0])).toBe(def.locus);
        expect(line[1]).toBe(def.name);
        expect(Number(line[4])).toBe(decoded.values[def.locus - 1]);
      }
    }
  });
});

describe('tile grid', () => {
  it('keeps each tile plus the bloom margin within the largest render target', async () => {
    const { tileGrid } = await import('../../src/export/exporter');
    for (const [w, h, max, margin] of [[4961, 7016, 4096, 0], [4961, 7016, 4096, 120], [2480, 2480, 4096, 300], [900, 1200, 4096, 0]] as const) {
      const { cols, rows } = tileGrid(w, h, max, margin);
      expect(Math.ceil(w / cols) + 2 * margin).toBeLessThanOrEqual(max);
      expect(Math.ceil(h / rows) + 2 * margin).toBeLessThanOrEqual(max);
    }
    expect(tileGrid(900, 1200, 4096, 0, { cols: 3, rows: 4 })).toEqual({ cols: 3, rows: 4 });
  });
});
