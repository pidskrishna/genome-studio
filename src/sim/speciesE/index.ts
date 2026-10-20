import { pow } from '../dmath';
import type { JobDone } from '../host';
import { Rng } from '../rng';
import { hashSheetGeometry } from '../speciesB';
import {
  AREA_FACTOR,
  CURVATURE_MAX,
  CURVATURE_MIN,
  DRAFT_SCALE,
  DRAWN_THICKNESS,
  FUSE_FACTOR,
  FUSE_PASSES,
  GROWING_VERTEX_CAP,
  LATTICE,
  SIDE_MARGIN,
  SMOOTHING_GAIN,
  SPLIT_FACTOR,
  SPLIT_PASSES,
  STEP_CAP,
  TOP_FRACTION,
} from './constants';
import { addCorallites } from './corallites';
import { NutrientField, voxelise } from './field';
import type { CoralMesh } from './mesh';
import { speciesEParams, type SpeciesEParams } from './params';
import { startingMesh } from './start';

// Species E (spec section 4c): accretive growth in a diffusing nutrient field, after Kaandorp and
// Sloot (2001), Merks et al. (2003) and Kaandorp et al. (2005), with clarifications 29 and 32. Each
// growth step: the colony is filled into the lattice as solid; the field takes one diffusion step;
// each polyp's uptake is probed at the polyp height along its normal and normalised by the largest;
// each vertex moves out along its normal by s · c^γ · k(h), or not at all below the threshold tr;
// the surface is smoothed and refined. Lengths are in lattice units throughout.

export interface SpeciesEInput {
  code: string;
}

export type StopReason = 'top' | 'steps' | 'vertex cap' | 'starved';

/** Plain geometry data for species E, in the same form as species B's (clarification 27). */
export interface CoralGeometry {
  positions: Float64Array;
  /** Three vertex indices per triangle, facing out of the colony. */
  triangles: Int32Array;
  /** Four values per vertex: growth layer, nutrient uptake, curvature, height. */
  drivers: Float64Array;
  /** Spacing of the drawn vertices. */
  cellWidth: number;
  drawnThickness: number;
  stats: { steps: number; stopReason: StopReason; polyps: number; vertices: number; triangles: number; levels: number; top: number };
  /** Geometry hash over positions, triangles and drivers. */
  hash: string;
}

export const DRIVER_COUNT = 4;

/** Keeps every vertex above the floor and inside the sides of the growth space. */
function confine(mesh: CoralMesh, n: number): void {
  const p = mesh.positions;
  const lo = SIDE_MARGIN;
  const hi = n - 1 - SIDE_MARGIN;
  for (let v = 0; v < mesh.vertexCount; v++) {
    p[v * 3] = Math.min(hi, Math.max(lo, p[v * 3]!));
    p[v * 3 + 1] = Math.max(0, p[v * 3 + 1]!);
    p[v * 3 + 2] = Math.min(hi, Math.max(lo, p[v * 3 + 2]!));
  }
}

function top(mesh: CoralMesh): number {
  let max = 0;
  for (let v = 0; v < mesh.vertexCount; v++) max = Math.max(max, mesh.positions[v * 3 + 1]!);
  return max;
}

export interface CoralOptions {
  /**
   * The draft (clarification 28): the same colony on a lattice DRAFT_SCALE times coarser, every
   * length divided by it, so the polyps are relatively larger where the spacing is near its minimum;
   * no corallites. The result is scaled back up, so it sits where the organism will.
   */
  draft?: boolean;
}

/** Grows species E from decoded parameters. Yields progress from 0 to 1. */
export function* growSpeciesE(full: SpeciesEParams, options: CoralOptions = {}): Generator<number, CoralGeometry> {
  const scale = options.draft ? DRAFT_SCALE : 1;
  const n = LATTICE / scale;
  const p: SpeciesEParams = options.draft
    ? {
        ...full,
        polypSpacing: Math.max(1, full.polypSpacing / scale),
        layerThickness: full.layerThickness / scale,
        polypHeight: full.polypHeight / scale,
        startingSize: full.startingSize / scale,
        coralliteDepth: 0,
        coralliteRim: 0,
      }
    : full;
  const spacing = p.polypSpacing;
  const s = p.layerThickness;
  // α = D Δt, from growth to transport = s² / (D Δt).
  const alpha = (s * s) / p.growthToTransport;
  const minArea = AREA_FACTOR * (Math.sqrt(3) / 4) * spacing * spacing;
  const topLimit = TOP_FRACTION * (n - 1);
  const mesh = startingMesh(p, n);
  const field = new NutrientField(n);
  const solid = new Uint8Array(n * n * n);
  const irregular = new Rng(p.seed, 1);
  const useCurvature = p.curvatureRule > 0;
  const minRadius = CURVATURE_MIN * s;
  const maxRadius = CURVATURE_MAX * s;

  let steps = 0;
  let stopReason: StopReason = 'steps';
  let shown = -1;
  for (let step = 1; step <= STEP_CAP; step++) {
    voxelise(n, mesh.positions, mesh.triangles, mesh.triangleCount, solid);
    field.setSolid(solid);
    field.step(alpha);

    const V = mesh.vertexCount;
    const normals = mesh.normals();
    const uptake = new Float64Array(V);
    let most = 0;
    for (let v = 0; v < V; v++) {
      const h = p.polypHeight;
      const c = field.sample(mesh.positions[v * 3]! + h * normals[v * 3]!, mesh.positions[v * 3 + 1]! + h * normals[v * 3 + 1]!, mesh.positions[v * 3 + 2]! + h * normals[v * 3 + 2]!);
      uptake[v] = Math.max(0, c);
      most = Math.max(most, uptake[v]!);
    }
    if (!(most > 1e-12)) {
      stopReason = 'starved';
      break;
    }
    const low = useCurvature ? mesh.curvature().low : null;
    for (let v = 0; v < V; v++) {
      const c = uptake[v]! / most;
      mesh.uptake[v] = c;
      let g = p.uptakeResponse === 1 ? c : pow(c, p.uptakeResponse);
      if (low) {
        // Kaandorp and Sloot's rule on the larger principal radius of curvature, 1 / κ2 (none where
        // κ2 ≤ 0): growth is full below the minimum radius and none above the maximum.
        const radius = low[v]! > 0 ? 1 / low[v]! : 0;
        const k = Math.min(1, Math.max(0, 1 - (radius - minRadius) / (maxRadius - minRadius)));
        g *= 1 - p.curvatureRule + p.curvatureRule * k;
      }
      const jitter = 1 + p.irregularity * (2 * irregular.next() - 1);
      if (!(g > p.growthThreshold)) continue;
      const l = s * g * jitter;
      for (let d = 0; d < 3; d++) mesh.positions[v * 3 + d] = mesh.positions[v * 3 + d]! + l * normals[v * 3 + d]!;
    }
    confine(mesh, n);
    mesh.smooth(SMOOTHING_GAIN * p.smoothing);
    confine(mesh, n);
    for (let pass = 0; pass < SPLIT_PASSES; pass++) if (mesh.split(SPLIT_FACTOR * spacing, step) === 0) break;
    for (let pass = 0; pass < FUSE_PASSES; pass++) if (mesh.fuse(FUSE_FACTOR * spacing, minArea, 0) === 0) break;
    steps = step;

    const height = top(mesh);
    const percent = Math.floor(100 * Math.min(1, Math.max(step / STEP_CAP, height / topLimit)));
    if (percent !== shown) {
      shown = percent;
      yield percent / 100;
    }
    if (height >= topLimit) {
      stopReason = 'top';
      break;
    }
    if (mesh.vertexCount >= GROWING_VERTEX_CAP) {
      stopReason = 'vertex cap';
      break;
    }
  }

  mesh.removeDegenerate(0);
  const polyps = mesh.vertexCount;
  const finalTop = top(mesh);
  const { mean } = mesh.curvature();
  const relief = addCorallites(mesh, p, mean);
  mesh.removeDegenerate(0);

  // Centre the colony over the origin; y stays the height above the floor.
  const V = mesh.vertexCount;
  const positions = new Float64Array(V * 3);
  const drivers = new Float64Array(V * 4);
  for (let v = 0; v < V; v++) {
    positions[v * 3] = (mesh.positions[v * 3]! - n / 2) * scale;
    positions[v * 3 + 1] = mesh.positions[v * 3 + 1]! * scale;
    positions[v * 3 + 2] = (mesh.positions[v * 3 + 2]! - n / 2) * scale;
    drivers[v * 4] = mesh.birth[v]!;
    drivers[v * 4 + 1] = mesh.uptake[v]!;
    drivers[v * 4 + 2] = relief.curvature[v] ?? 0;
    drivers[v * 4 + 3] = positions[v * 3 + 1]!;
  }
  const triangles = Int32Array.from(mesh.triangles);
  yield 1;
  return {
    positions,
    triangles,
    drivers,
    cellWidth: (scale * spacing) / (1 << relief.levels),
    drawnThickness: DRAWN_THICKNESS * spacing * scale,
    stats: { steps, stopReason, polyps, vertices: V, triangles: triangles.length / 3, levels: relief.levels, top: finalTop },
    hash: hashSheetGeometry({ positions, triangles, drivers }),
  };
}

/** Worker job: grows a species E code. */
export function* speciesE(input: SpeciesEInput): Generator<number, JobDone<CoralGeometry>> {
  const geometry = yield* growSpeciesE(speciesEParams(input.code));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}
