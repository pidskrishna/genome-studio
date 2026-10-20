import {
  clearanceIsLimited,
  decodeValue,
  geneAt,
  speciesAOf,
  valueById,
  type DecodedGenome,
  type GeneDef,
  type SpeciesId,
} from '../genome';

// What the gene map, inspector and code bar say about a gene: its value in words, the unit the
// number field uses, its reference, and notes on clamped values. Plain functions, no DOM.

export const SPECIES_NAMES: Readonly<Record<SpeciesId, string>> = {
  A: 'Branching and venation',
  B: 'Differential growth',
  C: 'Phyllotaxis',
  D: 'Seashell',
};


/** Units the spec gives as percentages ("0.4% to 2% of envelope height"). */
const PERCENT_UNITS: Readonly<Record<string, string>> = {
  'envelope height': '% of envelope height',
  height: '% of height',
  'per step': '% per step',
  radius: '% of radius',
  'final size': '% of final size',
  'final radius': '% of the final radius',
  'organ length': '% of organ length',
  'curve radius': "% of the curve's radius",
  'rib spacing': '% of the rib spacing',
  size: '% of size',
};

/** How the exact number field shows a gene: model value × scale, followed by the unit. */
export interface FieldUnit {
  scale: number;
  unit: string;
}

export function fieldUnit(def: GeneDef): FieldUnit {
  const percent = PERCENT_UNITS[def.unit];
  if (percent) return { scale: 100, unit: percent };
  return { scale: 1, unit: def.unit };
}

const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** A number at a precision that suits its size. */
export function formatNumber(x: number): string {
  const a = Math.abs(x);
  if (a >= 100) return grouped.format(x);
  const digits = a >= 10 ? 1 : a >= 1 ? 2 : 3;
  const text = x.toFixed(digits);
  // No "−0.000" for values that round to zero.
  return Number(text) === 0 ? (0).toFixed(digits) : text.replace('-', '−');
}

function singular(unit: string): string {
  return unit.replace(/^nodes\b/, 'node').replace(/^passes\b/, 'pass').replace(/^organs\b/, 'organ').replace(/^cords\b/, 'cord');
}

/** A decoded model value in words, with its unit: "1.60% of envelope height", "3 nodes", "Ring". */
export function formatValue(def: GeneDef, value: number): string {
  switch (def.kind) {
    case 'choice':
      return def.choices?.[value] ?? String(value);
    case 'seed':
      return grouped.format(value);
    case 'int':
      return `${value} ${value === 1 ? singular(def.unit) : def.unit}`;
    default: {
      if (def.id === 'spaceDensity') return `${grouped.format(Math.floor(value + 0.5))} points`;
      const { scale, unit } = fieldUnit(def);
      const number = formatNumber(value * scale);
      if (!unit) return number;
      return unit === '°' || unit.startsWith('%') ? number + unit : `${number} ${unit}`;
    }
  }
}

/** The gene's value as decoded from a raw slider value (before any clamp). */
export function rawValueText(def: GeneDef, raw: number): string {
  return formatValue(def, decodeValue(def, raw));
}

const RUNIONS_2007 = 'Runions, Lane and Prusinkiewicz (2007), Modeling Trees with a Space Colonization Algorithm';
const NATH_2003 = 'Nath, Crawford, Carpenter and Coen (2003), Genetic Control of Surface Curvature, Science 299:1404';
const SHARON_2010 = 'Sharon and Efrati (2010), The mechanics of non-Euclidean plates, Soft Matter 6:5693';
const DOUADY_1996 = 'Douady and Couder (1996), Phyllotaxis as a dynamical self organizing process, parts I to III, Journal of Theoretical Biology 178:255–312';
const ABOP_1990 = 'Prusinkiewicz and Lindenmayer (1990), The Algorithmic Beauty of Plants, chapter 4';
const RAUP_1966 = 'Raup (1966), Geometric analysis of shell coiling: general problems, Journal of Paleontology 40:1178–1190';
const FOWLER_1992 = 'Fowler, Meinhardt and Prusinkiewicz (1992), Modeling seashells, Computer Graphics 26(2):379–387';

/** The gene's reference, from the spec's "Basis" column. */
export function referenceOf(def: GeneDef): string {
  const basis = def.basis;
  if (basis.startsWith('Paper (envelope is an input)')) return `${RUNIONS_2007}. The envelope is an input to the model.`;
  if (basis.startsWith('Paper, eq.')) return `${RUNIONS_2007}, ${basis.slice('Paper, '.length)}.`;
  if (basis === 'Paper') return `${RUNIONS_2007}.`;
  if (basis === 'Nath 2003') return `${NATH_2003}.`;
  if (basis === 'Plate mechanics') return `Thin-plate mechanics; see ${SHARON_2010}.`;
  if (basis === 'Model') return 'A parameter of this tool’s spring-mesh simulation, not of a published model.';
  if (basis === 'Designed extension') return 'Designed extension, added for visual range. Not part of the published model.';
  if (basis === 'Douady and Couder 1996') return `${DOUADY_1996}.`;
  if (basis === 'Douady and Couder 1996 (initial conditions)') return `${DOUADY_1996}. The starting organs are the paper's initial conditions.`;
  if (basis === 'Prusinkiewicz and Lindenmayer 1990') return `${ABOP_1990}.`;
  if (basis === 'Prusinkiewicz and Lindenmayer 1990 (receptacle is an input)') return `${ABOP_1990}. The receptacle is an input to the model.`;
  if (basis === 'Prusinkiewicz and Lindenmayer 1990 (organ shape is an input)') return `${ABOP_1990}. Organ shapes are an input to the model.`;
  if (basis === 'Raup 1966') return `${RAUP_1966}.`;
  if (basis === 'Fowler et al. 1992') return `${FOWLER_1992}.`;
  if (basis === 'Designed') return 'Designed choice. Not part of the published model.';
  if (basis === 'Appearance') return 'Appearance only: used by the renderer, never by the growth simulation.';
  if (basis === 'Encoding') return 'Part of the encoding: feeds the seeded random generator.';
  return basis;
}

/**
 * Notes on derived and clamped values: the kill distance limit (clarification 5), the sensing range
 * in D (clarification 16) and the drawn thickness of species B (clarification 14).
 */
export function geneNotes(decoded: DecodedGenome, locus: number): string[] {
  const def = geneAt(decoded.species, locus);
  if (decoded.species === 'A') {
    if (def.id === 'sensingRange') {
      const d = speciesAOf(decoded);
      return [`${formatNumber(d.sensingRange)} D at a mean point spacing of ${formatNumber(d.spacing)} D.`];
    }
    if (def.id === 'clearance') {
      const used = decoded.values[locus - 1] ?? 0;
      if (!clearanceIsLimited(decoded)) return [`Kill distance in use: ${formatNumber(used)} D.`];
      const d = speciesAOf(decoded);
      const limit =
        d.killLimitedBy === 'envelope'
          ? 'a quarter of the envelope radius'
          : '0.8 × the sensing range';
      return [
        `Kill distance in use: ${formatNumber(used)} D, limited by ${limit}. The gene asks for ${formatNumber(decodeValue(def, decoded.raw[locus - 1] ?? 0))} D.`,
      ];
    }
  } else if (def.id === 'thickness' || def.id === 'personalSpace') {
    const h = valueById(decoded, 'thickness');
    const space = valueById(decoded, 'personalSpace');
    const drawn = Math.min(h, space);
    const clamp = h > space ? ', limited by the personal space' : '';
    return [`Drawn thickness: ${formatNumber(drawn)} cell widths${clamp}. Stiffness uses the full thickness.`];
  }
  return [];
}

/** "Form genes", "Pigment and surface genes", "Seed". */
export const GROUP_NAMES = {
  header: 'Header',
  form: 'Form genes',
  pigment: 'Pigment and surface genes',
  seed: 'Seed',
  checksum: 'Checksum',
} as const;
