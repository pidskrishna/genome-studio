import { atan2, cos, PI, sin } from '../dmath';
import type { JobDone } from '../host';
import { Rng } from '../rng';
import { hashBranchGeometry } from '../speciesA';
import {
  CAP_TIME,
  CLOSE_TIME,
  COLONY_TIME,
  CUP_TIME,
  DRAFT_SIDES,
  DRAFT_STEP,
  DRAWN_SIDES,
  FLAT_TIME,
  GROW_MULTIPLE,
  LC,
  NECK_PULL,
  NECK_TIME,
  ORIENT_TOLERANCE,
  SEGMENT_CAP,
  TIP_CAP,
  VERTEX_CAP,
} from './constants';
import { FieldTree, type FieldPoints, type FieldSample } from './field';
import { speciesFParams, type SpeciesFParams } from './params';

// Species F (spec section 4d): the Neighbour-Sensing model of Meškauskas, McNulty and Moore (2004),
// with clarification 34. The mycelium is a tree of sections, each a run of unit segments from a
// branch point. Every time step, all growing tips read the fields of the mycelium as it stood at
// the start of the step: a tip grows only while the density field is below GROW_MULTIPLE times the
// branching threshold; it turns toward its tropism vector with persistence k (eq. 13) and advances
// one unit; where the density field is below the branching threshold it may branch. The rules
// change over time for all tips at once, in the phases of the chosen programme (figures 5 to 8).

export interface SpeciesFInput {
  code: string;
}

export type StopReason = 'programme' | 'segment cap' | 'no growth';

/** Plain geometry data for species F, in the species A form (clarification 27). */
export interface HyphaGeometry {
  /** xyz per node; y is up. */
  positions: Float64Array;
  /** Parent of each node, −1 for the start. Parents come before children. */
  parents: Int32Array;
  /** Every node has the hypha thickness. */
  radii: Float64Array;
  /** Four values per node: hyphal age, tips supported, phase of the programme, height. */
  drivers: Float64Array;
  stats: { steps: number; stopReason: StopReason; segments: number; tips: number; nodes: number; drawnVertices: number };
  /** Sides to draw each hypha with: the renderer's usual 8, or fewer in a draft (clarification 28). */
  drawnSides: number;
  /** Geometry hash over positions, parents, radii and drivers. */
  hash: string;
}

export const DRIVER_COUNT = 4;

/** One phase of a programme: when it ends, and what the tips do in it. */
interface Phase {
  end: number;
  /** Target angle from vertical at the start and end of the phase, or 'cap' for the cap's turn; null for no orientation. */
  angle: [number, number] | 'cap' | null;
  /** Fraction of the closing pull (locus 8) in force. */
  pull: number;
  parallel: boolean;
}

const HALF_PI = PI / 2;

/** The phases of each programme (section 4d, clarification 34), in steps of `step` units. */
function programme(p: SpeciesFParams, step: number): Phase[] {
  const steps = (time: number) => Math.floor(time / step);
  if (p.programme === 0) return [{ end: steps(COLONY_TIME), angle: null, pull: 0, parallel: false }];
  const phases: Phase[] = [];
  let t = steps(FLAT_TIME);
  phases.push({ end: t, angle: [HALF_PI, HALF_PI], pull: 0, parallel: false });
  t += steps(CUP_TIME);
  phases.push({ end: t, angle: [HALF_PI, p.cupAngle], pull: 0, parallel: true });
  if (p.programme >= 2) {
    t += steps(CLOSE_TIME);
    phases.push({ end: t, angle: null, pull: 1, parallel: true });
  }
  if (p.programme >= 3) {
    t += steps(NECK_TIME);
    // Figure 7C: the pull is reduced, not removed, and growth turns upward into a bottle's neck.
    phases.push({ end: t, angle: [0, 0], pull: NECK_PULL, parallel: true });
  }
  if (p.programme >= 4) {
    if (steps(p.stemLength) > 0) {
      t += steps(p.stemLength);
      phases.push({ end: t, angle: [0, 0], pull: 0, parallel: true });
    }
    t += steps(CAP_TIME);
    phases.push({ end: t, angle: 'cap', pull: 0, parallel: true });
  }
  return phases;
}

interface Tip {
  node: number;
  section: number;
  dx: number;
  dy: number;
  dz: number;
  /** Path length from the start. */
  length: number;
  /** Path length when the cap phase began, inherited by branches. */
  capStart: number;
}

/** A unit vector at angle `spread` (or less) from (ax, ay, az), uniform over that cap of the sphere. */
function inCone(ax: number, ay: number, az: number, spread: number, rng: Rng): [number, number, number] {
  const c = 1 - rng.next() * (1 - cos(spread));
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const phi = 2 * PI * rng.next();
  // A frame (u, v) perpendicular to a.
  let ux = 0;
  let uy = 0;
  let uz = 0;
  if (Math.abs(ax) <= Math.abs(ay) && Math.abs(ax) <= Math.abs(az)) ux = 1;
  else if (Math.abs(ay) <= Math.abs(az)) uy = 1;
  else uz = 1;
  let vx = ay * uz - az * uy;
  let vy = az * ux - ax * uz;
  let vz = ax * uy - ay * ux;
  const lv = Math.sqrt(vx * vx + vy * vy + vz * vz);
  vx /= lv;
  vy /= lv;
  vz /= lv;
  const wx = ay * vz - az * vy;
  const wy = az * vx - ax * vz;
  const wz = ax * vy - ay * vx;
  const cp = cos(phi);
  const sp = sin(phi);
  return [c * ax + s * (cp * vx + sp * wx), c * ay + s * (cp * vy + sp * wy), c * az + s * (cp * vz + sp * wz)];
}

function normalise(x: number, y: number, z: number): [number, number, number] | null {
  const l = Math.sqrt(x * x + y * y + z * z);
  return l > 0 ? [x / l, y / l, z / l] : null;
}

export interface HyphaOptions {
  /**
   * The draft (clarification 28): tips grow DRAFT_STEP units per step for that fraction of the
   * steps, with branching and persistence per step raised, and the hyphae drawn with fewer sides.
   */
  draft?: boolean;
}

/** Grows species F from decoded parameters. Yields progress from 0 to 1. */
export function* growSpeciesF(full: SpeciesFParams, options: HyphaOptions = {}): Generator<number, HyphaGeometry> {
  const step = options.draft ? DRAFT_STEP : 1;
  // A coarser step branches and turns a little more per step: a branch chance of 1 − (1 − p)² and a
  // persistence of k². (Matching per unit of length at a step of 3 would be cubes; the squares keep
  // the draft fast and still show the organism's character.)
  const p: SpeciesFParams = options.draft
    ? {
        ...full,
        branchingProbability: 1 - (1 - full.branchingProbability) * (1 - full.branchingProbability),
        persistence: full.persistence * full.persistence,
      }
    : full;
  const sides = options.draft ? DRAFT_SIDES : DRAWN_SIDES;
  const phases = programme(p, step);
  const total = phases[phases.length - 1]!.end;
  const rng = new Rng(p.seed, 1);

  // Nodes: the start, then one per unit of growth.
  const nx: number[] = [0];
  const ny: number[] = [0];
  const nz: number[] = [0];
  const parent: number[] = [-1];
  const birth: number[] = [0];
  const phaseOf: number[] = [0];
  const sectionOf: number[] = [-1];
  const sectionSize: number[] = [];
  /** Field point indices (node − 1) of each section. */
  const sectionPoints: number[][] = [[]];
  let tips: Tip[] = [{ node: 0, section: 0, dx: 0, dy: 1, dz: 0, length: 0, capStart: 0 }];
  sectionSize.push(0);

  const sample: FieldSample = { density: 0, dx: 0, dy: 0, dz: 0, mx: 0, my: 0, mz: 0, px: 0, py: 0, pz: 0 };
  let steps = 0;
  let stopReason: StopReason = 'programme';
  let phaseIndex = 0;
  let capBegun = false;
  let shown = -1;
  const growLimit = GROW_MULTIPLE * p.branchingThreshold;

  for (let t = 1; t <= total; t++) {
    while (phases[phaseIndex]!.end < t) phaseIndex++;
    const phase = phases[phaseIndex]!;
    const phaseStart = phaseIndex === 0 ? 0 : phases[phaseIndex - 1]!.end;
    if (phase.angle === 'cap' && !capBegun) {
      capBegun = true;
      for (const tip of tips) tip.capStart = tip.length;
    }

    // The mycelium as it stands at the start of this step.
    const count = nx.length - 1;
    const pts: FieldPoints = {
      count,
      step,
      x: new Float64Array(count),
      y: new Float64Array(count),
      z: new Float64Array(count),
      weight: new Float64Array(count),
      section: new Int32Array(count),
      tx: new Float64Array(count),
      ty: new Float64Array(count),
      tz: new Float64Array(count),
    };
    for (let i = 0; i < count; i++) {
      const v = i + 1;
      const u = parent[v]!;
      pts.x[i] = nx[v]!;
      pts.y[i] = ny[v]!;
      pts.z[i] = nz[v]!;
      pts.section[i] = sectionOf[v]!;
      pts.weight[i] = LC / sectionSize[sectionOf[v]!]!;
      pts.tx[i] = (nx[v]! - nx[u]!) / step;
      pts.ty[i] = (ny[v]! - ny[u]!) / step;
      pts.tz[i] = (nz[v]! - nz[u]!) / step;
    }
    const tree = new FieldTree(pts);

    const next: Tip[] = [];
    let grew = 0;
    let growingTips = 0;
    for (const tip of tips) {
      const v = tip.node;
      tree.sample(nx[v]!, ny[v]!, nz[v]!, sectionPoints[tip.section]!, sample);
      if (!(sample.density < growLimit)) {
        next.push(tip);
        continue;
      }
      growingTips++;
      // Tropism (eq. 11), each term as a unit vector times its impact.
      let vx = 0;
      let vy = 0;
      let vz = 0;
      const addUnit = (x: number, y: number, z: number, impact: number) => {
        if (!(impact > 0)) return;
        const u = normalise(x, y, z);
        if (!u) return;
        vx += impact * u[0];
        vy += impact * u[1];
        vz += impact * u[2];
      };
      addUnit(-sample.dx, -sample.dy, -sample.dz, p.selfAvoidance);
      if (phase.pull > 0) addUnit(sample.mx, sample.my, sample.mz, phase.pull * p.closingPull);
      if (phase.parallel) addUnit(sample.px, sample.py, sample.pz, p.parallelTropism);
      if (phase.angle !== null && p.orientationStrength > 0) {
        let target: number;
        if (phase.angle === 'cap') {
          const f = Math.min(1, Math.max(0, (tip.length - tip.capStart) / p.capTurnLength));
          target = HALF_PI + (p.capAngle - HALF_PI) * f;
        } else {
          const f = (t - phaseStart) / (phase.end - phaseStart);
          target = phase.angle[0] + (phase.angle[1] - phase.angle[0]) * f;
        }
        const angle = atan2(Math.sqrt(tip.dx * tip.dx + tip.dz * tip.dz), tip.dy);
        if (Math.abs(target - angle) > ORIENT_TOLERANCE) {
          // Eq. 12: a vertical push, up when the tip points lower than the target, down when higher,
          // turned about the hyphal axis by the spiral twist (Rodrigues' formula).
          let gx = 0;
          let gy = angle > target ? 1 : -1;
          let gz = 0;
          if (p.spiralTwist > 0) {
            const c = cos(p.spiralTwist);
            const s = sin(p.spiralTwist);
            const kx = tip.dx;
            const ky = tip.dy;
            const kz = tip.dz;
            const cx = ky * gz - kz * gy;
            const cy = kz * gx - kx * gz;
            const cz = kx * gy - ky * gx;
            const dot = kx * gx + ky * gy + kz * gz;
            gx = gx * c + cx * s + kx * dot * (1 - c);
            gy = gy * c + cy * s + ky * dot * (1 - c);
            gz = gz * c + cz * s + kz * dot * (1 - c);
          }
          vx += p.orientationStrength * gx;
          vy += p.orientationStrength * gy;
          vz += p.orientationStrength * gz;
        }
      }
      // Eq. 13: the new direction keeps k of the old one.
      const tropism = normalise(vx, vy, vz);
      let dir: [number, number, number] = [tip.dx, tip.dy, tip.dz];
      if (tropism) {
        const k = p.persistence;
        dir = normalise(k * tip.dx + (1 - k) * tropism[0], k * tip.dy + (1 - k) * tropism[1], k * tip.dz + (1 - k) * tropism[2]) ?? dir;
      }

      // Branching, decided at the tip before it moves: the section ends here and two begin. A
      // section must have grown before its tip can branch, so branches never pile up on one point.
      const canBranch = sample.density < p.branchingThreshold && sectionSize[tip.section]! > 0 && tips.length + next.length < TIP_CAP;
      const branchRoll = rng.next();
      if (canBranch && branchRoll < p.branchingProbability) {
        const spread = inCone(dir[0], dir[1], dir[2], p.branchAngle, rng);
        let side = spread;
        if (tropism) side = normalise(spread[0] + (1 - p.persistence) * tropism[0], spread[1] + (1 - p.persistence) * tropism[1], spread[2] + (1 - p.persistence) * tropism[2]) ?? spread;
        for (const d of [dir, side]) {
          const section = sectionSize.length;
          sectionSize.push(0);
          sectionPoints.push([]);
          next.push({ node: v, section, dx: d[0], dy: d[1], dz: d[2], length: tip.length, capStart: tip.capStart });
        }
        continue;
      }
      // Grow one unit, unless the segment cap is reached.
      if (nx.length - 1 >= SEGMENT_CAP) {
        next.push(tip);
        continue;
      }
      const u = nx.length;
      nx.push(nx[v]! + step * dir[0]);
      ny.push(ny[v]! + step * dir[1]);
      nz.push(nz[v]! + step * dir[2]);
      parent.push(v);
      birth.push(t);
      phaseOf.push(phaseIndex);
      sectionOf.push(tip.section);
      sectionSize[tip.section] = sectionSize[tip.section]! + 1;
      sectionPoints[tip.section]!.push(u - 1);
      next.push({ node: u, section: tip.section, dx: dir[0], dy: dir[1], dz: dir[2], length: tip.length + step, capStart: tip.capStart });
      grew++;
    }
    tips = next;
    steps = t;
    const percent = Math.floor((100 * t) / total);
    if (percent !== shown) {
      shown = percent;
      yield percent / 100;
    }
    if (nx.length - 1 >= SEGMENT_CAP) {
      stopReason = 'segment cap';
      break;
    }
    if (grew === 0 && growingTips === 0) {
      stopReason = 'no growth';
      break;
    }
  }

  return output(p, { nx, ny, nz, parent, birth, phaseOf }, tips.length, steps, stopReason, sides);
}

/** Thins the nodes to the drawn vertex cap, works out the drivers, and packs the geometry. */
function output(
  p: SpeciesFParams,
  m: { nx: number[]; ny: number[]; nz: number[]; parent: number[]; birth: number[]; phaseOf: number[] },
  tipCount: number,
  steps: number,
  stopReason: StopReason,
  sides: number,
): HyphaGeometry {
  const n = m.nx.length;
  const children = new Int32Array(n);
  for (let v = 1; v < n; v++) children[m.parent[v]!] = children[m.parent[v]!]! + 1;
  // Tips supported: the hyphal tips beyond each node (the paper's colouring).
  const supported = new Float64Array(n);
  for (let v = n - 1; v >= 0; v--) {
    if (children[v] === 0) supported[v] = supported[v]! + 1;
    const u = m.parent[v]!;
    if (u >= 0) supported[u] = supported[u]! + supported[v]!;
  }
  // The branch renderer draws one tube per chain; each side chain repeats its parent node and
  // every chain is capped, the first at both ends: (nodes + side chains) × sides + (side chains + 2)
  // × (sides + 1) vertices.
  let sideChains = 0;
  for (let v = 0; v < n; v++) sideChains += Math.max(0, children[v]! - 1);
  const drawn = (nodes: number) => (nodes + sideChains) * sides + (sideChains + 2) * (sides + 1);
  // Keep the start, every end and branch point, and every k-th node between, within the vertex cap.
  let keepEvery = 1;
  const estimate = (k: number) => {
    let kept = 0;
    for (let v = 0; v < n; v++) if (v === 0 || children[v] !== 1 || m.birth[v]! % k === 0) kept++;
    return drawn(kept);
  };
  while (estimate(keepEvery) > VERTEX_CAP && keepEvery < 64) keepEvery++;
  const map = new Int32Array(n).fill(-1);
  const kept: number[] = [];
  for (let v = 0; v < n; v++) {
    if (v === 0 || children[v] !== 1 || m.birth[v]! % keepEvery === 0) {
      map[v] = kept.length;
      kept.push(v);
    }
  }
  const nearestKept = (v: number) => {
    let u = v;
    while (u >= 0 && map[u] === -1) u = m.parent[u]!;
    return u;
  };
  const count = kept.length;
  const positions = new Float64Array(count * 3);
  const parents = new Int32Array(count);
  const radii = new Float64Array(count).fill(p.hyphaThickness);
  const drivers = new Float64Array(count * 4);
  for (let i = 0; i < count; i++) {
    const v = kept[i]!;
    positions[i * 3] = m.nx[v]!;
    positions[i * 3 + 1] = m.ny[v]!;
    positions[i * 3 + 2] = m.nz[v]!;
    const u = m.parent[v]!;
    parents[i] = u < 0 ? -1 : map[nearestKept(u)]!;
    drivers[i * 4] = m.birth[v]!;
    drivers[i * 4 + 1] = supported[v]!;
    drivers[i * 4 + 2] = m.phaseOf[v]!;
    drivers[i * 4 + 3] = m.ny[v]!;
  }
  return {
    positions,
    parents,
    radii,
    drivers,
    stats: { steps, stopReason, segments: n - 1, tips: tipCount, nodes: count, drawnVertices: drawn(count) },
    drawnSides: sides,
    hash: hashBranchGeometry({ positions, parents, radii, drivers }),
  };
}

/** Worker job: grows a species F code. */
export function* speciesF(input: SpeciesFInput): Generator<number, JobDone<HyphaGeometry>> {
  const geometry = yield* growSpeciesF(speciesFParams(input.code));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.parents.buffer, geometry.radii.buffer, geometry.drivers.buffer],
  };
}
