// Constants of encoding version 1 for species B. Changing any of these changes every organism, so
// recorded geometry hashes must be re-recorded (spec clarification 2).

/** Radius of the starting shape. Margin distances and "% of radius" genes are in these units. */
export const START_RADIUS = 1;

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

/** Stiffness scales: stretch k = stiffness × h × STRETCH_SCALE, bending k = stiffness × h³ × BEND_SCALE. */
export const STRETCH_SCALE = 1;
export const BEND_SCALE = 1;
/** Repulsion k = repulsion gene × REPULSION_SCALE. Each k becomes a correction fraction k / (1 + k). */
export const REPULSION_SCALE = 1;

/**
 * Two vertices repel only if they are this many personal-space radii apart along the sheet (in
 * material coordinates scaled by the mean growth), so neighbours within the sheet never push apart.
 */
export const REPULSION_SHEET_SEPARATION = 3;

/** Per growth step, lift raises the growing margin by this many cell widths at lift +1. */
export const RISE_PER_STEP = 0.05;
/** Per growth step, lift −1 pulls the sheet this fraction of the way back to its starting plane. */
export const FLATTEN_PER_STEP = 0.05;

/** A hinge whose unfolded triangles are flatter than this (height / base) carries no bending. */
export const MIN_HINGE_HEIGHT = 0.05;
