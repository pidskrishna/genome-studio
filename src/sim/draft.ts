import { KILL_LIMIT_OF_RADIUS } from '../genome';
import type { JobDone } from './host';
import { growSpeciesA, type BranchGeometry, type SpeciesAInput } from './speciesA';
import { speciesAParams, type SpeciesAParams } from './speciesA/params';
import { growSpeciesB, type SheetGeometry, type SpeciesBInput } from './speciesB';
import { speciesBParams, type SpeciesBParams } from './speciesB/params';
import { growSpeciesC, type PhylloGeometry, type SpeciesCInput } from './speciesC';
import { speciesCParams } from './speciesC/params';
import { growSpeciesD, type ShellGeometry, type SpeciesDInput } from './speciesD';
import { speciesDParams } from './speciesD/params';
import { growSpeciesE, type CoralGeometry, type SpeciesEInput } from './speciesE';
import { speciesEParams } from './speciesE/params';
import { growSpeciesF, type HyphaGeometry, type SpeciesFInput } from './speciesF';
import { speciesFParams } from './speciesF/params';

// The draft (spec section 6, clarification 3): a low-resolution run of the same code with the same
// algorithm, shown while a form gene's slider is dragged. It shares the organism's character and
// outline but not its fine detail, and is never mistaken for the organism: it is its own job, and the
// full run on release is the organism.
//
// Species A: twice the segment length D and an eighth of the attraction points, drawn from the same
// seed. Doubling D shrinks the envelope's volume in D³ by eight, so an eighth of the points keeps the
// same spacing between points: the sensing range (set in point spacings) is unchanged in D, with no
// cube root needed. Lengths set in physical terms (tip radius, twig shedding) halve with D, so twigs
// keep their size; the kill distance keeps its length in D and its envelope limit (clarification 5)
// is applied to the smaller envelope.
//
// Species B: twice the cell size, so about a quarter of the cells, with every rule unchanged.
//
// Species C (clarification 20): the same organ positions, with the coarsest organs and half the
// receptacle's rings and segments.
//
// Species D (clarification 20): half the rings and half the points around the generating curve.
//
// Species E (clarification 28): a lattice a third the size, every length a third, no corallites.
//
// Species F (clarification 28): tips grow three units per step for a third of the steps, drawn with four sides.

/** How much longer a draft's growth step (species A) or cells (species B) are than the organism's. */
export const DRAFT_SCALE = 2;
/** A species A draft never has fewer attraction points than this. */
export const DRAFT_MIN_POINTS = 24;

export function draftParamsA(full: SpeciesAParams): SpeciesAParams {
  const segmentLength = full.segmentLength * DRAFT_SCALE;
  // The envelope's radius in the draft's D, as speciesADerived works it out.
  const radius = 1 / segmentLength / full.aspect / 2;
  const scaleCubed = DRAFT_SCALE * DRAFT_SCALE * DRAFT_SCALE;
  return {
    ...full,
    segmentLength,
    pointCount: Math.max(DRAFT_MIN_POINTS, Math.floor(full.pointCount / scaleCubed + 0.5)),
    killDistance: Math.min(full.killDistance, KILL_LIMIT_OF_RADIUS * radius),
    tipRadius: full.tipRadius / DRAFT_SCALE,
    shedLength: full.shedLength / DRAFT_SCALE,
  };
}

export function draftParamsB(full: SpeciesBParams): SpeciesBParams {
  return { ...full, cellSize: full.cellSize * DRAFT_SCALE };
}

/** Worker job: a species A draft. */
export function* speciesADraft(input: SpeciesAInput): Generator<number, JobDone<BranchGeometry>> {
  const geometry = yield* growSpeciesA(draftParamsA(speciesAParams(input.code)));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.parents.buffer, geometry.radii.buffer, geometry.drivers.buffer],
  };
}

/** Worker job: a species B draft. */
export function* speciesBDraft(input: SpeciesBInput): Generator<number, JobDone<SheetGeometry>> {
  const geometry = yield* growSpeciesB(draftParamsB(speciesBParams(input.code)));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}

/** Worker job: a species C draft. */
export function* speciesCDraft(input: SpeciesCInput): Generator<number, JobDone<PhylloGeometry>> {
  const geometry = yield* growSpeciesC(speciesCParams(input.code), { draft: true });
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}

/** Worker job: a species D draft. */
export function* speciesDDraft(input: SpeciesDInput): Generator<number, JobDone<ShellGeometry>> {
  const geometry = yield* growSpeciesD(speciesDParams(input.code), { draft: true });
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}

/** Worker job: a species E draft. */
export function* speciesEDraft(input: SpeciesEInput): Generator<number, JobDone<CoralGeometry>> {
  const geometry = yield* growSpeciesE(speciesEParams(input.code), { draft: true });
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}

/** Worker job: a species F draft. */
export function* speciesFDraft(input: SpeciesFInput): Generator<number, JobDone<HyphaGeometry>> {
  const geometry = yield* growSpeciesF(speciesFParams(input.code), { draft: true });
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.parents.buffer, geometry.radii.buffer, geometry.drivers.buffer],
  };
}
