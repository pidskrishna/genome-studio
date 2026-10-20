import { CHECKSUM_START, GENE_BASES, GENE_COUNT, geneTable, KILL_LIMIT_OF_RADIUS, KILL_LIMIT_OF_SENSING, SEED_BASES, type GeneDef, type SpeciesId } from '../genome';
import { DRAFT_SCALE } from '../sim/draft';
import { ORIGIN_RING, STEP_CAP as STEP_CAP_A, SURFACE_SHARE, SURFACE_SHELL } from '../sim/speciesA/constants';
import { ANISOTROPY_STRENGTH, AREA_MULTIPLE, REPULSION_SHEET_SEPARATION, SETTLE_PASSES, STEP_CAP as STEP_CAP_B, VERTEX_CAP } from '../sim/speciesB/constants';
import {
  CONICITY,
  GAMMA_SEEDLING,
  GAMMA_T1,
  GAMMA_TAU,
  GAMMA_WHORL,
  MATURITY_TIME,
  MIN_ORGAN_SCALE,
  NEAR_RANGE,
  NEGLIGIBLE_INHIBITION,
  ORGAN_CAP,
  SAMPLES_PER_ORGAN,
  VERTEX_CAP as VERTEX_CAP_C,
} from '../sim/speciesC/constants';
import {
  CURVE_POINTS,
  FLARE_GAIN,
  FLARE_TURNS,
  IRREGULARITY_AMPLITUDE,
  MIN_RINGS,
  PATTERN,
  PATTERN_STEPS_PER_RING,
  PATTERN_SUBSTEPS,
  RINGS_PER_TURN,
  SIZE_MULTIPLE,
  WHORL_CAP,
} from '../sim/speciesD/constants';
import {
  AREA_FACTOR,
  CORALLITE_LEVELS,
  CURVATURE_MAX,
  CURVATURE_MIN,
  CYCLES,
  DRAFT_SCALE as DRAFT_SCALE_E,
  FUSE_FACTOR,
  GROWING_VERTEX_CAP,
  LATTICE,
  SIDE_MARGIN,
  SPLIT_FACTOR,
  STEP_CAP as STEP_CAP_E,
  TOP_FRACTION,
  VERTEX_CAP as VERTEX_CAP_E,
} from '../sim/speciesE/constants';
import {
  CAP_TIME,
  CLOSE_TIME,
  COLONY_TIME,
  CUP_TIME,
  DRAFT_STEP,
  FLAT_TIME,
  GROW_MULTIPLE,
  LC,
  NECK_PULL,
  NECK_TIME,
  SEGMENT_CAP,
  SOFTENING,
  THETA,
  TIP_CAP,
  VERTEX_CAP as VERTEX_CAP_F,
} from '../sim/speciesF/constants';
import { formatValue, SPECIES_NAMES } from './gene-info';

// The Methods page's content (spec section 10): which parts are published models and which are
// designed, each model and its equations, the additions to the published procedures, every gene with
// its range and scale, the references and the limits. Plain data, so it can be tested without a DOM;
// numbers come from the code's own constants, so the page cannot drift from what the tool does.

export const REFERENCES = {
  runions2005: 'Runions, Fuhrer, Lane, Federl, Rolland-Lagan and Prusinkiewicz (2005), Modeling and visualization of leaf venation patterns, ACM Transactions on Graphics 24(3):702–711. https://www.algorithmicbotany.org/papers/venation.sig2005.pdf',
  runions2007: 'Runions, Lane and Prusinkiewicz (2007), Modeling Trees with a Space Colonization Algorithm, Eurographics Workshop on Natural Phenomena. https://www.algorithmicbotany.org/papers/colonization.egwnp2007.pdf',
  nath2003: 'Nath, Crawford, Carpenter and Coen (2003), Genetic Control of Surface Curvature, Science 299:1404–1407. http://doi.org/10.1126/science.1079354',
  sharon2010: 'Sharon and Efrati (2010), The mechanics of non-Euclidean plates, Soft Matter 6:5693–5704.',
  douady1996: 'Douady and Couder (1996), Phyllotaxis as a dynamical self organizing process, parts I to III, Journal of Theoretical Biology 178:255–312.',
  prusinkiewicz1990: 'Prusinkiewicz and Lindenmayer (1990), The Algorithmic Beauty of Plants, chapter 4: Phyllotaxis. Springer. http://algorithmicbotany.org/papers/abop/abop.pdf',
  vogel1979: 'Vogel (1979), A better way to construct the sunflower head, Mathematical Biosciences 44:179–189.',
  raup1965: 'Raup and Michelson (1965), Theoretical morphology of the coiled shell, Science 147:1294–1295.',
  raup1966: 'Raup (1966), Geometric analysis of shell coiling: general problems, Journal of Paleontology 40:1178–1190.',
  fowler1992: 'Fowler, Meinhardt and Prusinkiewicz (1992), Modeling seashells, Computer Graphics 26(2):379–387 (SIGGRAPH ’92). https://www.algorithmicbotany.org/papers/shells.sig92.html',
  meinhardt1987: 'Meinhardt and Klingler (1987), A model for pattern formation on the shells of molluscs, Journal of Theoretical Biology 126:63–89.',
  kaandorp1994: 'Kaandorp (1994), Fractal Modelling: Growth and Form in Biology. Springer.',
  kaandorpSloot2001: 'Kaandorp and Sloot (2001), Morphological models of radiate accretive growth and the influence of hydrodynamics, Journal of Theoretical Biology 209:257–274.',
  merks2003: 'Merks, Hoekstra, Kaandorp and Sloot (2003), Models of coral growth: spontaneous branching, compactification and the Laplacian growth assumption, Journal of Theoretical Biology 224:153–166. https://doi.org/10.1016/S0022-5193(03)00140-1',
  kaandorp2005: 'Kaandorp, Sloot, Merks, Bak, Vermeij and Maier (2005), Morphogenesis of the branching reef coral Madracis mirabilis, Proceedings of the Royal Society B 272:127–133. https://pmc.ncbi.nlm.nih.gov/articles/PMC1634949',
  meyer2002: 'Meyer, Desbrun, Schröder and Barr (2002), Discrete differential-geometry operators for triangulated 2-manifolds, in Visualization and Mathematics III, Springer.',
  meskauskas2004a: 'Meškauskas, McNulty and Moore (2004), Concerted regulation of all hyphal tips generates fungal fruit body structures: experiments with computer visualizations produced by a new mathematical model of hyphal growth, Mycological Research 108:341–353. https://doi.org/10.1017/S0953756204009670',
  meskauskas2004b: 'Meškauskas, Fricker and Moore (2004), Simulating colonial growth of fungi with the Neighbour-Sensing model of hyphal growth, Mycological Research 108:1241–1256. https://doi.org/10.1017/S0953756204001261',
} as const;

export type Status = 'Published model' | 'Published method' | 'Published rule' | 'Published mechanism, approximate simulation' | 'Textbook structure' | 'Designed abstraction' | 'Designed extension' | 'Designed' | 'Numerical choice' | 'Model parameter' | 'Appearance' | 'Encoding';

export interface GroundingRow {
  part: string;
  status: Status;
  basis: string;
}

/** Spec section 10's table: what is published and what is designed. */
export const GROUNDING: readonly GroundingRow[] = [
  { part: 'Branching growth (species A)', status: 'Published model', basis: 'Runions, Lane and Prusinkiewicz 2007; Runions et al. 2005. Implemented as written, with the additions listed below.' },
  { part: 'Branch thickness', status: 'Published rule', basis: 'The pipe model, as used in the 2007 paper; exponent between 2 and 3.' },
  { part: 'Ruffling from marginal growth (species B)', status: 'Published mechanism, approximate simulation', basis: 'Nath et al. 2003; Sharon and Efrati 2010. A spring-mesh approximation of thin-sheet elasticity.' },
  { part: 'Organ arrangement (species C)', status: 'Published model', basis: 'Douady and Couder 1996 (the threshold model of part II, with Γ falling over time as in part III), after the rule of Hofmeister and of Snow and Snow. Implemented as written, with the additions listed below.' },
  { part: 'Receptacles and organ shapes (species C)', status: 'Published method', basis: 'Designed geometry after Prusinkiewicz and Lindenmayer 1990, chapter 4: organs are given shapes and sizes that change with their position.' },
  { part: 'Shell coiling (species D)', status: 'Published model', basis: 'Raup and Michelson 1965; Raup 1966; built as a sweep as in Fowler, Meinhardt and Prusinkiewicz 1992.' },
  { part: 'Shell ribs and cords (species D)', status: 'Published method', basis: 'Fowler, Meinhardt and Prusinkiewicz 1992, section 2.5: displacement along the surface normal, in proportion to the size of the generating curve.' },
  { part: 'Shell edge pattern (species D)', status: 'Published mechanism, approximate simulation', basis: 'Meinhardt and Klingler 1987; Fowler, Meinhardt and Prusinkiewicz 1992, eq. 8, with one fixed set of the paper’s constants.' },
  { part: 'Coral accretive growth (species E)', status: 'Published model', basis: 'Kaandorp and Sloot 2001; Merks, Hoekstra, Kaandorp and Sloot 2003; Kaandorp et al. 2005. Implemented as written, with the additions listed below.' },
  { part: 'Coral nutrient field (species E)', status: 'Published model', basis: 'Diffusion from a source plane to an absorbing floor and colony (Merks et al. 2003; Kaandorp et al. 2005). The papers solve it by lattice Boltzmann; here a multigrid diffusion solver on a lattice (a numerical choice).' },
  { part: 'Corallites, uptake response and growth irregularity (species E)', status: 'Designed extension', basis: 'Added for visual range. Corallites are drawn on the finished colony and do not affect growth.' },
  { part: 'Hyphal growth and branching (species F)', status: 'Published model', basis: 'The Neighbour-Sensing model: Meškauskas, McNulty and Moore 2004; Meškauskas, Fricker and Moore 2004. Implemented as written, with the calibration listed below.' },
  { part: 'Fruit body programmes (species F)', status: 'Published method', basis: 'Meškauskas, McNulty and Moore 2004, figures 5 to 8: the same rules for every tip, changed over time in phases. The timings are designed.' },
  { part: 'Helix geometry and base pairing', status: 'Textbook structure', basis: 'B-form DNA: right-handed, about 10.5 base pairs per turn, A with T and C with G.' },
  { part: 'Genome to parameter mapping', status: 'Designed abstraction', basis: 'Real genes do not encode model parameters directly. The code is an addressing scheme, not a model of gene expression.' },
  { part: 'Genes marked “designed” in the gene tables', status: 'Designed extension', basis: 'Added for visual range, and labelled as such wherever they appear.' },
];

/** How a gene's basis reads on the Methods page. */
export function geneStatus(def: GeneDef): Status {
  const b = def.basis;
  if (b.startsWith('Paper') || b === 'Nath 2003' || b.startsWith('Douady and Couder') || b === 'Raup 1966') return 'Published model';
  if (b.startsWith('Merks') || b.startsWith('Kaandorp') || b.startsWith('Meškauskas')) return 'Published model';
  if (b.startsWith('Prusinkiewicz and Lindenmayer') || b === 'Fowler et al. 1992') return 'Published method';
  if (b === 'Plate mechanics') return 'Published rule';
  if (b === 'Designed extension') return 'Designed extension';
  if (b.startsWith('Designed')) return 'Designed';
  if (b.startsWith('Model')) return 'Model parameter';
  if (b === 'Appearance') return 'Appearance';
  return 'Encoding';
}

export interface GeneRow {
  locus: number;
  name: string;
  parameter: string;
  range: string;
  scale: 'Linear' | 'Logarithmic' | 'Whole numbers' | 'Choice' | 'Seed';
  status: Status;
}

const SCALES = { linear: 'Linear', log: 'Logarithmic', int: 'Whole numbers', choice: 'Choice', seed: 'Seed' } as const;

/** Every gene of a species with its range, scale and status (spec section 10). */
export function geneRows(species: SpeciesId): GeneRow[] {
  return geneTable(species).map((def) => ({
    locus: def.locus,
    name: def.name,
    parameter: def.parameter,
    range: def.kind === 'choice' ? (def.choices ?? []).join(', ') : `${formatValue(def, def.min)} to ${formatValue(def, def.max)}`,
    scale: SCALES[def.kind],
    status: geneStatus(def),
  }));
}

export interface Note {
  text: string;
  status: Status;
}

export interface ModelSection {
  title: string;
  /** The published procedure, step by step. */
  procedure: string[];
  /** Equations as plain text. */
  equations: string[];
  /** What this tool adds to or decides beyond the publication, each marked designed or numerical. */
  additions: Note[];
  limits: string[];
  references: string[];
}

export const SPECIES_A: ModelSection = {
  title: `Species A: ${SPECIES_NAMES.A.toLowerCase()}`,
  procedure: [
    'N attraction points are seeded inside an envelope; one or more starting nodes sit at the base.',
    'Each iteration, every attraction point influences the single nearest node, if that node is within the radius of influence.',
    'Each influenced node v grows a new node at v + D·n̂, where n̂ is the normalised sum of the normalised vectors from v to each point influencing it.',
    'An attraction point is removed when any node comes closer to it than the kill distance.',
    'Branch radii follow the pipe model from the tips toward the base, with every tip at the tip radius.',
    'Optional post-processing as in the paper: node relocation toward the basal neighbour, and curve subdivision.',
    'Growth ends when every attraction point is removed, or none is within range of any node. Lengths are in units of D, the segment length.',
  ],
  equations: [
    'Pipe model (paper eq. 1):  rⁿ = r₁ⁿ + r₂ⁿ,  n from 2 to 3',
    'Growth direction (paper eq. 2):  n̂ = Σ (s − v)/|s − v|, normalised, over the points s influencing node v',
    'With tropism g = (0, t, 0) (paper eq. 3):  direction = (n̂ + g)/|n̂ + g|;  new node v′ = v + D · direction',
  ],
  additions: [
    { status: 'Designed', text: 'Clear stem (clarification 4): until the organism first branches, whenever no attraction point is within range of any node, the newest node of each stem grows one D straight up, plus tropism, until points come into range. Once it has branched, growth ends as in the paper. This is common practice in implementations, not a step of the paper.' },
    { status: 'Designed', text: `Kill distance limits (clarification 5): the kill distance in use is the smallest of the gene's value, ${KILL_LIMIT_OF_SENSING} × the sensing range, and ${KILL_LIMIT_OF_RADIUS} × the envelope's largest radius, so a stem cannot clear every point on its way up.` },
    { status: 'Designed', text: 'Sensing range (clarification 16): the radius of influence is set in mean spacings between attraction points (the cube root of the envelope volume per point), not in D.' },
    { status: 'Designed', text: `Stopping (clarification 15): a node whose growth direction sums to zero does not grow that step, and growth stops after ${STEP_CAP_A.toLocaleString('en-GB')} steps whatever else happens.` },
    { status: 'Designed', text: 'A node never grows a new node on top of one of its existing children (they would coincide exactly).' },
    { status: 'Numerical choice', text: `Several starting nodes sit on a ring of ${ORIGIN_RING} × the envelope radius. Surface seeking 1 moves ${Math.round(SURFACE_SHARE * 100)}% of the points into the outer ${Math.round(SURFACE_SHELL * 100)}% of the envelope.` },
    { status: 'Numerical choice', text: 'Relocation moves a node the angle-relaxation gene × 0.5 of the way to its parent (the paper uses half way); smoothing is cubic B-spline subdivision.' },
    { status: 'Designed extension', text: 'Twig shedding removes terminal branches shorter than its threshold, shortest first, and never removes the last branching point.' },
  ],
  limits: ['The paper covers open branching only; closed, looping venation is not modelled.', 'One organism in a constant environment: vertical axis up, no neighbours, no obstacles, no changing light.'],
  references: [REFERENCES.runions2007, REFERENCES.runions2005],
};

export const SPECIES_B: ModelSection = {
  title: `Species B: ${SPECIES_NAMES.B.toLowerCase()}`,
  procedure: [
    'A thin sheet grows faster at its margin than in its interior, so it cannot stay flat and buckles into ruffles. Excess marginal growth makes snapdragon leaves crinkle (Nath et al. 2003).',
    'The sheet is a triangle mesh. Each step: grow (each edge’s rest length increases by an amount set by its distance from the margin), relax (the mesh settles under stretch resistance, bending resistance and short-range repulsion), divide (edges longer than the split length are divided).',
    `Growth stops when the sheet's total rest area reaches ${AREA_MULTIPLE} × its starting area (clarification 1), with a hard cap of ${VERTEX_CAP.toLocaleString('en-GB')} vertices and ${STEP_CAP_B.toLocaleString('en-GB')} steps.`,
  ],
  equations: [
    'Thin-plate scaling with thickness h:  stretch stiffness ∝ h,  bending stiffness ∝ h³ (so bending weighs h²/12 against stretch)',
    'Growth is redistributed, not added: the mean rest-length increase per step is the growth-rate gene; margin bias, anisotropy and patches set where it goes',
  ],
  additions: [
    { status: 'Designed', text: 'Body plans: disc, ring (inner radius 0.5), tube (length 2) and closed sphere, all with a starting radius of 1. For the sphere, “margin” means the growth patches (spec section 4).' },
    { status: 'Numerical choice', text: `Relaxation moves each vertex to a weighted average of full corrections: stretch 1, bending h²/12, repulsion r/(1 + r) with r = repulsion ÷ stiffness (each push capped at a tenth of the personal space), and lift. So stiffness matters only relative to repulsion and lift.` },
    { status: 'Numerical choice', text: `Repulsion acts only between parts of the sheet at least ${REPULSION_SHEET_SEPARATION} personal spaces apart along the sheet, so neighbours are not pushed apart.` },
    { status: 'Designed', text: `Anisotropy strength is ${ANISOTROPY_STRENGTH} (growth 3:1 along or across the margin at ±1).` },
    { status: 'Designed extension', text: 'Lift +1 pushes the margin up; lift −1 pushes it outward along the sheet, as tension.' },
    { status: 'Numerical choice', text: `Mesh-quality guards keep triangles sound: edge flips in the rest geometry, a cap on rest angles, a guard that returns any very thin triangle to its rest shape, and ${SETTLE_PASSES} settle passes at maturity.` },
    { status: 'Designed', text: 'Drawn thickness is the smaller of the thickness and the personal space (clarification 14), so the drawn sheet does not visibly pass through itself; mechanics use the full thickness.' },
  ],
  limits: [
    'This is a spring-mesh approximation of thin-sheet elasticity. It reproduces buckling and ruffling qualitatively, and its parameters are dimensionless. It is not a quantitative model of any tissue.',
  ],
  references: [REFERENCES.nath2003, REFERENCES.sharon2010],
};

const BODY_PLAN_CONICITY = ['head', 'dome', 'cone', 'column'].map((p, i) => `${p} ${CONICITY[i]}`).join(', ');

export const SPECIES_C: ModelSection = {
  title: `Species C: ${SPECIES_NAMES.C.toLowerCase()}`,
  procedure: [
    'The tip of a shoot is modelled in a plane around its centre; the central zone is a circle of radius R0. New organs (primordia) appear on its edge, and the tip’s growth carries every organ outward at a speed proportional to its distance from the centre (part I).',
    `Distances use the paper’s cone distance (part II, eq. 6) with a conicity 1/N set by the body plan: ${BODY_PLAN_CONICITY}. Conicity changes which arrangements win.`,
    'Each organ inhibits new ones near it; the inhibitions add up. When the lowest inhibition on the edge falls to 1, one organ appears there, and the inhibition is evaluated again at once, so several can appear at almost the same moment: that is how whorls form (part II).',
    `Γ, the width of a new organ relative to the central zone, falls over the organism’s life as the apex grows from a seedling’s (part III, eq. 1), from Γi to the gene’s value. The starting organs sit evenly spaced on the edge at the start.`,
    `Growth runs to t = ${MATURITY_TIME} in units of R0 / V0, or to ${ORGAN_CAP.toLocaleString('en-GB')} organs.`,
    'Each organ is then placed on the receptacle, keeping its angle around the axis, and given a shape, a size and an angle (Prusinkiewicz and Lindenmayer 1990, chapter 4).',
  ],
  equations: [
    'Drift (part I):  r = R0 · exp(t − b) for an organ born at time b',
    'Cone distance (part II, eq. 6):  d² = (r₀ − r₁)² / N + 2N r₀ r₁ (1 − cos(θ₀ − θ₁))',
    'Inhibition (part II, eq. 2):  E(θ) = Σ (d₀ / d)^η over all organs; a new organ appears where min E reaches 1',
    'Organ size (part II, eq. 7):  d₀ = Γ √N R0',
    `Growth over time (part III, eq. 1):  Γ(t) = (Γi + Γf)/2 − (Γi − Γf)/2 · tanh((t − ${GAMMA_T1}) / ${GAMMA_TAU})`,
  ],
  additions: [
    { status: 'Designed', text: `Starting Γ (clarification 23): Γi = ${GAMMA_SEEDLING} with one starting organ, as in a seedling, and ${GAMMA_WHORL} sin(π/k) with k ≥ 2 starting organs, so their symmetry can carry on as pairs or whorls; never below the gene’s value. Without a falling Γ the model mostly settles into alternating or disordered arrangements, as the paper reports.` },
    { status: 'Designed', text: `Conicity per body plan (clarification 22): ${BODY_PLAN_CONICITY}, within the range the paper explores.` },
    { status: 'Designed', text: 'Receptacles: a head (a disc, domed by the aspect), a half-ellipsoid dome, a cone, and a column with a rounded tip. Head organs are laid out by rank, at radius √(rank / count) as in Vogel’s sunflower, so they pack evenly; on the other receptacles distance from the apex is proportional to log-radius on the plane, which makes the plane’s spirals constant-pitch helices on the column.' },
    { status: 'Designed', text: `Organs: four outlines (floret, scale, leaf, spine) with width, curl and cupping. An organ’s length is the organ-length gene × the spacing between its neighbours, × its maturation (at least ${MIN_ORGAN_SCALE}), so organs touch or overlap as on a pine cone.` },
    { status: 'Designed extension', text: 'Size variation varies each organ’s size and angle at random; initiation noise jitters the angle at which each organ appears.' },
    { status: 'Numerical choice', text: `The edge is sampled at ${SAMPLES_PER_ORGAN} points per organ width. Organs within ${NEAR_RANGE} d₀ of the edge are summed exactly; farther ones, whose inhibition is smooth, at a few points per band of distance, interpolated. A term below ${NEGLIGIBLE_INHIBITION} is dropped. The time of each new organ is found by root finding to within 1e-10. Checked against a full sum: each organ appears at inhibition 1 within 0.2% for the wild type and 2% at the softest, densest extreme.` },
    { status: 'Numerical choice', text: `Caps: ${ORGAN_CAP.toLocaleString('en-GB')} organs and ${VERTEX_CAP_C.toLocaleString('en-GB')} vertices; organs get fewer vertices as their number grows. Drawn thickness is the organ-thickness gene × the mean organ length.` },
  ],
  limits: [
    'The model says where organs appear, from inhibition and growth alone, and reproduces the observed arrangements and the transitions between them. It does not model the chemistry behind the inhibition.',
    'Receptacle shapes, organ shapes and organ growth are designed geometry, not a model of how organs develop.',
    'Within the gene’s range, alternate rows (180°) show only in the seedling phase, at the rim or base; raising Γ moves the arrangement toward them. Flat heads with very stiff inhibition at small Γ become disordered, as the paper also reports for flat apices.',
  ],
  references: [REFERENCES.douady1996, REFERENCES.prusinkiewicz1990, REFERENCES.vogel1979],
};

export const SPECIES_D: ModelSection = {
  title: `Species D: ${SPECIES_NAMES.D.toLowerCase()}`,
  procedure: [
    'A shell grows only at its opening, so it is the trace the aperture leaves as it grows and turns (Raup). The aperture is the generating curve: an ellipse of height to width S, in a plane through the coiling axis, tilted by the aperture tilt.',
    'Each turn every length grows by W, the whorl expansion rate. The curve’s inner and outer edges lie at a ratio D from the axis, and its centre moves along the axis by T times its distance from it.',
    'Rings of points evenly spaced along the curve (Fowler et al., section 2.4) are laid down at even steps of the angle of coiling and joined by triangles; the first ring is closed by a cap, the embryonic shell.',
    'Ribs and cords move the surface along its normal, in proportion to the curve’s size (Fowler et al., section 2.5).',
    'The edge pattern is Meinhardt’s activator–substrate model run along the curve as the rings are laid down, so each ring records the pattern of its moment (Fowler et al., eq. 8).',
    `Growth stops when the curve reaches ${SIZE_MULTIPLE} × its starting size or after ${WHORL_CAP} whorls, whichever comes first.`,
  ],
  equations: [
    'Coiling (Raup):  size(θ) = W^(θ / 2π);  centre at distance size(θ) from the axis, size(θ) · T below the apex',
    'Generating curve:  half width (1 − D)/(1 + D) · size,  height S × that',
    'Activator:  ∂a/∂t = ρ s (a²/(1 + κa²) + ρ₀) − μa + Dₐ ∂²a/∂x²',
    'Substrate:  ∂s/∂t = σ − ρ s (a²/(1 + κa²) + ρ₀) − νs + Dₛ ∂²s/∂x²',
    `Constants (Fowler et al., figure 11):  ρ = ${PATTERN.rho} ± ${PATTERN.rhoNoise * 100}%, κ = ${PATTERN.kappa}, ρ₀ = ${PATTERN.rho0}, μ = ${PATTERN.mu}, Dₐ = ${PATTERN.da}, σ = ${PATTERN.sigma}, ν = ${PATTERN.nu}, Dₛ = ${PATTERN.ds}`,
  ],
  additions: [
    { status: 'Designed', text: 'Rib width: each rib is a cosine bump covering the rib-width share of the spacing between ribs; nodules add extra height where ribs and cords cross. Fowler et al. use plain sine ribs and lattices.' },
    { status: 'Designed extension', text: `The aperture flare widens the curve by up to ${FLARE_GAIN * 100}% over the last ${FLARE_TURNS} of a turn; growth irregularity varies each ring’s size by up to ${IRREGULARITY_AMPLITUDE * 100}%, smoothed over neighbouring rings, which leaves growth lines.` },
    { status: 'Designed', text: 'A left-handed shell is the right-handed one’s mirror image.' },
    { status: 'Numerical choice', text: `${CURVE_POINTS} points around the curve and ${RINGS_PER_TURN} rings per turn (at least ${MIN_RINGS}), fewer if the vertex cap would be passed.` },
    { status: 'Numerical choice', text: `The pattern advances ${PATTERN_STEPS_PER_RING} units of time per ring, each in ${PATTERN_SUBSTEPS} forward Euler steps. With whole steps, as in the paper, about 3% of random seeds overshot and failed; quarter steps keep every seed bounded without changing the pattern’s scale.` },
  ],
  limits: [
    'Raup’s model describes the geometry of coiling, not the biology of the mantle that builds it.',
    'Overlapping whorls are allowed: when the distance from the axis is small, each whorl wraps the one before, as in real shells, and the surface passes through itself where they meet.',
    'The edge pattern uses one fixed set of the published constants, so it shows the mechanism (stripes along the direction of growth), not the range of patterns real shells have. Travelling-wave patterns need the paper’s activator–inhibitor model with a global hormone (eq. 9), not built.',
  ],
  references: [REFERENCES.raup1965, REFERENCES.raup1966, REFERENCES.fowler1992, REFERENCES.meinhardt1987],
};

export const SPECIES_E: ModelSection = {
  title: `Species E: ${SPECIES_NAMES.E.toLowerCase()}`,
  procedure: [
    `A stony coral grows by accretion: the living surface lays down a new layer of skeleton on top of the old, thicker where its polyps absorb more nutrient. The colony is a closed triangle mesh whose vertices are polyps, standing on the floor of a growth space of ${LATTICE} × ${LATTICE} × ${LATTICE} lattice units.`,
    'The nutrient diffuses through the lattice from a source plane at the top (R = 1). The colony and the floor are solid and absorb it (R = 0), the floor standing for competing organisms on the sea floor; the four sides wrap around; there is no flow (Merks et al. 2003; Kaandorp et al. 2005, figure 1c).',
    'Each growth step: the colony is filled into the lattice; the field takes one step of diffusion; each polyp’s uptake is the concentration probed at the polyp height along its normal, divided by the largest uptake; each vertex moves out along its normal by the layer thickness times that uptake (Kaandorp et al. 2005, eq. 2.3), unless it falls below the growth threshold, Kaandorp and Sloot’s tr.',
    'Growth to transport, s² / (D Δt), sets how far the field settles between growth steps. When transport is fast the field nears its steady (Laplace) state, depletion zones form between branches and the colony branches; when growth and transport share a time scale the colony becomes compact (Merks et al. 2003).',
    `Mesh refinement follows Merks et al.: an edge splits at ${SPLIT_FACTOR} × the polyp spacing, the new vertex placed by cubic interpolation between the two normals; two vertices fuse below ${FUSE_FACTOR} ×; a triangle under ${AREA_FACTOR} × the starting mean area is removed.`,
    `Growth stops when the colony’s top reaches ${TOP_FRACTION * 100}% of the height of the source plane, after ${STEP_CAP_E} steps, or at ${GROWING_VERTEX_CAP.toLocaleString('en-GB')} polyps.`,
  ],
  equations: [
    'Diffusion:  ∂R/∂t = D ∇²R,  R = 1 on the source plane, R = 0 on the floor and colony',
    'Growth step:  l = s · (c / c_max)^γ · k(h),  zero where the growth is at or below tr',
    'Growth to transport:  G = s² / (D Δt);  each step solves (1 − D Δt ∇²) R = R_previous',
    `Curvature rule (Kaandorp and Sloot):  k = 1 below a radius of curvature of ${CURVATURE_MIN} s, 0 above ${CURVATURE_MAX} s, linear between; blended with 1 by the curvature rule gene`,
    'Compactness (Kaandorp et al. 2005):  C = colony volume / convex hull volume',
  ],
  additions: [
    { status: 'Numerical choice', text: `Diffusion is one backward Euler step per growth step, solved by ${CYCLES} multigrid V-cycles started from the previous field (clarification 29). The papers iterate lattice Boltzmann moment propagation; both solve the same equation. At small G the step reaches the steady field.` },
    { status: 'Numerical choice', text: `The lattice is ${LATTICE} units on a side, smaller than the papers’ 144 and 200, so that a colony grows in seconds; the colony is filled into it by winding number, so overlapping branches stay solid. Vertices are kept ${SIDE_MARGIN} units inside the sides.` },
    { status: 'Numerical choice', text: 'Curvature for the curvature rule and the curvature gradient uses the discrete operators of Meyer et al. (2002). Where two edges of a triangle split, the quad is cut along its shorter diagonal rather than at random.' },
    { status: 'Designed', text: 'The four starting forms (knob, ridge, ring, encrusting disc) and their size; the papers start from a small sphere. The starting mesh is jittered slightly from the seed so the colony is not perfectly symmetric.' },
    { status: 'Designed extension', text: 'The uptake response γ (1 is the published linear rule) and growth irregularity, a random variation in layer thickness from polyp to polyp.' },
    { status: 'Designed', text: `Corallites, the polyps’ cups, are drawn as relief on the finished colony after up to ${CORALLITE_LEVELS} subdivisions within the cap of ${VERTEX_CAP_E.toLocaleString('en-GB')} vertices: a cup, septa and a rim around each polyp. They do not affect growth.` },
    { status: 'Numerical choice', text: `The draft (clarification 28) grows on a lattice ${DRAFT_SCALE_E} times coarser, every length divided by ${DRAFT_SCALE_E}, without corallites.` },
  ],
  limits: [
    'The model is abiotic: it shows how much of a coral’s form follows from nutrient diffusion and accretion alone, not the biology of polyps, symbionts or water flow. It is not a model of any one coral species.',
    'With the floor fixed as absorbing (clarification 31) the colonies are those of Kaandorp et al.’s figure 1c; the hemispherical forms of an inert floor are not reached.',
    'On this lattice the most open colonies reach a compactness of about 0.55, against 0.39 in Merks et al. on 200³; a finer lattice branches more but takes longer than the speed budget allows.',
    'Branches that grow into each other pass through each other in the mesh; the lattice treats both as solid.',
  ],
  references: [REFERENCES.kaandorpSloot2001, REFERENCES.merks2003, REFERENCES.kaandorp2005, REFERENCES.kaandorp1994, REFERENCES.meyer2002],
};

export const SPECIES_F: ModelSection = {
  title: `Species F: ${SPECIES_NAMES.F.toLowerCase()}`,
  procedure: [
    'A mushroom, a cup fungus or a puffball is built from hyphae, cells that grow only at their tips and branch. In the Neighbour-Sensing model every tip follows the same rules, sensing the hyphae around it and a vertical orientation, and fruit body shapes arise when those rules change over time for all tips at once; no tip needs to know where it is.',
    'The mycelium is a tree of sections, each a run of unit segments from a branch point to its tip. Every section generates a density field falling with the square of distance (eq. 3) and a long-range field falling with the square root of distance (eq. 5); each section counts once, its field averaged along it; a tip does not sense its own section (eq. 4).',
    `Each time step every tip reads the fields of the mycelium as it stood at the step’s start. It grows only while the density field is below ${GROW_MULTIPLE} × the branching threshold (figure 1). It turns toward its tropism vector, keeping a share k of its old direction (eq. 13), and advances one unit. Where the density field is below the branching threshold it may branch, with the branching probability; one branch keeps the parent’s direction, the other leaves within the branch angle.`,
    'The tropism vector (eq. 11) sums self-avoidance (away from the density field), the closing pull (toward the long-range field), parallel tropism (along neighbouring hyphae, eq. 9) and the orientation push (eq. 12: up or down whenever the tip’s angle from vertical is more than 5° from the target).',
    `The programme sets the rules over time (figures 5 to 8). Colony: ${COLONY_TIME} units of free growth. Cup: a flat colony (${FLAT_TIME}), then the target angle turns to the cup angle (${CUP_TIME}). Closed: then the pull closes it (${CLOSE_TIME}). Flask: then growth turns upward with the pull halved (${NECK_TIME}). Mushroom: then a stem, then a cap whose angle turns from 90° to the cap angle over the cap turn length (${CAP_TIME}).`,
    `Growth stops when the programme ends, at ${SEGMENT_CAP.toLocaleString('en-GB')} segments, or when no tip can grow; at most ${TIP_CAP.toLocaleString('en-GB')} tips.`,
  ],
  equations: [
    'Density field (eq. 3):  N(p) = Σ over sections S ≠ own of lc · mean over points j of S of 1 / (|p − x_j|² + ε²)',
    'Long-range field (eq. 5):  M(p) = Σ over sections of lc · mean of (|p − x_j|² + ε²)^(−1/4)',
    'Tropism (eq. 11):  v = a · unit(−∇N) + Im · unit(∇M) + Ic · unit(v_parallel) + Ig · g(angle)',
    'Direction (eq. 13):  d_new = unit(k · d + (1 − k) · unit(v));  tip_new = tip + d_new',
    `Constants:  lc = ${LC}, ε = ${SOFTENING} units, growth limit ${GROW_MULTIPLE} × the branching threshold`,
  ],
  additions: [
    { status: 'Numerical choice', text: `Fields are summed by a Barnes–Hut tree (opening angle ${THETA}) instead of over every point; the tip’s own section is subtracted exactly. Against the direct sum, within 0.5% for the density and 5% for its gradient.` },
    { status: 'Numerical choice', text: `Calibration (clarification 35): the papers give neither lc nor the scale of their fields, so lc = ${LC} and every field is softened over ${SOFTENING} units, making the density field act like figure 1’s count of tips within 20 units; each term of eq. 11 enters as a unit vector times its impact, so impacts compare.` },
    { status: 'Designed', text: `Programme timings: phase lengths are set here, not in the paper, which changes its settings by hand; there is no orientation push while the cup closes, and in the neck the pull is ${NECK_PULL * 100}% of its value (“reduction”, figure 7C).` },
    { status: 'Designed', text: 'A tip branches only once its section has grown, so branches never pile up on one point.' },
    { status: 'Designed', text: `Hypha thickness is drawn only. Long runs of nodes are thinned in the output so that the drawn tubes stay within ${VERTEX_CAP_F.toLocaleString('en-GB')} vertices; branch points and ends are kept.` },
    { status: 'Numerical choice', text: `The draft (clarification 28) grows ${DRAFT_STEP} units per step for that fraction of the steps, with the branch chance per step raised to 1 − (1 − p)² and the persistence to k², and draws hyphae with fewer sides.` },
  ],
  limits: [
    'The model is the paper’s abstraction: the fields stand for signals of similar physical form, not for a named chemical. It shows that one set of rules for every tip can make these shapes, not how any real fungus does it.',
    'The programme’s phases are set by hand, as in the paper. Gills and spores are not modelled.',
    'Hyphae may cross and their tubes intersect; where bundled hyphae interpenetrate, a few pixels can differ between a whole frame and a tiled export (milestone 23).',
  ],
  references: [REFERENCES.meskauskas2004a, REFERENCES.meskauskas2004b],
};

/** The genome, the draft and determinism: how a code becomes an organism. */
export const ENCODING_NOTES: readonly string[] = [
  `A genome is one string of 160 bases (A, C, G, T). Bases 1 to 3 name the species and 4 to 6 the encoding version; ${GENE_COUNT - 1} parameter genes of ${GENE_BASES} bases each and a ${SEED_BASES}-base seed follow; the last ${160 - CHECKSUM_START} bases are a checksum that catches any single mistyped letter.`,
  'Each gene’s bases are read as a number in base 4 (0 to 4,095; the seed 0 to 16,777,215) and mapped onto the parameter’s range, linearly or logarithmically. The mapping is designed: it is an addressing scheme, not a model of gene expression.',
  'The same code always grows the same organism, on any machine. The simulation uses only exactly specified arithmetic (no browser maths functions whose last bits vary) and a seeded random generator, and every organism is summarised by a geometry hash. Compare the hash below across browsers and machines.',
  `While a form gene’s slider is dragged, a draft is shown: the same code and algorithm at lower resolution (clarification 3). Species A uses ${DRAFT_SCALE} × the segment length and an eighth of the attraction points from the same seed; species B uses ${DRAFT_SCALE} × the cell size; species C keeps the organs where they are and draws them with fewer vertices; species D uses half the rings and half the points around its curve; species E grows on a lattice ${DRAFT_SCALE_E} times coarser without corallites; species F grows ${DRAFT_STEP} units per step and draws its hyphae with fewer sides. A draft is labelled as such and is never the organism: releasing the slider grows the organism itself.`,
  'Looks and views are how the organism is imaged, outside the genome. Pigment and surface genes are read by the renderer only and never change the geometry.',
];
