// Gene tables. They must match SPEC.md (sections 3, 4, 4a and 4b) locus by locus: order, names, ranges, scales.

export type SpeciesId = 'A' | 'B' | 'C' | 'D';

/** Every species the encoding knows, in header order (AAA, AAC, AAG, AAT). */
export const ALL_SPECIES: readonly SpeciesId[] = ['A', 'B', 'C', 'D'];
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
const C_DRIVERS = ['Order of appearance', 'Distance from the apex', 'Position along the organ', 'Height'] as const;
const D_DRIVERS = ['Growth lines', 'Position around the curve', 'Ornament relief', 'Edge pattern'] as const;

/** Loci 16 to 23, shared by every species apart from the choices of locus 20. */
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
  { locus: 4, id: 'sensingRange', name: 'Sensing range', kind: 'log', min: 2.5, max: 12, unit: 'point spacings', parameter: 'Radius of influence', basis: 'Paper', description: 'Sets how far a branch tip can sense an attraction point, as a multiple of the mean spacing between points.' },
  { locus: 5, id: 'clearance', name: 'Clearance', kind: 'linear', min: 1, max: 20, unit: 'D', parameter: 'Kill distance', basis: 'Paper', description: 'Sets how close a branch must come to remove an attraction point; it never exceeds 0.8 times the sensing range or a quarter of the envelope radius.' },
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

const PL_1990 = 'Prusinkiewicz and Lindenmayer 1990';
const DC_1996 = 'Douady and Couder 1996';
const RAUP_1966 = 'Raup 1966';

export const SPECIES_C_GENES: readonly GeneDef[] = table([
  { locus: 1, id: 'bodyPlan', name: 'Body plan', kind: 'choice', min: 0, max: 3, unit: '', parameter: 'Receptacle: head (a disc), dome, cone, or column', basis: `${PL_1990} (receptacle is an input)`, choices: ['Head', 'Dome', 'Cone', 'Column'], description: 'Chooses the shape of the receptacle the organs grow on.' },
  { locus: 2, id: 'inhibitionRange', name: 'Inhibition range', kind: 'log', min: 0.1, max: 2, unit: 'central zone radii', parameter: 'Γ = d0 / (√N R0): the width of a new organ relative to the central zone', basis: DC_1996, description: 'Sets how much room each new organ needs, which chooses between many-armed spirals and alternate rows.' },
  { locus: 3, id: 'organForm', name: 'Organ form', kind: 'choice', min: 0, max: 3, unit: '', parameter: 'Organ shape: floret, scale, leaf, or spine', basis: `${PL_1990} (organ shape is an input)`, choices: ['Floret', 'Scale', 'Leaf', 'Spine'], description: 'Chooses the shape of every organ.' },
  { locus: 4, id: 'inhibitionFalloff', name: 'Inhibition falloff', kind: 'linear', min: 3, max: 17, unit: '', parameter: 'η, how sharply inhibition falls with distance', basis: DC_1996, description: 'Sets how sharply an organ’s inhibition fades with distance.' },
  { locus: 5, id: 'startingOrgans', name: 'Starting organs', kind: 'int', min: 1, max: 4, unit: 'organs', parameter: 'Organs present at the start', basis: `${DC_1996} (initial conditions)`, description: 'Sets how many organs are present at the start, which can lead to pairs or whorls.' },
  { locus: 6, id: 'receptacleAspect', name: 'Receptacle aspect', kind: 'log', min: 0.1, max: 4, unit: 'height to radius', parameter: 'Height to radius; for the head, how domed the disc is', basis: `${PL_1990} (receptacle is an input)`, description: 'Sets how tall the receptacle is for its width; for a head, how domed the disc is.' },
  { locus: 7, id: 'organLength', name: 'Organ length', kind: 'log', min: 0.5, max: 4, unit: 'organ spacings', parameter: 'Length in spacings between neighbouring organs', basis: PL_1990, description: 'Sets how long each organ is, measured in spacings between neighbouring organs, so organs can overlap.' },
  { locus: 8, id: 'organWidth', name: 'Organ width', kind: 'linear', min: 0.1, max: 1, unit: 'width to length', parameter: 'Width to length', basis: 'Designed', description: 'Sets how wide each organ is for its length.' },
  { locus: 9, id: 'organAngle', name: 'Organ angle', kind: 'linear', min: 0, max: 90, unit: '°', parameter: 'Angle between organ and receptacle surface', basis: PL_1990, description: 'Sets how far each organ stands up from the receptacle surface.' },
  { locus: 10, id: 'organCurl', name: 'Organ curl', kind: 'linear', min: -90, max: 90, unit: '°', parameter: 'Bend along the organ\'s length', basis: 'Designed', description: 'Bends each organ along its length, outward when positive and inward when negative.' },
  { locus: 11, id: 'organCupping', name: 'Organ cupping', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Curve across the organ\'s width, from flat to a half tube', basis: 'Designed', description: 'Curves each organ across its width, from flat to a half tube.' },
  { locus: 12, id: 'maturation', name: 'Maturation', kind: 'linear', min: 0.05, max: 1, unit: 'final radius', parameter: 'Distance from the centre at which an organ reaches full size', basis: PL_1990, description: 'Sets how far from the centre an organ must travel before it reaches full size.' },
  { locus: 13, id: 'organThickness', name: 'Organ thickness', kind: 'log', min: 0.02, max: 0.3, unit: 'organ length', parameter: 'Drawn thickness of each organ', basis: 'Designed', description: 'Sets how thick each organ is drawn, as a fraction of its length.' },
  { locus: 14, id: 'sizeVariation', name: 'Size variation', kind: 'linear', min: 0, max: 0.3, unit: 'size', parameter: 'Random variation in each organ\'s size and angle', basis: 'Designed extension', description: 'Varies each organ’s size and angle at random.' },
  { locus: 15, id: 'initiationNoise', name: 'Initiation noise', kind: 'linear', min: 0, max: 5, unit: '°', parameter: 'Random jitter in the angle at which each organ appears', basis: 'Designed extension', description: 'Jitters the angle at which each new organ appears, which can break a perfect pattern.' },
  ...appearance(C_DRIVERS, 'What the A-to-B gradient follows: order of appearance, distance from the apex, position along the organ, or height'),
  seedGene('Random seed for size variation and initiation noise'),
]);

export const SPECIES_D_GENES: readonly GeneDef[] = table([
  { locus: 1, id: 'whorlExpansion', name: 'Whorl expansion', kind: 'log', min: 1.3, max: 1000, unit: 'per turn', parameter: 'W, growth of the curve per turn', basis: RAUP_1966, description: 'Sets how much the shell widens with each turn, from a tall spire of many whorls to a single wide whorl.' },
  { locus: 2, id: 'translation', name: 'Translation', kind: 'linear', min: 0, max: 8, unit: '', parameter: 'T, movement along the axis per unit distance from it', basis: RAUP_1966, description: 'Sets how far the coil moves along its axis, from a flat coil to a tall spire.' },
  { locus: 3, id: 'axisDistance', name: 'Distance from axis', kind: 'linear', min: 0, max: 0.9, unit: '', parameter: 'D, inner to outer edge distance of the curve from the axis', basis: RAUP_1966, description: 'Sets how far the coil stands off its axis, from tightly wound to an open coil.' },
  { locus: 4, id: 'apertureShape', name: 'Aperture shape', kind: 'log', min: 0.25, max: 4, unit: 'height to width', parameter: 'S, height to width of the generating curve', basis: RAUP_1966, description: 'Sets the shape of the opening, from wide and low to tall and narrow.' },
  { locus: 5, id: 'apertureTilt', name: 'Aperture tilt', kind: 'linear', min: -60, max: 60, unit: '°', parameter: 'Angle of the generating curve\'s plane to the axis', basis: 'Fowler et al. 1992', description: 'Tilts the opening against the coiling axis.' },
  { locus: 6, id: 'handedness', name: 'Handedness', kind: 'choice', min: 0, max: 1, unit: '', parameter: 'Coiling direction: right (dextral) or left (sinistral)', basis: RAUP_1966, choices: ['Right', 'Left'], description: 'Chooses whether the shell coils to the right or to the left.' },
  { locus: 7, id: 'ribCount', name: 'Rib count', kind: 'int', min: 0, max: 40, unit: 'per turn', parameter: 'Ribs per turn', basis: 'Designed extension', description: 'Sets how many ribs cross each turn of the shell.' },
  { locus: 8, id: 'ribHeight', name: 'Rib height', kind: 'linear', min: 0, max: 0.4, unit: 'curve radius', parameter: 'Height of each rib', basis: 'Designed extension', description: 'Sets how far each rib stands out from the shell.' },
  { locus: 9, id: 'ribWidth', name: 'Rib width', kind: 'linear', min: 0.05, max: 0.5, unit: 'rib spacing', parameter: 'Width of each rib', basis: 'Designed extension', description: 'Sets how wide each rib is, as a fraction of the gap between ribs.' },
  { locus: 10, id: 'cordCount', name: 'Cord count', kind: 'int', min: 0, max: 32, unit: 'cords', parameter: 'Cords around the curve', basis: 'Designed extension', description: 'Sets how many cords run along the shell, around the opening.' },
  { locus: 11, id: 'cordHeight', name: 'Cord height', kind: 'linear', min: 0, max: 0.2, unit: 'curve radius', parameter: 'Height of each cord', basis: 'Designed extension', description: 'Sets how far each cord stands out from the shell.' },
  { locus: 12, id: 'nodules', name: 'Nodules', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Extra height where ribs and cords cross', basis: 'Designed extension', description: 'Raises knobs where ribs and cords cross.' },
  { locus: 13, id: 'apertureFlare', name: 'Aperture flare', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'How far the lip widens over the last part of the final whorl', basis: 'Designed extension', description: 'Widens the lip of the opening over the end of the last whorl.' },
  { locus: 14, id: 'wallThickness', name: 'Wall thickness', kind: 'log', min: 0.01, max: 0.2, unit: 'curve radius', parameter: 'Drawn thickness of the shell wall', basis: 'Designed', description: 'Sets how thick the shell wall is drawn.' },
  { locus: 15, id: 'growthIrregularity', name: 'Growth irregularity', kind: 'linear', min: 0, max: 1, unit: '', parameter: 'Random variation in growth from step to step, leaving growth lines', basis: 'Designed extension', description: 'Varies growth at random from step to step, which leaves growth lines on the shell.' },
  ...appearance(D_DRIVERS, 'What the A-to-B gradient follows: growth lines, position around the curve, ornament relief, or edge pattern'),
  seedGene('Random seed for growth irregularity and the edge pattern\'s starting noise'),
]);

const TABLES: Readonly<Record<SpeciesId, readonly GeneDef[]>> = {
  A: SPECIES_A_GENES,
  B: SPECIES_B_GENES,
  C: SPECIES_C_GENES,
  D: SPECIES_D_GENES,
};

export function geneTable(species: SpeciesId): readonly GeneDef[] {
  return TABLES[species];
}

export function geneAt(species: SpeciesId, locus: number): GeneDef {
  const gene = geneTable(species)[locus - 1];
  if (!gene) throw new RangeError(`No gene at locus ${locus}`);
  return gene;
}
