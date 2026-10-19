import { describe, expect, it } from 'vitest';
import { wildType } from '../../src/genome';
import { codeGroups } from '../../src/ui/code-bar';
import { fineLabel, fineSpeed, RIPPLE_STEP_MS, rippleSchedule, type RippleGroup } from '../../src/ui/interaction';

// Milestone 10c: the slider's fine-drag speed and the randomise ripple's schedule (DESIGN.md section 7).

describe('fine-drag speed', () => {
  it('is full speed near the track, then half, a quarter and a tenth as the pointer moves away', () => {
    expect(fineSpeed(0, false)).toBe(1);
    expect(fineSpeed(39, false)).toBe(1);
    expect(fineSpeed(40, false)).toBe(0.5);
    expect(fineSpeed(-89, false)).toBe(0.5);
    expect(fineSpeed(90, false)).toBe(0.25);
    expect(fineSpeed(149, false)).toBe(0.25);
    expect(fineSpeed(150, false)).toBe(0.1);
    expect(fineSpeed(800, false)).toBe(0.1);
  });

  it('is a tenth with Shift held, wherever the pointer is', () => {
    for (const d of [0, 20, 60, 120, 400]) expect(fineSpeed(d, true)).toBe(0.1);
  });

  it('never speeds up as the pointer moves further away', () => {
    let last = Infinity;
    for (let d = 0; d < 400; d += 3) {
      const s = fineSpeed(d, false);
      expect(s).toBeLessThanOrEqual(last);
      last = s;
    }
  });

  it('names each slower speed', () => {
    expect(fineLabel(1)).toBe('');
    expect(fineLabel(0.5)).toBe('Half speed');
    expect(fineLabel(0.25)).toBe('Quarter speed');
    expect(fineLabel(0.1)).toBe('Fine');
  });
});

describe('randomise ripple', () => {
  const groups: RippleGroup[] = codeGroups(wildType('A'), 'A').map((g) => ({ locus: g.locus, kind: g.group }));

  it('gives every gene and the checksum one step, 26 ms apart, in order, and the header none', () => {
    const steps = rippleSchedule(groups, new Set());
    expect(steps).toHaveLength(25);
    expect(steps.map((s) => groups[s.group]!.locus)).toEqual([...Array.from({ length: 24 }, (_, i) => i + 1), null]);
    steps.forEach((s, k) => expect(s.delayMs).toBe(k * RIPPLE_STEP_MS));
    expect(groups[steps[steps.length - 1]!.group]!.kind).toBe('checksum');
    expect(steps.some((s) => groups[s.group]!.kind === 'header')).toBe(false);
  });

  it('skips locked genes but keeps the rhythm of the others', () => {
    const all = rippleSchedule(groups, new Set());
    const some = rippleSchedule(groups, new Set([3, 17]));
    expect(some).toHaveLength(23);
    expect(some.some((s) => groups[s.group]!.locus === 3 || groups[s.group]!.locus === 17)).toBe(false);
    for (const s of some) expect(s.delayMs).toBe(all.find((a) => a.group === s.group)!.delayMs);
  });

  it('takes about 0.6 s from the first gene to the checksum', () => {
    const steps = rippleSchedule(groups, new Set());
    expect(steps[steps.length - 1]!.delayMs).toBe(24 * RIPPLE_STEP_MS);
  });
});
