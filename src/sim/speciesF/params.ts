import { decodeGenome, valueById } from '../../genome';
import { PI } from '../dmath';

/** Decoded species F parameters, in model units. Angles are in radians; lengths in units of tip growth per step. */
export interface SpeciesFParams {
  /** 0 colony, 1 cup, 2 closed, 3 flask, 4 mushroom. */
  programme: number;
  branchingThreshold: number;
  selfAvoidance: number;
  branchingProbability: number;
  persistence: number;
  orientationStrength: number;
  cupAngle: number;
  closingPull: number;
  stemLength: number;
  capAngle: number;
  capTurnLength: number;
  parallelTropism: number;
  spiralTwist: number;
  branchAngle: number;
  hyphaThickness: number;
  seed: number;
}

const RADIANS = PI / 180;

export function speciesFParams(code: string): SpeciesFParams {
  const decoded = decodeGenome(code);
  if (decoded.species !== 'F') throw new Error('Not a species F code');
  const v = (id: string) => valueById(decoded, id);
  return {
    programme: v('fruitBody'),
    branchingThreshold: v('branchingThreshold'),
    selfAvoidance: v('selfAvoidance'),
    branchingProbability: v('branchingProbability'),
    persistence: v('persistence'),
    orientationStrength: v('orientationStrength'),
    cupAngle: v('cupAngle') * RADIANS,
    closingPull: v('closingPull'),
    stemLength: Math.floor(v('stemLength') + 0.5),
    capAngle: v('capAngle') * RADIANS,
    capTurnLength: v('capTurnLength'),
    parallelTropism: v('parallelTropism'),
    spiralTwist: v('spiralTwist') * RADIANS,
    branchAngle: v('branchAngle') * RADIANS,
    hyphaThickness: v('hyphaThickness'),
    seed: v('seed'),
  };
}
