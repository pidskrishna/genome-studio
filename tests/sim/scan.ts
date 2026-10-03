// Scanner for forbidden calls in simulation code. The rule is an allowlist: the only members of Math
// that may appear are sqrt, abs, floor, min and max.

export const ALLOWED_MATH = ['sqrt', 'abs', 'floor', 'min', 'max'] as const;

/** Replaces comments and the contents of string literals with spaces, keeping line numbers. */
export function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const ch = source[i] as string;
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && source[j] !== ch) j += source[j] === '\\' ? 2 : 1;
      out += ch + blank(source.slice(i + 1, j)) + ch;
      i = j + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

export interface Violation {
  line: number;
  text: string;
  rule: string;
}

export function findViolations(source: string): Violation[] {
  const code = stripCommentsAndStrings(source);
  const violations: Violation[] = [];
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const add = (index: number, rule: string) =>
    violations.push({ line: lineOf(index), text: (source.split('\n')[lineOf(index) - 1] ?? '').trim(), rule });

  // Any use of Math other than an allowed member: Math.sin, Math['sin'], const M = Math, ...
  const allowed = new RegExp(`^\\s*\\.\\s*(${ALLOWED_MATH.join('|')})\\b`);
  for (const m of code.matchAll(/\bMath\b/g)) {
    if (!allowed.test(code.slice(m.index + 4))) add(m.index, 'Math member not on the allowlist');
  }

  // ** and **= with anything but an integer literal as the exponent.
  for (const m of code.matchAll(/\*\*=?/g)) {
    const after = code.slice(m.index + m[0].length);
    if (!/^\s*-?\d+(?![\d.eExXn_])/.test(after)) add(m.index, '** with a non-integer exponent');
  }

  for (const m of code.matchAll(/\bDate\b/g)) add(m.index, 'Date');
  for (const m of code.matchAll(/\bperformance\b/g)) add(m.index, 'performance.now');
  return violations;
}
