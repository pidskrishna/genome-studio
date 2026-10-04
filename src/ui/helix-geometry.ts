import {
  CHECKSUM_START,
  complementStrand,
  GENE_COUNT,
  GENOME_LENGTH,
  geneAt,
  geneSpan,
  type SpeciesId,
} from '../genome';

// Pure geometry of the helix editor (spec section 5): correct B-form DNA, right-handed, about 10.5
// base pairs per turn, two antiparallel strands with a major and a minor groove. No three.js and no
// DOM, so it can be tested on its own. Units are ångströms. The axis is y; base 1 is at the top and
// the code strand runs 5′ to 3′ downwards (−y), so index i (0-based) sits at y = −i × RISE.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Rise per base pair along the axis (B-form: about 3.4 Å). */
export const RISE = 3.38;
/** Base pairs per turn (spec: about 10.5). */
export const BASES_PER_TURN = 10.5;
/** Twist per base pair, in radians (about 34.3°). */
export const TWIST = (2 * Math.PI) / BASES_PER_TURN;
/** Radius of the backbone (phosphate) path. */
export const BACKBONE_RADIUS = 9.5;
/**
 * Angle round the axis from the code strand's backbone to the paired strand's backbone at the same
 * base pair, across the minor groove. Less than 180°, so the grooves differ: about 0.4 turn (14 Å)
 * of axial gap on the minor side and 0.6 turn (21 Å) on the major side, as in B-form DNA.
 */
export const GROOVE_ANGLE = 0.4 * 2 * Math.PI;
/** How far the meeting point of a base pair sits from the axis, as a fraction of the radius. */
const PAIR_MIDDLE = 0.15;

export type Strand = 'code' | 'pair';

/**
 * Angle of a strand's backbone round the axis at (possibly fractional) base index t. Angles are
 * measured from +z towards +x. The code strand advances down the axis (−y) while its angle
 * decreases, which is a right-handed screw: viewed along the direction of advance it turns clockwise.
 */
export function backboneAngle(strand: Strand, t: number): number {
  const a = -t * TWIST;
  return strand === 'code' ? a : a + GROOVE_ANGLE;
}

export function axisPoint(t: number): Vec3 {
  return { x: 0, y: -t * RISE, z: 0 };
}

/** A point on a strand's backbone at base index t, at the given distance from the axis. */
export function backbonePoint(strand: Strand, t: number, radius = BACKBONE_RADIUS): Vec3 {
  const a = backboneAngle(strand, t);
  return { x: radius * Math.sin(a), y: -t * RISE, z: radius * Math.cos(a) };
}

/** One rung: the code base and its complement, each a half-rung from its backbone to the middle. */
export interface Rung {
  /** 0-based index in the code. */
  index: number;
  /** 1-based position, as the genome functions and the editor use. */
  position: number;
  base: string;
  pair: string;
  codeEnd: Vec3;
  pairEnd: Vec3;
  middle: Vec3;
}

export function rungAt(code: string, index: number): Rung {
  const codeEnd = backbonePoint('code', index);
  const pairEnd = backbonePoint('pair', index);
  const middle = {
    x: ((codeEnd.x + pairEnd.x) / 2) * (PAIR_MIDDLE / Math.cos(GROOVE_ANGLE / 2)),
    y: codeEnd.y,
    z: ((codeEnd.z + pairEnd.z) / 2) * (PAIR_MIDDLE / Math.cos(GROOVE_ANGLE / 2)),
  };
  const base = code.charAt(index);
  return { index, position: index + 1, base, pair: complementStrand(base), codeEnd, pairEnd, middle };
}

/** Every rung of a code, in code order. The paired strand is derived, never stored (section 2). */
export function helixRungs(code: string): Rung[] {
  return Array.from({ length: code.length }, (_, i) => rungAt(code, i));
}

/**
 * The bases of one strand read 5′ to 3′, with their backbone points. The code strand runs in code
 * order; the paired strand runs the other way (antiparallel), so it reads as the reverse complement.
 */
export function strandFivePrimeToThree(code: string, strand: Strand): { base: string; point: Vec3 }[] {
  const pair = complementStrand(code);
  const out: { base: string; point: Vec3 }[] = [];
  for (let k = 0; k < code.length; k++) {
    const i = strand === 'code' ? k : code.length - 1 - k;
    out.push({ base: (strand === 'code' ? code : pair).charAt(i), point: backbonePoint(strand, i) });
  }
  return out;
}

/** Rotates a point about the y axis by `spin`, as three.js does for `rotation.y`. */
export function rotateY(p: Vec3, spin: number): Vec3 {
  const c = Math.cos(spin);
  const s = Math.sin(spin);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

/**
 * The spin that turns the base pair at index t to face the viewer (+z): the pair's two backbones sit
 * symmetrically left and right, and the rung runs across the view in front of the axis.
 */
export function facingSpin(t: number): number {
  return -(backboneAngle('code', t) + GROOVE_ANGLE / 2);
}

/**
 * The detent nearest a spin: the closest spin at which some base pair faces the viewer. Facing spins
 * are one twist apart (facingSpin(t) for whole t), so a released drag settles onto one of them.
 */
export function detent(spin: number): number {
  const k = Math.round((spin + GROOVE_ANGLE / 2) / TWIST);
  return k * TWIST - GROOVE_ANGLE / 2;
}

/** The spin equal to `target` modulo a full turn that is closest to `from`, so turns take the short way. */
export function nearestSpin(from: number, target: number): number {
  const turn = 2 * Math.PI;
  return target + Math.round((from - target) / turn) * turn;
}

// Gene bands --------------------------------------------------------------------------------------

export type BandKind = 'header' | 'form' | 'pigment' | 'seed' | 'checksum';

/** A labelled band along the code strand's backbone: a gene, the header or the checksum. */
export interface Band {
  kind: BandKind;
  /** Gene locus, or null for the header and checksum. */
  locus: number | null;
  /** 0-based index of the first base. */
  start: number;
  length: number;
}

export function helixBands(species: SpeciesId): Band[] {
  const bands: Band[] = [{ kind: 'header', locus: null, start: 0, length: 6 }];
  for (let locus = 1; locus <= GENE_COUNT; locus++) {
    const { start, length } = geneSpan(locus);
    bands.push({ kind: geneAt(species, locus).group, locus, start, length });
  }
  bands.push({ kind: 'checksum', locus: null, start: CHECKSUM_START, length: GENOME_LENGTH - CHECKSUM_START });
  return bands;
}

/** The band holding a 0-based base index. */
export function bandAt(bands: readonly Band[], index: number): Band | undefined {
  return bands.find((b) => index >= b.start && index < b.start + b.length);
}

/** Middle of a band, as a fractional base index. */
export function bandMiddle(band: Band): number {
  return band.start + (band.length - 1) / 2;
}

// Rung instances: the code half of base i is instance i, the paired half is instance 160 + i.

export function rungInstance(index: number, strand: Strand): number {
  return strand === 'code' ? index : GENOME_LENGTH + index;
}

export function baseOfInstance(instance: number): { index: number; strand: Strand } {
  return instance < GENOME_LENGTH
    ? { index: instance, strand: 'code' }
    : { index: instance - GENOME_LENGTH, strand: 'pair' };
}
