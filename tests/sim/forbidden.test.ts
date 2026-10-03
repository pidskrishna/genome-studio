import { describe, expect, it } from 'vitest';
import { findViolations } from './scan';

const sources = import.meta.glob('/src/sim/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('forbidden calls in src/sim', () => {
  it('finds the simulation sources', () => {
    const files = Object.keys(sources);
    expect(files).toContain('/src/sim/dmath.ts');
    expect(files).toContain('/src/sim/rng.ts');
    expect(files).toContain('/src/sim/worker.ts');
  });

  it('no file uses a forbidden call', () => {
    const report: string[] = [];
    for (const [file, source] of Object.entries(sources)) {
      for (const v of findViolations(source)) report.push(`${file}:${v.line} ${v.rule}: ${v.text}`);
    }
    expect(report).toEqual([]);
  });
});

describe('the scanner', () => {
  it('allows only Math.sqrt, abs, floor, min and max', () => {
    expect(findViolations('const a = Math.sqrt(x) + Math.abs(y) + Math.floor(z) + Math.min(1, 2) + Math.max(3, 4);')).toEqual([]);
    for (const bad of ['random()', 'sin(x)', 'cos(x)', 'tan(x)', 'atan2(y, x)', 'exp(x)', 'log(x)', 'pow(x, y)', 'round(x)', 'imul(a, b)', 'hypot(a, b)', 'PI', 'fround(x)', 'sqrtx(1)']) {
      expect(findViolations(`const v = Math.${bad};`), bad).toHaveLength(1);
    }
  });

  it('catches indirect uses of Math', () => {
    expect(findViolations("const v = Math['sin'](x);")).toHaveLength(1);
    expect(findViolations('const M = Math; M.sin(1);')).toHaveLength(1);
    expect(findViolations('const { sin } = Math;')).toHaveLength(1);
    expect(findViolations('Math . sin(1)')).toHaveLength(1);
  });

  it('allows ** only with an integer literal exponent', () => {
    expect(findViolations('const a = x ** 2 + y ** 3 + z ** -1; w **= 4;')).toEqual([]);
    for (const bad of ['x ** 0.5', 'x ** 2.0', 'x ** y', 'x ** (2)', 'x ** 1e3', 'x **= 0.5', 'x ** 2n', 'x ** 0x2']) {
      expect(findViolations(`const v = ${bad};`), bad).toHaveLength(1);
    }
  });

  it('catches Date and performance.now', () => {
    expect(findViolations('const t = Date.now();')).toHaveLength(1);
    expect(findViolations('const t = new Date();')).toHaveLength(1);
    expect(findViolations('const t = performance.now();')).toHaveLength(1);
  });

  it('ignores comments and strings, but not the code around them', () => {
    expect(findViolations('// Math.sin is banned\n/* Math.random */ const s = "Math.cos"; const t = `Date`;')).toEqual([]);
    const v = findViolations('const a = 1; // fine\nconst b = Math.exp(1);');
    expect(v).toHaveLength(1);
    expect(v[0]?.line).toBe(2);
  });
});
