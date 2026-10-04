import { decodeGenome, valueById } from './genome';

// The pigment and surface genes (loci 16 to 23) as the renderer reads them. They go from the decoder
// straight to the renderer, skipping the simulation (spec section 8), so changing them never regrows.

export interface Pigments {
  /** Hue of the first pigment, 0 to 360°. */
  readonly hueA: number;
  /** Hue of the second pigment, 0 to 360°. */
  readonly hueB: number;
  /** Colour strength, 0 to 1. */
  readonly saturation: number;
  /** Overall tone, 0.1 to 0.9. */
  readonly lightness: number;
  /** What the A-to-B gradient follows: the index of the gene's choice, 0 to 3. */
  readonly driver: number;
  /** How sharply A turns into B, 0 to 1. */
  readonly contrast: number;
  /** Surface from matt (0) to wet (1). */
  readonly gloss: number;
  /** Translucency and light emission, 0 to 1. */
  readonly glow: number;
}

/** Decodes the pigment genes of a valid code. */
export function pigmentsOf(code: string): Pigments {
  const d = decodeGenome(code);
  return {
    hueA: valueById(d, 'pigmentA'),
    hueB: valueById(d, 'pigmentB'),
    saturation: valueById(d, 'saturation'),
    lightness: valueById(d, 'lightness'),
    driver: valueById(d, 'gradientDriver'),
    contrast: valueById(d, 'gradientContrast'),
    gloss: valueById(d, 'gloss'),
    glow: valueById(d, 'glow'),
  };
}
