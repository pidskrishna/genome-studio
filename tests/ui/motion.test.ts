import { describe, expect, it } from 'vitest';
import { bezier, Damped, DURATIONS, easeOut } from '../../src/ui/motion';

// Interface motion (DESIGN.md section 5, milestone 10a): springs are critically damped.

function run(s: Damped, ms: number, dt: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < ms; t += dt * 1000) {
    s.step(dt);
    out.push(s.value);
  }
  return out;
}

describe('critically damped spring', () => {
  it('never overshoots its target from rest, at any frame time', () => {
    for (const dt of [1 / 240, 1 / 60, 1 / 30, 0.05]) {
      for (const [from, to] of [[0, 1], [1, 0], [-3, 7]] as const) {
        const s = new Damped(from, 520);
        s.target = to;
        const values = run(s, 2000, dt);
        for (const v of values) {
          if (to > from) expect(v).toBeLessThanOrEqual(to);
          else expect(v).toBeGreaterThanOrEqual(to);
        }
      }
    }
  });

  it('is within 1% of the distance at its settle time, and settles exactly soon after', () => {
    const s = new Damped(0, 520);
    s.target = 1;
    run(s, 520, 1 / 60);
    expect(1 - s.value).toBeLessThan(0.01);
    run(s, 1000, 1 / 60);
    expect(s.settled).toBe(true);
    expect(s.value).toBe(1);
  });

  it('gives the same position whatever the frame rate (it is solved exactly)', () => {
    const a = new Damped(0, 300);
    const b = new Damped(0, 300);
    a.target = b.target = 1;
    run(a, 200, 1 / 120);
    run(b, 200, 1 / 30);
    expect(Math.abs(a.value - b.value)).toBeLessThan(1e-9);
  });

  it('snap jumps with no motion', () => {
    const s = new Damped(0, 300);
    s.target = 1;
    s.step(0.016);
    s.snap(5);
    expect(s.value).toBe(5);
    expect(s.settled).toBe(true);
  });
});

describe('timing', () => {
  it('is quick for small things and slow for large ones', () => {
    expect(DURATIONS.small).toBe(100);
    expect(DURATIONS.medium).toBe(220);
    expect(DURATIONS.large).toBe(520);
  });

  it('the ease-out curve matches CSS cubic-bezier(0.2, 0, 0, 1)', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    // Decelerating: more than half way at the half-time, and monotonic.
    expect(easeOut(0.5)).toBeGreaterThan(0.8);
    let last = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const v = easeOut(t);
      expect(v).toBeGreaterThanOrEqual(last - 1e-12);
      last = v;
    }
    expect(bezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 6);
  });
});
