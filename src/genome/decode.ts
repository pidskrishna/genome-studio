import type { GeneDef } from './genes';

/** Slider range for every gene except the seed: 6 bases, 0 to 4,095. */
export const GENE_MAX = 4095;
export const SEED_MAX = 16_777_215;

export function rawMax(def: GeneDef): number {
  return def.kind === 'seed' ? SEED_MAX : GENE_MAX;
}

/** Number of equal bins for a whole-number or multiple-choice gene. */
export function binCount(def: GeneDef): number {
  return def.max - def.min + 1;
}

/**
 * base ** t for base > 0 and t in [0, 1], using only multiplication and square roots, which are
 * exact and identical on every machine. The browser's own pow is not, so log-scale genes use this.
 * t is read to 48 binary places.
 */
export function detPow(base: number, t: number): number {
  if (t <= 0) return 1;
  if (t >= 1) return base;
  let result = 1;
  let root = base;
  let frac = t;
  for (let i = 0; i < 48; i++) {
    root = Math.sqrt(root);
    frac *= 2;
    if (frac >= 1) {
      frac -= 1;
      result *= root;
    }
  }
  return result;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** The bin (0-based) that a raw slider value falls in. */
export function binOf(def: GeneDef, raw: number): number {
  return Math.floor((raw * binCount(def)) / (GENE_MAX + 1));
}

/** Raw gene value to model value, as in SPEC.md section 2 and clarification 6. */
export function decodeValue(def: GeneDef, raw: number): number {
  switch (def.kind) {
    case 'seed':
      return raw;
    case 'int':
    case 'choice':
      return def.min + binOf(def, raw);
    case 'linear':
      return clamp(def.min + (raw / GENE_MAX) * (def.max - def.min), def.min, def.max);
    case 'log':
      return clamp(def.min * detPow(def.max / def.min, raw / GENE_MAX), def.min, def.max);
  }
}

/**
 * Model value to the raw value that decodes closest to it. For whole-number and multiple-choice
 * genes this is the centre of the bin, so the setting reads back unchanged (clarification 6).
 */
export function encodeValue(def: GeneDef, model: number): number {
  switch (def.kind) {
    case 'seed':
      return clamp(Math.round(model), 0, SEED_MAX);
    case 'int':
    case 'choice': {
      const n = binCount(def);
      const bin = clamp(Math.round(model) - def.min, 0, n - 1);
      return Math.floor(((2 * bin + 1) * (GENE_MAX + 1)) / (2 * n));
    }
    case 'linear': {
      const t = (clamp(model, def.min, def.max) - def.min) / (def.max - def.min);
      return clamp(Math.round(t * GENE_MAX), 0, GENE_MAX);
    }
    case 'log': {
      // Search the decoded values rather than invert with Math.log, so a code built from model
      // values is the same on every machine.
      const target = clamp(model, def.min, def.max);
      let lo = 0;
      let hi = GENE_MAX;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (decodeValue(def, mid) < target) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && target - decodeValue(def, lo - 1) < decodeValue(def, lo) - target) lo--;
      return lo;
    }
  }
}
