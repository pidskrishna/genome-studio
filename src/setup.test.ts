import { describe, expect, it } from 'vitest';

describe('project setup', () => {
  it('runs tests under TypeScript', () => {
    const sum: number = [1, 2, 3].reduce((a, b) => a + b, 0);
    expect(sum).toBe(6);
  });
});
