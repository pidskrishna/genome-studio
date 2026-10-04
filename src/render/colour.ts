import type { Pigments } from '../genome';

// How the pigment genes colour the organism, per look (spec section 7). Pure functions: the stage
// fills one colour per mesh vertex from these whenever the organism, the look or a pigment changes,
// so a pigment edit only rewrites a vertex attribute and redraws.
//
// The gradient: each mesh vertex carries the four gradient-driver values of the node (species A) or
// sheet vertex (species B) it was built from. The chosen driver is scaled to 0..1 over the organism,
// then turned into a weight from pigment A (0) to pigment B (1) whose sharpness is the contrast gene.

export type LookId = 'plate' | 'fluorescence' | 'glossy';

export const LOOKS: readonly LookId[] = ['plate', 'fluorescence', 'glossy'];

export const LOOK_NAMES: Readonly<Record<LookId, string>> = {
  plate: 'Monochrome plate',
  fluorescence: 'Fluorescence microscope',
  glossy: 'Glossy render',
};

/** Number of gradient-driver values per node or sheet vertex. */
export const DRIVERS = 4;

/** Share of values cut off at each end when a driver is scaled to 0..1, so outliers do not flatten it. */
export const DRIVER_TAIL = 0.01;

/**
 * Scales each driver to 0..1 over the organism, between its 1st and 99th percentiles (clamped
 * outside). A driver with no spread maps to 0.5.
 */
export function normaliseDrivers(drivers: ArrayLike<number>, count = DRIVERS): Float32Array {
  const n = Math.floor(drivers.length / count);
  const out = new Float32Array(n * count);
  const column = new Float64Array(n);
  for (let c = 0; c < count; c++) {
    for (let i = 0; i < n; i++) {
      const v = drivers[i * count + c]!;
      column[i] = Number.isFinite(v) ? v : 0;
    }
    const sorted = column.slice().sort();
    const lo = n > 0 ? sorted[Math.floor(DRIVER_TAIL * (n - 1))]! : 0;
    const hi = n > 0 ? sorted[Math.ceil((1 - DRIVER_TAIL) * (n - 1))]! : 0;
    const span = hi - lo;
    for (let i = 0; i < n; i++) {
      out[i * count + c] = span > 0 ? Math.min(1, Math.max(0, (column[i]! - lo) / span)) : 0.5;
    }
  }
  return out;
}

/**
 * Weight of pigment B at a driver position t in 0..1. Contrast 0 blends A into B across the whole
 * range; contrast 1 turns A into B over the middle 5% of it.
 */
export function gradientWeight(t: number, contrast: number): number {
  const width = 1 - 0.95 * Math.min(1, Math.max(0, contrast));
  const s = Math.min(1, Math.max(0, (t - 0.5) / width + 0.5));
  return s * s * (3 - 2 * s);
}

/** Hue in degrees from A towards B along the shorter way round the colour wheel. */
export function mixHue(a: number, b: number, w: number): number {
  let d = (((b - a) % 360) + 540) % 360 - 180;
  if (d === -180) d = 180;
  return (((a + d * w) % 360) + 360) % 360;
}

/** HSL (hue in degrees, saturation and lightness 0..1) to sRGB, 0..1. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Lightness the fluorescence look uses for every hue: full colour, so hue and saturation read as light. */
export const FLUORESCENCE_LIGHTNESS = 0.5;

/**
 * Ink tones of the monochrome plate at the A and B ends of the gradient, 0 (black) to 1 (paper).
 * Hue is ignored: A takes the lightness gene and B is a denser ink, 0.35 of it, so the gradient
 * always runs from lighter to darker and changes smoothly with lightness.
 */
export function plateTones(lightness: number): [number, number] {
  return [lightness, 0.35 * lightness];
}

/**
 * One colour per node or sheet vertex for a look, as linear RGB (three values each):
 * - glossy: the pigment colour, HSL(hue along the gradient, saturation, lightness);
 * - fluorescence: the emitted colour, HSL(hue along the gradient, saturation, 0.5);
 * - plate: the ink tone along the gradient, stored as a grey (r = g = b = tone, not linearised).
 */
export function nodeColours(drivers01: Float32Array, p: Pigments, look: LookId): Float32Array {
  const n = drivers01.length / DRIVERS;
  const out = new Float32Array(n * 3);
  const driver = Math.min(DRIVERS - 1, Math.max(0, Math.round(p.driver)));
  const [toneA, toneB] = plateTones(p.lightness);
  for (let i = 0; i < n; i++) {
    const w = gradientWeight(drivers01[i * DRIVERS + driver]!, p.contrast);
    if (look === 'plate') {
      const tone = toneA + (toneB - toneA) * w;
      out[i * 3] = tone;
      out[i * 3 + 1] = tone;
      out[i * 3 + 2] = tone;
      continue;
    }
    const l = look === 'fluorescence' ? FLUORESCENCE_LIGHTNESS : p.lightness;
    const [r, g, b] = hslToRgb(mixHue(p.hueA, p.hueB, w), p.saturation, l);
    out[i * 3] = srgbToLinear(r);
    out[i * 3 + 1] = srgbToLinear(g);
    out[i * 3 + 2] = srgbToLinear(b);
  }
  return out;
}

/** Spreads per-node colours to mesh vertices: vertex v takes the colour of node source[v]. */
export function vertexColours(nodes: Float32Array, source: Uint32Array, out: Float32Array = new Float32Array(source.length * 3)): Float32Array {
  for (let v = 0; v < source.length; v++) {
    const s = source[v]! * 3;
    out[v * 3] = nodes[s]!;
    out[v * 3 + 1] = nodes[s + 1]!;
    out[v * 3 + 2] = nodes[s + 2]!;
  }
  return out;
}
