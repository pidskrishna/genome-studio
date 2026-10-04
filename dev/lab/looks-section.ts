import { specimenName } from '../../src/genome';
import type { LabLook } from './glass-helix';
import { codeBar, helixBackdrop, lab, section, segmented } from './lab';
import { easeOut, motion, tween, wait } from './motion';

// Lab section for switching look: three miniature studios, each restyling its whole interface with
// a different "exposure" change. The organism is the real one, rendered once per look. Dev only.

const LOOK_OPTIONS: { value: LabLook; text: string }[] = [
  { value: 'plate', text: 'Plate' },
  { value: 'fluorescence', text: 'Fluorescence' },
  { value: 'glossy', text: 'Glossy' },
];

function mini(look: LabLook, onChange: (to: LabLook) => void): { root: HTMLElement; helix: HTMLElement; setLookControl: (l: LabLook) => void; seg: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'mini';
  root.dataset.look = look;
  root.innerHTML = `
    <div class="mini-stage"><div class="mini-org"></div></div>
    <div class="mini-helix"></div>
    <div class="mini-top glass layer-1"><span class="mini-title"><em></em></span></div>
    <div class="mini-code glass layer-1"></div>
    <div class="mini-exposure"></div>`;
  (root.querySelector('em') as HTMLElement).textContent = specimenName(lab.code).full;
  const cb = codeBar(lab.code, lab.species);
  (root.querySelector('.mini-code') as HTMLElement).append(cb.el);
  const helix = root.querySelector('.mini-helix') as HTMLElement;
  const seg = segmented('Look', LOOK_OPTIONS, look, onChange);
  (root.querySelector('.mini-top') as HTMLElement).append(seg.el);
  return { root, helix, setLookControl: seg.set, seg: seg.el };
}

function paintHelix(helix: HTMLElement, look: LabLook): void {
  helix.style.backgroundImage = helixBackdrop(lab.code, helix.clientWidth || 140, helix.clientHeight || 240, look);
}

/** White for a light look, black when going into fluorescence: a lamp brightening or dimming. */
function exposureColour(to: LabLook): string {
  return to === 'fluorescence' ? '#000' : '#fff';
}

export function looksSection(): HTMLElement {
  const make = (kind: 'uniform' | 'from-switch' | 'staged') => (stage: HTMLElement): void => {
    stage.classList.add('mini-host');
    let busy = false;
    const change = async (to: LabLook): Promise<void> => {
      const button = m.seg.querySelector<HTMLElement>(`button[data-value="${to}"]`);
      const from = m.root.dataset.look as LabLook;
      if (!button || to === from || busy) {
        m.setLookControl(from);
        return;
      }
      busy = true;
      const exposure = m.root.querySelector('.mini-exposure') as HTMLElement;
      exposure.style.background = exposureColour(to);
      const total = 400;
      if (motion.reduced) {
        // Crossfade only.
        exposure.style.background = 'var(--bg)';
        await tween(80, (p) => (exposure.style.opacity = String(p * 0.8))).done;
        m.root.dataset.look = to;
        paintHelix(m.helix, to);
        await tween(80, (p) => (exposure.style.opacity = String(0.8 * (1 - p)))).done;
      } else if (kind === 'uniform') {
        await tween(total * 0.4, (p) => (exposure.style.opacity = String(p * 0.3)), easeOut).done;
        m.root.dataset.look = to;
        paintHelix(m.helix, to);
        await tween(total * 0.6, (p) => (exposure.style.opacity = String(0.3 * (1 - p))), easeOut).done;
      } else if (kind === 'from-switch') {
        const r = m.root.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        const cx = b.left + b.width / 2 - r.left;
        const cy = b.top + b.height / 2 - r.top;
        const far = Math.hypot(Math.max(cx, r.width - cx), Math.max(cy, r.height - cy));
        const clone = m.root.cloneNode(true) as HTMLElement;
        clone.classList.add('mini-clone');
        clone.dataset.look = to;
        clone.setAttribute('aria-hidden', 'true');
        for (const btn of clone.querySelectorAll('.seg button')) btn.setAttribute('aria-checked', String((btn as HTMLElement).dataset.value === to));
        stage.append(clone);
        paintHelix(clone.querySelector('.mini-helix') as HTMLElement, to);
        const ex = clone.querySelector('.mini-exposure') as HTMLElement;
        ex.style.background = exposureColour(to);
        await tween(
          total,
          (p) => {
            clone.style.clipPath = `circle(${p * far}px at ${cx}px ${cy}px)`;
            ex.style.opacity = String(0.22 * (1 - p));
          },
          easeOut,
        ).done;
        m.root.dataset.look = to;
        paintHelix(m.helix, to);
        await wait(16);
        clone.remove();
      } else {
        // Stage first; the panels follow a moment later, as if the light reaches them second.
        m.root.classList.add('staged');
        const stageEx = m.root.querySelector('.mini-stage') as HTMLElement;
        stageEx.style.setProperty('--ex-colour', exposureColour(to));
        m.root.dataset.look = to;
        paintHelix(m.helix, to);
        stageEx.classList.remove('exposing');
        void stageEx.offsetWidth;
        stageEx.classList.add('exposing');
        await wait(total + 140);
        m.root.classList.remove('staged');
      }
      m.setLookControl(to);
      busy = false;
    };
    const m = mini('glossy', (to) => void change(to));
    stage.append(m.root);
    new ResizeObserver(() => paintHelix(m.helix, m.root.dataset.look as LabLook)).observe(m.helix);
  };
  return section({
    id: 'look',
    title: 'Switching look',
    note: 'Each miniature studio has its own look switch in its top bar. The whole interface follows the look, not only the stage. About 400ms in each.',
    stageClass: 'tall',
    variants: [
      { key: 'A', name: 'Uniform exposure', note: 'The whole studio lifts towards white (or dips towards black for fluorescence) and settles in the new look.', build: make('uniform') },
      { key: 'B', name: 'From the switch', note: 'The new look spreads outward from the control you pressed, like light entering from there.', build: make('from-switch') },
      { key: 'C', name: 'Stage, then panels', note: 'The stage changes first; the glass panels follow 120ms later.', build: make('staged') },
    ],
  });
}

