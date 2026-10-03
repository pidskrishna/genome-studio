import { atan2, cos, exp, log, pow, sin, tan } from './dmath';
import { GeometryHash } from './hash';
import type { JobDone } from './host';
import type { ProbeInput, ProbeOutput } from './protocol';
import { Rng } from './rng';

/**
 * Determinism probe: runs the generator and every maths function over a fixed sequence and hashes
 * the results. The same seed and steps must give the same hash in every browser.
 */
export function* probe(input: ProbeInput): Generator<number, JobDone<ProbeOutput>> {
  const rng = new Rng(input.seed);
  const hash = new GeometryHash();
  const steps = Math.max(1, Math.floor(input.steps));
  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < 64; i++) {
      const a = rng.range(-1e4, 1e4);
      const b = rng.range(-50, 50);
      const c = rng.range(1e-6, 1e3);
      hash
        .addFloat64(sin(a))
        .addFloat64(cos(a))
        .addFloat64(tan(b))
        .addFloat64(atan2(a, b))
        .addFloat64(exp(b))
        .addFloat64(log(c))
        .addFloat64(pow(c, b / 10))
        .addUint32(rng.nextUint32());
    }
    yield (step + 1) / steps;
  }
  return { output: { hash: hash.digest() } };
}
