import { decodeGenome, valueById } from '../../genome';

/** Decoded species A parameters, in model units. Lengths are in units of D. */
export interface SpeciesAParams {
  /** Envelope height to width. */
  aspect: number;
  /** Vertical growth bias, g = (0, tropism, 0). */
  tropism: number;
  /** N, the number of attraction points. */
  pointCount: number;
  /** Radius of influence, in D. */
  sensingRange: number;
  /** Kill distance, in D, already limited to 0.8 × the sensing range. */
  killDistance: number;
  /** D as a fraction of envelope height. */
  segmentLength: number;
  /** 0 uniform, 1 crowded near the envelope. */
  surfaceSeeking: number;
  /** −1 cone, 0 sphere, +1 inverted cone. */
  taper: number;
  /** Gap between base and envelope, as a fraction of envelope height. */
  clearStem: number;
  /** Number of starting nodes. */
  origins: number;
  /** n in r^n = r1^n + r2^n. */
  pipeExponent: number;
  /** Radius of terminal branches, in D. */
  tipRadius: number;
  /** Strength of node relocation toward the base, 0 to 1. */
  relaxation: number;
  /** Curve subdivision passes, 0 to 3. */
  smoothingPasses: number;
  /** Terminal branches shorter than this, in D, are removed. */
  shedLength: number;
  /** Seed for point placement. */
  seed: number;
}

export function speciesAParams(code: string): SpeciesAParams {
  const decoded = decodeGenome(code);
  if (decoded.species !== 'A') throw new Error('Not a species A code');
  const v = (id: string) => valueById(decoded, id);
  return {
    aspect: v('habitAspect'),
    tropism: v('tropism'),
    pointCount: Math.floor(v('spaceDensity') + 0.5),
    sensingRange: v('sensingRange'),
    killDistance: v('clearance'),
    segmentLength: v('segmentLength'),
    surfaceSeeking: v('surfaceSeeking'),
    taper: v('habitTaper'),
    clearStem: v('clearStem'),
    origins: v('origins'),
    pipeExponent: v('pipeExponent'),
    tipRadius: v('tipRadius'),
    relaxation: v('angleRelaxation'),
    smoothingPasses: v('limbSmoothing'),
    shedLength: v('twigShedding'),
    seed: v('seed'),
  };
}
