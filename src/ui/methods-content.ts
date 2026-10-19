import { CHECKSUM_START, GENE_BASES, GENE_COUNT, geneTable, KILL_LIMIT_OF_RADIUS, KILL_LIMIT_OF_SENSING, SEED_BASES, type GeneDef, type SpeciesId } from '../genome';
import { DRAFT_SCALE } from '../sim/draft';
import { ORIGIN_RING, STEP_CAP as STEP_CAP_A, SURFACE_SHARE, SURFACE_SHELL } from '../sim/speciesA/constants';
import { ANISOTROPY_STRENGTH, AREA_MULTIPLE, REPULSION_SHEET_SEPARATION, SETTLE_PASSES, STEP_CAP as STEP_CAP_B, VERTEX_CAP } from '../sim/speciesB/constants';
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
} as const;

export type Status = 'Published model' | 'Published rule' | 'Published mechanism, approximate simulation' | 'Textbook structure' | 'Designed abstraction' | 'Designed extension' | 'Designed' | 'Numerical choice' | 'Model parameter' | 'Appearance' | 'Encoding';

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
  { part: 'Helix geometry and base pairing', status: 'Textbook structure', basis: 'B-form DNA: right-handed, about 10.5 base pairs per turn, A with T and C with G.' },
  { part: 'Genome to parameter mapping', status: 'Designed abstraction', basis: 'Real genes do not encode model parameters directly. The code is an addressing scheme, not a model of gene expression.' },
  { part: 'Genes marked “designed” in the gene tables', status: 'Designed extension', basis: 'Added for visual range, and labelled as such wherever they appear.' },
];

/** How a gene's basis reads on the Methods page. */
export function geneStatus(def: GeneDef): Status {
  const b = def.basis;
  if (b.startsWith('Paper') || b === 'Nath 2003') return 'Published model';
  if (b === 'Plate mechanics') return 'Published rule';
  if (b === 'Designed extension') return 'Designed extension';
  if (b === 'Designed') return 'Designed';
  if (b === 'Model') return 'Model parameter';
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

/** The genome, the draft and determinism: how a code becomes an organism. */
export const ENCODING_NOTES: readonly string[] = [
  `A genome is one string of 160 bases (A, C, G, T). Bases 1 to 3 name the species and 4 to 6 the encoding version; ${GENE_COUNT - 1} parameter genes of ${GENE_BASES} bases each and a ${SEED_BASES}-base seed follow; the last ${160 - CHECKSUM_START} bases are a checksum that catches any single mistyped letter.`,
  'Each gene’s bases are read as a number in base 4 (0 to 4,095; the seed 0 to 16,777,215) and mapped onto the parameter’s range, linearly or logarithmically. The mapping is designed: it is an addressing scheme, not a model of gene expression.',
  'The same code always grows the same organism, on any machine. The simulation uses only exactly specified arithmetic (no browser maths functions whose last bits vary) and a seeded random generator, and every organism is summarised by a geometry hash. Compare the hash below across browsers and machines.',
  `While a form gene’s slider is dragged, a draft is shown: the same code and algorithm at lower resolution (clarification 3). Species A uses ${DRAFT_SCALE} × the segment length and an eighth of the attraction points from the same seed; species B uses ${DRAFT_SCALE} × the cell size. A draft is labelled as such and is never the organism: releasing the slider grows the organism itself.`,
  'Looks and views are how the organism is imaged, outside the genome. Pigment and surface genes are read by the renderer only and never change the geometry.',
];
