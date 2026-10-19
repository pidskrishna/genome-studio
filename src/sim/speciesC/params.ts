import { decodeGenome, valueById } from '../../genome';
import { PI } from '../dmath';

export const BODY_PLANS = ['head', 'dome', 'cone', 'column'] as const;
export type BodyPlan = (typeof BODY_PLANS)[number];

export const ORGAN_FORMS = ['floret', 'scale', 'leaf', 'spine'] as const;
export type OrganForm = (typeof ORGAN_FORMS)[number];

/** Decoded species C parameters, in model units. Angles are in radians. */
export interface SpeciesCParams {
  bodyPlan: BodyPlan;
  /** Γ, the width of a new organ relative to the central zone (clarification 22). */
  gamma: number;
  organForm: OrganForm;
  /** η, the inhibition exponent. */
  falloff: number;
  startingOrgans: number;
  /** Receptacle height to radius; for the head, how domed the disc is. */
  aspect: number;
  /** Organ length in spacings between neighbouring organs. */
  organLength: number;
  /** Organ width to length. */
  organWidth: number;
  /** Angle between organ and receptacle surface. */
  organAngle: number;
  /** Bend along the organ's length, outward when positive. */
  organCurl: number;
  /** 0 flat to 1 a half tube. */
  organCupping: number;
  /** Fraction of the receptacle from the apex at which an organ reaches full size. */
  maturation: number;
  /** Drawn thickness as a fraction of organ length. */
  organThickness: number;
  /** 0 to 0.3. */
  sizeVariation: number;
  /** Largest jitter of each new organ's angle, in radians. */
  initiationNoise: number;
  seed: number;
}

const DEG = PI / 180;

export function speciesCParams(code: string): SpeciesCParams {
  const decoded = decodeGenome(code);
  if (decoded.species !== 'C') throw new Error('Not a species C code');
  const v = (id: string) => valueById(decoded, id);
  return {
    bodyPlan: BODY_PLANS[v('bodyPlan')] ?? 'head',
    gamma: v('inhibitionRange'),
    organForm: ORGAN_FORMS[v('organForm')] ?? 'floret',
    falloff: v('inhibitionFalloff'),
    startingOrgans: v('startingOrgans'),
    aspect: v('receptacleAspect'),
    organLength: v('organLength'),
    organWidth: v('organWidth'),
    organAngle: v('organAngle') * DEG,
    organCurl: v('organCurl') * DEG,
    organCupping: v('organCupping'),
    maturation: v('maturation'),
    organThickness: v('organThickness'),
    sizeVariation: v('sizeVariation'),
    initiationNoise: v('initiationNoise') * DEG,
    seed: v('seed'),
  };
}
