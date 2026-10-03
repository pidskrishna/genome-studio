import { GeometryHash } from '../hash';
import type { JobDone } from '../host';
import { colonise, type StopReason } from './colonise';
import { STEP_CAP } from './constants';
import { envelopeOf, originPositions, samplePoints, type Envelope } from './envelope';
import { speciesAParams, type SpeciesAParams } from './params';
import { gradientDrivers, pipeRadii, relocate, shedTwigs, subdivide } from './postprocess';
import type { Tree } from './tree';

export interface SpeciesAInput {
  code: string;
}

/** Plain geometry data for species A. Lengths are in units of D; y is up. */
export interface BranchGeometry {
  /** xyz per node. */
  positions: Float64Array;
  /** Parent of each node, −1 for a starting node. Parents come before children. */
  parents: Int32Array;
  /** Branch radius at each node. */
  radii: Float64Array;
  /** Four values per node: distance from base, branch radius, branch order, height. */
  drivers: Float64Array;
  envelope: Envelope;
  stats: { steps: number; stopReason: StopReason; pointCount: number; pointsLeft: number; grownNodes: number };
  /** Geometry hash over positions, parents, radii and drivers. */
  hash: string;
}

export function hashBranchGeometry(g: Pick<BranchGeometry, 'positions' | 'parents' | 'radii' | 'drivers'>): string {
  return new GeometryHash().addFloat64Array(g.positions).addIntArray(g.parents).addFloat64Array(g.radii).addFloat64Array(g.drivers).digest();
}

/** Grows species A from decoded parameters. Yields progress from 0 to 1. */
export function* growSpeciesA(params: SpeciesAParams): Generator<number, BranchGeometry> {
  const envelope = envelopeOf(params);
  const points = samplePoints(params, envelope);
  const grower = colonise({
    points,
    origins: originPositions(params.origins, envelope),
    sensingRange: params.sensingRange,
    killDistance: params.killDistance,
    tropism: params.tropism,
    stepCap: STEP_CAP,
  });
  let step = grower.next();
  while (!step.done) {
    yield 0.9 * step.value;
    step = grower.next();
  }
  const grown = step.value;

  let tree: Tree = shedTwigs(grown, params.shedLength);
  tree = relocate(tree, params.relaxation);
  for (let pass = 0; pass < params.smoothingPasses; pass++) tree = subdivide(tree);
  yield 0.95;

  const n = tree.parent.length;
  const positions = new Float64Array(n * 3);
  for (let v = 0; v < n; v++) {
    positions[v * 3] = tree.x[v] as number;
    positions[v * 3 + 1] = tree.y[v] as number;
    positions[v * 3 + 2] = tree.z[v] as number;
  }
  const parents = Int32Array.from(tree.parent);
  const radii = pipeRadii(tree, params.tipRadius, params.pipeExponent);
  const drivers = gradientDrivers(tree, radii);
  return {
    positions,
    parents,
    radii,
    drivers,
    envelope,
    stats: {
      steps: grown.steps,
      stopReason: grown.stopReason,
      pointCount: points.length / 3,
      pointsLeft: grown.pointsLeft,
      grownNodes: grown.parent.length,
    },
    hash: hashBranchGeometry({ positions, parents, radii, drivers }),
  };
}

/** Worker job: grows a species A code. */
export function* speciesA(input: SpeciesAInput): Generator<number, JobDone<BranchGeometry>> {
  const geometry = yield* growSpeciesA(speciesAParams(input.code));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.parents.buffer, geometry.radii.buffer, geometry.drivers.buffer],
  };
}
