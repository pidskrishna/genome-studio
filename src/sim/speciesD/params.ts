import { decodeGenome, valueById } from '../../genome';
import { PI } from '../dmath';

/** Decoded species D parameters, in model units. Angles are in radians. */
export interface SpeciesDParams {
  /** W, growth of the curve per turn. */
  expansion: number;
  /** T, movement along the axis per unit distance from it. */
  translation: number;
  /** D, inner to outer edge distance of the curve from the axis. */
  axisDistance: number;
  /** S, height to width of the generating curve. */
  shape: number;
  tilt: number;
  left: boolean;
  ribCount: number;
  /** Fractions of the curve's radius. */
  ribHeight: number;
  /** Fraction of the rib spacing. */
  ribWidth: number;
  cordCount: number;
  cordHeight: number;
  nodules: number;
  flare: number;
  /** Fraction of the curve's radius. */
  wallThickness: number;
  irregularity: number;
  seed: number;
}

export function speciesDParams(code: string): SpeciesDParams {
  const decoded = decodeGenome(code);
  if (decoded.species !== 'D') throw new Error('Not a species D code');
  const v = (id: string) => valueById(decoded, id);
  return {
    expansion: v('whorlExpansion'),
    translation: v('translation'),
    axisDistance: v('axisDistance'),
    shape: v('apertureShape'),
    tilt: (v('apertureTilt') * PI) / 180,
    left: v('handedness') === 1,
    ribCount: v('ribCount'),
    ribHeight: v('ribHeight'),
    ribWidth: v('ribWidth'),
    cordCount: v('cordCount'),
    cordHeight: v('cordHeight'),
    nodules: v('nodules'),
    flare: v('apertureFlare'),
    wallThickness: v('wallThickness'),
    irregularity: v('growthIrregularity'),
    seed: v('seed'),
  };
}
