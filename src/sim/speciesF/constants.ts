// Constants of encoding version 1 for species F. Changing any of these changes every organism, so
// recorded geometry hashes must be re-recorded (spec clarification 2). The fixed environment of
// section 4d is the vertical orientation field, pointing up (y).

/** Each section's field is lc times its mean over its points (Meškauskas et al. 2004, eq. 3). */
export const LC = 0.5;
/** Distances in the fields are softened by this many units, so two tips at one point stay finite. */
export const SOFTENING = 10;
/** Opening angle of the Barnes–Hut tree that sums the fields (clarification 29). */
export const THETA = 0.5;
/** Points per leaf of that tree. */
export const LEAF_SIZE = 8;

/** A tip grows only while the density field is below this multiple of the branching threshold (clarification 34). */
export const GROW_MULTIPLE = 5;
/** The orientation push acts only outside this tolerance of the target angle, in radians (eq. 12; 5°). */
export const ORIENT_TOLERANCE = (5 * 3.141592653589793) / 180;

/** Phase lengths in time units (figures 5 to 8): the colony programme ... */
export const COLONY_TIME = 120;
/** ... the flat colony that starts every other programme (figure 7A: 100) ... */
export const FLAT_TIME = 60;
/** ... the cup (figure 7B: 200) ... */
export const CUP_TIME = 120;
/** ... the closing pull ... */
export const CLOSE_TIME = 100;
/** ... the flask's neck ... */
export const NECK_TIME = 80;
/** In the neck the closing pull is reduced to this fraction (figure 7C). */
export const NECK_PULL = 0.5;
/** ... and the cap, after the stem (locus 9). */
export const CAP_TIME = 160;

/** Hard caps (section 4d): growing tips ... */
export const TIP_CAP = 4_000;
/** ... segments of one unit ... */
export const SEGMENT_CAP = 80_000;
/** ... and vertices of the drawn tubes, estimated as nodes × sides plus a cap at each tip. */
export const VERTEX_CAP = 200_000;
/** Sides of each drawn hypha, as the branch renderer draws them. */
export const DRAWN_SIDES = 8;
