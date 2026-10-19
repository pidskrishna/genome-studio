import { cos, PI, sin } from '../dmath';
import type { OrganForm } from './params';
import type { SurfaceFrame } from './receptacle';

// Organ shapes (spec section 4a: designed geometry, after Prusinkiewicz and Lindenmayer 1990). An
// organ is a thin sheet: rows across its width at even steps along its length, closed by a single tip
// vertex. Its midline leaves the receptacle at the organ angle and bends by the curl along its length;
// its cross-section cups upward by the cupping.

/** Half-width at fraction x of the length (0 base, 1 tip), as a fraction of the organ's full width. */
export function halfWidth(form: OrganForm, x: number): number {
  switch (form) {
    case 'floret': {
      const s = sin(PI * (0.1 + 0.9 * x));
      return 0.5 * Math.sqrt(Math.max(0, s));
    }
    case 'scale': {
      const grow = Math.min(1, 0.35 + 1.3 * x);
      const tip = x < 0.8 ? 1 : (1 - x) / 0.2;
      return 0.5 * grow * Math.max(0, tip);
    }
    case 'leaf':
      return 0.5 * Math.max(0, sin(PI * (0.04 + 0.96 * x))) * (1 - 0.25 * x);
    case 'spine':
      return 0.125 * (1 - x);
  }
}

export interface OrganSpec {
  form: OrganForm;
  /** Length along the midline. */
  length: number;
  /** Full width. */
  width: number;
  /** Angle between organ and surface at the base, radians. */
  angle: number;
  /** Total bend along the length, radians, away from the surface when positive. */
  curl: number;
  /** 0 flat to 1 a half tube. */
  cupping: number;
  /** Points along the length (before the tip) and across the width. */
  rows: number;
  columns: number;
  /** How far the base sits below the surface, along the normal. */
  sink: number;
}

export interface MeshSink {
  /** Adds a vertex and returns its index. */
  vertex(x: number, y: number, z: number, along: number): number;
  triangle(a: number, b: number, c: number): void;
}

/**
 * Midline offset at fraction x from the base, in the frame's (along-surface, normal) plane: the
 * integral of (cos α, sin α) with α = angle + curl·x, in closed form.
 */
function midline(spec: OrganSpec, x: number): { u: number; v: number; alpha: number } {
  const alpha = spec.angle + spec.curl * x;
  const k = spec.curl;
  if (Math.abs(k) < 1e-6) {
    return { u: spec.length * x * cos(spec.angle), v: spec.length * x * sin(spec.angle), alpha };
  }
  return {
    u: (spec.length * (sin(alpha) - sin(spec.angle))) / k,
    v: (spec.length * (cos(spec.angle) - cos(alpha))) / k,
    alpha,
  };
}

/** Builds one organ at a surface frame. Triangles face the organ's upper side. */
export function buildOrgan(spec: OrganSpec, f: SurfaceFrame, out: MeshSink): void {
  const { rows, columns } = spec;
  const bx = f.x - f.nx * spec.sink;
  const by = f.y - f.ny * spec.sink;
  const bz = f.z - f.nz * spec.sink;
  const index: number[] = [];
  for (let i = 0; i < rows; i++) {
    const x = i / rows;
    const { u, v, alpha } = midline(spec, x);
    // Point on the midline, then the organ's own up direction there (perpendicular to the midline).
    const px = bx + f.mx * u + f.nx * v;
    const py = by + f.my * u + f.ny * v;
    const pz = bz + f.mz * u + f.nz * v;
    const ca = cos(alpha);
    const sa = sin(alpha);
    const upx = -sa * f.mx + ca * f.nx;
    const upy = -sa * f.my + ca * f.ny;
    const upz = -sa * f.mz + ca * f.nz;
    const hw = halfWidth(spec.form, x) * spec.width;
    for (let j = 0; j < columns; j++) {
      const s = columns === 1 ? 0 : (2 * j) / (columns - 1) - 1;
      const lift = spec.cupping * hw * s * s;
      index.push(
        out.vertex(px + f.ax * s * hw + upx * lift, py + upy * lift, pz + f.az * s * hw + upz * lift, x),
      );
    }
  }
  const tip = midline(spec, 1);
  const tipIndex = out.vertex(bx + f.mx * tip.u + f.nx * tip.v, by + f.my * tip.u + f.ny * tip.v, bz + f.mz * tip.u + f.nz * tip.v, 1);
  // Winding: with rows running along the midline (m) and columns across it (a), (a, m) order gives
  // a normal of a × m, which is the outward normal n of the surface (see receptacle.ts), turned with
  // the organ: its upper side.
  for (let i = 0; i + 1 < rows; i++) {
    for (let j = 0; j + 1 < columns; j++) {
      const a = index[i * columns + j]!;
      const b = index[i * columns + j + 1]!;
      const c = index[(i + 1) * columns + j]!;
      const d = index[(i + 1) * columns + j + 1]!;
      out.triangle(a, b, d);
      out.triangle(a, d, c);
    }
  }
  const last = (rows - 1) * columns;
  for (let j = 0; j + 1 < columns; j++) out.triangle(index[last + j]!, index[last + j + 1]!, tipIndex);
}
