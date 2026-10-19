// Constants of encoding version 1 for species D. Changing any of these changes every organism, so
// recorded geometry hashes must be re-recorded (spec clarification 2).

/** Growth stops when the generating curve reaches this multiple of its starting size ... */
export const SIZE_MULTIPLE = 200;
/** ... or after this many whorls, whichever comes first (section 4b, maturity). */
export const WHORL_CAP = 10;

/** Hard cap on vertices (section 4b). */
export const VERTEX_CAP = 120_000;

/** Points around the generating curve, evenly spaced along it (Fowler et al., section 2.4). */
export const CURVE_POINTS = 128;
/** Rings laid down per turn, before the vertex cap ... */
export const RINGS_PER_TURN = 120;
/** ... and never fewer rings than this in all. */
export const MIN_RINGS = 240;

/** Steps of the ellipse table used to space points evenly along the generating curve. */
export const CURVE_TABLE_STEPS = 2048;

/** Units of time the edge pattern advances per ring (section 4b, clarification 24) ... */
export const PATTERN_STEPS_PER_RING = 8;
/**
 * ... each in this many forward Euler steps. With ν = 0 the substrate piles up between stripes, and
 * where one ignites a whole unit step overshoots the autocatalysis: about 3% of seeds blew up to
 * NaN over 7,500 units. Half steps already kept all of 300 seeds bounded; quarter steps leave margin.
 */
export const PATTERN_SUBSTEPS = 4;
/**
 * Meinhardt's activator–substrate model (Fowler et al., eq. 8) with their figure 11 constants:
 * ∂a/∂t = ρ s (a² / (1 + κ a²) + ρ0) − μ a + Da ∂²a/∂x², ∂s/∂t = σ − ρ s (a² / (1 + κ a²) + ρ0) − ν s + Ds ∂²s/∂x².
 */
export const PATTERN = {
  rho: 0.01,
  /** ρ varies by up to this fraction per cell, from the seed. */
  rhoNoise: 0.025,
  kappa: 0,
  rho0: 0.001,
  mu: 0.01,
  da: 0.002,
  sigma: 0.015,
  nu: 0,
  ds: 0.4,
} as const;

/** The aperture flare acts over this last fraction of a turn ... */
export const FLARE_TURNS = 0.15;
/** ... and widens the curve by up to this fraction at a flare of 1. */
export const FLARE_GAIN = 0.6;

/** Growth irregularity of 1 varies each ring's size by up to this fraction. */
export const IRREGULARITY_AMPLITUDE = 0.04;

/** Draft (clarification 20): this fraction of the points around the curve and of the rings. */
export const DRAFT_FRACTION = 0.5;
