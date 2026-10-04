import { decodeGenome, valueById } from '../../genome';
import { PI } from '../dmath';
import { AREA_MULTIPLE } from './constants';
import { startArea } from './shapes';

export const BODY_PLANS = ['disc', 'ring', 'tube', 'sphere'] as const;
export type BodyPlan = (typeof BODY_PLANS)[number];

/** Decoded species B parameters, in model units. Lengths are in starting radii unless stated. */
export interface SpeciesBParams {
  bodyPlan: BodyPlan;
  /** Growth at the margin ÷ growth in the interior. */
  marginBias: number;
  /** Sheet thickness h, in cell widths. */
  thickness: number;
  /** Mean rest-length increase per step. */
  growthRate: number;
  /** How far growth reaches in from the margin, in starting radii. */
  growthZone: number;
  /** −1 toward the margin, +1 along it. */
  anisotropy: number;
  stiffness: number;
  /** Repulsion radius, in cell widths. */
  personalSpace: number;
  repulsion: number;
  /** Out-of-plane starting noise, in starting radii. */
  startingRoughness: number;
  /** Scale of growth patches, in starting radii. */
  patchSize: number;
  patchContrast: number;
  /** −1 spreading flat, +1 rising. */
  lift: number;
  /** Relax passes per growth step. */
  relaxation: number;
  /** Edge split length as a fraction of final size. */
  cellSize: number;
  seed: number;
}

/**
 * Final size: the diameter of a disc with the final rest area, which is the area multiple times the
 * starting area. Cell size is a fraction of this (clarification 1), so every body plan ends with a
 * similar number of cells.
 */
export function finalSize(params: SpeciesBParams): number {
  return 2 * Math.sqrt((AREA_MULTIPLE * startArea(params.bodyPlan)) / PI);
}

/** The edge split length, in starting radii. One cell width. */
export function splitLength(params: SpeciesBParams): number {
  return params.cellSize * finalSize(params);
}

export function speciesBParams(code: string): SpeciesBParams {
  const decoded = decodeGenome(code);
  if (decoded.species !== 'B') throw new Error('Not a species B code');
  const v = (id: string) => valueById(decoded, id);
  return {
    bodyPlan: BODY_PLANS[v('bodyPlan')] ?? 'disc',
    marginBias: v('marginBias'),
    thickness: v('thickness'),
    growthRate: v('growthRate'),
    growthZone: v('growthZone'),
    anisotropy: v('anisotropy'),
    stiffness: v('stiffness'),
    personalSpace: v('personalSpace'),
    repulsion: v('repulsion'),
    startingRoughness: v('startingRoughness'),
    patchSize: v('patchSize'),
    patchContrast: v('patchContrast'),
    lift: v('lift'),
    relaxation: v('relaxation'),
    cellSize: v('cellSize'),
    seed: v('seed'),
  };
}
