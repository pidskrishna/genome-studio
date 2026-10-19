import { describe, expect, it } from 'vitest';
import { addToTray, TRAY_SIZE, type TrayEntry } from '../../src/ui/tray';

// Milestone 11: the specimen tray keeps recent organisms, newest first, each once.

const e = (code: string, image = ''): TrayEntry => ({ code, image });

describe('specimen tray', () => {
  it('puts the newest organism first', () => {
    let t: TrayEntry[] = [];
    for (const c of ['a', 'b', 'c']) t = addToTray(t, e(c));
    expect(t.map((x) => x.code)).toEqual(['c', 'b', 'a']);
  });

  it('keeps each code once: returning to one moves it to the front', () => {
    let t: TrayEntry[] = [];
    for (const c of ['a', 'b', 'c', 'a']) t = addToTray(t, e(c));
    expect(t.map((x) => x.code)).toEqual(['a', 'c', 'b']);
  });

  it('keeps at most TRAY_SIZE organisms; the oldest leaves first', () => {
    let t: TrayEntry[] = [];
    for (let i = 0; i < TRAY_SIZE + 3; i++) t = addToTray(t, e(String(i)));
    expect(t).toHaveLength(TRAY_SIZE);
    expect(t[0]!.code).toBe(String(TRAY_SIZE + 2));
    expect(t.some((x) => x.code === '0' || x.code === '1' || x.code === '2')).toBe(false);
  });

  it('stores codes exactly, so a click restores that exact code', () => {
    const code = 'AAAAAAGCAGTTGCGCGCTGATTC';
    expect(addToTray([], e(code))[0]!.code).toBe(code);
  });
});
