import { describe, expect, it } from 'vitest';
import { BASES, GENOME_LENGTH, wildType, type SpeciesId } from '../../src/genome';
import { mulberry32, randomGenome } from '../../src/genome/test-helpers';
import {
  BASES_PER_TURN,
  backbonePoint,
  facingSpin,
  GROOVE_ANGLE,
  helixBands,
  helixRungs,
  RISE,
  rotateY,
  strandFivePrimeToThree,
  TWIST,
  type Strand,
  type Vec3,
} from '../../src/ui/helix-geometry';
import { BASE_COLOURS, HelixScene } from '../../src/ui/helix-scene';

// Milestone 8 check: the helix is right-handed B-form DNA and every rung pairs A with T or C with G.

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => {
  const l = Math.sqrt(dot(a, a));
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/**
 * The screw sense of a path round a straight axis, from first principles: for each step, the turn
 * about the axis (r_k × r_k+1 · a) times the advance along it ((p_k+1 − p_k) · a). Positive for every
 * step means a right-handed screw (turning anticlockwise when it comes towards you); negative,
 * left-handed. The axis is fitted from the points (the mean of a whole number of turns is on it).
 */
function screwSenses(points: Vec3[], axisFrom: Vec3, axisTo: Vec3): number[] {
  const a = unit(sub(axisTo, axisFrom));
  const radial = (p: Vec3): Vec3 => {
    const d = sub(p, axisFrom);
    const along = dot(d, a);
    return { x: d.x - a.x * along, y: d.y - a.y * along, z: d.z - a.z * along };
  };
  const out: number[] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    const turn = dot(cross(radial(points[k]!), radial(points[k + 1]!)), a);
    const advance = dot(sub(points[k + 1]!, points[k]!), a);
    out.push(Math.sign(turn) * Math.sign(advance));
  }
  return out;
}

/** Discrete torsion sign: (d1 × d2) · d3 over consecutive steps. Positive for a right-handed helix. */
function torsionSigns(points: Vec3[]): number[] {
  const out: number[] = [];
  for (let k = 0; k + 3 < points.length; k++) {
    const d1 = sub(points[k + 1]!, points[k]!);
    const d2 = sub(points[k + 2]!, points[k + 1]!);
    const d3 = sub(points[k + 3]!, points[k + 2]!);
    out.push(Math.sign(dot(cross(d1, d2), d3)));
  }
  return out;
}

function strandPoints(strand: Strand, step = 1): Vec3[] {
  const pts: Vec3[] = [];
  for (let t = 0; t <= GENOME_LENGTH - 1; t += step) pts.push(backbonePoint(strand, t));
  return pts;
}

/** Axis through the centres of whole turns at each end of the helix. */
function fittedAxis(points: Vec3[], perTurn: number): { from: Vec3; to: Vec3 } {
  const n = Math.round(perTurn * 2);
  const mean = (ps: Vec3[]): Vec3 => {
    const s = ps.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), { x: 0, y: 0, z: 0 });
    return { x: s.x / ps.length, y: s.y / ps.length, z: s.z / ps.length };
  };
  return { from: mean(points.slice(0, n)), to: mean(points.slice(points.length - n)) };
}

describe('helix geometry', () => {
  it('both strands are right-handed screws, whichever way they are read', () => {
    for (const strand of ['code', 'pair'] as const) {
      for (const step of [1, 0.25]) {
        const pts = strandPoints(strand, step);
        const axis = fittedAxis(pts, BASES_PER_TURN / step);
        const forward = screwSenses(pts, axis.from, axis.to);
        expect(forward.every((s) => s === 1)).toBe(true);
        // Reading the other way (as the antiparallel strand runs) or with the axis reversed keeps the hand.
        const backward = screwSenses([...pts].reverse(), axis.to, axis.from);
        expect(backward.every((s) => s === 1)).toBe(true);
        expect(screwSenses(pts, axis.to, axis.from).every((s) => s === 1)).toBe(true);
        expect(torsionSigns(pts).every((s) => s === 1)).toBe(true);
        expect(torsionSigns([...pts].reverse()).every((s) => s === 1)).toBe(true);
      }
    }
  });

  it('the handedness checks catch a mirrored (left-handed) helix', () => {
    const pts = strandPoints('code').map((p) => ({ x: -p.x, y: p.y, z: p.z }));
    const axis = fittedAxis(pts, BASES_PER_TURN);
    expect(screwSenses(pts, axis.from, axis.to).every((s) => s === -1)).toBe(true);
    expect(torsionSigns(pts).every((s) => s === -1)).toBe(true);
  });

  it('stays right-handed as drawn, after any spin the view applies', () => {
    for (const spin of [0, 1, -2.5, facingSpin(40), facingSpin(117)]) {
      const pts = strandPoints('code').map((p) => rotateY(p, spin));
      const axis = fittedAxis(pts, BASES_PER_TURN);
      expect(screwSenses(pts, axis.from, axis.to).every((s) => s === 1)).toBe(true);
    }
  });

  it('is B-form: about 10.5 base pairs per turn, 3.4 Å rise, 160 bases in about 15 turns', () => {
    expect(BASES_PER_TURN).toBeCloseTo(10.5, 6);
    expect(RISE).toBeGreaterThan(3.2);
    expect(RISE).toBeLessThan(3.5);
    const pts = strandPoints('code');
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = { ...pts[k]!, y: 0 };
      const b = { ...pts[k + 1]!, y: 0 };
      const angle = Math.acos(dot(a, b) / Math.sqrt(dot(a, a) * dot(b, b)));
      expect(angle).toBeCloseTo((2 * Math.PI) / 10.5, 9);
      expect(pts[k]!.y - pts[k + 1]!.y).toBeCloseTo(RISE, 9);
    }
    const turns = (GENOME_LENGTH * TWIST) / (2 * Math.PI);
    expect(turns).toBeGreaterThan(14.5);
    expect(turns).toBeLessThan(16);
  });

  it('has a minor and a major groove: the strands are not half a turn apart', () => {
    const pitch = BASES_PER_TURN * RISE;
    // Where the paired strand passes a direction round the axis, the code strand passes the same
    // direction a fraction f of a pitch above and 1 − f below. Equal gaps would mean no grooves.
    const i = 80;
    const p = backbonePoint('pair', i);
    const target = Math.atan2(p.x, p.z);
    const ys: number[] = [];
    for (let t = 0; t < GENOME_LENGTH - 1; t += 0.001) {
      const a = backbonePoint('code', t);
      const b = backbonePoint('code', t + 0.001);
      const da = Math.atan2(a.x, a.z) - target;
      const db = Math.atan2(b.x, b.z) - target;
      if (Math.sin(da) >= 0 !== Math.sin(db) >= 0 && Math.cos(da) > 0) ys.push(a.y);
    }
    const above = Math.min(...ys.filter((y) => y > p.y).map((y) => y - p.y));
    const below = Math.min(...ys.filter((y) => y < p.y).map((y) => p.y - y));
    const minor = Math.min(above, below);
    const major = Math.max(above, below);
    expect(minor + major).toBeCloseTo(pitch, 1);
    expect(minor / pitch).toBeCloseTo(GROOVE_ANGLE / (2 * Math.PI), 2);
    expect(major / minor).toBeGreaterThan(1.3);
  });

  it('has two antiparallel strands: the pair strand reads 5′ to 3′ the other way, as the reverse complement', () => {
    const code = wildType('A');
    const codeStrand = strandFivePrimeToThree(code, 'code');
    const pairStrand = strandFivePrimeToThree(code, 'pair');
    const reverseComplement = [...code].reverse().map((b) => ({ A: 'T', C: 'G', G: 'C', T: 'A' })[b]).join('');
    expect(pairStrand.map((s) => s.base).join('')).toBe(reverseComplement);
    expect(codeStrand.map((s) => s.base).join('')).toBe(code);
    const advance = (s: { point: Vec3 }[]): number => s[s.length - 1]!.point.y - s[0]!.point.y;
    expect(Math.sign(advance(codeStrand))).toBe(-Math.sign(advance(pairStrand)));
  });

  it('turns a base pair to face the viewer with its rung across the view', () => {
    for (const t of [0, 7, 33.5, 159]) {
      const s = facingSpin(t);
      const code = rotateY(backbonePoint('code', t), s);
      const pair = rotateY(backbonePoint('pair', t), s);
      expect(code.z).toBeGreaterThan(0);
      expect(code.z).toBeCloseTo(pair.z, 9);
      expect(code.x).toBeCloseTo(-pair.x, 9);
    }
  });
});

describe('rungs pair A with T and C with G', () => {
  const PAIRS = new Set(['AT', 'TA', 'CG', 'GC']);
  const rand = mulberry32(2026);
  const codes: { code: string; species: SpeciesId }[] = [
    { code: wildType('A'), species: 'A' },
    { code: wildType('B'), species: 'B' },
  ];
  for (let n = 0; n < 100; n++) codes.push({ code: randomGenome(n % 2 ? 'B' : 'A', rand), species: n % 2 ? 'B' : 'A' });
  // Any letters at all in the body, including runs of one base.
  for (let n = 0; n < 50; n++) {
    let body = '';
    for (let i = 0; i < GENOME_LENGTH - 3; i++) body += BASES[Math.floor(rand() * 4)];
    codes.push({ code: 'AAA' + body, species: 'A' });
  }
  for (const b of BASES) codes.push({ code: 'AAC' + b.repeat(GENOME_LENGTH - 3), species: 'B' });

  it('in the geometry, for every rung of every code', () => {
    for (const { code } of codes) {
      const rungs = helixRungs(code);
      expect(rungs).toHaveLength(GENOME_LENGTH);
      for (const r of rungs) {
        expect(r.base).toBe(code[r.index]);
        expect(PAIRS.has(r.base + r.pair)).toBe(true);
        // Each rung joins the two backbones at one height.
        expect(r.codeEnd.y).toBe(r.pairEnd.y);
        expect(r.middle.y).toBe(r.codeEnd.y);
      }
    }
  });

  it('in the drawn colours, for every rung of every code', () => {
    const scene = new HelixScene();
    const letterOf = new Map(BASES.split('').map((b) => [BASE_COLOURS[b]!, b]));
    expect(letterOf.size).toBe(4);
    for (const { code, species } of codes) {
      scene.setCode(code, species);
      for (let i = 0; i < GENOME_LENGTH; i++) {
        const base = letterOf.get(scene.rungColour(i, 'code'));
        const pair = letterOf.get(scene.rungColour(i, 'pair'));
        expect(base).toBe(code[i]);
        expect(PAIRS.has(base! + pair!)).toBe(true);
      }
    }
  });

  it('bands cover the code once, in order, with the five groups', () => {
    for (const species of ['A', 'B'] as const) {
      const bands = helixBands(species);
      let next = 0;
      for (const b of bands) {
        expect(b.start).toBe(next);
        next = b.start + b.length;
      }
      expect(next).toBe(GENOME_LENGTH);
      expect(new Set(bands.map((b) => b.kind))).toEqual(new Set(['header', 'form', 'pigment', 'seed', 'checksum']));
      expect(bands.filter((b) => b.locus !== null)).toHaveLength(24);
    }
  });
});
