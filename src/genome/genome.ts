import { baseToDigit, basesToValue, cleanCode, digitToBase, valueToBases } from './bases';
import { checksumOf, CHECKSUM_BASES } from './checksum';
import { decodeValue, encodeValue, rawMax } from './decode';
import { ALL_SPECIES, geneAt, geneTable, type SpeciesId } from './genes';
import { speciesADerived, type SpeciesADerived } from './speciesA';

export const GENOME_LENGTH = 160;
export const GENE_COUNT = 24;
export const PARAMETER_GENE_COUNT = 23;
export const GENE_BASES = 6;
export const SEED_BASES = 12;
/** 1-based position of the first base of the first parameter gene. */
export const FIRST_GENE_POSITION = 7;
/** 0-based index where the checksum starts. */
export const CHECKSUM_START = GENOME_LENGTH - CHECKSUM_BASES;

/** Species fields (clarifications 9 and 17). */
export const SPECIES_HEADER: Readonly<Record<SpeciesId, string>> = { A: 'AAA', B: 'AAC', C: 'AAG', D: 'AAT' };
export const ENCODING_VERSION_1 = 'AAA';

/** Position of a gene in the code, 0-based start and length in bases. */
export function geneSpan(locus: number): { start: number; length: number } {
  if (!Number.isInteger(locus) || locus < 1 || locus > GENE_COUNT) {
    throw new RangeError(`No gene at locus ${locus}`);
  }
  const start = 6 + (locus - 1) * GENE_BASES;
  return { start, length: locus === GENE_COUNT ? SEED_BASES : GENE_BASES };
}

/** Builds a complete code from 24 raw gene values (23 of 0 to 4,095, then the seed). */
export function makeGenome(species: SpeciesId, raw: readonly number[]): string {
  if (raw.length !== GENE_COUNT) throw new RangeError(`Expected ${GENE_COUNT} gene values`);
  let body = SPECIES_HEADER[species] + ENCODING_VERSION_1;
  raw.forEach((value, i) => {
    const { length } = geneSpan(i + 1);
    body += valueToBases(value, length);
  });
  return body + checksumOf(body);
}

export function withChecksum(body: string): string {
  return body.slice(0, CHECKSUM_START) + checksumOf(body.slice(0, CHECKSUM_START));
}

export function speciesOfHeader(code: string): SpeciesId | null {
  const field = code.slice(0, 3);
  return ALL_SPECIES.find((s) => SPECIES_HEADER[s] === field) ?? null;
}

export function hasValidChecksum(code: string): boolean {
  return code.slice(CHECKSUM_START) === checksumOf(code.slice(0, CHECKSUM_START));
}

export type ParseResult =
  | { ok: true; code: string; species: SpeciesId; warning?: string }
  | { ok: false; message: string };

/**
 * Cleans and checks a pasted or linked code. A wrong checksum is not fatal: the code loads with a
 * typo warning and comes back with the corrected checksum (clarification 11). `accepted` limits the
 * species, for an app that does not grow every species yet; its message lists only those.
 */
export function parseGenome(input: string, accepted: readonly SpeciesId[] = ALL_SPECIES): ParseResult {
  const cleaned = cleanCode(input);
  if (!cleaned.ok) return cleaned;
  const code = cleaned.code;
  if (code.length !== GENOME_LENGTH) {
    return {
      ok: false,
      message: `A genome code has ${GENOME_LENGTH} bases, but this one has ${code.length}.`,
    };
  }
  const species = speciesOfHeader(code);
  if (species === null || !accepted.includes(species)) {
    const fields = accepted.map((s) => SPECIES_HEADER[s]);
    const list = fields.length > 1 ? `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}` : fields.join('');
    const field = code.slice(0, 3);
    const first = species === null ? `Unknown species "${field}".` : `Species "${field}" cannot be grown here yet.`;
    return { ok: false, message: `${first} This tool grows species ${list}.` };
  }
  if (code.slice(3, 6) !== ENCODING_VERSION_1) {
    return { ok: false, message: `Unknown encoding version "${code.slice(3, 6)}". This tool reads version ${ENCODING_VERSION_1}.` };
  }
  if (hasValidChecksum(code)) return { ok: true, code, species };
  return {
    ok: true,
    code: withChecksum(code),
    species,
    warning: 'This code may contain a typo: its checksum does not match. The checksum has been corrected.',
  };
}

/** Raw value of one gene (0 to 4,095, or the 24-bit seed). */
export function readGene(code: string, locus: number): number {
  const { start, length } = geneSpan(locus);
  return basesToValue(code.slice(start, start + length));
}

/** The bases of one gene. */
export function geneBases(code: string, locus: number): string {
  const { start, length } = geneSpan(locus);
  return code.slice(start, start + length);
}

/** Moves a slider: rewrites that gene's bases and the checksum. */
export function writeGene(code: string, locus: number, raw: number): string {
  const { start, length } = geneSpan(locus);
  const species = speciesOfHeader(code);
  if (species === null) throw new Error('Code has no valid species header');
  if (!Number.isInteger(raw) || raw < 0 || raw > rawMax(geneAt(species, locus))) {
    throw new RangeError(`Gene value ${raw} is outside its range`);
  }
  return withChecksum(code.slice(0, start) + valueToBases(raw, length) + code.slice(start + length));
}

/**
 * Edits one base by its 1-based position in the code. Only gene and seed bases (7 to 156) can be
 * edited; the header and checksum cannot (clarification 10).
 */
export function writeBase(code: string, position: number, base: string): string {
  if (!Number.isInteger(position) || position < FIRST_GENE_POSITION || position > CHECKSUM_START) {
    throw new RangeError(`Base ${position} cannot be edited`);
  }
  if (baseToDigit(base) < 0) throw new RangeError(`Not a base: ${base}`);
  const i = position - 1;
  return withChecksum(code.slice(0, i) + base + code.slice(i + 1));
}

/** The next base in the cycle A, C, G, T. */
export function nextBase(base: string): string {
  return digitToBase((baseToDigit(base) + 1) % 4);
}

export interface DecodedGenome {
  readonly code: string;
  readonly species: SpeciesId;
  /** Raw gene values, indexed by locus − 1. The last is the 24-bit seed. */
  readonly raw: readonly number[];
  /** Model values, indexed by locus − 1. The seed is passed through unchanged. */
  readonly values: readonly number[];
  readonly checksumOk: boolean;
}

/**
 * Decodes a 160-base code. Every code with a valid header decodes to values inside their ranges.
 * Throws if the code is not 160 bases or has an unknown header; use `parseGenome` on user input.
 */
export function decodeGenome(code: string): DecodedGenome {
  if (code.length !== GENOME_LENGTH) throw new Error(`Code has ${code.length} bases`);
  const species = speciesOfHeader(code);
  if (species === null || code.slice(3, 6) !== ENCODING_VERSION_1) throw new Error('Unknown species or version');
  const raw: number[] = [];
  const values: number[] = [];
  for (const def of geneTable(species)) {
    const r = readGene(code, def.locus);
    raw.push(r);
    values.push(decodeValue(def, r));
  }
  if (species === 'A') {
    // Clarification 5: kill distance is never above 0.8 × the sensing range or a quarter of the
    // envelope radius, both in D.
    values[4] = speciesADerived(values).killDistance;
  }
  return { code, species, raw, values, checksumOk: hasValidChecksum(code) };
}

/** True when the decoded kill distance was reduced by one of its limits (species A). */
export function clearanceIsLimited(decoded: DecodedGenome): boolean {
  if (decoded.species !== 'A') return false;
  return decodeValue(geneAt('A', 5), decoded.raw[4] ?? 0) > (decoded.values[4] ?? 0);
}

/** Envelope, point spacing and lengths in D for a decoded species A genome. */
export function speciesAOf(decoded: DecodedGenome): SpeciesADerived {
  if (decoded.species !== 'A') throw new Error('Not a species A genome');
  const unclamped = decoded.values.slice();
  unclamped[4] = decodeValue(geneAt('A', 5), decoded.raw[4] ?? 0);
  return speciesADerived(unclamped);
}

/** A decoded value looked up by gene id. */
export function valueById(decoded: DecodedGenome, id: string): number {
  const def = geneTable(decoded.species).find((g) => g.id === id);
  if (!def) throw new RangeError(`No gene "${id}"`);
  return decoded.values[def.locus - 1] ?? NaN;
}

/** Sets a gene from a model value, as typed into the exact number field. */
export function writeModelValue(code: string, locus: number, model: number): string {
  const species = speciesOfHeader(code);
  if (species === null) throw new Error('Code has no valid species header');
  return writeGene(code, locus, encodeValue(geneAt(species, locus), model));
}

/**
 * The part of a code the simulation reads: the header, the form genes and the seed. Two codes with
 * the same key grow the same geometry, so a change that keeps the key (a pigment gene, or the
 * checksum that follows it) never needs a regrow.
 */
export function formKey(code: string): string {
  const species = speciesOfHeader(code);
  if (species === null) throw new Error('Code has no valid species header');
  let key = code.slice(0, 6);
  for (const def of geneTable(species)) {
    if (def.group !== 'pigment') key += geneBases(code, def.locus);
  }
  return key;
}
