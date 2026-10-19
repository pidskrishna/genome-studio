import { specimenName } from '../genome';

// Export sizes and file names (spec section 9; clarifications 12 and 13). Pure, so they can be tested.

export type Preset = 'A4' | 'A3' | 'A2' | 'custom';
export type Orientation = 'portrait' | 'landscape' | 'square';

/** Paper sizes at 300 dpi, portrait (spec section 9). */
export const PRESETS: Readonly<Record<Exclude<Preset, 'custom'>, { width: number; height: number }>> = {
  A4: { width: 2480, height: 3508 },
  A3: { width: 3508, height: 4961 },
  A2: { width: 4961, height: 7016 },
};

export const DPI = 300;
/** Largest side the exporter accepts, in pixels (well past A2; memory, not the graphics card, limits it). */
export const MAX_SIDE = 20_000;

/**
 * The pixel size of an export. Landscape swaps a preset's sides; square takes the short edge on both
 * sides (clarification 13: A4 square is 2,480 × 2,480). Custom sizes are whole pixels from 1 to MAX_SIDE.
 */
export function exportSize(preset: Preset, orientation: Orientation, custom = { width: 2480, height: 3508 }): { width: number; height: number } {
  const clampSide = (n: number): number => Math.min(MAX_SIDE, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));
  const base = preset === 'custom' ? { width: clampSide(custom.width), height: clampSide(custom.height) } : PRESETS[preset];
  const short = Math.min(base.width, base.height);
  const long = Math.max(base.width, base.height);
  if (orientation === 'square') return { width: short, height: short };
  if (preset === 'custom') return base;
  return orientation === 'landscape' ? { width: long, height: short } : { width: short, height: long };
}

/** Printed size at 300 dpi, in millimetres, to one decimal place. */
export function printedSize(width: number, height: number): { width: number; height: number } {
  const mm = (px: number): number => Math.round(((px / DPI) * 25.4) * 10) / 10;
  return { width: mm(width), height: mm(height) };
}

/**
 * The file name: the specimen name and the start of the code (clarification 12), safe on every
 * system. The full code is in the PNG's metadata and in the methods file.
 */
export function exportFileName(code: string): string {
  const name = specimenName(code).full.replace(/\s+/g, '-');
  return `${name}-${code.slice(0, 12)}`;
}

/** Keeps a typed file name to letters, digits, spaces, hyphens, underscores and full stops. */
export function cleanFileName(typed: string, fallback: string): string {
  const cleaned = typed.trim().replace(/\.png$/i, '').replace(/[^\p{L}\p{N} ._-]+/gu, '-').replace(/^[.\s-]+/, '');
  return cleaned === '' ? fallback : cleaned.slice(0, 120);
}
