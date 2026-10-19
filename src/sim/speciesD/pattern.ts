import type { Rng } from '../rng';
import { PATTERN } from './constants';

// The edge pattern (spec section 4b, clarification 24): Meinhardt's activator–substrate model
// (Fowler, Meinhardt and Prusinkiewicz 1992, eq. 8) on cells along the growing edge, which is a
// closed curve, so the cells wrap round. Forward Euler with unit cells, as in the paper, and steps of
// a quarter of the paper's unit of time (see PATTERN_SUBSTEPS). The cells start at the uniform steady state (a = σ / μ and the
// matching s), and the seed varies ρ by up to ±2.5% per cell, which lets the pattern form.

export class EdgePattern {
  private a: Float64Array;
  private s: Float64Array;
  private nextA: Float64Array;
  private nextS: Float64Array;
  private readonly rho: Float64Array;

  constructor(
    readonly cells: number,
    noise: Rng,
  ) {
    const { rho, rhoNoise, rho0, mu, sigma, kappa } = PATTERN;
    const a0 = sigma / mu;
    const s0 = sigma / (rho * ((a0 * a0) / (1 + kappa * a0 * a0) + rho0));
    this.a = new Float64Array(cells).fill(a0);
    this.s = new Float64Array(cells).fill(s0);
    this.nextA = new Float64Array(cells);
    this.nextS = new Float64Array(cells);
    this.rho = new Float64Array(cells);
    for (let i = 0; i < cells; i++) this.rho[i] = rho * (1 + rhoNoise * (2 * noise.next() - 1));
  }

  /** Activator concentration in each cell. */
  get activator(): Float64Array {
    return this.a;
  }

  /** Advances by `times` units of time, each in `substeps` forward Euler steps. */
  step(times: number, substeps = 1): void {
    const { kappa, rho0, mu, da, sigma, nu, ds } = PATTERN;
    const h = 1 / substeps;
    const n = this.cells;
    for (let t = 0; t < times * substeps; t++) {
      const a = this.a;
      const s = this.s;
      for (let i = 0; i < n; i++) {
        const l = i === 0 ? n - 1 : i - 1;
        const r = i === n - 1 ? 0 : i + 1;
        const ai = a[i]!;
        const si = s[i]!;
        const production = this.rho[i]! * si * ((ai * ai) / (1 + kappa * ai * ai) + rho0);
        this.nextA[i] = Math.max(0, ai + h * (production - mu * ai + da * (a[l]! - 2 * ai + a[r]!)));
        this.nextS[i] = Math.max(0, si + h * (sigma - production - nu * si + ds * (s[l]! - 2 * si + s[r]!)));
      }
      this.a = this.nextA;
      this.s = this.nextS;
      this.nextA = a;
      this.nextS = s;
    }
  }
}
