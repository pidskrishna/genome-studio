import {
  decodeValue,
  geneAt,
  geneBases,
  GENE_COUNT,
  geneSpan,
  CHECKSUM_START,
  readGene,
  type GeneDef,
  type SpeciesId,
} from '../../src/genome';
import { Damped, dur, loop, motion } from './motion';
import type { LabLook } from './glass-helix';

// Shared pieces of the interaction lab: settings, the section scaffold with per-variant picks and
// notes, the segmented control, the code bar, value formatting and a helix-like backdrop. Dev only.

export type Face = 'plex' | 'geist' | 'chivo';
export type Numerals = 'tabular' | 'mono' | 'code';

export const lab = {
  look: 'glossy' as LabLook,
  face: 'plex' as Face,
  numerals: 'mono' as Numerals,
  hue: 160,
  species: 'A' as SpeciesId,
  /** The code every section shows; main.ts sets it to the species A wild type. */
  code: '',
};

export const FACES: Record<Face, { name: string; ui: string; mono: string }> = {
  plex: { name: 'IBM Plex Sans', ui: "'IBM Plex Sans'", mono: "'IBM Plex Mono'" },
  geist: { name: 'Geist', ui: "'Geist'", mono: "'Geist Mono'" },
  chivo: { name: 'Chivo', ui: "'Chivo'", mono: "'Chivo Mono'" },
};

export function applyType(root: HTMLElement, face: Face, numerals: Numerals): void {
  const f = FACES[face];
  root.style.setProperty('--ui', `${f.ui}, system-ui, sans-serif`);
  root.style.setProperty('--mono', `${f.mono}, ui-monospace, monospace`);
  root.style.setProperty('--num', numerals === 'mono' ? 'var(--mono)' : 'var(--ui)');
  root.style.setProperty('--num-variant', numerals === 'code' ? 'proportional-nums' : 'tabular-nums');
}

// Picks and notes -------------------------------------------------------------------------------------

const STORE = 'interaction-lab-v1';
interface Saved {
  picks: Record<string, string>;
  notes: Record<string, string>;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    // Storage may be unavailable; picks then last only for this visit.
  }
  return { picks: {}, notes: {} };
}

export const saved: Saved = load();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(saved));
  } catch {
    // Ignored, as above.
  }
  for (const l of listeners) l();
}

export function onSavedChange(l: () => void): void {
  listeners.add(l);
}

// Section scaffold ------------------------------------------------------------------------------------

export interface Variant {
  key: string;
  name: string;
  note: string;
  build: (stage: HTMLElement, cell: HTMLElement) => void;
}

export interface SectionSpec {
  id: string;
  title: string;
  note: string;
  variants: Variant[];
  /** Builds a shared area instead of one stage per variant (helix sections draw on one canvas). */
  shared?: (variantsRow: HTMLElement, cells: HTMLElement[]) => void;
  tools?: (header: HTMLElement) => void;
  stageClass?: string;
  /** Stack the variants as full-width rows (for wide things like the code bar). */
  rows?: boolean;
}

export const sectionTitles: Record<string, string> = {};
export const variantNames: Record<string, Record<string, string>> = {};

export function section(spec: SectionSpec): HTMLElement {
  sectionTitles[spec.id] = spec.title;
  variantNames[spec.id] = Object.fromEntries(spec.variants.map((v) => [v.key, v.name]));
  const el = document.createElement('section');
  el.className = 'lab-section';
  el.id = spec.id;
  const head = document.createElement('header');
  head.className = 'sec-head';
  head.innerHTML = `<h2></h2><p class="sec-note"></p>`;
  (head.querySelector('h2') as HTMLElement).textContent = spec.title;
  (head.querySelector('.sec-note') as HTMLElement).textContent = spec.note;
  spec.tools?.(head);
  const row = document.createElement('div');
  row.className = spec.rows ? 'variants rows' : 'variants';
  const cells: HTMLElement[] = [];
  for (const v of spec.variants) {
    const cell = document.createElement('div');
    cell.className = 'variant';
    cell.dataset.variant = v.key;
    const vh = document.createElement('div');
    vh.className = 'var-head';
    vh.innerHTML = `<span class="var-key"></span><span class="var-name"></span><button type="button" class="prefer" aria-pressed="false">Prefer</button><p class="var-note"></p>`;
    (vh.querySelector('.var-key') as HTMLElement).textContent = v.key;
    (vh.querySelector('.var-name') as HTMLElement).textContent = v.name;
    (vh.querySelector('.var-note') as HTMLElement).textContent = v.note;
    const prefer = vh.querySelector('.prefer') as HTMLButtonElement;
    const sync = (): void => {
      const on = saved.picks[spec.id] === v.key;
      prefer.setAttribute('aria-pressed', String(on));
      prefer.textContent = on ? 'Preferred' : 'Prefer';
      cell.classList.toggle('picked', on);
    };
    prefer.addEventListener('click', () => {
      saved.picks[spec.id] = saved.picks[spec.id] === v.key ? '' : v.key;
      persist();
    });
    onSavedChange(sync);
    sync();
    cell.append(vh);
    if (!spec.shared) {
      const stage = document.createElement('div');
      stage.className = `var-stage ${spec.stageClass ?? ''}`;
      cell.append(stage);
      v.build(stage, cell);
    }
    cells.push(cell);
    row.append(cell);
  }
  el.append(head, row);
  if (spec.shared) {
    spec.shared(row, cells);
    spec.variants.forEach((v, i) => v.build(cells[i]!, cells[i]!));
  }
  const notes = document.createElement('label');
  notes.className = 'sec-notes';
  notes.innerHTML = `<span>Notes</span><textarea rows="1" placeholder="What to change"></textarea>`;
  const ta = notes.querySelector('textarea') as HTMLTextAreaElement;
  ta.value = saved.notes[spec.id] ?? '';
  ta.addEventListener('input', () => {
    saved.notes[spec.id] = ta.value;
    persist();
  });
  el.append(notes);
  return el;
}

// Segmented control -----------------------------------------------------------------------------------

/**
 * Word segments with one glass lozenge that slides to the chosen segment (critically damped, no
 * overshoot). Arrow keys move the choice.
 */
export function segmented<T extends string>(label: string, options: { value: T; text: string }[], initial: T, onChange: (v: T) => void): { el: HTMLElement; set: (v: T) => void } {
  const el = document.createElement('div');
  el.className = 'seg';
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', label);
  const ind = document.createElement('span');
  ind.className = 'seg-ind glass';
  el.append(ind);
  const x = new Damped(0, dur('medium'));
  const w = new Damped(0, dur('medium'));
  let current = initial;
  let stop: (() => void) | null = null;
  const buttons = options.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.textContent = o.text;
    b.dataset.value = o.value;
    b.addEventListener('click', () => choose(o.value, true));
    b.addEventListener('keydown', (e) => {
      const i = options.findIndex((p) => p.value === current);
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = options[(i + d + options.length) % options.length]!;
      choose(next.value, true);
      buttons.find((bb) => bb.dataset.value === next.value)?.focus();
    });
    el.append(b);
    return b;
  });
  const place = (instant: boolean): void => {
    const b = buttons.find((bb) => bb.dataset.value === current);
    if (!b) return;
    x.target = b.offsetLeft;
    w.target = b.offsetWidth;
    x.setSettle(dur('medium'));
    w.setSettle(dur('medium'));
    if (instant || motion.reduced || x.value === 0) {
      x.snap(x.target);
      w.snap(w.target);
    }
    if (motion.reduced && !instant) {
      ind.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 160 });
    }
    if (stop) return;
    stop = loop((dt) => {
      x.step(dt);
      w.step(dt);
      ind.style.transform = `translateX(${x.value}px)`;
      ind.style.width = `${w.value}px`;
      const busy = !x.settled || !w.settled;
      if (!busy) stop = null;
      return busy;
    });
  };
  const choose = (v: T, fire: boolean): void => {
    current = v;
    for (const b of buttons) {
      const on = b.dataset.value === v;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    place(false);
    if (fire) onChange(v);
  };
  choose(initial, false);
  new ResizeObserver(() => place(true)).observe(el);
  return { el, set: (v: T) => choose(v, false) };
}

// Values ----------------------------------------------------------------------------------------------

export function formatModel(def: GeneDef, model: number): string {
  if (def.kind === 'choice') return def.choices?.[Math.round(model)] ?? String(model);
  if (def.kind === 'int' || def.kind === 'seed') return String(Math.round(model));
  const a = Math.abs(model);
  if (def.unit === '°') return `${Math.round(model)}`;
  if (a >= 1000) return Math.round(model).toLocaleString('en-GB');
  if (a >= 100) return model.toFixed(0);
  if (a >= 10) return model.toFixed(1);
  if (a >= 0.1) return model.toFixed(2);
  return model.toFixed(4);
}

export function geneReadout(code: string, species: SpeciesId, locus: number): { def: GeneDef; raw: number; value: string; unit: string; bases: string } {
  const def = geneAt(species, locus);
  const raw = readGene(code, locus);
  const model = decodeValue(def, raw);
  return { def, raw, value: formatModel(def, model), unit: def.unit === '°' ? '°' : def.unit, bases: geneBases(code, locus) };
}

// Code bar --------------------------------------------------------------------------------------------

export interface CodeGroup {
  kind: 'header' | 'form' | 'pigment' | 'seed' | 'checksum';
  locus: number | null;
  start: number;
  length: number;
  el: HTMLElement;
  letters: HTMLElement[];
}

/** The 160 letters grouped by gene, with a group hairline under form and pigment genes. */
export function codeBar(code: string, species: SpeciesId): { el: HTMLElement; groups: CodeGroup[]; letters: HTMLElement[]; set: (code: string) => void } {
  const el = document.createElement('div');
  el.className = 'code';
  el.setAttribute('aria-label', 'Genome code');
  const groups: CodeGroup[] = [];
  const letters: HTMLElement[] = [];
  const spans: { kind: CodeGroup['kind']; locus: number | null; start: number; length: number }[] = [{ kind: 'header', locus: null, start: 0, length: 6 }];
  for (let locus = 1; locus <= GENE_COUNT; locus++) {
    const { start, length } = geneSpan(locus);
    spans.push({ kind: geneAt(species, locus).group, locus, start, length });
  }
  spans.push({ kind: 'checksum', locus: null, start: CHECKSUM_START, length: 160 - CHECKSUM_START });
  for (const s of spans) {
    const g = document.createElement('span');
    g.className = `code-group g-${s.kind}`;
    if (s.locus !== null) g.title = geneAt(species, s.locus).name;
    const ls: HTMLElement[] = [];
    for (let i = s.start; i < s.start + s.length; i++) {
      const l = document.createElement('span');
      l.className = 'code-letter';
      l.textContent = code.charAt(i);
      g.append(l);
      ls.push(l);
      letters.push(l);
    }
    el.append(g);
    groups.push({ ...s, el: g, letters: ls });
  }
  return {
    el,
    groups,
    letters,
    set: (next: string) => letters.forEach((l, i) => (l.textContent = next.charAt(i))),
  };
}

// Backdrop --------------------------------------------------------------------------------------------

const BASE_CSS: Record<string, string> = { A: '#1f9d4c', C: '#2d68e8', G: '#e07a12', T: '#df3a3c' };

/** A flat drawing of the helix for panels that sit over the helix column (frost blurs it anyway). */
export function helixBackdrop(code: string, width: number, height: number, look: LabLook): string {
  const strand = look === 'fluorescence' ? 'rgba(230,236,244,0.55)' : look === 'plate' ? 'rgba(60,70,82,0.45)' : 'rgba(255,255,255,0.7)';
  const cx = width * 0.56;
  const amp = 46;
  const step = 11;
  let rungs = '';
  let a = '';
  let b = '';
  for (let i = 0; i * step < height + step; i++) {
    const y = i * step;
    const ph = (i * 2 * Math.PI) / 10.5;
    const x1 = cx + amp * Math.sin(ph);
    const x2 = cx + amp * Math.sin(ph + 0.8 * Math.PI);
    a += `${i ? 'L' : 'M'}${x1.toFixed(1)} ${y}`;
    b += `${i ? 'L' : 'M'}${x2.toFixed(1)} ${y}`;
    const base = code.charAt(i % code.length) || 'A';
    rungs += `<line x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}" stroke="${BASE_CSS[base]}" stroke-width="3" stroke-linecap="round" opacity="0.85"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rungs}<path d="${a}" fill="none" stroke="${strand}" stroke-width="5"/><path d="${b}" fill="none" stroke="${strand}" stroke-width="5"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Restarts a CSS animation on every element given. */
export function flashAll(els: Iterable<Element>, cls = 'pulse'): void {
  for (const el of els) {
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
  }
}
