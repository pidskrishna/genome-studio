// Constants of encoding version 1 for species C. Changing any of these changes every organism, so
// recorded geometry hashes must be re-recorded (spec clarification 2).

/** Radius of the central zone, R0. Plane lengths are in these units. */
export const CENTRAL_RADIUS = 1;

/** Growth runs to this time, in units of R0 / V0 (clarification 23). The first organ ends e^20 R0 out. */
export const MATURITY_TIME = 20;

/** Γ over time (clarification 23, part III eq. 1): Γi with one starting organ, ... */
export const GAMMA_SEEDLING = 2.4;
/** ... and Γi = GAMMA_WHORL × sin(π / k) with k ≥ 2 starting organs. */
export const GAMMA_WHORL = 1.8;
/** t1 and τ of part III's eq. 1. */
export const GAMMA_T1 = 6;
export const GAMMA_TAU = 3;

/** Conicity 1/N per body plan (clarification 22): head, dome, cone, column. */
export const CONICITY = [1, 2, 3, 6] as const;

/** Hard cap on organs (section 4a). */
export const ORGAN_CAP = 2000;

/** Hard cap on vertices (section 4a), receptacle included. */
export const VERTEX_CAP = 120_000;

/**
 * A single organ's inhibition below this is not computed: it is too small to matter, and an organ
 * that has drifted so far that even its closest approach to the edge gives less is dropped for good.
 * With 2,000 organs the dropped terms sum to less than 2e-4 of the threshold.
 */
export const NEGLIGIBLE_INHIBITION = 1e-7;

/** Coarse samples of the edge of the central zone per organ width (Γ radians, at the gene's Γ). */
export const SAMPLES_PER_ORGAN = 4;
/** Never fewer coarse samples than this around the edge. */
export const MIN_SAMPLES = 32;

/**
 * Inhibition from organs beyond NEAR_RANGE d0 of the edge (at their closest approach) is smooth
 * around the edge, more so the farther the organ: it is computed at a few points per band and
 * interpolated around the edge, and at two times per new organ, linearly in between. Band i holds
 * organs from FAR_BANDS[i][0] d0 outward and uses FAR_BANDS[i][1] points. Organs nearer than
 * NEAR_RANGE d0 are computed exactly at every sample they reach.
 */
export const NEAR_RANGE = 1.5;
export const FAR_BANDS: readonly (readonly [number, number])[] = [
  [1.5, 128],
  [6, 96],
  [24, 48],
  [96, 16],
]

/** How many of the lowest sampled minima are refined when placing a new organ ... */
export const CANDIDATES = 4;
/** ... and while searching for its time. */
export const SEARCH_CANDIDATES = 2;

/** Golden-section steps that refine a minimum within one coarse sample spacing. */
export const REFINE_STEPS = 14;

/** Root-finding steps on the time of the next organ, after it has been bracketed. */
export const TIME_STEPS = 40;

/** Safety cap on bracketing doublings for one organ. */
export const BRACKET_CAP = 60;

/** Head height at a receptacle aspect of 1, in receptacle radii; scales with the aspect. */
export const HEAD_DOMING = 0.2;

/** Rings and segments of the receptacle surface. */
export const RECEPTACLE_RINGS = 48;
export const RECEPTACLE_SEGMENTS = 96;

/** The smallest organ, as a fraction of full size, so no organ shrinks to nothing near the apex. */
export const MIN_ORGAN_SCALE = 0.08;

/** Size variation also turns each organ by up to this many degrees, times the gene's value. */
export const ANGLE_VARIATION_DEGREES = 45;

/** Organ resolutions, finest first: points along the length, points across the width. */
export const ORGAN_RESOLUTIONS: readonly (readonly [number, number])[] = [
  [12, 7],
  [9, 5],
  [6, 4],
  [4, 3],
];

/** Organs are spread over their own window of this many neighbours each side to measure spacing. */
export const SPACING_WINDOW = 4;

/** The organ base sinks this fraction of the drawn thickness into the receptacle, so no gap shows. */
export const ORGAN_SINK = 0.5;
