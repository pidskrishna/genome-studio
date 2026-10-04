// Tiled rendering: a large virtual image is drawn as sub-rectangles and stitched, so its size is not
// limited by the graphics card's largest drawable image (spec section 9). These helpers are pure; the
// stage draws each rectangle with a camera view offset.

/** A sub-rectangle of the virtual image, in pixels from its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An RGBA image, rows from the top. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Splits a width × height image into cols × rows rectangles that cover it exactly, without overlap. */
export function tileRects(width: number, height: number, cols: number, rows: number): Rect[] {
  checkSize(width, height);
  return gridRects(cuts(width, cols), cuts(height, rows));
}

function checkSize(width: number, height: number): void {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) {
    throw new RangeError('Image size must be whole positive pixels');
  }
}

function gridRects(xs: readonly number[], ys: readonly number[]): Rect[] {
  const out: Rect[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      out.push({ x: xs[i]!, y: ys[j]!, width: xs[i + 1]! - xs[i]!, height: ys[j + 1]! - ys[j]! });
    }
  }
  return out;
}

function cuts(size: number, parts: number): number[] {
  const n = Math.max(1, Math.min(Math.floor(parts), size));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Math.floor((i * size) / n));
  return out;
}

function mergeCuts(a: readonly number[], b: readonly number[]): number[] {
  return [...new Set([...a, ...b])].sort((p, q) => p - q);
}

/*
 * How a sub-rectangle is drawn. Every tile is drawn with the projection of the whole image and a
 * viewport the size of the whole image, shifted by whole pixels so the tile's corner lands on the
 * render target's corner. Together with vertex snapping (snap.ts), a whole-pixel shift rasterises
 * exactly as the whole image does, so the stitched tiles match the frame drawn whole pixel for pixel.
 * A view offset (a cropped projection) rounds differently and flips a few antialiasing samples along
 * edges, about 0.01% of pixels.
 *
 * The viewport cannot exceed the graphics card's limit, so an image larger than that is first split
 * into windows, each drawn with a view offset; tiles never straddle two windows. Window edges are
 * not guaranteed exact; MAX_VIEWPORT_DIMS is at least 16,384 on desktop cards, above A2's 7,016.
 */

/** Windows of at most maxViewport pixels per side that cover the image. */
export function viewportWindows(width: number, height: number, maxViewport: number): Rect[] {
  return tileRects(width, height, Math.ceil(width / maxViewport), Math.ceil(height / maxViewport));
}

/** Tiles of a cols × rows split, further split along window edges so none straddles two windows. */
export function imageTiles(width: number, height: number, cols: number, rows: number, maxViewport: number): Rect[] {
  checkSize(width, height);
  const wx = cuts(width, Math.ceil(width / maxViewport));
  const wy = cuts(height, Math.ceil(height / maxViewport));
  return gridRects(mergeCuts(cuts(width, cols), wx), mergeCuts(cuts(height, rows), wy));
}

export interface RegionPlan {
  /** The window the tile lies in: the part of the image the camera's projection covers. */
  window: Rect;
  /** True when the window is the whole image, so the camera needs no view offset. */
  whole: boolean;
  /** Viewport on the tile's render target, in its pixels from the bottom-left corner. */
  viewport: { x: number; y: number; width: number; height: number };
}

export function planRegion(width: number, height: number, rect: Rect, maxViewport: number): RegionPlan {
  checkSize(width, height);
  const window = viewportWindows(width, height, maxViewport).find(
    (w) => rect.x >= w.x && rect.y >= w.y && rect.x + rect.width <= w.x + w.width && rect.y + rect.height <= w.y + w.height,
  );
  if (!window || rect.width <= 0 || rect.height <= 0) throw new RangeError('Tile must lie inside one viewport window');
  return {
    window,
    whole: window.width === width && window.height === height,
    viewport: {
      x: window.x - rect.x,
      y: rect.y + rect.height - (window.y + window.height),
      width: window.width,
      height: window.height,
    },
  };
}

/** Copies a tile into the full image. */
export function placeTile(full: Pixels, rect: Rect, tile: Pixels): void {
  if (tile.width !== rect.width || tile.height !== rect.height) throw new RangeError('Tile does not fit its rectangle');
  for (let row = 0; row < rect.height; row++) {
    const src = row * rect.width * 4;
    const dst = ((rect.y + row) * full.width + rect.x) * 4;
    full.data.set(tile.data.subarray(src, src + rect.width * 4), dst);
  }
}

/** Reverses row order in place: graphics cards read pixels from the bottom row up. */
export function flipRows(image: Pixels): Pixels {
  const stride = image.width * 4;
  const tmp = new Uint8Array(stride);
  for (let top = 0, bottom = image.height - 1; top < bottom; top++, bottom--) {
    const a = top * stride;
    const b = bottom * stride;
    tmp.set(image.data.subarray(a, a + stride));
    image.data.copyWithin(a, b, b + stride);
    image.data.set(tmp, b);
  }
  return image;
}

/** Draws every rectangle and stitches them into one image. */
export function stitch(width: number, height: number, rects: readonly Rect[], draw: (rect: Rect) => Pixels): Pixels {
  const full: Pixels = { width, height, data: new Uint8Array(width * height * 4) };
  for (const rect of rects) placeTile(full, rect, draw(rect));
  return full;
}

export interface PixelDifference {
  /** Pixels where any channel differs. */
  differing: number;
  /** Largest difference in any channel, 0 to 255. */
  maxChannel: number;
  total: number;
}

/**
 * Pass mark for "stitched tiles match the frame drawn whole", agreed with the owner on 4 October
 * 2026. Geometry lines up exactly (vertex snapping), but the graphics card rounds shading across a
 * triangle slightly differently at a shifted position, so a handful of pixels can be one colour level
 * apart. A seam would show as differences along tile edges, so none is allowed there.
 */
export const TILE_TOLERANCE = { maxChannel: 1, maxShare: 0.0001, onSeam: 0 } as const;

export function tilesMatch(d: PixelDifference, onSeam: number): boolean {
  return d.maxChannel <= TILE_TOLERANCE.maxChannel && d.differing <= TILE_TOLERANCE.maxShare * d.total && onSeam <= TILE_TOLERANCE.onSeam;
}

/** Pixels that differ within one pixel of an edge between two of the given tiles. */
export function seamDifferences(a: Pixels, b: Pixels, rects: readonly Rect[]): number {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const r of rects) {
    if (r.x > 0) xs.add(r.x);
    if (r.y > 0) ys.add(r.y);
  }
  const near = (v: number, edges: Set<number>) => edges.has(v) || edges.has(v + 1);
  let count = 0;
  for (let p = 0; p < a.width * a.height; p++) {
    if (!near(p % a.width, xs) && !near(Math.floor(p / a.width), ys)) continue;
    for (let c = 0; c < 4; c++) {
      if (a.data[p * 4 + c] !== b.data[p * 4 + c]) {
        count++;
        break;
      }
    }
  }
  return count;
}

export function comparePixels(a: Pixels, b: Pixels): PixelDifference {
  if (a.width !== b.width || a.height !== b.height) throw new RangeError('Images differ in size');
  let differing = 0;
  let maxChannel = 0;
  for (let p = 0; p < a.width * a.height; p++) {
    let worst = 0;
    for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(a.data[p * 4 + c]! - b.data[p * 4 + c]!));
    if (worst > 0) differing++;
    maxChannel = Math.max(maxChannel, worst);
  }
  return { differing, maxChannel, total: a.width * a.height };
}
