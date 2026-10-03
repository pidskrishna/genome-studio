// Gene tables. They must match SPEC.md (sections 3 and 4) locus by locus: order, names, ranges, scales.

export type SpeciesId = 'A' | 'B';
export type GeneGroup = 'form' | 'pigment' | 'seed';
export type GeneKind = 'linear' | 'log' | 'int' | 'choice' | 'seed';

export interface GeneDef {
  /** 1 to 24, the fixed position of the gene. */
  readonly locus: number;
  /** Stable identifier for code. */
  readonly id: string;
  /** Name shown to the user. Describes the model parameter; never borrowed from a real gene. */
  readonly name: string;
  readonly group: GeneGroup;
  readonly kind: GeneKind;
  /** Decoded range. For `choice` genes this is 0 to the number of choices minus one. */
  readonly min: number;
  readonly max: number;
  /** Unit of the decoded value, empty when dimensionless. */
  readonly unit: string;
  /** The model parameter, as worded in the spec table. */
  readonly parameter: string;
  /** The spec's "Basis" column. */
  readonly basis: string;
  /** True for genes the spec marks as a designed extension or a designed choice. */
  readonly designed: boolean;
  /** One sentence on what the gene does. */
  readonly description: string;
  readonly choices?: readonly string[];
}

type Def = Omit<GeneDef, 'designed' | 'group'> & { group?: GeneGroup };

function table(defs: readonly Def[]): readonly GeneDef[] {
  return defs.map((d, i) => {
    if (d.locus !== i + 1) throw new Error(`Gene table out of order at locus ${i + 1}`);
    const group: GeneGroup = d.group ?? (d.locus === 24 ? 'seed' : d.locus >= 16 ? 'pigment' : 'form');
    return { ...d, group, designed: d.basis.startsWith('Designed') };
  });
}

const A_DRIVERS = ['Distance from base', 'Branch radius', 'Branch order', 'Height'] as const;
const B_DRIVERS = ['Distance from margin', 'Curvature', 'Order of growth', 'Height'] as const;

/** Loci 16 to 23, shared by both species apart from the choices of locus 20. */
function appearance(drivers: readonly string[], driverParameter: string): readonly Def[] {
  return [
    { locus: 16, id: 'pigmentA', name: 'Pigment A', kind: 'linear', min: 0, max: 360, unit: '°', parameter: 'Hue of the first pigment', basis: 'Appearance', description: 'Sets the hue of the first pigment, at the start of the colour gradient.' },
    { locus: 17, id: 'pigmentB', name: 'Pigment B', kind: 'linear', min: 0, max: 360, unit: '°', parameter: 'Hue of the second pigment', basis: 'Appearance', description: 'Sets the hue of the second pigment, at the end of the colour gradient.' },
    { locus: 18, id: 'saturation', name: 'Saturation', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Colour strength', basis: 'Appearance', description: 'Sets how strong the colour is, from grey to full colour.' },
    { locus: 19, id: 'lightness', name: 'Lightness', kind: 'linear', min: 0.1, max: 0.9, unit: '', parameter: 'Overall tone', basis: 'Appearance', description: 'Sets the overall tone, from dark to light.' },
    { locus: 20, id: 'gradientDriver', name: 'Gradient driver', kind: 'choice', min: 0, max: 3, unit: '', parameter: driverParameter, basis: 'Appearance', choices: drivers, description: 'Chooses which property of the organism the colour gradient follows.' },
    { locus: 21, id: 'gradientContrast', name: 'Gradient contrast', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'How sharply A turns into B', basis: 'Appearance', description: 'Sets how sharply pigment A turns into pigment B.' },
    { locus: 22, id: 'gloss', name: 'Gloss', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Surface from matt to wet', basis: 'Appearance', description: 'Sets the surface finish, from matt to wet.' },
    { locus: 23, id: 'glow', name: 'Glow', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Translucency and light emission', basis: 'Appearance', description: 'Sets how translucent the organism is and how much light it emits.' },
  ];
}

function seedGene(parameter: string): Def {
  return {
    locus: 24, id: 'seed', name: 'Seed', kind: 'seed', min: 0, max: 16_777_215, unit: '', parameter, basis: 'Encoding',
    description: 'Sets the random seed, so the same code always grows the same organism.',
  };
}

export const SPECIES_A_GENES: readonly GeneDef[] = table([
  { locus: 1, id: 'habitAspect', name: 'Habit: aspect', kind: 'log', min: 0.4, max: 4, unit: 'height to width', parameter: 'Envelope height to width', basis: 'Paper (envelope is an input)', description: 'Sets how tall and narrow, or short and wide, the envelope that holds the attraction points is.' },
  { locus: 2, id: 'tropism', name: 'Tropism', kind: 'linear', min: -0.5, max: 0.5, unit: '', parameter: 'Vertical growth bias', basis: 'Paper, eq. 3', description: 'Pulls new growth upward when positive and downward when negative.' },
  { locus: 3, id: 'spaceDensity', name: 'Space density', kind: 'log', min: 300, max: 12_000, unit: 'points', parameter: 'N, number of attraction points', basis: 'Paper', description: 'Sets how many attraction points fill the envelope, and so how dense the branching is.' },
  { locus: 4, id: 'sensingRange', name: 'Sensing range', kind: 'log', min: 4, max: 64, unit: 'D', parameter: 'Radius of influence', basis: 'Paper', description: 'Sets how far a branch tip can sense an attraction point.' },
  { locus: 5, id: 'clearance', name: 'Clearance', kind: 'linear', min: 1, max: 20, unit: 'D', parameter: 'Kill distance', basis: 'Paper', description: 'Sets how close a branch must come to remove an attraction point; it never exceeds 0.8 times the sensing range.' },
  { locus: 6, id: 'segmentLength', name: 'Segment length', kind: 'log', min: 0.004, max: 0.02, unit: 'envelope height', parameter: 'D, relative to envelope height', basis: 'Paper', description: 'Sets the length of each growth step, as a fraction of the envelope height.' },
  { locus: 7, id: 'surfaceSeeking', name: 'Surface seeking', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Attraction points uniform (0), or crowded near the envelope (1)', basis: 'Paper', description: 'Moves the attraction points from evenly spread to crowded near the envelope surface.' },
  { locus: 8, id: 'habitTaper', name: 'Habit: taper', kind: 'linear', min: -1, max: 1, unit: '', parameter: 'Envelope from cone, through sphere, to inverted cone', basis: 'Paper (envelope is an input)', description: 'Reshapes the envelope from a cone, through a sphere, to an inverted cone.' },
  { locus: 9, id: 'clearStem', name: 'Clear stem', kind: 'linear', min: 0, max: 0.5, unit: 'height', parameter: 'Gap between base node and envelope', basis: 'Paper (envelope is an input)', description: 'Sets the bare gap between the base and the envelope, as a fraction of its height.' },
  { locus: 10, id: 'origins', name: 'Origins', kind: 'int', min: 1, max: 6, unit: 'nodes', parameter: 'Number of starting nodes', basis: 'Paper', description: 'Sets how many starting nodes sit at the base.' },
  { locus: 11, id: 'pipeExponent', name: 'Pipe exponent', kind: 'linear', min: 2, max: 3, unit: '', parameter: 'n in the branch radius formula', basis: 'Paper, eq. 1', description: 'Sets how quickly branches thicken toward the base.' },
  { locus: 12, id: 'tipRadius', name: 'Tip radius', kind: 'linear', min: 0.05, max: 0.5, unit: 'D', parameter: 'Radius of terminal branches', basis: 'Paper', description: 'Sets the radius of the finest twigs.' },
  { locus: 13, id: 'angleRelaxation', name: 'Angle relaxation', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Strength of node relocation toward the base', basis: 'Paper', description: 'Sets how far each node is pulled back toward its basal neighbour, which straightens kinks.' },
  { locus: 14, id: 'limbSmoothing', name: 'Limb smoothing', kind: 'int', min: 0, max: 3, unit: 'passes', parameter: 'Curve subdivision passes', basis: 'Paper', description: 'Sets how many times each limb is subdivided into a smoother curve.' },
  { locus: 15, id: 'twigShedding', name: 'Twig shedding', kind: 'linear', min: 0, max: 10, unit: 'D', parameter: 'Remove terminal branches shorter than a threshold', basis: 'Designed extension', description: 'Removes terminal branches shorter than this length.' },
  ...appearance(A_DRIVERS, 'What the A-to-B gradient follows: distance from base, branch radius, branch order, or height'),
  seedGene('Random seed for point placement'),
]);

export const SPECIES_B_GENES: readonly GeneDef[] = table([
  { locus: 1, id: 'bodyPlan', name: 'Body plan', kind: 'choice', min: 0, max: 3, unit: '', parameter: 'Starting form: disc, ring, tube, or closed sphere', basis: 'Designed', choices: ['Disc', 'Ring', 'Tube', 'Closed sphere'], description: 'Chooses the starting form of the sheet.' },
  { locus: 2, id: 'marginBias', name: 'Margin bias', kind: 'log', min: 1, max: 20, unit: 'ratio', parameter: 'Ratio of growth at the margin to growth in the interior', basis: 'Nath 2003', description: 'Sets how much faster the margin grows than the interior, which drives buckling.' },
  { locus: 3, id: 'thickness', name: 'Thickness', kind: 'log', min: 0.2, max: 3, unit: 'cell widths', parameter: 'Sheet thickness h; sets stretch stiffness (∝ h), bending stiffness (∝ h³) and rendered thickness', basis: 'Plate mechanics', description: 'Sets how thick the sheet is, which makes it harder to stretch and much harder to bend.' },
  { locus: 4, id: 'growthRate', name: 'Growth rate', kind: 'log', min: 0.002, max: 0.03, unit: 'per step', parameter: 'Rest-length increase per step', basis: 'Model', description: 'Sets how much each edge lengthens in every growth step.' },
  { locus: 5, id: 'growthZone', name: 'Growth zone', kind: 'linear', min: 0.02, max: 1, unit: 'radius', parameter: 'How far growth reaches in from the margin', basis: 'Nath 2003', description: 'Sets how far the fast-growing zone reaches in from the margin, as a fraction of the radius.' },
  { locus: 6, id: 'anisotropy', name: 'Anisotropy', kind: 'linear', min: -1, max: 1, unit: '', parameter: 'Growth along the margin versus toward it', basis: 'Model', description: 'Favours growth along the margin when positive and toward it when negative.' },
  { locus: 7, id: 'stiffness', name: 'Stiffness', kind: 'log', min: 0.1, max: 10, unit: '', parameter: 'Overall elastic modulus', basis: 'Plate mechanics', description: 'Sets how strongly the sheet resists being stretched or bent.' },
  { locus: 8, id: 'personalSpace', name: 'Personal space', kind: 'linear', min: 1, max: 4, unit: 'cell widths', parameter: 'Repulsion radius', basis: 'Model', description: 'Sets how close two parts of the sheet can come before they push apart.' },
  { locus: 9, id: 'repulsion', name: 'Repulsion', kind: 'log', min: 0.1, max: 10, unit: '', parameter: 'Repulsion strength', basis: 'Model', description: 'Sets how hard parts of the sheet push apart when they come too close.' },
  { locus: 10, id: 'startingRoughness', name: 'Starting roughness', kind: 'linear', min: 0, max: 0.05, unit: 'radius', parameter: 'Out-of-plane noise that seeds the first buckles', basis: 'Model', description: 'Sets the small out-of-plane noise at the start that gives the first buckles somewhere to form.' },
  { locus: 11, id: 'patchSize', name: 'Patch size', kind: 'linear', min: 0.05, max: 1, unit: 'radius', parameter: 'Scale of spatial variation in growth rate', basis: 'Designed extension', description: 'Sets the size of the patches in which the growth rate varies.' },
  { locus: 12, id: 'patchContrast', name: 'Patch contrast', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Strength of that variation', basis: 'Designed extension', description: 'Sets how strongly the growth rate differs from patch to patch.' },
  { locus: 13, id: 'lift', name: 'Lift', kind: 'linear', min: -1, max: 1, unit: '', parameter: 'Vertical bias, from spreading flat to rising', basis: 'Designed extension', description: 'Biases growth upward when positive, so the sheet rises rather than spreading flat.' },
  { locus: 14, id: 'relaxation', name: 'Relaxation', kind: 'int', min: 1, max: 20, unit: 'passes per step', parameter: 'Relax passes per growth step, from tense to settled', basis: 'Model', description: 'Sets how many times the mesh settles after each growth step.' },
  { locus: 15, id: 'cellSize', name: 'Cell size', kind: 'log', min: 0.005, max: 0.02, unit: 'final size', parameter: 'Edge split length', basis: 'Model', description: 'Sets how long an edge may grow before it is split, as a fraction of the final size.' },
  ...appearance(B_DRIVERS, 'What the A-to-B gradient follows: distance from margin, curvature, order of growth, or height'),
  seedGene('Random seed for starting noise and growth patches'),
]);

export function geneTable(species: SpeciesId): readonly GeneDef[] {
  return species === 'A' ? SPECIES_A_GENES : SPECIES_B_GENES;
}

export function geneAt(species: SpeciesId, locus: number): GeneDef {
  const gene = geneTable(species)[locus - 1];
  if (!gene) throw new RangeError(`No gene at locus ${locus}`);
  return gene;
}
