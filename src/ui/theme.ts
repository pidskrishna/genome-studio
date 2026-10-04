import type { Pigments } from '../genome';
import type { LookId } from '../render/colour';

// The interface's design tokens for each look (DESIGN.md sections 2 and 3). They are written to the
// page as CSS custom properties, so switching look restyles the whole interface, not only the stage.
// In the fluorescence look the accents take the organism's pigment hues: --hue is pigment A, --hue-b
// pigment B; both follow the pigment genes without a regrow.

export const TOKEN_NAMES = [
  'bg',
  'backdrop',
  'stage',
  'ink',
  'ink-2',
  'ink-3',
  'hair',
  'hair-strong',
  'fill-1',
  'fill-2',
  'fill-3',
  'frost',
  'rim-hi',
  'rim-lo',
  'rim-edge',
  'shadow',
  'reflection',
  'accent',
  'on-accent',
  'pulse',
  'wash',
  'cursor-light',
  'g-form',
  'g-pigment',
  'g-other',
  'reticle',
  'reticle-halo',
  'frost-fill',
  'warn',
  'error',
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type Tokens = Readonly<Record<TokenName, string>>;

export const LOOK_TOKENS: Readonly<Record<LookId, Tokens>> = {
  // Off-white paper, ink-black type, frosted white glass: the renderer's own paper and ink.
  plate: {
    bg: '#f3efe4',
    backdrop: '#ebe7dc',
    stage: '#f3efe4',
    ink: '#1c1a17',
    'ink-2': 'rgba(28, 26, 23, 0.62)',
    'ink-3': 'rgba(28, 26, 23, 0.4)',
    hair: 'rgba(28, 26, 23, 0.14)',
    'hair-strong': 'rgba(28, 26, 23, 0.32)',
    'fill-1': 'rgba(253, 251, 246, 0.42)',
    'fill-2': 'rgba(253, 251, 246, 0.6)',
    'fill-3': 'rgba(254, 252, 248, 0.76)',
    frost: '40px',
    'rim-hi': 'rgba(255, 255, 255, 0.98)',
    'rim-lo': 'rgba(255, 255, 255, 0.4)',
    'rim-edge': 'rgba(28, 26, 23, 0.1)',
    shadow: '0 1px 1px rgba(40, 32, 20, 0.05)',
    reflection: 'none',
    accent: '#1c1a17',
    'on-accent': '#f6f3ea',
    pulse: '#1c1a17',
    wash: 'rgba(28, 26, 23, 0.14)',
    'cursor-light': 'rgba(255, 255, 255, 0.75)',
    'g-form': '#5e7491',
    'g-pigment': '#9a6488',
    'g-other': 'rgba(28, 26, 23, 0.3)',
    reticle: 'rgba(28, 26, 23, 0.7)',
    'reticle-halo': 'rgba(255, 255, 255, 0.7)',
    'frost-fill': 'rgba(249, 246, 238, 0.62)',
    warn: '#7a5200',
    error: '#a32020',
  },
  // Black, dark smoked glass, controls lit in the organism's pigment hues.
  fluorescence: {
    bg: '#000',
    backdrop: '#000',
    stage: '#000',
    ink: '#e9ecef',
    'ink-2': 'rgba(233, 236, 239, 0.6)',
    'ink-3': 'rgba(233, 236, 239, 0.36)',
    hair: 'rgba(255, 255, 255, 0.1)',
    'hair-strong': 'rgba(255, 255, 255, 0.26)',
    'fill-1': 'rgba(20, 21, 24, 0.4)',
    'fill-2': 'rgba(24, 26, 30, 0.58)',
    'fill-3': 'rgba(28, 30, 35, 0.74)',
    frost: '40px',
    'rim-hi': 'rgba(255, 255, 255, 0.3)',
    'rim-lo': 'rgba(255, 255, 255, 0.07)',
    'rim-edge': 'rgba(255, 255, 255, 0.05)',
    shadow: 'none',
    reflection: 'none',
    accent: 'hsl(var(--hue) 88% 66%)',
    'on-accent': '#000',
    pulse: 'hsl(var(--hue) 90% 70%)',
    wash: 'hsl(var(--hue) 90% 60% / 0.35)',
    'cursor-light': 'rgba(255, 255, 255, 0.08)',
    'g-form': '#8a9bb3',
    'g-pigment': 'hsl(var(--hue-b) 70% 62%)',
    'g-other': 'rgba(255, 255, 255, 0.28)',
    reticle: 'hsl(var(--hue) 70% 72%)',
    'reticle-halo': 'rgba(0, 0, 0, 0.6)',
    'frost-fill': 'rgba(30, 32, 37, 0.66)',
    warn: '#e8b25a',
    error: '#ff7a70',
  },
  // Neutral studio grey, clearer glass with a soft reflection.
  glossy: {
    bg: '#9a9c9f',
    backdrop: '#a3a5a8',
    stage: '#9a9c9f',
    ink: '#0f1114',
    'ink-2': 'rgba(15, 17, 20, 0.64)',
    'ink-3': 'rgba(15, 17, 20, 0.42)',
    hair: 'rgba(15, 17, 20, 0.14)',
    'hair-strong': 'rgba(15, 17, 20, 0.32)',
    'fill-1': 'rgba(255, 255, 255, 0.1)',
    'fill-2': 'rgba(255, 255, 255, 0.17)',
    'fill-3': 'rgba(255, 255, 255, 0.28)',
    frost: '16px',
    'rim-hi': 'rgba(255, 255, 255, 0.85)',
    'rim-lo': 'rgba(255, 255, 255, 0.22)',
    'rim-edge': 'rgba(0, 0, 0, 0.06)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.1), 0 8px 20px -14px rgba(0, 0, 0, 0.35)',
    reflection: 'linear-gradient(115deg, transparent 32%, rgba(255, 255, 255, 0.13) 44%, transparent 58%)',
    accent: '#33506c',
    'on-accent': '#f2f4f6',
    pulse: '#ffffff',
    wash: 'rgba(255, 255, 255, 0.6)',
    'cursor-light': 'rgba(255, 255, 255, 0.4)',
    'g-form': '#3f5a78',
    'g-pigment': '#7b4f6e',
    'g-other': 'rgba(15, 17, 20, 0.3)',
    reticle: 'rgba(15, 17, 20, 0.75)',
    'reticle-halo': 'rgba(255, 255, 255, 0.55)',
    'frost-fill': 'rgba(196, 198, 201, 0.55)',
    warn: '#5a3c00',
    error: '#7d1414',
  },
};

/** The helix column's backdrop as a number, for the helix scene (it must match --backdrop). */
export const BACKDROP_HEX: Readonly<Record<LookId, number>> = {
  plate: 0xebe7dc,
  fluorescence: 0x000000,
  glossy: 0xa3a5a8,
};

/** The genome-browser base colours, the same in every look (DESIGN.md section 2). */
export const BASE_CSS: Readonly<Record<string, string>> = { A: '#1f9d4c', C: '#2d68e8', G: '#e07a12', T: '#df3a3c' };

export interface StyleTarget {
  dataset: DOMStringMap;
  style: Pick<CSSStyleDeclaration, 'setProperty'>;
}

/** Writes one look's tokens to an element (normally the root), so the whole interface follows it. */
export function applyLook(target: StyleTarget, look: LookId): void {
  target.dataset.look = look;
  const tokens = LOOK_TOKENS[look];
  for (const name of TOKEN_NAMES) target.style.setProperty(`--${name}`, tokens[name]);
}

/** The pigment hues the fluorescence look lights its controls with, in whole degrees 0 to 359. */
export function pigmentHues(p: Pick<Pigments, 'hueA' | 'hueB'>): { a: number; b: number } {
  const wrap = (h: number): number => ((Math.round(h) % 360) + 360) % 360;
  return { a: wrap(p.hueA), b: wrap(p.hueB) };
}

/** Writes the pigment hues; only the fluorescence tokens read them, so other looks are unaffected. */
export function applyPigmentHues(target: StyleTarget, p: Pick<Pigments, 'hueA' | 'hueB'>): void {
  const { a, b } = pigmentHues(p);
  target.style.setProperty('--hue', String(a));
  target.style.setProperty('--hue-b', String(b));
}
