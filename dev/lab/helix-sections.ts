import { geneAt, GENE_COUNT, nextBase, rawMax, readGene, writeGene, CHECKSUM_START, FIRST_GENE_POSITION } from '../../src/genome';
import { bandMiddle, type Band } from '../../src/ui/helix-geometry';
import { GlassHelixSet, type HelixMaterial, type HelixModel } from './glass-helix';
import { codeBar, geneReadout, lab, section, flashAll, type CodeGroup } from './lab';
import { dur, motion, wait } from './motion';
import { pressable, rollLetter } from './controls';
import type { Reticle } from './surface';

// Lab sections drawn on the frosted helix: focusing a gene, cycling a base, and randomising.

const helixSets: GlassHelixSet[] = [];
document.addEventListener('lab:look', () => helixSets.forEach((s) => s.setLook(lab.look)));
Object.assign(window, { helixSets });

/** Inspector stub attached beside the focused gene, with a hairline leader to its base pair. */
function attachInspector(m: HelixModel): { show: (band: Band | null) => void } {
  const panel = document.createElement('div');
  panel.className = 'helix-inspector glass layer-3';
  panel.innerHTML = '<span class="insp-name"></span><span class="insp-value"><span class="num"></span><span class="insp-unit"></span></span><div class="insp-bases"></div>';
  const leader = document.createElement('i');
  leader.className = 'leader';
  m.overlay.append(leader, panel);
  let band: Band | null = null;
  const parent = m.onFrame;
  m.onFrame = (model) => {
    parent?.(model);
    if (!band) return;
    // Just below the gene, so the lit base pairs stay in view, with a short leader up to them.
    const bottom = model.axisY(band.start + band.length - 0.5);
    const axis = model.rect.width * model.axisFraction;
    const x = Math.min(Math.max(axis - 30, 40), model.rect.width - 178);
    const top = Math.min(bottom + 14, model.rect.height - 84);
    panel.style.transform = `translate(${x}px, ${top}px)`;
    leader.style.transform = `translate(${axis}px, ${bottom + 2}px)`;
    leader.style.height = `${Math.max(0, top - bottom - 2)}px`;
  };
  return {
    show: (b) => {
      band = b;
      panel.classList.toggle('open', b !== null);
      leader.classList.toggle('open', b !== null);
      if (!b || b.locus === null) return;
      const r = geneReadout(m.code, m.species, b.locus);
      (panel.querySelector('.insp-name') as HTMLElement).textContent = r.def.name;
      (panel.querySelector('.num') as HTMLElement).textContent = r.value;
      (panel.querySelector('.insp-unit') as HTMLElement).textContent = r.unit;
      const bases = panel.querySelector('.insp-bases') as HTMLElement;
      bases.replaceChildren(
        ...[...r.bases].map((letter) => {
          const s = document.createElement('span');
          s.className = 'base static';
          s.dataset.base = letter;
          s.textContent = letter;
          return s;
        }),
      );
      m.onFrame?.(m);
    },
  };
}

function helixSet(row: HTMLElement, reticle: Reticle, onBase?: (view: number, index: number) => void, onBand?: (view: number, band: Band) => void, visiblePairs?: number): GlassHelixSet {
  // Every helix section uses the chosen material, borosilicate.
  const set = new GlassHelixSet({ count: 3, species: lab.species, code: lab.code, look: lab.look, reticle, onBase, onBand, visiblePairs, materials: ['boro', 'boro', 'boro'] });
  set.el.classList.add('helix-stage');
  row.append(set.el);
  helixSets.push(set);
  return set;
}

// Material --------------------------------------------------------------------------------------------

export function materialSection(reticle: Reticle): HTMLElement {
  const sets: GlassHelixSet[] = [];
  const build = (row: HTMLElement, materials: HelixMaterial[]): void => {
    const set = new GlassHelixSet({
      count: 3,
      species: lab.species,
      code: lab.code,
      look: lab.look,
      reticle,
      materials,
      onBand: (view, band) => {
        const m = set.models[view]!;
        if (band === m.focus) m.setFocus(null);
        else {
          m.setFocus(band, dur('small') * 1.5);
          setTimeout(() => (m.turnTo(bandMiddle(band)), set.wake()), dur('small') * 1.5);
        }
        set.wake();
      },
      onBase: (view, index) => {
        const m = set.models[view]!;
        const band = m.bandOf(index);
        if (band) set.opts.onBand?.(view, band);
      },
    });
    set.el.classList.add('helix-stage');
    if (sets.length === 1) set.el.classList.add('second-row');
    row.append(set.el);
    sets.push(set);
    helixSets.push(set);
  };
  const el = section({
    id: 'material',
    title: 'Helix material',
    note: 'Six glass materials on the same helix. Drag to spin, scroll to travel, click a gene on the ruler to focus it (light leads, as you chose). Try each look: the materials change with it. B, E and F use real physical transmission, so the glass blurs what is behind it.',
    variants: [
      { key: 'A', name: 'Lit cores (current)', note: 'A coloured core lit inside each frosted rung; frosted tubes for the backbones.', build: () => {} },
      { key: 'B', name: 'Frosted crystal', note: 'Physically frosted glass throughout; the coloured cores glow softly through it, blurred.', build: () => {} },
      { key: 'C', name: 'Milk glass', note: 'Nearly opaque soft white glass; the bases are pastel tints in the glass itself, no inner light.', build: () => {} },
      { key: 'D', name: 'Edge-lit optic', note: 'Clear glass you see only by its edges, like a lens element; the coloured cores read sharply.', build: () => {} },
      { key: 'E', name: 'Borosilicate', note: 'Laboratory glass: nearly clear, faintly cool, physically refracting the cores inside.', build: () => {} },
      { key: 'F', name: 'Stained frost', note: 'The rungs are coloured frosted glass, no inner light; backbones frosted white.', build: () => {} },
    ],
    shared: (row) => {
      build(row, ['lit', 'frosted', 'milk']);
      build(row, ['edge', 'boro', 'stained']);
    },
  });
  el.classList.add('helix-section', 'material-section');
  return el;
}

// Focus -----------------------------------------------------------------------------------------------

export function focusSection(reticle: Reticle): HTMLElement {
  let set: GlassHelixSet;
  const inspectors: { show: (band: Band | null) => void }[] = [];
  const timers: number[][] = [[], [], []];
  const focusIn = async (view: number, band: Band | null): Promise<void> => {
    const m = set.models[view]!;
    for (const t of timers[view]!) clearTimeout(t);
    timers[view] = [];
    const later = (ms: number, f: () => void): void => {
      timers[view]!.push(window.setTimeout(() => (f(), set.wake()), motion.reduced ? 0 : ms));
    };
    const insp = inspectors[view]!;
    if (!band || band === m.focus) {
      m.setFocus(null);
      insp.show(null);
      set.wake();
      return;
    }
    const mid = bandMiddle(band);
    const large = dur('large');
    insp.show(null);
    if (view === 0) {
      // Turn, then light.
      m.turnTo(mid, large);
      later(large * 0.6, () => m.setFocus(band, dur('medium')));
      later(large * 0.6 + dur('medium') * 0.5, () => insp.show(band));
    } else if (view === 1) {
      // Light leads: the gene lights where it is, then turns to you.
      m.setFocus(band, dur('small') * 1.5);
      later(dur('small') * 1.5, () => m.turnTo(mid, large));
      later(dur('small') * 1.5 + large * 0.8, () => insp.show(band));
    } else {
      // Light travels along the backbone from where you were to the gene as the helix turns.
      const from = m.focus ? bandMiddle(m.focus) : m.travel.value;
      if (m.focus) m.setFocus(null, dur('small'));
      void m.travelLight(from, mid, large, 2.6);
      m.turnTo(mid, large);
      later(large * 0.85, () => m.setFocus(band, dur('medium')));
      later(large * 0.95, () => insp.show(band));
    }
    set.wake();
  };
  const el = section({
    id: 'focus',
    title: 'Focusing a gene on the helix',
    note: 'Click a gene on the ruler (left of each helix) or any rung. Click the focused gene again to release it. Drag to spin; it settles so a base pair faces you. Scroll to travel. At rest the helix drifts slowly; the focused gene breathes.',
    variants: [
      { key: 'A', name: 'Turn, then light', note: 'The helix turns to the gene; as it arrives the gene lights and the rest dims to frosted grey.', build: () => {} },
      { key: 'B', name: 'Light leads', note: 'The gene lights where it is first, so your eye finds it; then it turns to face you.', build: () => {} },
      { key: 'C', name: 'Light travels', note: 'A band of light runs along the backbone from where you were to the gene while the helix turns.', build: () => {} },
    ],
    shared: (row) => {
      set = helixSet(
        row,
        reticle,
        (view, index) => {
          const band = set.models[view]!.bandOf(index);
          if (band) void focusIn(view, band);
        },
        (view, band) => void focusIn(view, band),
      );
      for (const m of set.models) inspectors.push(attachInspector(m));
    },
  });
  el.classList.add('helix-section');
  return el;
}

// Base cycle ------------------------------------------------------------------------------------------

export function cycleSection(reticle: Reticle): HTMLElement {
  let set: GlassHelixSet;
  const readouts: { el: HTMLElement; update: (index: number | null, changed?: number) => void }[] = [];
  const selected: (number | null)[] = [null, null, null];

  const cycle = async (view: number, index: number, letter?: string): Promise<void> => {
    const m = set.models[view]!;
    const pos = index + 1;
    const editable = pos >= FIRST_GENE_POSITION && pos <= CHECKSUM_START;
    const band = m.bandOf(index) ?? null;
    if (band && band !== m.focus) m.setFocus(band, dur('medium'));
    selected[view] = index;
    readouts[view]!.update(index);
    if (!editable) {
      readouts[view]!.el.classList.add('refuse');
      setTimeout(() => readouts[view]!.el.classList.remove('refuse'), 1200);
      set.wake();
      return;
    }
    const next = letter ?? nextBase(m.code.charAt(index));
    if (next === m.code.charAt(index)) return;
    const ms = dur('medium') + 80;
    if (view === 0) {
      await m.pulseRung(index, next, 'across', ms);
    } else if (view === 1) {
      await m.pulseRung(index, next, 'meet', ms * 0.85);
    } else {
      await m.pulseRung(index, next, 'across', ms * 0.8);
      if (band) {
        void m.travelLight(index, band.start - 0.3, dur('medium'), 1.4);
        void m.travelLight(index, band.start + band.length - 0.7, dur('medium'), 1.4);
      }
    }
    readouts[view]!.update(index, index);
    set.wake();
  };

  const el = section({
    id: 'cycle',
    title: 'Cycling a base',
    note: 'Click a rung to cycle its base A, C, G, T; with a base selected, type A, C, G or T. Its partner follows (A pairs with T, C with G). Header and checksum bases cannot be edited.',
    variants: [
      { key: 'A', name: 'Strand to strand', note: 'A pulse of light crosses the rung from the code strand to its partner, leaving the new colours behind.', build: () => {} },
      { key: 'B', name: 'Meet in the middle', note: 'Two pulses leave both backbones and meet where the bases pair.', build: () => {} },
      { key: 'C', name: 'Through and on', note: 'The pulse crosses the rung, then runs on along the backbone through the rest of the gene.', build: () => {} },
    ],
    shared: (row) => {
      set = helixSet(row, reticle, (view, index) => void cycle(view, index));
      set.el.tabIndex = 0;
      set.el.setAttribute('aria-label', 'Helices: click a rung, then type A, C, G or T');
      set.el.addEventListener('keydown', (e) => {
        const letter = e.key.toUpperCase();
        if (!'ACGT'.includes(letter) || letter.length !== 1) return;
        selected.forEach((index, view) => {
          if (index !== null) void cycle(view, index, letter);
        });
      });
      set.models.forEach((m) => {
        m.drift = 0;
        m.turnTo(30, 0);
        const box = document.createElement('div');
        box.className = 'cycle-readout glass layer-2';
        m.overlay.append(box);
        const update = (index: number | null, changed?: number): void => {
          if (index === null) {
            box.textContent = 'Click a rung';
            return;
          }
          const band = m.bandOf(index);
          const pos = index + 1;
          if (!band || band.locus === null) {
            box.innerHTML = `<span class="insp-name"></span><span class="refuse-note">These bases can’t be edited.</span>`;
            (box.querySelector('.insp-name') as HTMLElement).textContent = `${band?.kind === 'header' ? 'Header' : 'Checksum'}, base ${pos}`;
            return;
          }
          const r = geneReadout(m.code, m.species, band.locus);
          box.innerHTML = `<div class="insp-head"><span class="insp-name"></span><span class="insp-value"><span class="num"></span><span class="insp-unit"></span></span></div><div class="insp-bases"></div>`;
          (box.querySelector('.insp-name') as HTMLElement).textContent = `${r.def.name}, base ${pos}`;
          (box.querySelector('.num') as HTMLElement).textContent = r.value;
          (box.querySelector('.insp-unit') as HTMLElement).textContent = r.unit;
          const bases = box.querySelector('.insp-bases') as HTMLElement;
          [...r.bases].forEach((letter, k) => {
            const s = document.createElement('span');
            s.className = 'base static';
            s.dataset.base = letter;
            const i = band.start + k;
            s.classList.toggle('selected', i === index);
            bases.append(s);
            if (changed === i) rollLetter(s, letter);
            else s.textContent = letter;
          });
          if (changed !== undefined) flashAll([box.querySelector('.num') as HTMLElement]);
        };
        readouts.push({ el: box, update });
        update(null);
      });
    },
  });
  el.classList.add('helix-section');
  return el;
}

function restart(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

// Randomise -------------------------------------------------------------------------------------------

/** The editor's rule: every unlocked gene moves to a different value, chosen uniformly. */
function randomised(code: string, locked: Set<number>): string {
  let next = code;
  for (let locus = 1; locus <= GENE_COUNT; locus++) {
    if (locked.has(locus)) continue;
    const def = geneAt(lab.species, locus);
    const max = rawMax(def);
    const current = readGene(next, locus);
    let raw = Math.floor(Math.random() * max);
    if (raw >= current) raw += 1;
    next = writeGene(next, locus, raw);
  }
  return next;
}

export function randomiseSection(reticle: Reticle): HTMLElement {
  let set: GlassHelixSet;
  const bars: { set: (code: string) => void; letters: HTMLElement[]; groups: CodeGroup[] }[] = [];
  const lockedSets = [0, 1, 2].map(() => new Set([3, 17]));
  const FOCUS_LOCUS = 7;

  const run = async (view: number): Promise<void> => {
    const m = set.models[view]!;
    const bar = bars[view]!;
    const before = m.code;
    const LOCKED = lockedSets[view]!;
    const after = randomised(before, LOCKED);
    const origin = bandMiddle(m.bands.find((b) => b.locus === FOCUS_LOCUS)!);
    const groupOf = (i: number): CodeGroup => bar.groups.find((gr) => i >= gr.start && i < gr.start + gr.length)!;
    const lockedAt = (i: number): boolean => {
      const g = groupOf(i);
      return g.locus !== null && LOCKED.has(g.locus);
    };
    // Unscaled milliseconds: wait() applies the lab's slow motion.
    const delayOf = (i: number): number => {
      if (motion.reduced) return 0;
      if (view === 0) return (i / 159) * 480;
      if (view === 1) return (Math.abs(i - origin) / 120) * 480;
      return bar.groups.indexOf(groupOf(i)) * 26;
    };
    const rungMs = dur('medium') * 0.8;
    // The front: every base the ripple reaches lights briefly, changed or not, so its shape is visible.
    const reached = view === 2 ? bar.groups.filter((g) => g.kind !== 'header').map((g) => g.start) : [...Array(160).keys()];
    await Promise.all([
      ...reached.map(async (i) => {
        await wait(delayOf(i));
        if (view === 2) {
          const g = groupOf(i);
          if (g.locus !== null && LOCKED.has(g.locus)) return;
          restart(g.el, 'front');
          for (let k = g.start; k < g.start + g.length; k++) m.flash[k] = Math.max(m.flash[k]!, 0.45);
        } else {
          if (lockedAt(i) || i < 6) return;
          restart(bar.letters[i]!, 'front');
          m.flash[i] = Math.max(m.flash[i]!, 0.45);
        }
        set.wake();
      }),
      ...[...Array(160).keys()]
        .filter((i) => before[i] !== after[i])
        .map(async (i) => {
          await wait(delayOf(i));
          rollLetter(bar.letters[i]!, after.charAt(i));
          await m.pulseRung(i, after.charAt(i), 'meet', rungMs);
        }),
    ]);
    m.setCode(after);
    set.wake();
  };

  const el = section({
    id: 'randomise',
    title: 'Randomising',
    note: 'Press Randomise all under a helix. Every unlocked gene changes; Space density and Pigment B are locked and stay still, their rungs frosted over. Lock Surface seeking (the gene mid-view) to watch frost condense on its rungs. Slow motion helps compare.',
    variants: [
      { key: 'A', name: 'Top to bottom', note: 'One continuous front runs down the sequence, base 1 to 160, in about 480ms.', build: () => {} },
      { key: 'B', name: 'From the middle of the view', note: 'Two fronts spread up and down from the gene at the centre of the view (Surface seeking), where you are looking.', build: () => {} },
      { key: 'C', name: 'Gene by gene', note: 'Whole genes light and change as blocks, one after the next, in 24 distinct steps.', build: () => {} },
    ],
    shared: (row, cells) => {
      set = helixSet(row, reticle, undefined, undefined, 64);
      set.models.forEach((m, view) => {
        const LOCKED = lockedSets[view]!;
        for (const l of LOCKED) m.setLocked(l, true);
        const focusBand = m.bands.find((b) => b.locus === FOCUS_LOCUS)!;
        m.setFocus(null);
        m.turnTo(bandMiddle(focusBand), 0);
        const cell = cells[view]!;
        const under = document.createElement('div');
        under.className = 'randomise-under over-stage';
        const panel = document.createElement('div');
        panel.className = 'codebar compact glass layer-1';
        const cb = codeBar(m.code, m.species);
        for (const g of cb.groups) if (g.locus !== null && LOCKED.has(g.locus)) g.el.classList.add('locked');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn glass';
        btn.textContent = 'Randomise all';
        pressable(btn, 'sink');
        let busy = false;
        btn.addEventListener('click', async () => {
          if (busy) return;
          busy = true;
          await run(view);
          busy = false;
        });
        const lock = document.createElement('button');
        lock.type = 'button';
        lock.className = 'btn glass';
        lock.textContent = 'Lock Surface seeking';
        pressable(lock, 'sink');
        lock.addEventListener('click', () => {
          const on = !LOCKED.has(FOCUS_LOCUS);
          if (on) LOCKED.add(FOCUS_LOCUS);
          else LOCKED.delete(FOCUS_LOCUS);
          m.setLocked(FOCUS_LOCUS, on);
          cb.groups.find((g) => g.locus === FOCUS_LOCUS)?.el.classList.toggle('locked', on);
          lock.textContent = on ? 'Unlock Surface seeking' : 'Lock Surface seeking';
          set.wake();
        });
        const actions = document.createElement('div');
        actions.className = 'insp-actions';
        actions.append(lock, btn);
        panel.append(cb.el, actions);
        under.append(panel);
        cell.append(under);
        bars.push(cb);
      });
    },
  });
  el.classList.add('helix-section', 'randomise-section');
  return el;
}
