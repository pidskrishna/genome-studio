import type { Pixels } from '../render/tiles';

// A small PNG writer and reader (spec section 9: the genome code goes into the PNG's metadata). The
// writer streams rows through the platform's own zlib compressor (CompressionStream 'deflate', in
// every current browser and in Node), so images far larger than a canvas may be (A2 is 34.8 million
// pixels; Safari allows a canvas of about 16.7 million) are written without one. Pixels are 8-bit
// RGBA, straight (not premultiplied) alpha, rows from the top.

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(parts: readonly Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

/** Byte arrays over a plain ArrayBuffer, as a Blob takes them. */
type Bytes = Uint8Array<ArrayBuffer>;

function chunk(type: string, data: Uint8Array): Bytes[] {
  const t = new Uint8Array(new TextEncoder().encode(type));
  return [u32(data.length), t, new Uint8Array(data), u32(crc32([t, data]))];
}

/** tEXt keywords and text are Latin-1; the genome code and names are plain ASCII. */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i] = c < 256 ? c : 63; // '?'
  }
  return out;
}

export interface EncodeOptions {
  /** tEXt metadata, keyword → text. Keywords are 1 to 79 Latin-1 characters. */
  text?: Record<string, string>;
  /** Rows per compressor write; also lets a caller report progress and yield between batches. */
  rowsPerBatch?: number;
  /** Called with 0 to 1 as rows are compressed; may return a promise to yield. */
  onProgress?: (fraction: number) => void | Promise<void>;
  /** Stops encoding (the promise rejects with an AbortError). */
  signal?: AbortSignal;
}

/** Encodes RGBA pixels as a PNG with the Sub filter on every row. */
export async function encodePng(image: Pixels, options: EncodeOptions = {}): Promise<Blob> {
  const { width, height, data } = image;
  if (data.length !== width * height * 4) throw new RangeError('Pixel data does not match the size');
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, adaptive filtering, no interlace
  const parts: BlobPart[] = [SIGNATURE, ...chunk('IHDR', ihdr)];
  for (const [key, value] of Object.entries(options.text ?? {})) {
    parts.push(...chunk('tEXt', new Uint8Array([...latin1(key), 0, ...latin1(value)])));
  }

  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const collected: Bytes[] = [];
  const reading = (async () => {
    const reader = stream.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      collected.push(new Uint8Array(value));
    }
  })();
  const stride = width * 4;
  const batch = Math.max(1, options.rowsPerBatch ?? 64);
  for (let y0 = 0; y0 < height; y0 += batch) {
    if (options.signal?.aborted) {
      // The reader fails when the stream is aborted; that failure is the cancellation itself.
      reading.catch(() => {});
      await writer.abort();
      throw new DOMException('Export cancelled', 'AbortError');
    }
    const rows = Math.min(batch, height - y0);
    const out = new Uint8Array(rows * (stride + 1));
    for (let r = 0; r < rows; r++) {
      const src = (y0 + r) * stride;
      const dst = r * (stride + 1);
      out[dst] = 1; // Sub: each byte minus the byte one pixel to its left
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? data[src + i - 4]! : 0;
        out[dst + 1 + i] = (data[src + i]! - left) & 255;
      }
    }
    await writer.write(out);
    await options.onProgress?.((y0 + rows) / height);
  }
  await writer.close();
  await reading;
  // One IDAT chunk per compressed piece: PNG allows consecutive IDAT chunks.
  for (const piece of collected) parts.push(...chunk('IDAT', piece));
  parts.push(...chunk('IEND', new Uint8Array(0)));
  return new Blob(parts, { type: 'image/png' });
}

export interface PngInfo {
  width: number;
  height: number;
  /** tEXt metadata, keyword → text. */
  text: Record<string, string>;
  /** Every chunk's CRC matched. */
  crcOk: boolean;
}

/** Reads a PNG's size and tEXt metadata (and checks every chunk's CRC). */
export function readPng(bytes: Uint8Array): PngInfo {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  let crcOk = true;
  const text: Record<string, string> = {};
  const decoder = new TextDecoder('latin1');
  while (p + 12 <= bytes.length) {
    const length = view.getUint32(p);
    const type = decoder.decode(bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + length);
    if (view.getUint32(p + 8 + length) !== crc32([bytes.subarray(p + 4, p + 8), data])) crcOk = false;
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
    } else if (type === 'tEXt') {
      const zero = data.indexOf(0);
      text[decoder.decode(data.subarray(0, zero))] = decoder.decode(data.subarray(zero + 1));
    } else if (type === 'IEND') break;
    p += 12 + length;
  }
  return { width, height, text, crcOk };
}
