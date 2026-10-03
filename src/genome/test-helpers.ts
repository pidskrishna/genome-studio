import { makeGenome } from './genome';
import { geneTable, type SpeciesId } from './genes';
import { rawMax } from './decode';

/** Small seeded generator for tests (the sim's own generator arrives in milestone 2). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomGenome(species: SpeciesId, rand: () => number): string {
  const raw = geneTable(species).map((def) => Math.floor(rand() * (rawMax(def) + 1)));
  return makeGenome(species, raw);
}
