import { describe, expect, it } from 'vitest';
import { wildType } from '../../../src/genome';
import { grow, withGenes } from './helpers';

// Tropism on the whole organism. The tree must still reach the same attraction points, so tropism
// mostly changes the routes between them: the centre of mass moves only a little (a few tenths of a
// percent of the envelope height), and a single seed can go either way. So the centre of mass is
// averaged over 20 seeds. Branch direction responds strongly and is checked too.

const SEEDS = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);

function measure(tropism: number): { centre: number; slope: number } {
  let centre = 0;
  let slope = 0;
  for (const seed of SEEDS) {
    const g = grow(withGenes(wildType('A'), { 2: tropism, 24: seed }));
    const n = g.parents.length;
    let sumY = 0;
    let sumSlope = 0;
    let segments = 0;
    for (let v = 0; v < n; v++) {
      const y = g.positions[v * 3 + 1] as number;
      sumY += y;
      const p = g.parents[v] as number;
      if (p < 0) continue;
      const dx = (g.positions[v * 3] as number) - (g.positions[p * 3] as number);
      const dy = y - (g.positions[p * 3 + 1] as number);
      const dz = (g.positions[v * 3 + 2] as number) - (g.positions[p * 3 + 2] as number);
      sumSlope += dy / Math.sqrt(dx * dx + dy * dy + dz * dz);
      segments++;
    }
    centre += (sumY / n - g.envelope.bottom) / g.envelope.height;
    slope += sumSlope / segments;
  }
  return { centre: centre / SEEDS.length, slope: slope / SEEDS.length };
}

describe('tropism on the whole organism', () => {
  it('positive tropism raises and negative tropism lowers the centre of mass, averaged over 20 seeds', () => {
    const down = measure(-0.5);
    const none = measure(0);
    const up = measure(0.5);
    expect(down.centre).toBeLessThan(none.centre);
    expect(up.centre).toBeGreaterThan(none.centre);
    // Branches point more upward as tropism rises.
    const mid = [measure(-0.25).slope, measure(0.25).slope];
    expect([down.slope, mid[0], none.slope, mid[1], up.slope]).toEqual([down.slope, mid[0], none.slope, mid[1], up.slope].slice().sort((a, b) => (a as number) - (b as number)));
    expect(up.slope - down.slope).toBeGreaterThan(0.2);
  }, 60_000);
});
