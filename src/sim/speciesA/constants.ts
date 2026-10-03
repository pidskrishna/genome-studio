// Constants of encoding version 1 for species A, and its fixed environment. Changing any of these
// changes every organism, so recorded geometry hashes must be re-recorded (spec clarification 2).

/** Segment length. All species A lengths are in units of D, as in the paper. */
export const D = 1;

/** Growth stops after this many steps whatever else happens (clarification 15). */
export const STEP_CAP = 4000;

/** A node whose summed growth direction is shorter than this does not grow (clarification 15). */
export const ZERO_DIRECTION = 1e-9;

/** A node does not grow a new node within this distance of one of its existing children. */
export const DUPLICATE_DISTANCE = 1e-6;

/** Several origins sit on a ring around the base of this radius, as a fraction of envelope radius. */
export const ORIGIN_RING = 0.15;

/** Fixed environment: vertical axis up, no neighbours, no obstacles, no changing light. */
export const UP: readonly [number, number, number] = [0, 1, 0];

/** Rejection-sampling attempts per attraction point before it falls back to the envelope axis. */
export const MAX_SAMPLE_ATTEMPTS = 10_000;

/** Fraction of the envelope radius that surface seeking at 1 confines points to. */
export const SURFACE_SHELL = 0.1;
