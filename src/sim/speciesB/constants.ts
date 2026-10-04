// Constants of encoding version 1 for species B. Changing any of these changes every organism, so
// recorded geometry hashes must be re-recorded (spec clarification 2).

/** Radius of the starting shape. Margin distances and "% of radius" genes are in these units. */
export const START_RADIUS = 1;

/** Inner radius of the ring body plan's starting annulus. */
export const RING_INNER_RADIUS = 0.5;

/** Length of the tube body plan's starting cylinder (its radius is START_RADIUS). */
export const TUBE_LENGTH = 2;

/** Growth stops when the total rest area reaches this multiple of the starting area (clarification 1). */
export const AREA_MULTIPLE = 4;

/** Hard cap on vertices (clarification 1). Growth stops when another split would exceed it. */
export const VERTEX_CAP = 40_000;

/** Safety cap on growth steps; normal growth reaches the area multiple long before this. */
export const STEP_CAP = 4000;

/** Starting edges are this fraction of the split length. */
export const START_EDGE_FRACTION = 0.75;

/** Out-of-plane noise is never below this, so a flat start can still buckle. In starting radii. */
export const MIN_ROUGHNESS = 1e-4;

/** Repulsion weight relative to stretch is r / (1 + r), with r = REPULSION_WEIGHT × repulsion ÷ stiffness. */
export const REPULSION_WEIGHT = 1;

/** Each pass pushes a touching pair apart by at most this fraction of the personal space each. */
export const REPULSION_STEP = 0.1;

/**
 * Two vertices repel only if they are this many personal-space radii apart along the sheet (in
 * material coordinates scaled by the mean growth), so neighbours within the sheet never push apart.
 */
export const REPULSION_SHEET_SEPARATION = 3;

/** Lift: each pass the growing margin asks to move this many cell widths up (rising) or outward along the sheet (spreading flat). */
export const LIFT_PER_PASS = 0.2;

/** Lift's weight relative to stretch is LIFT_WEIGHT × g / (1 + g), with g = |lift| ÷ stiffness. */
export const LIFT_WEIGHT = 0.5;

/** A hinge whose unfolded triangles are flatter than this (height / base) carries no bending. */
export const MIN_HINGE_HEIGHT = 0.05;

/** At most this many sweeps of Delaunay edge flips after each divide. */
export const FLIP_SWEEPS = 4;

/** No flip across a fold whose two triangles' normals are more than 60 degrees apart (cosine 0.5). */
export const FLIP_MIN_FOLD_COSINE = 0.5;

/** Relaxation passes run once more at maturity, with no growth, so the sheet settles. */
export const SETTLE_PASSES = 20;

/**
 * Shape guard: a triangle whose smallest angle falls below 15 degrees (cosine 0.9659…) gets a vote,
 * of this weight relative to stretch, to return to its rest shape, so no triangle is crushed flat.
 */
export const SHAPE_GUARD_COSINE = 0.9659258262890683;
export const SHAPE_GUARD_WEIGHT = 6;

/**
 * Anisotropy at ±1 makes growth along the margin and toward it differ by this much either side of
 * the mean: 0.5 gives 1.5 × and 0.5 ×, a ratio of 3. Stronger ratios ask for ruffles finer than a
 * cell, which the mesh cannot hold.
 */
export const ANISOTROPY_STRENGTH = 0.5;

/** No rest triangle may have an angle above 150 degrees (cosine −0.866…); see clampRestCaps. */
export const MAX_REST_ANGLE_COSINE = -0.8660254037844386;

/** At maturity, a triangle with an angle above 160 degrees (cosine −0.9397…) is re-triangulated. */
export const CAP_ANGLE_COSINE = -0.9396926207859084;
