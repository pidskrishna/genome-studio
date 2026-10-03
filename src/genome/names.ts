import { basesToValue } from './bases';

// Fixed syllable tables. Never reorder or edit them: the same bases must give the same name in every
// version of the tool.

const GENUS_START = ['Ram', 'Plic', 'Vel', 'Cor', 'Lob', 'Spir', 'Nod', 'Fim'] as const;
const GENUS_END = ['ula', 'ina', 'ium', 'ora', 'ella', 'ata', 'ona', 'ia'] as const;

const EPITHET_FIRST = ['ba', 'ce', 'di', 'fo', 'gu', 'ha', 'je', 'ki', 'lo', 'mu', 'na', 'pe', 'ri', 'so', 'tu', 'va'] as const;
const EPITHET_SECOND = ['la', 'me', 'ni', 'ro', 'su', 'ta', 've', 'xi', 'co', 'du', 'fa', 'ge', 'hi', 'jo', 'ku', 'ra'] as const;
const EPITHET_END = ['us', 'a', 'um', 'is', 'ensis', 'ata', 'ina', 'osa', 'ella', 'ii', 'oides', 'ifer', 'aris', 'alis', 'ulus', 'ica'] as const;

export interface SpecimenName {
  genus: string;
  epithet: string;
  /** "Genus epithet". */
  full: string;
}

function pick<T>(table: readonly T[], i: number): T {
  const item = table[i];
  if (item === undefined) throw new RangeError(`No entry ${i}`);
  return item;
}

/**
 * The genus comes from the species field (bases 1 to 3); the epithet from the two leading bases of
 * each of the first three genes (bases 7 to 8, 13 to 14 and 19 to 20), 16 coarse steps each.
 */
export function specimenName(code: string): SpecimenName {
  const species = basesToValue(code.slice(0, 3));
  const genus = pick(GENUS_START, species % 8) + pick(GENUS_END, Math.floor(species / 8));
  const first = basesToValue(code.slice(6, 8));
  const second = basesToValue(code.slice(12, 14));
  const third = basesToValue(code.slice(18, 20));
  const epithet = pick(EPITHET_FIRST, first) + pick(EPITHET_SECOND, second) + pick(EPITHET_END, third);
  return { genus, epithet, full: `${genus} ${epithet}` };
}
