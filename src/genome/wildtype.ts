import { encodeValue } from './decode';
import { geneTable, type SpeciesId } from './genes';
import { makeGenome } from './genome';

// Provisional wild types, written as model values. They are tuned in milestones 3 to 5.
// Species A: dense enough that a trunk at the minimum sensing range still finds points to branch to.

const A_WILD: readonly number[] = [
  1.5, 0.1, 8000, 8, 3, 0.016, 0, 0, 0.15, 1, 2.5, 0.15, 0.5, 2, 2, //
  120, 40, 0.6, 0.5, 0, 0.5, 0.5, 0.2,
];

const B_WILD: readonly number[] = [
  0, 6, 1, 0.01, 0.25, 0, 1, 2, 1, 0.02, 0.4, 0, 0, 8, 0.01, //
  300, 30, 0.6, 0.5, 3, 0.5, 0.5, 0.2,
];

// Species C and D (v0.2): provisional until milestones 15 and 16. C is a domed head of florets in a
// spiral; D a turreted shell with ribs and cords, coloured by its edge pattern.

const C_WILD: readonly number[] = [
  0, 0.3, 0, 5, 1, 1, 1.2, 0.6, 60, 0, 0.3, 0.3, 0.1, 0.05, 0.5, //
  45, 20, 0.7, 0.5, 1, 0.5, 0.4, 0.2,
];

const D_WILD: readonly number[] = [
  2.5, 2, 0.1, 1.2, 0, 0, 12, 0.1, 0.25, 8, 0.04, 0.3, 0.3, 0.05, 0.2, //
  30, 15, 0.5, 0.6, 3, 0.6, 0.6, 0.1,
];

// Species E and F (v0.3): provisional until milestones 20 and 21. E is an upright branching coral
// with six-part cups; F a mushroom, grown with the paper's figure 8 settings where it gives them.

const E_WILD: readonly number[] = [
  0, 0.2, 0.012, 0.5, 0, 0.5, 0.05, 1, 0.04, 0.3, 0.05, 0.6, 0.2, 1, 0.15, //
  20, 340, 0.5, 0.6, 0, 0.5, 0.3, 0.1,
];

const F_WILD: readonly number[] = [
  4, 0.06, 0.1, 0.4, 0.1, 0.5, 45, 0.3, 150, 180, 200, 0.1, 0, 60, 0.3, //
  35, 15, 0.3, 0.7, 0, 0.5, 0.2, 0.3,
];

const WILD_VALUES: Readonly<Record<SpeciesId, readonly number[]>> = { A: A_WILD, B: B_WILD, C: C_WILD, D: D_WILD, E: E_WILD, F: F_WILD };

const WILD_SEED = 1_234_567;

/** The default genome for a species. */
export function wildType(species: SpeciesId): string {
  const values = WILD_VALUES[species];
  const raw = geneTable(species).map((def, i) => (def.kind === 'seed' ? WILD_SEED : encodeValue(def, values[i] ?? 0)));
  return makeGenome(species, raw);
}
