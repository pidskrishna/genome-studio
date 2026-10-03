import { D, DUPLICATE_DISTANCE, UP, ZERO_DIRECTION } from './constants';

// Space colonisation, as in Runions, Lane and Prusinkiewicz (2007), with the additions agreed in
// clarifications 4 and 15. Lengths are in units of D.
//
// Each step:
//  1. every attraction point influences its nearest node, if that node is within the radius of
//     influence;
//  2. every influenced node v grows a new node at v + D·dir, where dir is (n̂ + g) normalised and
//     n̂ is the normalised sum of the unit vectors from v to its points (paper eqs. 2 and 3);
//  3. points closer than the kill distance to any node are removed.
//
// Nodes are never removed while growing, so each point's nearest node is kept up to date
// incrementally: only a newly added node can become nearer. Points sit in a uniform grid with
// cells one radius of influence wide, so a new node only checks the 27 cells around it.

export type StopReason =
  /** Every attraction point was removed (paper). */
  | 'all-points-removed'
  /** No remaining point is within range of any node (paper). */
  | 'out-of-range'
  /** Points are in range but no node could grow: every direction summed to zero (clarification 15). */
  | 'stalled'
  /** The fixed step cap was reached (clarification 15). */
  | 'step-cap';

export interface ColoniseConfig {
  /** Attraction points, xyz triples. */
  points: Float64Array;
  /** Starting nodes, xyz triples. */
  origins: Float64Array;
  sensingRange: number;
  /** Must not exceed the sensing range. */
  killDistance: number;
  /** Vertical growth bias: g = (0, tropism, 0). */
  tropism: number;
  stepCap: number;
}

export interface ColoniseResult {
  x: number[];
  y: number[];
  z: number[];
  /** Parent of each node, −1 for a starting node. Parents always come before their children. */
  parent: number[];
  steps: number;
  stopReason: StopReason;
  pointsLeft: number;
}

/** Yields progress from 0 to 1 after each step and returns the grown tree. */
export function* colonise(config: ColoniseConfig): Generator<number, ColoniseResult> {
  const { points, origins, tropism, stepCap } = config;
  const ri = config.sensingRange;
  const dk = Math.min(config.killDistance, ri);
  const ri2 = ri * ri;
  const dk2 = dk * dk;
  const pointCount = points.length / 3;

  // ---- uniform grid of attraction points
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < pointCount; i++) {
    const px = points[i * 3] as number;
    const py = points[i * 3 + 1] as number;
    const pz = points[i * 3 + 2] as number;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    minZ = Math.min(minZ, pz);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
    maxZ = Math.max(maxZ, pz);
  }
  if (pointCount === 0) {
    minX = minY = minZ = maxX = maxY = maxZ = 0;
  }
  const cell = ri;
  const nx = Math.floor((maxX - minX) / cell) + 1;
  const ny = Math.floor((maxY - minY) / cell) + 1;
  const nz = Math.floor((maxZ - minZ) / cell) + 1;
  const cellOf = (i: number) =>
    (Math.floor(((points[i * 3 + 1] as number) - minY) / cell) * nz +
      Math.floor(((points[i * 3 + 2] as number) - minZ) / cell)) *
      nx +
    Math.floor(((points[i * 3] as number) - minX) / cell);
  const cellStart = new Int32Array(nx * ny * nz + 1);
  for (let i = 0; i < pointCount; i++) {
    const c = cellOf(i);
    cellStart[c + 1] = (cellStart[c + 1] as number) + 1;
  }
  for (let c = 0; c < nx * ny * nz; c++) cellStart[c + 1] = (cellStart[c + 1] as number) + (cellStart[c] as number);
  const cellFill = cellStart.slice(0, nx * ny * nz);
  const cellItems = new Int32Array(pointCount);
  for (let i = 0; i < pointCount; i++) {
    const c = cellOf(i);
    cellItems[cellFill[c] as number] = i;
    cellFill[c] = (cellFill[c] as number) + 1;
  }

  const alive = new Uint8Array(pointCount).fill(1);
  let aliveCount = pointCount;
  const nearest = new Int32Array(pointCount).fill(-1);
  const nearestD2 = new Float64Array(pointCount).fill(Infinity);

  // ---- nodes
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  const parent: number[] = [];
  const firstChild: number[] = [];
  const nextSibling: number[] = [];
  const sumX: number[] = [];
  const sumY: number[] = [];
  const sumZ: number[] = [];
  const influence: number[] = [];

  function addNode(nxp: number, nyp: number, nzp: number, p: number): number {
    const id = x.length;
    x.push(nxp);
    y.push(nyp);
    z.push(nzp);
    parent.push(p);
    firstChild.push(-1);
    nextSibling.push(-1);
    sumX.push(0);
    sumY.push(0);
    sumZ.push(0);
    influence.push(0);
    if (p >= 0) {
      nextSibling[id] = firstChild[p] as number;
      firstChild[p] = id;
    }
    // Update the nearest node of every point within range, and remove points within kill distance.
    const ix = Math.floor((nxp - minX) / cell);
    const iy = Math.floor((nyp - minY) / cell);
    const iz = Math.floor((nzp - minZ) / cell);
    const x0 = Math.max(0, ix - 1);
    const x1 = Math.min(nx - 1, ix + 1);
    const y0 = Math.max(0, iy - 1);
    const y1 = Math.min(ny - 1, iy + 1);
    const z0 = Math.max(0, iz - 1);
    const z1 = Math.min(nz - 1, iz + 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = (cy * nz + cz) * nx + cx;
          const end = cellStart[c + 1] as number;
          for (let k = cellStart[c] as number; k < end; k++) {
            const i = cellItems[k] as number;
            if (alive[i] === 0) continue;
            const dx = (points[i * 3] as number) - nxp;
            const dy = (points[i * 3 + 1] as number) - nyp;
            const dz = (points[i * 3 + 2] as number) - nzp;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < dk2) {
              alive[i] = 0;
              aliveCount--;
            } else if (d2 <= ri2 && d2 < (nearestD2[i] as number)) {
              nearest[i] = id;
              nearestD2[i] = d2;
            }
          }
        }
      }
    }
    return id;
  }

  const originCount = origins.length / 3;
  let trunkTips: number[] = [];
  for (let j = 0; j < originCount; j++) {
    trunkTips.push(addNode(origins[j * 3] as number, origins[j * 3 + 1] as number, origins[j * 3 + 2] as number, -1));
  }

  // Trunk direction while no point is in range: straight up plus tropism (clarification 4).
  const tx = UP[0];
  const ty = UP[1] + tropism;
  const tz = UP[2];
  const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
  const trunkX = (tx / tl) * D;
  const trunkY = (ty / tl) * D;
  const trunkZ = (tz / tl) * D;

  let everInRange = false;
  let steps = 0;
  let stopReason: StopReason;
  let progress = 0;
  const touched: number[] = [];

  for (;;) {
    if (aliveCount === 0) {
      stopReason = 'all-points-removed';
      break;
    }
    if (steps >= stepCap) {
      stopReason = 'step-cap';
      break;
    }

    // 1. Each live point influences its nearest node within range.
    touched.length = 0;
    for (let i = 0; i < pointCount; i++) {
      if (alive[i] === 0) continue;
      const v = nearest[i] as number;
      if (v < 0) continue;
      const len = Math.sqrt(nearestD2[i] as number);
      if (influence[v] === 0) touched.push(v);
      influence[v] = (influence[v] as number) + 1;
      sumX[v] = (sumX[v] as number) + ((points[i * 3] as number) - (x[v] as number)) / len;
      sumY[v] = (sumY[v] as number) + ((points[i * 3 + 1] as number) - (y[v] as number)) / len;
      sumZ[v] = (sumZ[v] as number) + ((points[i * 3 + 2] as number) - (z[v] as number)) / len;
    }

    if (touched.length === 0) {
      if (everInRange) {
        stopReason = 'out-of-range';
        break;
      }
      // Clear stem: the newest nodes grow straight up until points come into range.
      const above = trunkTips.every((t) => (y[t] as number) > maxY + ri);
      if (above) {
        // The trunk has passed every point and only grows upward: none can ever come into range.
        stopReason = 'out-of-range';
        break;
      }
      trunkTips = trunkTips.map((t) => addNode((x[t] as number) + trunkX, (y[t] as number) + trunkY, (z[t] as number) + trunkZ, t));
    } else {
      everInRange = true;
      touched.sort((a, b) => a - b);
      let grew = 0;
      for (const v of touched) {
        const sx = sumX[v] as number;
        const sy = sumY[v] as number;
        const sz = sumZ[v] as number;
        sumX[v] = 0;
        sumY[v] = 0;
        sumZ[v] = 0;
        influence[v] = 0;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl < ZERO_DIRECTION) continue; // zero-direction rule
        const dx = sx / sl;
        const dy = sy / sl + tropism;
        const dz = sz / sl;
        const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const gx = (x[v] as number) + (dx / dl) * D;
        const gy = (y[v] as number) + (dy / dl) * D;
        const gz = (z[v] as number) + (dz / dl) * D;
        let duplicate = false;
        for (let c = firstChild[v] as number; c >= 0; c = nextSibling[c] as number) {
          const ex = (x[c] as number) - gx;
          const ey = (y[c] as number) - gy;
          const ez = (z[c] as number) - gz;
          if (ex * ex + ey * ey + ez * ez < DUPLICATE_DISTANCE * DUPLICATE_DISTANCE) {
            duplicate = true;
            break;
          }
        }
        if (duplicate) continue;
        addNode(gx, gy, gz, v);
        grew++;
      }
      if (grew === 0) {
        stopReason = 'stalled';
        break;
      }
    }

    steps++;
    progress = Math.max(progress, 1 - aliveCount / Math.max(1, pointCount), steps / stepCap);
    yield progress;
  }

  return { x, y, z, parent, steps, stopReason, pointsLeft: aliveCount };
}
