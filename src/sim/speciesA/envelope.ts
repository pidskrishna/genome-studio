import { envelopeProfile } from '../../genome';
import { cos, PI, sin } from '../dmath';
import { Rng } from '../rng';
import { MAX_SAMPLE_ATTEMPTS, ORIGIN_RING, SURFACE_SHARE, SURFACE_SHELL } from './constants';
import type { SpeciesAParams } from './params';

/**
 * The envelope is a solid of revolution about the vertical axis. Its height is 1 / segmentLength
 * (so D = 1), its width is height / aspect, and it starts clearStem × height above the base.
 */
export interface Envelope {
  bottom: number;
  height: number;
  /** Largest radius (half the width). */
  radius: number;
  taper: number;
}

export function envelopeOf(params: SpeciesAParams): Envelope {
  const height = 1 / params.segmentLength;
  return {
    bottom: params.clearStem * height,
    height,
    radius: height / params.aspect / 2,
    taper: params.taper,
  };
}

/** Radius of the envelope at normalised height s, as a fraction of its largest radius. */
export const profile = envelopeProfile;

/** Seeds the attraction points inside the envelope: N points as xyz triples. */
export function samplePoints(params: SpeciesAParams, envelope: Envelope): Float64Array {
  const rng = new Rng(params.seed, 0);
  const n = params.pointCount;
  const out = new Float64Array(n * 3);
  const { bottom, height, radius, taper } = envelope;
  for (let i = 0; i < n; i++) {
    let x = 0;
    let z = 0;
    let s = rng.next();
    for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
      const cs = rng.next();
      const cx = (2 * rng.next() - 1) * radius;
      const cz = (2 * rng.next() - 1) * radius;
      const limit = radius * profile(taper, cs);
      const r2 = cx * cx + cz * cz;
      if (r2 <= limit * limit) {
        s = cs;
        x = cx;
        z = cz;
        // Surface seeking moves a share of the points outward along their radius, into a thin
        // shell just inside the envelope; the rest stay spread through it.
        const r = Math.sqrt(r2);
        if (rng.next() < SURFACE_SHARE * params.surfaceSeeking && r > 0 && limit > 0) {
          const u = r / limit;
          const pushed = 1 - (1 - u) * SURFACE_SHELL;
          x = (cx / r) * pushed * limit;
          z = (cz / r) * pushed * limit;
        }
        break;
      }
    }
    out[i * 3] = x;
    out[i * 3 + 1] = bottom + s * height;
    out[i * 3 + 2] = z;
  }
  return out;
}

/** Starting nodes: one at the base, or several evenly spaced on a small ring around it. */
export function originPositions(count: number, envelope: Envelope): Float64Array {
  const out = new Float64Array(count * 3);
  if (count === 1) return out;
  const ring = Math.max(2, ORIGIN_RING * envelope.radius);
  for (let j = 0; j < count; j++) {
    const angle = (2 * PI * j) / count;
    out[j * 3] = ring * cos(angle);
    out[j * 3 + 2] = ring * sin(angle);
  }
  return out;
}
