// The margin ruler beside the helix (DESIGN.md section 6), as pure functions so its behaviour can be
// tested without the DOM. Group names are always shown; a gene's name fades in as the pointer
// approaches its segment, and stays while the gene is focused or hovered.

/** Distance in pixels over which a gene's name fades in as the pointer approaches. */
export const LABEL_REACH = 70;

/**
 * Opacity of a gene's name on the ruler: 1 when the gene is focused or hovered, otherwise
 * 1 − (distance from the pointer to the gene's middle) / LABEL_REACH, and 0 with no pointer.
 */
export function labelOpacity(pointerY: number | null, middleY: number, named: boolean): number {
  if (named) return 1;
  if (pointerY === null) return 0;
  return Math.max(0, 1 - Math.abs(pointerY - middleY) / LABEL_REACH);
}
