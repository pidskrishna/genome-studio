// Constants of encoding version 1 for species E. Changing any of these changes every organism, so
// recorded geometry hashes must be re-recorded (spec clarification 2). The fixed environment of
// section 4c lives here: the growth space, the source plane at its top (R = 1), the absorbing floor
// (R = 0) and the periodic sides (clarification 31).

/** The growth space is a cube of this many lattice units (section 4c; Merks et al. used 144 and 200). */
export const LATTICE = 96;

/** Growth stops when the colony's top reaches this fraction of the source plane's height ... */
export const TOP_FRACTION = 0.8;
/** ... or after this many growth steps, whichever comes first. */
export const STEP_CAP = 240;

/** Polyps while growing. Corallites are drawn by subdividing the final mesh, up to the vertex cap. */
export const GROWING_VERTEX_CAP = 30_000;
/** Hard cap on vertices in the output (section 4c). */
export const VERTEX_CAP = 120_000;

/** Mesh refinement (Merks et al. 2003): an edge splits at this multiple of the polyp spacing ... */
export const SPLIT_FACTOR = 1.5;
/** ... two vertices fuse below this multiple ... */
export const FUSE_FACTOR = 0.75;
/** ... and a triangle smaller than this multiple of the starting mean area is removed. */
export const AREA_FACTOR = 0.1;
/** Split passes per growth step, enough for any edge a growth step can stretch. */
export const SPLIT_PASSES = 4;
/** Fusion passes per growth step. */
export const FUSE_PASSES = 2;

/**
 * Kaandorp and Sloot's curvature rule, as Merks et al. describe it: growth is greatest where the
 * radius of curvature is below this multiple of the layer thickness ...
 */
export const CURVATURE_MIN = 2;
/** ... and none where it is above this multiple. */
export const CURVATURE_MAX = 20;

/** Multigrid V-cycles per growth step (clarification 29) ... */
export const CYCLES = 2;
/** ... red-black Gauss–Seidel sweeps before and after each coarsening ... */
export const SMOOTH = 2;
/** ... and on the coarsest grid. */
export const COARSE_SWEEPS = 16;

/** Surface smoothing of 1 moves a vertex this fraction of the way to its neighbours' mean, per step. */
export const SMOOTHING_GAIN = 0.5;
/** Vertices are kept this many lattice units inside the sides of the growth space. */
export const SIDE_MARGIN = 2;
/** The starting mesh is jittered by up to this fraction of the polyp spacing (seed stream 2). */
export const START_JITTER = 0.1;

/** The draft's lattice and lengths are this many times coarser (clarification 28). */
export const DRAFT_SCALE = 3;

/** Drawn thickness, as a fraction of the polyp spacing (clarification 27). */
export const DRAWN_THICKNESS = 0.25;
/** Corallites: subdivision passes at most, before the vertex cap ... */
export const CORALLITE_LEVELS = 2;
/** ... septa height as a fraction of the cup depth ... */
export const SEPTA_RELIEF = 0.6;
/** ... and the rim's half width, as a fraction of the cup radius. */
export const RIM_WIDTH = 0.35;
