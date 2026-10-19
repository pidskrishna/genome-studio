import { cos, exp, log, PI, sin } from '../dmath';
import type { JobDone } from '../host';
import { Rng } from '../rng';
import { hashSheetGeometry } from '../speciesB';
import {
  CURVE_POINTS,
  CURVE_TABLE_STEPS,
  DRAFT_FRACTION,
  FLARE_GAIN,
  FLARE_TURNS,
  IRREGULARITY_AMPLITUDE,
  MIN_RINGS,
  PATTERN_STEPS_PER_RING,
  PATTERN_SUBSTEPS,
  RINGS_PER_TURN,
  SIZE_MULTIPLE,
  VERTEX_CAP,
  WHORL_CAP,
} from './constants';
import { speciesDParams, type SpeciesDParams } from './params';
import { EdgePattern } from './pattern';

// Species D (spec section 4b): Raup's coiled shell as a sweep (Fowler, Meinhardt and Prusinkiewicz
// 1992). The generating curve is an ellipse of height to width S, in a plane through the coiling
// axis (y), tilted by the aperture tilt. Each turn, every length grows by W, so after an angle θ the
// scale is W^(θ / 2π). With the curve's centre at unit distance from the axis at the start, its half
// width is (1 − D) / (1 + D), so its inner and outer edges lie at a ratio D from the axis, and the
// centre sits T times its distance from the axis below the apex. Rings of points evenly spaced along
// the curve are laid down at even steps of θ and joined by triangles; the first ring is closed by a
// cap, the embryonic shell. Ornament then moves each point along the surface normal (clarification
// 24), and the edge pattern runs along the curve as the rings are laid down.

const TWO_PI = 2 * PI;

export interface SpeciesDInput {
  code: string;
}

/** Plain geometry data for species D, in the same form as species B's (clarification 19). */
export interface ShellGeometry {
  positions: Float64Array;
  /** Three vertex indices per triangle, facing out of the shell. */
  triangles: Int32Array;
  /** Four values per vertex: growth lines (ring), position around the curve, ornament relief, edge pattern. */
  drivers: Float64Array;
  /** Spacing of points around the final curve. */
  cellWidth: number;
  /** Wall thickness × the final curve's radius. */
  drawnThickness: number;
  stats: { rings: number; points: number; whorls: number; vertices: number; triangles: number };
  /** Geometry hash over positions, triangles and drivers. */
  hash: string;
}

export const DRIVER_COUNT = 4;

export interface ShellOptions {
  draft?: boolean;
}

/** Points evenly spaced along an ellipse of half axes a (across) and b (up), from its outer point. */
function curvePoints(a: number, b: number, count: number): { u: Float64Array; v: Float64Array } {
  const length = new Float64Array(CURVE_TABLE_STEPS + 1);
  let px = a;
  let py = 0;
  for (let i = 1; i <= CURVE_TABLE_STEPS; i++) {
    const phi = (TWO_PI * i) / CURVE_TABLE_STEPS;
    const x = a * cos(phi);
    const y = b * sin(phi);
    length[i] = length[i - 1]! + Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
    px = x;
    py = y;
  }
  const total = length[CURVE_TABLE_STEPS]!;
  const u = new Float64Array(count);
  const v = new Float64Array(count);
  let i = 0;
  for (let j = 0; j < count; j++) {
    const target = (total * j) / count;
    while (i < CURVE_TABLE_STEPS - 1 && length[i + 1]! < target) i++;
    const span = length[i + 1]! - length[i]!;
    const f = span > 0 ? (target - length[i]!) / span : 0;
    const phi = (TWO_PI * (i + f)) / CURVE_TABLE_STEPS;
    u[j] = a * cos(phi);
    v[j] = b * sin(phi);
  }
  return { u, v };
}

/** Rib profile at a phase in ribs (a whole number at each rib's crest): a cosine bump of the given width. */
function ribProfile(phase: number, width: number): number {
  const d = Math.abs(phase - Math.floor(phase + 0.5));
  return d < width / 2 ? 0.5 * (1 + cos((TWO_PI * d) / width)) : 0;
}

/** Grows species D from decoded parameters. Yields progress from 0 to 1. */
export function* growSpeciesD(p: SpeciesDParams, options: ShellOptions = {}): Generator<number, ShellGeometry> {
  const lnW = log(p.expansion);
  const whorls = Math.min(log(SIZE_MULTIPLE) / lnW, WHORL_CAP);
  const thetaMax = TWO_PI * whorls;
  const points = options.draft ? Math.floor(CURVE_POINTS * DRAFT_FRACTION) : CURVE_POINTS;
  const ringCap = Math.floor((VERTEX_CAP - 1) / points);
  let rings = Math.max(MIN_RINGS, -Math.floor(-whorls * RINGS_PER_TURN));
  if (options.draft) rings = Math.floor(rings * DRAFT_FRACTION);
  rings = Math.min(rings, ringCap);

  const halfWidth = (1 - p.axisDistance) / (1 + p.axisDistance);
  const curve = curvePoints(halfWidth, p.shape * halfWidth, points);
  /** The curve's radius, for ornament and wall thickness: the mean of its half axes. */
  const curveRadius = (halfWidth * (1 + p.shape)) / 2;
  const final = exp((thetaMax * lnW) / TWO_PI);
  const ct = cos(p.tilt);
  const st = sin(p.tilt);

  // Growth irregularity: each ring's size varies by a smoothed random amount (seed stream 1).
  const irregular = new Rng(p.seed, 1);
  const raw = new Float64Array(rings);
  for (let k = 0; k < rings; k++) raw[k] = 2 * irregular.next() - 1;

  const vertexCount = rings * points + 1;
  const base = new Float64Array(vertexCount * 3);
  const centres = new Float64Array(rings * 3);
  const scales = new Float64Array(rings);
  const thetas = new Float64Array(rings);
  for (let k = 0; k < rings; k++) {
    const theta = rings > 1 ? (thetaMax * k) / (rings - 1) : 0;
    thetas[k] = theta;
    const size = exp((theta * lnW) / TWO_PI) / final;
    const left = raw[Math.max(0, k - 1)]!;
    const right = raw[Math.min(rings - 1, k + 1)]!;
    let curveScale = size * (1 + IRREGULARITY_AMPLITUDE * p.irregularity * ((left + 2 * raw[k]! + right) / 4));
    const flareFrom = thetaMax - TWO_PI * FLARE_TURNS;
    if (theta > flareFrom) {
      const f = Math.min(1, (theta - flareFrom) / (TWO_PI * FLARE_TURNS));
      curveScale *= 1 + p.flare * FLARE_GAIN * f * f * (3 - 2 * f);
    }
    scales[k] = curveScale;
    const c = cos(theta);
    const s = sin(theta);
    const cx = size * c;
    const cy = -p.translation * size;
    const cz = size * s;
    centres[k * 3] = cx;
    centres[k * 3 + 1] = cy;
    centres[k * 3 + 2] = cz;
    // The curve's plane: across along the radius (c, 0, s), up along the axis tilted toward the
    // direction of coiling (−s, 0, c).
    const vx = -st * s;
    const vy = ct;
    const vz = st * c;
    for (let j = 0; j < points; j++) {
      const u = curve.u[j]! * curveScale;
      const v = curve.v[j]! * curveScale;
      const i = (k * points + j) * 3;
      base[i] = cx + u * c + v * vx;
      base[i + 1] = cy + v * vy;
      base[i + 2] = cz + u * s + v * vz;
    }
  }
  const capIndex = rings * points;
  base[capIndex * 3] = centres[0]!;
  base[capIndex * 3 + 1] = centres[1]!;
  base[capIndex * 3 + 2] = centres[2]!;

  // Ornament along the surface normal (Fowler et al., section 2.5), in proportion to the curve's size.
  const positions = base.slice();
  const relief = new Float64Array(vertexCount);
  const ornamented = p.ribHeight > 0 || p.cordHeight > 0;
  for (let k = 0; k < rings && ornamented; k++) {
    const rib = p.ribCount > 0 ? ribProfile((p.ribCount * thetas[k]!) / TWO_PI, p.ribWidth) : 0;
    const kPrev = Math.max(0, k - 1);
    const kNext = Math.min(rings - 1, k + 1);
    for (let j = 0; j < points; j++) {
      const cord = p.cordCount > 0 ? 0.5 * (1 + cos((TWO_PI * p.cordCount * j) / points)) : 0;
      const height = p.ribHeight * rib + p.cordHeight * cord + p.nodules * (p.ribHeight + p.cordHeight) * rib * cord;
      relief[k * points + j] = height;
      if (height === 0) continue;
      const at = (kk: number, jj: number, axis: number) => base[(kk * points + ((jj + points) % points)) * 3 + axis]!;
      const ax = at(kNext, j, 0) - at(kPrev, j, 0);
      const ay = at(kNext, j, 1) - at(kPrev, j, 1);
      const az = at(kNext, j, 2) - at(kPrev, j, 2);
      const bx = at(k, j + 1, 0) - at(k, j - 1, 0);
      const by = at(k, j + 1, 1) - at(k, j - 1, 1);
      const bz = at(k, j + 1, 2) - at(k, j - 1, 2);
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const i = (k * points + j) * 3;
      // Outward: away from the curve's centre.
      const ox = base[i]! - centres[k * 3]!;
      const oy = base[i + 1]! - centres[k * 3 + 1]!;
      const oz = base[i + 2]! - centres[k * 3 + 2]!;
      if (nx * ox + ny * oy + nz * oz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(len > 0)) continue;
      const d = (height * curveRadius * scales[k]!) / len;
      positions[i] = positions[i]! + nx * d;
      positions[i + 1] = positions[i + 1]! + ny * d;
      positions[i + 2] = positions[i + 2]! + nz * d;
    }
  }

  // Edge pattern, recorded ring by ring (seed stream 2).
  const pattern = new EdgePattern(points, new Rng(p.seed, 2));
  const drivers = new Float64Array(vertexCount * 4);
  let shown = -1;
  for (let k = 0; k < rings; k++) {
    if (k > 0) pattern.step(PATTERN_STEPS_PER_RING, PATTERN_SUBSTEPS);
    const a = pattern.activator;
    for (let j = 0; j < points; j++) {
      const v = k * points + j;
      drivers[v * 4] = k;
      drivers[v * 4 + 1] = j / points;
      drivers[v * 4 + 2] = relief[v]!;
      drivers[v * 4 + 3] = a[j]!;
    }
    const percent = Math.floor((100 * k) / rings);
    if (percent !== shown) {
      shown = percent;
      yield percent / 100;
    }
  }
  let capPattern = 0;
  for (let j = 0; j < points; j++) capPattern += drivers[j * 4 + 3]!;
  drivers[capIndex * 4] = 0;
  drivers[capIndex * 4 + 1] = 0;
  drivers[capIndex * 4 + 2] = 0;
  drivers[capIndex * 4 + 3] = capPattern / points;

  // Left-handed shells are the mirror image (z → −z), with the winding turned to keep faces outward.
  if (p.left) for (let v = 0; v < vertexCount; v++) positions[v * 3 + 2] = -positions[v * 3 + 2]!;

  // Triangles: the tube between rings, and the cap. Choose the winding that faces outward on the
  // first quad of the middle ring, where the shell is well formed.
  const tri: number[] = [];
  const q = (k: number, j: number) => k * points + (j % points);
  const quads: [number, number, number, number][] = [];
  for (let k = 0; k + 1 < rings; k++) for (let j = 0; j < points; j++) quads.push([q(k, j), q(k, j + 1), q(k + 1, j + 1), q(k + 1, j)]);
  const flip = outwardFlip(positions, centres, Math.floor((rings - 1) / 2), points, p.left);
  for (const [a, b, c, d] of quads) {
    if (flip) tri.push(a, c, b, a, d, c);
    else tri.push(a, b, c, a, c, d);
  }
  // The cap faces away from the second ring: the reverse of the tube's winding at ring 0.
  for (let j = 0; j < points; j++) {
    const a = q(0, j);
    const b = q(0, j + 1);
    if (flip) tri.push(capIndex, a, b);
    else tri.push(capIndex, b, a);
  }

  const triangles = Int32Array.from(tri);
  yield 1;
  return {
    positions,
    triangles,
    drivers,
    cellWidth: (TWO_PI * curveRadius * (scales[rings - 1] ?? 1)) / points,
    drawnThickness: p.wallThickness * curveRadius * (scales[rings - 1] ?? 1),
    stats: { rings, points, whorls, vertices: vertexCount, triangles: triangles.length / 3 },
    hash: hashSheetGeometry({ positions, triangles, drivers }),
  };
}

/** Whether the winding (k, j), (k, j + 1), (k + 1, j + 1) must be reversed to face out of the shell. */
function outwardFlip(positions: Float64Array, centres: Float64Array, k: number, points: number, left: boolean): boolean {
  const at = (v: number, axis: number) => positions[v * 3 + axis]!;
  const a = k * points;
  const b = k * points + 1;
  const c = (k + 1) * points + 1;
  const ux = at(b, 0) - at(a, 0);
  const uy = at(b, 1) - at(a, 1);
  const uz = at(b, 2) - at(a, 2);
  const vx = at(c, 0) - at(a, 0);
  const vy = at(c, 1) - at(a, 1);
  const vz = at(c, 2) - at(a, 2);
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const mz = left ? -1 : 1;
  const ox = at(a, 0) - centres[k * 3]!;
  const oy = at(a, 1) - centres[k * 3 + 1]!;
  const oz = at(a, 2) - mz * centres[k * 3 + 2]!;
  return nx * ox + ny * oy + nz * oz < 0;
}

/** Worker job: grows a species D code. */
export function* speciesD(input: SpeciesDInput): Generator<number, JobDone<ShellGeometry>> {
  const geometry = yield* growSpeciesD(speciesDParams(input.code));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}
