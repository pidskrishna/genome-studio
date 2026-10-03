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

const WILD_SEED = 1_234_567;

/** The default genome for a species. */
export function wildType(species: SpeciesId): string {
  const values = species === 'A' ? A_WILD : B_WILD;
  const raw = geneTable(species).map((def, i) => (def.kind === 'seed' ? WILD_SEED : encodeValue(def, values[i] ?? 0)));
  return makeGenome(species, raw);
}
