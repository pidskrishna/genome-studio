import { cos, PI, sin } from '../dmath';
import { HEAD_DOMING } from './constants';
import type { BodyPlan } from './params';

// The receptacle: a surface of revolution about the vertical axis, radius 1 at its widest, apex on
// top. It is described by a profile (horizontal radius, height) over a parameter g from 0 at the apex
// to 1 at the rim or base. Organs sit at the g their distance from the centre of the plane maps to
// (see index.ts); the angle around the axis is the organ's angle on the plane (spec section 4a).

/** Where the column's rounded tip gives way to straight sides. */
const COLUMN_TIP = 0.15;
/** Steps in the tables of arc length and area along the profile. */
const TABLE_STEPS = 512;

export interface ProfilePoint {
  /** Horizontal radius. */
  rho: number;
  /** Height. */
  y: number;
}

export function profile(plan: BodyPlan, aspect: number, g: number): ProfilePoint {
  switch (plan) {
    case 'head':
      // A disc, domed by the aspect: rho = g, height falling as a paraboloid to the rim.
      return { rho: g, y: HEAD_DOMING * aspect * (1 - g * g) };
    case 'dome': {
      const phi = (g * PI) / 2;
      return { rho: sin(phi), y: aspect * cos(phi) };
    }
    case 'cone':
      return { rho: g, y: aspect * (1 - g) };
    case 'column': {
      const tip = Math.min(1, g / COLUMN_TIP);
      return { rho: sin((tip * PI) / 2), y: aspect * (1 - g) };
    }
  }
}

/** A point of the receptacle, with the frame an organ sits in. */
export interface SurfaceFrame {
  x: number;
  y: number;
  z: number;
  /** Unit tangent along the profile, away from the apex. */
  mx: number;
  my: number;
  mz: number;
  /** Unit outward normal. */
  nx: number;
  ny: number;
  nz: number;
  /** Unit tangent around the axis. */
  ax: number;
  az: number;
}

export class Receptacle {
  /** Arc length from the apex at TABLE_STEPS + 1 even steps of g. */
  private readonly arc = new Float64Array(TABLE_STEPS + 1);
  /** Surface area from the apex at the same steps. */
  private readonly area = new Float64Array(TABLE_STEPS + 1);

  constructor(
    readonly plan: BodyPlan,
    readonly aspect: number,
  ) {
    let prev = profile(plan, aspect, 0);
    for (let i = 1; i <= TABLE_STEPS; i++) {
      const next = profile(plan, aspect, i / TABLE_STEPS);
      const dr = next.rho - prev.rho;
      const dy = next.y - prev.y;
      const ds = Math.sqrt(dr * dr + dy * dy);
      this.arc[i] = this.arc[i - 1]! + ds;
      this.area[i] = this.area[i - 1]! + PI * (next.rho + prev.rho) * ds;
      prev = next;
    }
  }

  private lookup(table: Float64Array, g: number): number {
    const u = Math.min(1, Math.max(0, g)) * TABLE_STEPS;
    const i = Math.min(TABLE_STEPS - 1, Math.floor(u));
    const f = u - i;
    return (1 - f) * table[i]! + f * table[i + 1]!;
  }

  /** Arc length from the apex along the profile. */
  arcAt(g: number): number {
    return this.lookup(this.arc, g);
  }

  get totalArc(): number {
    return this.arc[TABLE_STEPS]!;
  }

  /** Surface area between the apex and g. */
  areaAt(g: number): number {
    return this.lookup(this.area, g);
  }

  frame(g: number, theta: number): SurfaceFrame {
    const p = profile(this.plan, this.aspect, g);
    // Tangent along the profile by a central difference, kept inside [0, 1].
    const h = 1e-4;
    const a = profile(this.plan, this.aspect, Math.max(0, g - h));
    const b = profile(this.plan, this.aspect, Math.min(1, g + h));
    let dr = b.rho - a.rho;
    let dy = b.y - a.y;
    const len = Math.sqrt(dr * dr + dy * dy);
    if (len > 0) {
      dr /= len;
      dy /= len;
    } else {
      dr = 1;
      dy = 0;
    }
    const c = cos(theta);
    const s = sin(theta);
    return {
      x: p.rho * c,
      y: p.y,
      z: p.rho * s,
      mx: dr * c,
      my: dy,
      mz: dr * s,
      // The outward normal is the profile tangent turned a quarter towards the axis's top.
      nx: -dy * c,
      ny: dr,
      nz: -dy * s,
      ax: -s,
      az: c,
    };
  }
}
