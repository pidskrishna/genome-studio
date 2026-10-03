// Deterministic maths for the simulation.
//
// The browser's Math.sin, Math.exp and friends may differ in the last bit between engines, so the
// simulation uses these instead. They are built only from +, −, ×, ÷ and Math.sqrt, Math.floor and
// Math.abs, which IEEE 754 defines exactly, so every machine gets the same bits.
//
// The polynomial kernels and argument reduction follow fdlibm (Sun Microsystems, 1993), whose
// coefficients are used unchanged. Accuracy is about one unit in the last place. Argument reduction
// for sine and cosine is done in double-double arithmetic against a three-part π/2, which keeps it
// accurate for |x| up to about 1e15 (tested to 1e9) and finite, in [−1, 1], beyond that.

const scratch = new DataView(new ArrayBuffer(8));

/** Signed high 32 bits of a double. DataView is big-endian by default on every platform. */
function highWord(x: number): number {
  scratch.setFloat64(0, x);
  return scratch.getInt32(0);
}

function lowWord(x: number): number {
  scratch.setFloat64(0, x);
  return scratch.getUint32(4);
}

function fromWords(high: number, low: number): number {
  scratch.setInt32(0, high);
  scratch.setUint32(4, low);
  return scratch.getFloat64(0);
}

/** 2^k for −1022 ≤ k ≤ 1023, built from its bit pattern. */
function twoTo(k: number): number {
  return fromWords((k + 1023) << 20, 0);
}

/** y × 2^k with a single rounding. */
function scale(y: number, k: number): number {
  if (k > 1023) return y * 2 * twoTo(k - 1);
  if (k < -1022) return y * twoTo(k + 1000) * twoTo(-1000);
  return y * twoTo(k);
}

export const PI = 3.141592653589793;
const PI_LO = 1.2246467991473532e-16;
const HALF_PI = 1.5707963267948966;
const QUARTER_PI = 0.7853981633974483;

// ---------------------------------------------------------------- sine and cosine

// π/2 = PIO2_1 + PIO2_2 + PIO2_3 to about 160 bits.
const PIO2_1 = 1.5707963267948966;
const PIO2_2 = 6.123233995736766e-17;
const PIO2_3 = -1.4973849048591698e-33;
const TWO_OVER_PI = 0.6366197723675814;
const REDUCED_LIMIT = QUARTER_PI * (1 + 1 / 1048576);
const TINY = 7.450580596923828e-9; // 2^-27: below this, sin x = tan x = x to working precision
// Above this, n × π/2 could overflow during reduction, so the argument is halved first (exactly).
const HALVE_ABOVE = 8e307;

const SPLITTER = 134217729; // 2^27 + 1, Veltkamp splitting
const BIG = 1e290;

// Results of `split` and `reduce`, kept in module variables to avoid allocation.
let splitHi = 0;
let splitLo = 0;
let reducedHi = 0;
let reducedLo = 0;

function split(a: number): void {
  if (Math.abs(a) > BIG) {
    // Scale down to avoid overflow in the splitter; powers of two are exact.
    const s = a * 3.725290298461914e-9; // 2^-28
    const c = SPLITTER * s;
    const h = c - (c - s);
    splitHi = h * 268435456;
    splitLo = (s - h) * 268435456;
    return;
  }
  const c = SPLITTER * a;
  splitHi = c - (c - a);
  splitLo = a - splitHi;
}

split(PIO2_1);
const PIO2_1_HI = splitHi;
const PIO2_1_LO = splitLo;
split(PIO2_2);
const PIO2_2_HI = splitHi;
const PIO2_2_LO = splitLo;

/** Error of the rounded product n × (hi + lo), where (hi, lo) is the split of the constant. */
function productError(product: number, nHi: number, nLo: number, cHi: number, cLo: number): number {
  return ((nHi * cHi - product) + nHi * cLo + nLo * cHi) + nLo * cLo;
}

/**
 * Reduces x to (reducedHi + reducedLo) in [−π/4, π/4] and returns the quadrant, 0 to 3,
 * so that x = r + quadrant × π/2 (mod 2π).
 */
function reduce(x: number): number {
  let hi = x;
  let lo = 0;
  let quadrant = 0;
  for (let pass = 0; pass < 64 && Math.abs(hi) > REDUCED_LIMIT; pass++) {
    const n = Math.floor(hi * TWO_OVER_PI + 0.5);
    quadrant += n - 4 * Math.floor(n / 4);
    split(n);
    const nHi = splitHi;
    const nLo = splitLo;

    // hi + lo − n × PIO2_1, exactly as a sum of two doubles plus small terms.
    const p1 = n * PIO2_1;
    const p1Err = productError(p1, nHi, nLo, PIO2_1_HI, PIO2_1_LO);
    let s = hi - p1;
    let bv = s - hi;
    let err = (hi - (s - bv)) + (-p1 - bv);
    err += lo - p1Err;

    // − n × PIO2_2
    const p2 = n * PIO2_2;
    const p2Err = productError(p2, nHi, nLo, PIO2_2_HI, PIO2_2_LO);
    const s2 = s - p2;
    bv = s2 - s;
    err += (s - (s2 - bv)) + (-p2 - bv);
    err -= p2Err;

    // − n × PIO2_3; its rounding error is far below what matters.
    err -= n * PIO2_3;

    // Renormalise.
    s = s2 + err;
    bv = s - s2;
    lo = (s2 - (s - bv)) + (err - bv);
    hi = s;
  }
  reducedHi = hi;
  reducedLo = lo;
  return quadrant - 4 * Math.floor(quadrant / 4);
}

const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;

/** sin(x + y) for |x| ≤ π/4, y the tail of x. */
function kernelSin(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (y === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.08757232129817482790e-9;
const C6 = -1.13596475577881948265e-11;

/** cos(x + y) for |x| ≤ π/4, y the tail of x. */
function kernelCos(x: number, y: number): number {
  const z = x * x;
  const w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const u = 1 - hz;
  return u + (((1 - u) - hz) + (z * r - x * y));
}

export function sin(x: number): number {
  if (x - x !== 0) return NaN; // NaN or infinite
  const ax = Math.abs(x);
  if (ax < TINY) return x;
  if (ax <= QUARTER_PI) return kernelSin(x, 0);
  if (ax > HALVE_ABOVE) return 2 * sin(x / 2) * cos(x / 2);
  const q = reduce(x);
  const hi = reducedHi;
  const lo = reducedLo;
  if (q === 0) return kernelSin(hi, lo);
  if (q === 1) return kernelCos(hi, lo);
  if (q === 2) return -kernelSin(hi, lo);
  return -kernelCos(hi, lo);
}

export function cos(x: number): number {
  if (x - x !== 0) return NaN;
  const ax = Math.abs(x);
  if (ax <= QUARTER_PI) return kernelCos(x, 0);
  if (ax > HALVE_ABOVE) {
    const s = sin(x / 2);
    const c = cos(x / 2);
    return (c - s) * (c + s);
  }
  const q = reduce(x);
  const hi = reducedHi;
  const lo = reducedLo;
  if (q === 0) return kernelCos(hi, lo);
  if (q === 1) return -kernelSin(hi, lo);
  if (q === 2) return -kernelCos(hi, lo);
  return kernelSin(hi, lo);
}

export function tan(x: number): number {
  if (x - x !== 0) return NaN;
  const ax = Math.abs(x);
  if (ax < TINY) return x;
  if (ax > HALVE_ABOVE) return sin(x) / cos(x);
  const small = ax <= QUARTER_PI;
  const q = small ? 0 : reduce(x);
  const hi = small ? x : reducedHi;
  const lo = small ? 0 : reducedLo;
  const s = kernelSin(hi, lo);
  const c = kernelCos(hi, lo);
  return q === 0 || q === 2 ? s / c : -c / s;
}

// ---------------------------------------------------------------- arctangent

const ATAN_HI = [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800e0] as const;
const ATAN_LO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17] as const;
const AT0 = 3.33333333333329318027e-1;
const AT1 = -1.99999999998764832476e-1;
const AT2 = 1.42857142725034663711e-1;
const AT3 = -1.11111104054623557880e-1;
const AT4 = 9.09088713343650656196e-2;
const AT5 = -7.69187620504482999495e-2;
const AT6 = 6.66107313738753120669e-2;
const AT7 = -5.83357013379057348645e-2;
const AT8 = 4.97687799461593236017e-2;
const AT9 = -3.65315727442169155270e-2;
const AT10 = 1.62858201153657823623e-2;

export function atan(x: number): number {
  if (x !== x) return x;
  const ax = Math.abs(x);
  if (ax >= 7.378697629483821e19) {
    // |x| ≥ 2^66: atan is ±π/2 to working precision.
    return x > 0 ? ATAN_HI[3] + ATAN_LO[3] : -ATAN_HI[3] - ATAN_LO[3];
  }
  let id: number;
  let t: number;
  if (ax < 0.4375) {
    if (ax < TINY) return x;
    id = -1;
    t = x;
  } else if (ax < 1.1875) {
    if (ax < 0.6875) {
      id = 0;
      t = (2 * ax - 1) / (2 + ax);
    } else {
      id = 1;
      t = (ax - 1) / (ax + 1);
    }
  } else if (ax < 2.4375) {
    id = 2;
    t = (ax - 1.5) / (1 + 1.5 * ax);
  } else {
    id = 3;
    t = -1 / ax;
  }
  const z = t * t;
  const w = z * z;
  const s1 = z * (AT0 + w * (AT2 + w * (AT4 + w * (AT6 + w * (AT8 + w * AT10)))));
  const s2 = w * (AT1 + w * (AT3 + w * (AT5 + w * (AT7 + w * AT9))));
  if (id < 0) return t - t * (s1 + s2);
  const hi = ATAN_HI[id as 0 | 1 | 2 | 3];
  const lo = ATAN_LO[id as 0 | 1 | 2 | 3];
  const r = hi - ((t * (s1 + s2) - lo) - t);
  return x < 0 ? -r : r;
}

function isNegative(x: number): boolean {
  return x < 0 || (x === 0 && 1 / x < 0);
}

export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const m = (isNegative(y) ? 1 : 0) + (isNegative(x) ? 2 : 0);

  if (y === 0) {
    if (m < 2) return y; // ±0
    return m === 2 ? PI : -PI;
  }
  if (x === 0) return m & 1 ? -HALF_PI : HALF_PI;
  if (x === Infinity || x === -Infinity) {
    if (y === Infinity || y === -Infinity) {
      if (m === 0) return QUARTER_PI;
      if (m === 1) return -QUARTER_PI;
      if (m === 2) return 3 * QUARTER_PI;
      return -3 * QUARTER_PI;
    }
    if (m === 0) return 0;
    if (m === 1) return -0;
    return m === 2 ? PI : -PI;
  }
  if (y === Infinity || y === -Infinity) return m & 1 ? -HALF_PI : HALF_PI;

  // Compare binary exponents, as fdlibm does.
  const k = ((highWord(y) & 0x7ff00000) - (highWord(x) & 0x7ff00000)) >> 20;
  let z: number;
  if (k > 60) {
    z = HALF_PI + 0.5 * PI_LO;
    return m & 1 ? -z : z;
  } else if (m >= 2 && k < -60) {
    z = 0;
  } else {
    z = atan(Math.abs(y / x));
  }
  if (m === 0) return z;
  if (m === 1) return -z;
  if (m === 2) return PI - (z - PI_LO);
  return (z - PI_LO) - PI;
}

// ---------------------------------------------------------------- exponential and logarithm

const LN2_HI = 6.93147180369123816490e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e0;
const EXP_OVERFLOW = 7.09782712893383973096e2;
const EXP_UNDERFLOW = -7.45133219101941108420e2;
const P1 = 1.66666666666666019037e-1;
const P2 = -2.77777777770155933842e-3;
const P3 = 6.61375632143793436117e-5;
const P4 = -1.65339022054652515390e-6;
const P5 = 4.13813679705723846039e-8;

export function exp(x: number): number {
  if (x !== x) return x;
  if (x > EXP_OVERFLOW) return Infinity;
  if (x < EXP_UNDERFLOW) return 0;
  if (Math.abs(x) < 3.725290298461914e-9) return 1 + x; // |x| < 2^-28
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI; // exact: LN2_HI has trailing zero bits
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  return k === 0 ? y : scale(y, k);
}

const LG1 = 6.666666666666735130e-1;
const LG2 = 3.999999999940941908e-1;
const LG3 = 2.857142874366239149e-1;
const LG4 = 2.222219843214978396e-1;
const LG5 = 1.818357216161805012e-1;
const LG6 = 1.531383769920937332e-1;
const LG7 = 1.479819860511658591e-1;
const TWO54 = 18014398509481984;
const MIN_NORMAL = 2.2250738585072014e-308;

/** Natural logarithm. */
export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let k = 0;
  let v = x;
  if (v < MIN_NORMAL) {
    k -= 54;
    v *= TWO54;
  }
  let hx = highWord(v);
  const lx = lowWord(v);
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  // Normalise the mantissa into [√2/2, √2).
  const i = (hx + 0x95f64) & 0x100000;
  v = fromWords(hx | (i ^ 0x3ff00000), lx);
  k += i >> 20;
  const f = v - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const r = t2 + t1;
  const hfsq = 0.5 * f * f;
  return k * LN2_HI - ((hfsq - (s * (hfsq + r) + k * LN2_LO)) - f);
}

function isOddInteger(y: number): boolean {
  return Math.abs(y) < 9007199254740992 && y - 2 * Math.floor(y / 2) === 1;
}

/**
 * x^y. Computed as exp(y × log|x|), which keeps the relative error below about 2e-13 for every
 * finite result. Negative x needs an integer y, as with the built-in.
 */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  const ax = Math.abs(x);
  if (y === Infinity || y === -Infinity) {
    if (ax === 1) return NaN;
    return (ax > 1) === (y > 0) ? Infinity : 0;
  }
  if (x === 1) return 1;
  if (y === 1) return x;
  const negative = isNegative(x) && isOddInteger(y);
  if (ax === Infinity) {
    const magnitude = y > 0 ? Infinity : 0;
    return negative ? -magnitude : magnitude;
  }
  if (x < 0 && Math.floor(y) !== y) return NaN;
  let magnitude: number;
  if (ax === 0) magnitude = y > 0 ? 0 : Infinity;
  else if (y === 2) magnitude = ax * ax;
  else if (y === 0.5) magnitude = Math.sqrt(ax);
  else if (y === -1) magnitude = 1 / ax;
  else magnitude = exp(y * log(ax));
  return negative ? -magnitude : magnitude;
}
