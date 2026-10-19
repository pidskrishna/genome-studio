// Timing and speed rules for the inspector and code bar interactions (DESIGN.md section 7), as pure
// functions so they can be tested without a DOM.

/** Slider speed while dragging: a tenth with Shift, otherwise slower the further the pointer moves away. */
export function fineSpeed(awayPx: number, shift: boolean): number {
  if (shift) return 0.1;
  const d = Math.abs(awayPx);
  if (d < 40) return 1;
  if (d < 90) return 0.5;
  if (d < 150) return 0.25;
  return 0.1;
}

/** The word shown under the slider for a drag speed (empty at full speed). */
export function fineLabel(speed: number): string {
  if (speed >= 1) return '';
  if (speed >= 0.5) return 'Half speed';
  if (speed >= 0.25) return 'Quarter speed';
  return 'Fine';
}

/** Gap between one gene's turn and the next in the randomise ripple, in milliseconds. */
export const RIPPLE_STEP_MS = 26;
/** Gap between one gene and the next as the code is read out on copy, or written in on paste. */
export const READ_STEP_MS = 14;

export interface RippleGroup {
  /** The gene's locus, or null for the header and checksum. */
  locus: number | null;
  kind: 'header' | 'form' | 'pigment' | 'seed' | 'checksum';
}

export interface RippleStep {
  /** Index into the groups given. */
  group: number;
  delayMs: number;
}

/**
 * The gene-by-gene randomise ripple: genes take their turn in order, 26 ms apart (24 distinct steps),
 * and the checksum comes last. The header never changes and locked genes stay still, so neither has
 * a step; a locked gene still keeps its place in time, so the ripple's rhythm is the same whatever is
 * locked.
 */
export function rippleSchedule(groups: readonly RippleGroup[], locked: ReadonlySet<number>): RippleStep[] {
  const steps: RippleStep[] = [];
  let slot = 0;
  groups.forEach((g, i) => {
    if (g.kind === 'header') return;
    const delayMs = slot * RIPPLE_STEP_MS;
    slot++;
    if (g.locus !== null && locked.has(g.locus)) return;
    steps.push({ group: i, delayMs });
  });
  return steps;
}
