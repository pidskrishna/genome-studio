import { detPow } from './decode';

// Quantities derived from several species A genes, shared by the decoder (for the kill-distance
// limit and the inspector) and by the simulation. Arithmetic and square roots only, so the results
// are the same on every machine. Lengths are in units of D, the segment length.

const PI = 3.141592653589793;

/** Kill distance is never above this fraction of the envelope's largest radius (clarification 5). */
export const KILL_LIMIT_OF_RADIUS = 0.25;
/** Kill distance is never above this multiple of the sensing range (clarification 5). */
export const KILL_LIMIT_OF_SENSING = 0.8;

/**
 * Radius of the envelope at normalised height s (0 bottom, 1 top), as a fraction of its largest
 * radius. Taper −1 is a cone (wide at the bottom), 0 a sphere, +1 an inverted cone; values between
 * blend the sphere with the cone.
 */
export function envelopeProfile(taper: number, s: number): number {
  const sphere = 2 * Math.sqrt(Math.max(0, s * (1 - s)));
  if (taper < 0) return (1 + taper) * sphere + -taper * (1 - s);
  return (1 - taper) * sphere + taper * s;
}

/**
 * The integral of envelopeProfile² over s from 0 to 1, in closed form. With a = 1 − |taper| and
 * b = |taper|: ∫ sphere² = 2/3, ∫ cone² = 1/3 and ∫ sphere × cone = π/8.
 */
export function profileSquareIntegral(taper: number): number {
  const b = Math.abs(taper);
  const a = 1 - b;
  return (a * a * 2) / 3 + (2 * a * b * PI) / 8 + (b * b) / 3;
}

export interface SpeciesADerived {
  /** Envelope height, 1 / segment length. */
  height: number;
  /** Largest envelope radius, height / aspect / 2. */
  radius: number;
  /** Height of the envelope's bottom above the base. */
  bottom: number;
  volume: number;
  /** N, the number of attraction points, as a whole number. */
  pointCount: number;
  /** Mean spacing between attraction points: the cube root of the envelope volume per point. */
  spacing: number;
  /** Radius of influence in D: the sensing range gene (in point spacings) × the spacing. */
  sensingRange: number;
  /** Kill distance in D, after both limits of clarification 5. */
  killDistance: number;
  /** Which limit, if any, reduced the kill distance. */
  killLimitedBy: 'sensing range' | 'envelope' | null;
}

/** Derived quantities from species A model values, indexed by locus − 1 (kill distance unclamped). */
export function speciesADerived(values: readonly number[]): SpeciesADerived {
  const v = (locus: number) => values[locus - 1] as number;
  const height = 1 / v(6);
  const radius = height / v(1) / 2;
  const bottom = v(9) * height;
  const volume = PI * radius * radius * height * profileSquareIntegral(v(8));
  const pointCount = Math.floor(v(3) + 0.5);
  const spacing = detPow(volume / pointCount, 1 / 3);
  const sensingRange = v(4) * spacing;
  const bySensing = KILL_LIMIT_OF_SENSING * sensingRange;
  const byEnvelope = KILL_LIMIT_OF_RADIUS * radius;
  const gene = v(5);
  const killDistance = Math.min(gene, bySensing, byEnvelope);
  const killLimitedBy = killDistance === gene ? null : bySensing <= byEnvelope ? 'sensing range' : 'envelope';
  return { height, radius, bottom, volume, pointCount, spacing, sensingRange, killDistance, killLimitedBy };
}
