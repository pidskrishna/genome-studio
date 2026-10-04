import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, OrthographicCamera, Vector3 } from 'three';
import { comparePixels, flipRows, imageTiles, planRegion, seamDifferences, stitch, tileRects, tilesMatch, viewportWindows, type Pixels, type Rect } from '../../src/render/tiles';
import { mulberry32 } from '../../src/genome/test-helpers';

function noise(width: number, height: number, seed = 1): Pixels {
  const rand = mulberry32(seed);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  return { width, height, data };
}

function crop(image: Pixels, r: Rect): Pixels {
  const out: Pixels = { width: r.width, height: r.height, data: new Uint8Array(r.width * r.height * 4) };
  for (let y = 0; y < r.height; y++) {
    const s = ((r.y + y) * image.width + r.x) * 4;
    out.data.set(image.data.subarray(s, s + r.width * 4), y * r.width * 4);
  }
  return out;
}

function expectExactCover(width: number, height: number, rects: Rect[]): void {
  const hits = new Uint8Array(width * height);
  for (const r of rects) {
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) hits[y * width + x]!++;
  }
  expect(hits.every((h) => h === 1)).toBe(true);
}

describe('tile layout', () => {
  it.each([
    [800, 600, 2, 2],
    [801, 599, 2, 2],
    [17, 5, 3, 4],
    [4961, 7016, 3, 4],
  ])('%d × %d in %d × %d tiles covers every pixel exactly once', (w, h, c, r) => {
    const rects = tileRects(w, h, c, r);
    expect(rects).toHaveLength(c * r);
    if (w * h < 1e6) expectExactCover(w, h, rects);
    else expect(rects.reduce((s, t) => s + t.width * t.height, 0)).toBe(w * h);
  });

  it('splits tiles along viewport windows so none straddles two', () => {
    const rects = imageTiles(300, 200, 2, 1, 128);
    expectExactCover(300, 200, rects);
    for (const r of rects) expect(() => planRegion(300, 200, r, 128)).not.toThrow();
    expect(viewportWindows(300, 200, 128)).toHaveLength(6);
  });

  it('stitching cropped tiles rebuilds the image exactly', () => {
    const image = noise(97, 61);
    const rects = tileRects(97, 61, 2, 2);
    const stitched = stitch(97, 61, rects, (r) => crop(image, r));
    expect(comparePixels(stitched, image).differing).toBe(0);
  });

  it('flips rows from the bottom-up order graphics cards read in', () => {
    const image = noise(5, 4);
    const copy = { ...image, data: image.data.slice() };
    flipRows(copy);
    expect(Array.from(copy.data.subarray(0, 20))).toEqual(Array.from(image.data.subarray(60, 80)));
    flipRows(copy);
    expect(comparePixels(copy, image).differing).toBe(0);
  });
});

describe('drawing a sub-rectangle', () => {
  // Window coordinates as a rasteriser computes them: x from the left, y from the bottom, in pixels,
  // for a point at normalised device coordinates (nx, ny) and a viewport (x, y, width, height).
  const toWindow = (nx: number, ny: number, vp: { x: number; y: number; width: number; height: number }) => ({
    x: vp.x + ((nx + 1) / 2) * vp.width,
    y: vp.y + ((ny + 1) / 2) * vp.height,
  });

  it('the shifted viewport puts every point where the whole image has it, offset by the tile corner', () => {
    const W = 800;
    const H = 600;
    const rand = mulberry32(7);
    for (const rect of tileRects(W, H, 2, 2).concat(tileRects(W, H, 3, 5))) {
      const plan = planRegion(W, H, rect, 16384);
      expect(plan.whole).toBe(true);
      for (let i = 0; i < 20; i++) {
        const nx = rand() * 2 - 1;
        const ny = rand() * 2 - 1;
        const whole = toWindow(nx, ny, { x: 0, y: 0, width: W, height: H });
        const tile = toWindow(nx, ny, plan.viewport);
        // Whole image: pixel column X from the left, row Y from the top is at window (X, H − Y).
        // Tile: the same pixel is at (X − rect.x, rect.y + rect.height − Y).
        const X = whole.x;
        const Y = H - whole.y;
        expect(tile.x).toBeCloseTo(X - rect.x, 9);
        expect(tile.y).toBeCloseTo(rect.y + rect.height - Y, 9);
      }
    }
  });

  it.each(['perspective', 'orthographic'])('beyond the viewport limit, a %s view offset keeps points where the whole image has them', (kind) => {
    const W = 1000;
    const H = 700;
    const make = () => {
      const c = kind === 'perspective' ? new PerspectiveCamera(30, W / H, 0.1, 100) : new OrthographicCamera(-W / H, W / H, 1, -1, 0.1, 100);
      c.position.set(3, 2, 5);
      c.lookAt(0, 0, 0);
      c.updateMatrixWorld();
      return c;
    };
    const whole = make();
    const rand = mulberry32(3);
    for (const rect of imageTiles(W, H, 1, 1, 400)) {
      const plan = planRegion(W, H, rect, 400);
      expect(plan.whole).toBe(false);
      const cam = make();
      const w = plan.window;
      cam.setViewOffset(W, H, w.x, w.y, w.width, w.height);
      cam.updateProjectionMatrix();
      for (let i = 0; i < 20; i++) {
        const p = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5);
        const a = p.clone().project(whole);
        const b = p.clone().project(cam);
        const full = toWindow(a.x, a.y, { x: 0, y: 0, width: W, height: H });
        const tile = toWindow(b.x, b.y, plan.viewport);
        expect(tile.x).toBeCloseTo(full.x - rect.x, 6);
        expect(tile.y).toBeCloseTo(rect.y + rect.height - (H - full.y), 6);
      }
    }
  });
});

describe('tile pass mark', () => {
  const blank = (w: number, h: number): Pixels => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
  const rects = tileRects(100, 100, 2, 2);

  it('an identical frame passes', () => {
    const a = noise(100, 100);
    expect(tilesMatch(comparePixels(a, a), seamDifferences(a, a, rects))).toBe(true);
  });

  it('one pixel one level off, away from a seam, passes', () => {
    const a = blank(100, 100);
    const b = blank(100, 100);
    b.data[(10 * 100 + 10) * 4] = 1;
    expect(seamDifferences(a, b, rects)).toBe(0);
    expect(tilesMatch(comparePixels(a, b), 0)).toBe(true);
  });

  it('two levels off fails', () => {
    const a = blank(100, 100);
    const b = blank(100, 100);
    b.data[(10 * 100 + 10) * 4] = 2;
    expect(tilesMatch(comparePixels(a, b), seamDifferences(a, b, rects))).toBe(false);
  });

  it('any difference on a seam fails', () => {
    const a = blank(100, 100);
    const b = blank(100, 100);
    b.data[(10 * 100 + 49) * 4] = 1; // column 49 borders the tile edge at x = 50
    expect(seamDifferences(a, b, rects)).toBe(1);
    expect(tilesMatch(comparePixels(a, b), seamDifferences(a, b, rects))).toBe(false);
  });

  it('more than 0.01% of pixels off fails', () => {
    const a = blank(100, 100);
    const b = blank(100, 100);
    b.data[(10 * 100 + 10) * 4] = 1;
    b.data[(20 * 100 + 20) * 4] = 1; // 2 of 10,000 pixels is 0.02%
    expect(tilesMatch(comparePixels(a, b), 0)).toBe(false);
  });
});
