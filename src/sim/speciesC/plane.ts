import { atan2, cos, exp, pow, PI, sin } from '../dmath';
import type { Rng } from '../rng';
import {
  BRACKET_CAP,
  CANDIDATES,
  SEARCH_CANDIDATES,
  CENTRAL_RADIUS,
  CONICITY,
  FAR_BANDS,
  GAMMA_SEEDLING,
  GAMMA_T1,
  GAMMA_TAU,
  GAMMA_WHORL,
  MATURITY_TIME,
  MIN_SAMPLES,
  NEAR_RANGE,
  NEGLIGIBLE_INHIBITION,
  ORGAN_CAP,
  REFINE_STEPS,
  SAMPLES_PER_ORGAN,
  TIME_STEPS,
} from './constants';
import { BODY_PLANS, type SpeciesCParams } from './params';

// The threshold model of Douady and Couder (1996, part II), on the plane projection of a cone, with
// Γ falling over time as in part III.
//
// Time is measured in units of R0 / V0, so an organ born at time b sits at r = R0·exp(t − b) (part I:
// speed proportional to distance). Distances use the paper's cone distance (part II, eq. 6) with
// N = 1 / conicity: d² = (r0 − r1)² / N + 2N r0 r1 (1 − cos(θ0 − θ1)). Inhibition from one organ is
// (d0 / d)^η with d0 = Γ(t) √N R0 (eq. 7) and threshold 1. When the lowest inhibition on the edge of
// the central zone falls below 1, one organ appears there and the inhibition is evaluated again at
// once, so several organs can appear at the same moment.
//
// Numerically: the edge is held as samples, a few per organ width. Near organs are summed exactly
// at the samples they reach; far organs, whose inhibition is smooth around the edge, at a few points
// per distance band, interpolated (see FAR_BANDS). The time of the next organ is bracketed, then
// found by the Illinois method on the lowest of the best sampled minima, each refined. The
// inhibition at every point of the edge only falls with time, because organs only move away and Γ
// only falls, so the root is unique. The new organ goes at the lowest of the best minima, each
// refined by golden-section search.

const TWO_PI = 2 * PI;
const GOLDEN = 0.6180339887498949;

export type PlaneStop = 'maturity' | 'organ cap';

export interface PlaneResult {
  /** Birth time of each organ, in order of appearance. */
  birth: Float64Array;
  /** Angle of each organ, in [0, 2π). */
  angle: Float64Array;
  count: number;
  /** Time at the end of growth; organ i sits at R0·exp(endTime − birth[i]) on the plane. */
  endTime: number;
  stopReason: PlaneStop;
}

/** Overrides for tests. */
export interface PlaneOptions {
  organCap?: number;
  endTime?: number;
  /** Γ as a function of time, instead of part III's law. */
  gammaAt?: (t: number) => number;
}

function wrap(theta: number): number {
  return theta - TWO_PI * Math.floor(theta / TWO_PI);
}

function tanh(x: number): number {
  const ax = Math.abs(x);
  const e = exp(-2 * ax);
  const t = (1 - e) / (1 + e);
  return x < 0 ? -t : t;
}

/** Γi: 2.4 with one starting organ, 1.8 sin(π / k) with k ≥ 2, never below Γf (clarification 23). */
export function gammaStart(startingOrgans: number, gammaFinal: number): number {
  const gi = startingOrgans <= 1 ? GAMMA_SEEDLING : GAMMA_WHORL * sin(PI / startingOrgans);
  return Math.max(gi, gammaFinal);
}

/** Γ(t) by part III's eq. 1. */
export function gammaLaw(gi: number, gf: number): (t: number) => number {
  return (t) => (gi + gf) / 2 - ((gi - gf) / 2) * tanh((t - GAMMA_T1) / GAMMA_TAU);
}

interface Snapshot {
  t: number;
  /** Far inhibition at every sample. */
  e: Float64Array;
}

/** Runs the model. Yields progress from 0 to 1 after each new organ. */
export function* growPlane(p: SpeciesCParams, noise: Rng, options: PlaneOptions = {}): Generator<number, PlaneResult> {
  const organCap = options.organCap ?? ORGAN_CAP;
  const endTime = options.endTime ?? MATURITY_TIME;
  const gammaAt = options.gammaAt ?? gammaLaw(gammaStart(p.startingOrgans, p.gamma), p.gamma);
  const conicity = CONICITY[BODY_PLANS.indexOf(p.bodyPlan)] ?? 1;
  const n = 1 / conicity;
  const sqrtN = Math.sqrt(n);
  const m = p.falloff / 2;
  // x^m < NEGLIGIBLE_INHIBITION exactly when x < xMin, with x = d0² / d².
  const xMin = pow(NEGLIGIBLE_INHIBITION, 1 / m);

  // Samples of the edge, fine enough for the smallest Γ the organism reaches (the gene's).
  const samples = Math.max(MIN_SAMPLES, -Math.floor(-(SAMPLES_PER_ORGAN * TWO_PI) / p.gamma));
  const spacing = TWO_PI / samples;
  const sampleCos = new Float64Array(samples);
  const sampleSin = new Float64Array(samples);
  for (let k = 0; k < samples; k++) {
    sampleCos[k] = cos(k * spacing);
    sampleSin[k] = sin(k * spacing);
  }
  const bands = FAR_BANDS.map(([from, points]) => {
    const c = new Float64Array(points);
    const s = new Float64Array(points);
    for (let q = 0; q < points; q++) {
      c[q] = cos((q * TWO_PI) / points);
      s[q] = sin((q * TWO_PI) / points);
    }
    return { from, points, cos: c, sin: s, values: new Float64Array(points), start: 0, end: 0 };
  });

  const birth = new Float64Array(organCap);
  const angle = new Float64Array(organCap);
  const organCos = new Float64Array(organCap);
  const organSin = new Float64Array(organCap);
  let count = 0;
  let firstActive = 0;
  let firstNear = 0;
  const energy = new Float64Array(samples);
  // State of the current trial time, shared by the sample sum and point evaluations.
  let d0sq = 0;
  let cutoff2 = 0; // d² beyond which one organ's inhibition is negligible
  const termA = new Float64Array(organCap); // d² = a + b (1 − cos Δθ)
  const termB = new Float64Array(organCap);
  let snapA: Snapshot = { t: 0, e: new Float64Array(samples) };
  let snapB: Snapshot = { t: 0, e: new Float64Array(samples) };

  function setGamma(t: number): void {
    const d0 = gammaAt(t) * sqrtN * CENTRAL_RADIUS;
    d0sq = d0 * d0;
    cutoff2 = d0sq / xMin;
  }

  function closest2(j: number, t: number): number {
    const dr = CENTRAL_RADIUS * exp(t - birth[j]!) - CENTRAL_RADIUS;
    return (dr * dr) / n;
  }

  /** Drops organs that can never matter again, and sorts the rest into far bands and near. */
  function classify(t: number): void {
    setGamma(t);
    while (firstActive < count && closest2(firstActive, t) > cutoff2) firstActive++;
    // Organs are in order of birth, so their distance from the edge only falls with the index.
    let j = firstActive;
    for (let i = bands.length - 1; i >= 0; i--) {
      const band = bands[i]!;
      const from2 = band.from * band.from * d0sq;
      band.start = j;
      while (j < count && closest2(j, t) >= from2) j++;
      band.end = j;
    }
    const near2 = NEAR_RANGE * NEAR_RANGE * d0sq;
    while (j < count && closest2(j, t) >= near2) j++;
    firstNear = j;
  }

  function setTerms(from: number, to: number, t: number): void {
    for (let j = from; j < to; j++) {
      const r = CENTRAL_RADIUS * exp(t - birth[j]!);
      const dr = r - CENTRAL_RADIUS;
      termA[j] = (dr * dr) / n;
      termB[j] = 2 * n * r * CENTRAL_RADIUS;
    }
  }

  function term(j: number, c: number, s: number): number {
    const d2 = termA[j]! + termB[j]! * (1 - (c * organCos[j]! + s * organSin[j]!));
    if (!(d2 > 0)) return Infinity;
    const x = d0sq / d2;
    return x < xMin ? 0 : pow(x, m);
  }

  /** Far inhibition at time t, at every sample. */
  function farSnapshot(t: number, into: Float64Array): void {
    setGamma(t);
    into.fill(0);
    for (const band of bands) {
      if (band.end <= band.start) continue;
      setTerms(band.start, band.end, t);
      for (let q = 0; q < band.points; q++) {
        let e = 0;
        for (let j = band.start; j < band.end; j++) e += term(j, band.cos[q]!, band.sin[q]!);
        band.values[q] = e;
      }
      // Periodic linear interpolation onto the samples.
      const per = band.points / samples;
      for (let k = 0; k < samples; k++) {
        const u = k * per;
        const q = Math.floor(u);
        const f = u - q;
        into[k] = into[k]! + (1 - f) * band.values[q % band.points]! + f * band.values[(q + 1) % band.points]!;
      }
    }
  }

  /** Weight of the second snapshot at time t; a later time first moves the snapshots on. */
  function farWeight(t: number): number {
    if (t > snapB.t) {
      const next = { t, e: snapA.e };
      farSnapshot(t, next.e);
      snapA = snapB;
      snapB = next;
    }
    const span = snapB.t - snapA.t;
    return span > 0 ? (t - snapA.t) / span : 0;
  }

  /** Inhibition at every sample at time t. */
  function sampleAll(t: number): void {
    const w = farWeight(t);
    for (let k = 0; k < samples; k++) energy[k] = snapA.e[k]! + w * (snapB.e[k]! - snapA.e[k]!);
    setGamma(t);
    setTerms(firstNear, count, t);
    for (let j = firstNear; j < count; j++) {
      const a = termA[j]!;
      const b = termB[j]!;
      if (a > cutoff2) continue;
      // Samples where d² ≤ cutoff²: 1 − cos Δθ ≤ (cutoff² − a) / b.
      const limit = 1 - (cutoff2 - a) / b;
      let half: number;
      if (limit <= -1) half = samples;
      else half = -Math.floor(-atan2(Math.sqrt(Math.max(0, 1 - limit * limit)), limit) / spacing) + 1;
      const centre = Math.floor(angle[j]! / spacing + 0.5);
      const reach = Math.min(samples, 2 * half + 1);
      const from = centre - (reach === samples ? Math.floor(samples / 2) : half);
      for (let i = 0; i < reach; i++) {
        const k = (((from + i) % samples) + samples) % samples;
        energy[k] = energy[k]! + term(j, sampleCos[k]!, sampleSin[k]!);
      }
    }
  }

  /** Inhibition at one angle, at the time of the last sampleAll. */
  function pointEnergy(theta: number, w: number): number {
    const u = wrap(theta) / spacing;
    const k = Math.floor(u) % samples;
    const f = u - Math.floor(u);
    const k1 = (k + 1) % samples;
    const fa = (1 - f) * snapA.e[k]! + f * snapA.e[k1]!;
    const fb = (1 - f) * snapB.e[k]! + f * snapB.e[k1]!;
    let e = fa + w * (fb - fa);
    const c = cos(theta);
    const s = sin(theta);
    for (let j = firstNear; j < count; j++) e += term(j, c, s);
    return e;
  }

  function refine(theta: number, w: number): { theta: number; e: number } {
    let a = theta - spacing;
    let b = theta + spacing;
    let x1 = b - GOLDEN * (b - a);
    let x2 = a + GOLDEN * (b - a);
    let f1 = pointEnergy(x1, w);
    let f2 = pointEnergy(x2, w);
    for (let i = 0; i < REFINE_STEPS; i++) {
      if (f1 <= f2) {
        b = x2;
        x2 = x1;
        f2 = f1;
        x1 = b - GOLDEN * (b - a);
        f1 = pointEnergy(x1, w);
      } else {
        a = x1;
        x1 = x2;
        f1 = f2;
        x2 = a + GOLDEN * (b - a);
        f2 = pointEnergy(x2, w);
      }
    }
    let best = f1 <= f2 ? { theta: x1, e: f1 } : { theta: x2, e: f2 };
    const fc = pointEnergy(theta, w);
    if (fc < best.e) best = { theta, e: fc };
    return best;
  }

  /** The lowest of the best sampled minima at time t, each refined by golden-section search. */
  function lowest(t: number, candidates: number): { theta: number; e: number } {
    sampleAll(t);
    const w = farWeight(t);
    const minima: number[] = [];
    for (let k = 0; k < samples; k++) {
      const e = energy[k]!;
      if (e <= energy[(k + samples - 1) % samples]! && e <= energy[(k + 1) % samples]!) minima.push(k);
    }
    if (minima.length === 0) minima.push(0);
    minima.sort((i, j) => energy[i]! - energy[j]! || i - j);
    let best = { theta: 0, e: Infinity };
    for (const k of minima.slice(0, candidates)) {
      const r = refine(k * spacing, w);
      if (r.e < best.e) best = r;
    }
    return best;
  }

  function lowestAt(t: number): number {
    return lowest(t, SEARCH_CANDIDATES).e;
  }

  function add(t: number, theta: number): void {
    const a = wrap(theta);
    birth[count] = t;
    angle[count] = a;
    organCos[count] = cos(a);
    organSin[count] = sin(a);
    count++;
  }

  // Starting organs (locus 5), evenly spaced on the edge at time 0.
  const starting = Math.min(p.startingOrgans, organCap);
  for (let i = 0; i < starting; i++) add(0, (TWO_PI * i) / starting);

  let t = 0;
  let interval = 0.135 * n * p.gamma * p.gamma;
  let stopReason: PlaneStop = 'maturity';

  while (count < organCap) {
    classify(t);
    const step0 = Math.max(interval, 1e-9);
    snapA = { t, e: snapA.e };
    farSnapshot(t, snapA.e);
    snapB = { t: Math.min(t + step0, endTime), e: snapB.e };
    farSnapshot(snapB.t, snapB.e);
    if (lowestAt(t) > 1) {
      // Bracket the time at which the lowest inhibition reaches 1 ...
      let lo = t;
      let flo = lowestAt(t) - 1;
      let step = step0;
      let hi = Math.min(t + step, endTime);
      let fhi = lowestAt(hi) - 1;
      for (let i = 0; fhi > 0 && hi < endTime && i < BRACKET_CAP; i++) {
        lo = hi;
        flo = fhi;
        step *= 2;
        hi = Math.min(hi + step, endTime);
        fhi = lowestAt(hi) - 1;
      }
      if (fhi > 0) break; // No new organ before maturity.
      // ... then find it by the Illinois method.
      let side = 0;
      for (let i = 0; i < TIME_STEPS && hi - lo > 1e-10 * (1 + hi); i++) {
        let c = (lo * fhi - hi * flo) / (fhi - flo);
        if (!(c > lo && c < hi)) c = 0.5 * (lo + hi);
        const fc = lowestAt(c) - 1;
        if (fc <= 0) {
          hi = c;
          fhi = fc;
          if (side === -1) flo /= 2;
          side = -1;
        } else {
          lo = c;
          flo = fc;
          if (side === 1) fhi /= 2;
          side = 1;
        }
      }
      interval = hi - t;
      t = hi;
    }
    add(t, lowest(t, CANDIDATES).theta + p.initiationNoise * (2 * noise.next() - 1));
    yield Math.min(1, t / endTime);
  }
  if (count >= organCap) stopReason = 'organ cap';

  return {
    birth: birth.slice(0, count),
    angle: angle.slice(0, count),
    count,
    endTime: stopReason === 'maturity' ? endTime : t,
    stopReason,
  };
}
