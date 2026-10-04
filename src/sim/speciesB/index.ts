import { GeometryHash } from '../hash';
import type { JobDone } from '../host';
import { growSheet, type StopReason } from './grow';
import type { GrowingMesh } from './mesh';
import { speciesBParams, type SpeciesBParams } from './params';

export interface SpeciesBInput {
  code: string;
}

/** Plain geometry data for species B. Lengths are in starting radii; y is up. */
export interface SheetGeometry {
  /** xyz per vertex. */
  positions: Float64Array;
  /** Three vertex indices per triangle, ordered so the normal points out of the starting shape. */
  triangles: Int32Array;
  /** Four values per vertex: distance from margin, curvature, order of growth, height. */
  drivers: Float64Array;
  /** One cell width (the split length), in starting radii. */
  cellWidth: number;
  /** Drawn thickness in starting radii: the smaller of thickness and personal space (clarification 14). */
  drawnThickness: number;
  stats: { steps: number; stopReason: StopReason; vertices: number; triangles: number; areaMultiple: number };
  /** Geometry hash over positions, triangles and drivers. */
  hash: string;
}

export function hashSheetGeometry(g: Pick<SheetGeometry, 'positions' | 'triangles' | 'drivers'>): string {
  return new GeometryHash().addFloat64Array(g.positions).addIntArray(g.triangles).addFloat64Array(g.drivers).digest();
}

/** Number of gradient-driver attributes per vertex, in the order of the gene's choices. */
export const DRIVER_COUNT = 4;

/**
 * The four gradient-driver attributes per vertex, interleaved: distance from the margin (measured on
 * the starting shape, clarification 7), signed mean curvature, order of growth (the step the vertex
 * was born, 0 for the starting shape) and height.
 *
 * Curvature at a vertex is 2 (c − x)·n / ℓ², where c is the mean of its neighbours, n the
 * area-weighted vertex normal and ℓ² the mean squared length of its edges.
 */
export function sheetDrivers(mesh: GrowingMesh): Float64Array {
  const n = mesh.vertexCount;
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const sz = new Float64Array(n);
  const len2 = new Float64Array(n);
  const degree = new Float64Array(n);
  for (let e = 0; e < mesh.edgeCount; e++) {
    if (mesh.alive[e] !== 1) continue;
    const a = mesh.edgeA[e]!;
    const b = mesh.edgeB[e]!;
    const ex = mesh.x[b]! - mesh.x[a]!;
    const ey = mesh.y[b]! - mesh.y[a]!;
    const ez = mesh.z[b]! - mesh.z[a]!;
    const l2 = ex * ex + ey * ey + ez * ez;
    sx[a] = sx[a]! + mesh.x[b]!;
    sy[a] = sy[a]! + mesh.y[b]!;
    sz[a] = sz[a]! + mesh.z[b]!;
    sx[b] = sx[b]! + mesh.x[a]!;
    sy[b] = sy[b]! + mesh.y[a]!;
    sz[b] = sz[b]! + mesh.z[a]!;
    len2[a] = len2[a]! + l2;
    len2[b] = len2[b]! + l2;
    degree[a] = degree[a]! + 1;
    degree[b] = degree[b]! + 1;
  }
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const nz = new Float64Array(n);
  for (let t = 0; t < mesh.triangleCount; t++) {
    const a = mesh.tri[3 * t]!;
    const b = mesh.tri[3 * t + 1]!;
    const c = mesh.tri[3 * t + 2]!;
    const ux = mesh.x[b]! - mesh.x[a]!;
    const uy = mesh.y[b]! - mesh.y[a]!;
    const uz = mesh.z[b]! - mesh.z[a]!;
    const vx = mesh.x[c]! - mesh.x[a]!;
    const vy = mesh.y[c]! - mesh.y[a]!;
    const vz = mesh.z[c]! - mesh.z[a]!;
    // Triangles are ordered so this points out of the starting shape (up, for the disc and ring).
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      nx[v] = nx[v]! + cx;
      ny[v] = ny[v]! + cy;
      nz[v] = nz[v]! + cz;
    }
  }
  const out = new Float64Array(n * DRIVER_COUNT);
  for (let v = 0; v < n; v++) {
    const d = degree[v]!;
    const nl = Math.sqrt(nx[v]! * nx[v]! + ny[v]! * ny[v]! + nz[v]! * nz[v]!);
    let curvature = 0;
    if (d > 0 && nl > 0 && len2[v]! > 0) {
      const ox = sx[v]! / d - mesh.x[v]!;
      const oy = sy[v]! / d - mesh.y[v]!;
      const oz = sz[v]! / d - mesh.z[v]!;
      curvature = (2 * (ox * nx[v]! + oy * ny[v]! + oz * nz[v]!)) / nl / (len2[v]! / d);
    }
    out[v * DRIVER_COUNT] = mesh.margin[v]!;
    out[v * DRIVER_COUNT + 1] = curvature;
    out[v * DRIVER_COUNT + 2] = mesh.birth[v]!;
    out[v * DRIVER_COUNT + 3] = mesh.y[v]!;
  }
  return out;
}

/** Grows species B from decoded parameters. Yields progress from 0 to 1. */
export function* growSpeciesB(params: SpeciesBParams): Generator<number, SheetGeometry> {
  const grown = yield* growSheet(params);
  const mesh = grown.mesh;
  const positions = new Float64Array(mesh.vertexCount * 3);
  for (let v = 0; v < mesh.vertexCount; v++) {
    positions[v * 3] = mesh.x[v]!;
    positions[v * 3 + 1] = mesh.y[v]!;
    positions[v * 3 + 2] = mesh.z[v]!;
  }
  const triangles = mesh.tri.slice(0, 3 * mesh.triangleCount);
  const drivers = sheetDrivers(mesh);
  return {
    positions,
    triangles,
    drivers,
    cellWidth: grown.cellWidth,
    drawnThickness: Math.min(params.thickness, params.personalSpace) * grown.cellWidth,
    stats: {
      steps: grown.steps,
      stopReason: grown.stopReason,
      vertices: mesh.vertexCount,
      triangles: mesh.triangleCount,
      areaMultiple: grown.restArea / grown.startArea,
    },
    hash: hashSheetGeometry({ positions, triangles, drivers }),
  };
}

/** Worker job: grows a species B code. */
export function* speciesB(input: SpeciesBInput): Generator<number, JobDone<SheetGeometry>> {
  const geometry = yield* growSpeciesB(speciesBParams(input.code));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}
