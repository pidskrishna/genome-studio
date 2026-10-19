import { PI } from '../dmath';
import type { JobDone } from '../host';
import { Rng } from '../rng';
import { hashSheetGeometry } from '../speciesB';
import {
  ANGLE_VARIATION_DEGREES,
  MIN_ORGAN_SCALE,
  ORGAN_RESOLUTIONS,
  ORGAN_SINK,
  RECEPTACLE_RINGS,
  RECEPTACLE_SEGMENTS,
  SPACING_WINDOW,
  VERTEX_CAP,
} from './constants';
import { buildOrgan, type MeshSink } from './organs';
import { growPlane, type PlaneResult, type PlaneStop } from './plane';
import { speciesCParams, type SpeciesCParams } from './params';
import { Receptacle } from './receptacle';

export interface SpeciesCInput {
  code: string;
}

/**
 * Plain geometry data for species C, in the same form as species B's (clarification 19): one
 * triangle mesh, the receptacle and every organ, with a drawn thickness. Lengths are in receptacle
 * radii; y is up.
 */
export interface PhylloGeometry {
  positions: Float64Array;
  /** Three vertex indices per triangle, facing out of the receptacle and up from each organ. */
  triangles: Int32Array;
  /** Four values per vertex: order of appearance, distance from the apex, position along the organ, height. */
  drivers: Float64Array;
  /** Mean spacing between neighbouring organs. */
  cellWidth: number;
  /** Organ thickness × the mean full-size organ length (clarification 19). */
  drawnThickness: number;
  stats: { organs: number; stopReason: PlaneStop; vertices: number; triangles: number; endTime: number };
  /** Geometry hash over positions, triangles and drivers. */
  hash: string;
}

export const DRIVER_COUNT = 4;

/** Mesh options: the draft (clarification 20) uses the coarsest organs and half the receptacle rings. */
export interface MeshOptions {
  draft?: boolean;
}

class Builder implements MeshSink {
  positions: number[] = [];
  triangles: number[] = [];
  drivers: number[] = [];
  /** Drivers that every vertex added next will carry, apart from position along the organ. */
  order = 0;
  distance = 0;

  vertex(x: number, y: number, z: number, along: number): number {
    this.positions.push(x, y, z);
    this.drivers.push(this.order, this.distance, along, y);
    return this.positions.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.triangles.push(a, b, c);
  }
}

/**
 * Where each organ sits on the receptacle. Its distance from the centre of the plane, as log-radius
 * ρ = endTime − birth, keeps its order on the receptacle (section 4a). The head is laid out by rank,
 * radius √(rank / count) as in Vogel's sunflower, so organs pack evenly whatever Γ did; the other
 * receptacles use the logarithmic map g = ρ / ρmax, which makes the plane's spirals straight helices
 * on the column.
 */
function organPositions(plane: PlaneResult, plan: SpeciesCParams['bodyPlan']): Float64Array {
  const g = new Float64Array(plane.count);
  const rhoMax = plane.endTime - (plane.birth[0] ?? 0);
  for (let i = 0; i < plane.count; i++) {
    if (plan === 'head') {
      // Organs are in order of birth, so the youngest are last: rank from the centre is count − 1 − i.
      g[i] = Math.sqrt((plane.count - 1 - i + 0.5) / plane.count);
    } else {
      g[i] = rhoMax > 0 ? (plane.endTime - plane.birth[i]!) / rhoMax : 0;
    }
  }
  return g;
}

/** Builds the mesh from the organ arrangement. */
export function buildMesh(p: SpeciesCParams, plane: PlaneResult, options: MeshOptions = {}): PhylloGeometry {
  const receptacle = new Receptacle(p.bodyPlan, p.aspect);
  const g = organPositions(plane, p.bodyPlan);
  const count = plane.count;

  // Spacing between neighbouring organs: the receptacle area of a window of neighbours in order of
  // birth, shared out among them.
  const spacing = new Float64Array(count);
  let spacingSum = 0;
  for (let i = 0; i < count; i++) {
    const lo = Math.max(0, i - SPACING_WINDOW);
    const hi = Math.min(count - 1, i + SPACING_WINDOW);
    let gMin = g[i]!;
    let gMax = g[i]!;
    for (let j = lo; j <= hi; j++) {
      gMin = Math.min(gMin, g[j]!);
      gMax = Math.max(gMax, g[j]!);
    }
    const area = receptacle.areaAt(gMax) - receptacle.areaAt(gMin);
    const s = Math.sqrt(Math.max(area, 0) / Math.max(1, hi - lo));
    spacing[i] = s;
    spacingSum += s;
  }
  const meanSpacing = count > 0 ? spacingSum / count : 1;
  // A lone organ, or organs piled at one radius, still get a size.
  for (let i = 0; i < count; i++) if (!(spacing[i]! > 0)) spacing[i] = meanSpacing > 0 ? meanSpacing : 0.1;

  let lengthSum = 0;
  for (let i = 0; i < count; i++) lengthSum += p.organLength * spacing[i]!;
  const meanLength = count > 0 ? lengthSum / count : p.organLength * 0.1;
  const drawnThickness = p.organThickness * meanLength;

  // Organ resolution: the finest that keeps every vertex inside the cap.
  const rings = options.draft ? RECEPTACLE_RINGS / 2 : RECEPTACLE_RINGS;
  const segments = options.draft ? RECEPTACLE_SEGMENTS / 2 : RECEPTACLE_SEGMENTS;
  const receptacleVertices = 1 + rings * segments;
  const perOrgan = count > 0 ? Math.floor((VERTEX_CAP - receptacleVertices) / count) : VERTEX_CAP;
  const resolutions = options.draft ? ORGAN_RESOLUTIONS.slice(-1) : ORGAN_RESOLUTIONS;
  let [rows, columns] = resolutions[resolutions.length - 1]!;
  for (const [r, c] of resolutions) {
    if (r * c + 1 <= perOrgan) {
      [rows, columns] = [r, c];
      break;
    }
  }

  const out = new Builder();
  const total = receptacle.totalArc;

  // Receptacle: an apex vertex and rings out to the rim, facing outward.
  out.order = count;
  out.distance = 0;
  const apex = receptacle.frame(0, 0);
  out.vertex(apex.x, apex.y, apex.z, 0);
  for (let k = 1; k <= rings; k++) {
    const gk = k / rings;
    // Order of appearance at this radius, for the gradient: the share of organs nearer the apex.
    let nearer = 0;
    for (let i = 0; i < count; i++) if (g[i]! <= gk) nearer++;
    out.order = count - nearer;
    out.distance = receptacle.arcAt(gk);
    for (let q = 0; q < segments; q++) {
      const f = receptacle.frame(gk, (2 * PI * q) / segments);
      out.vertex(f.x, f.y, f.z, 0);
    }
  }
  const ring = (k: number, q: number) => 1 + (k - 1) * segments + (((q % segments) + segments) % segments);
  // Around the axis, θ grows from x toward z; seen from outside and above, (apex, q + 1, q) runs
  // counter-clockwise about the outward normal.
  for (let q = 0; q < segments; q++) out.triangle(0, ring(1, q + 1), ring(1, q));
  for (let k = 1; k < rings; k++) {
    for (let q = 0; q < segments; q++) {
      const a = ring(k, q);
      const b = ring(k, q + 1);
      const c = ring(k + 1, q);
      const d = ring(k + 1, q + 1);
      out.triangle(a, b, d);
      out.triangle(a, d, c);
    }
  }

  // Organs, in order of appearance.
  const variation = new Rng(p.seed, 2);
  const angleVariation = (ANGLE_VARIATION_DEGREES * PI) / 180;
  for (let i = 0; i < count; i++) {
    const sizeDraw = 2 * variation.next() - 1;
    const angleDraw = 2 * variation.next() - 1;
    const gi = g[i]!;
    const distance = receptacle.arcAt(gi);
    const fraction = total > 0 ? distance / total : 0;
    const grown = Math.max(MIN_ORGAN_SCALE, Math.min(1, fraction / p.maturation));
    const length = p.organLength * spacing[i]! * grown * (1 + p.sizeVariation * sizeDraw);
    out.order = i;
    out.distance = distance;
    buildOrgan(
      {
        form: p.organForm,
        length,
        width: length * p.organWidth,
        angle: p.organAngle + p.sizeVariation * angleVariation * angleDraw,
        curl: p.organCurl,
        cupping: p.organCupping,
        rows,
        columns,
        sink: ORGAN_SINK * drawnThickness,
      },
      receptacle.frame(gi, plane.angle[i]!),
      out,
    );
  }

  const positions = Float64Array.from(out.positions);
  const triangles = Int32Array.from(out.triangles);
  const drivers = Float64Array.from(out.drivers);
  return {
    positions,
    triangles,
    drivers,
    cellWidth: meanSpacing,
    drawnThickness,
    stats: { organs: count, stopReason: plane.stopReason, vertices: positions.length / 3, triangles: triangles.length / 3, endTime: plane.endTime },
    hash: hashSheetGeometry({ positions, triangles, drivers }),
  };
}

/** Grows species C from decoded parameters. Yields progress from 0 to 1. */
export function* growSpeciesC(p: SpeciesCParams, options: MeshOptions = {}): Generator<number, PhylloGeometry> {
  const plane = growPlane(p, new Rng(p.seed, 1));
  // Organs are many and quick, and every yield hands the worker back to its event loop, so yield
  // only when progress moves on by a whole percent.
  let shown = -1;
  let step = plane.next();
  while (!step.done) {
    const percent = Math.floor(95 * step.value);
    if (percent !== shown) {
      shown = percent;
      yield percent / 100;
    }
    step = plane.next();
  }
  const geometry = buildMesh(p, step.value, options);
  yield 1;
  return geometry;
}

/** Worker job: grows a species C code. */
export function* speciesC(input: SpeciesCInput): Generator<number, JobDone<PhylloGeometry>> {
  const geometry = yield* growSpeciesC(speciesCParams(input.code));
  return {
    output: geometry,
    transfer: [geometry.positions.buffer, geometry.triangles.buffer, geometry.drivers.buffer],
  };
}
