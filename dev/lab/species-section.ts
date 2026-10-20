import { pressable } from './controls';
import { section } from './lab';
import { Damped, dur, loop, motion } from './motion';

// Milestone 22: the species switch for six species (and more later). The owner's interview answers
// (20 October 2026): short names, a menu from the top bar, one line on the model under each name.
// Three variants of that menu, each in a slice of the top bar over the stage.

interface Species {
  letter: string;
  name: string;
  line: string;
}

const SPECIES: Species[] = [
  { letter: 'A', name: 'Branching', line: 'Branches grow toward open space' },
  { letter: 'B', name: 'Ruffles', line: 'A sheet that grows fastest at its edge' },
  { letter: 'C', name: 'Phyllotaxis', line: 'Organs form where there is room' },
  { letter: 'D', name: 'Seashell', line: 'A tube that grows and coils at its mouth' },
  { letter: 'E', name: 'Coral', line: 'Layers laid down where nutrient reaches' },
  { letter: 'F', name: 'Fungus', line: 'Hyphal tips that sense their neighbours' },
];

type Kind = 'list' | 'grid' | 'popup';

/** A slice of the top bar: the Species label and its menu button, beside the View control for scale. */
function bar(stage: HTMLElement): { bar: HTMLElement; button: HTMLButtonElement } {
  stage.classList.add('over-stage', 'species-stage');
  const el = document.createElement('div');
  el.className = 'species-bar glass layer-1';
  const label = document.createElement('span');
  label.className = 'top-label';
  label.textContent = 'Species';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn glass species-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  pressable(button, 'sink');
  const view = document.createElement('span');
  view.className = 'species-bar-rest';
  view.textContent = 'View   3D  Flat     Look   Plate  Fluorescence  Glossy';
  el.append(label, button, view);
  stage.append(el);
  return { bar: el, button };
}

function menu(kind: Kind) {
  return (stage: HTMLElement): void => {
    const { bar: top, button } = bar(stage);
    let current = 4;
    let active = current;
    let open = false;
    button.textContent = SPECIES[current]!.name;

    const panel = document.createElement('div');
    panel.className = `species-menu glass layer-3 species-${kind}`;
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Species');
    panel.tabIndex = -1;
    panel.hidden = true;
    const lozenge = document.createElement('span');
    lozenge.className = 'species-lozenge';
    panel.append(lozenge);
    const rows = SPECIES.map((s, i) => {
      const row = document.createElement('div');
      row.className = 'species-row';
      row.setAttribute('role', 'option');
      row.id = `species-${kind}-${s.letter}`;
      row.innerHTML = '<span class="species-name"></span><span class="species-line"></span>';
      (row.querySelector('.species-name') as HTMLElement).textContent = s.name;
      (row.querySelector('.species-line') as HTMLElement).textContent = s.line;
      row.addEventListener('pointerenter', () => setActive(i));
      row.addEventListener('click', () => choose(i));
      panel.append(row);
      return row;
    });
    top.append(panel);

    // The lozenge follows the active row, critically damped, as in the segmented controls.
    const lx = new Damped(0, dur('medium'));
    const ly = new Damped(0, dur('medium'));
    const lw = new Damped(0, dur('medium'));
    const lh = new Damped(0, dur('medium'));
    let stopLozenge: (() => void) | null = null;
    const placeLozenge = (instant: boolean) => {
      const r = rows[active]!;
      lx.target = r.offsetLeft;
      ly.target = r.offsetTop;
      lw.target = r.offsetWidth;
      lh.target = r.offsetHeight;
      if (instant || motion.reduced) for (const d of [lx, ly, lw, lh]) d.snap(d.target);
      if (stopLozenge) return;
      stopLozenge = loop((dt) => {
        for (const d of [lx, ly, lw, lh]) d.step(dt);
        lozenge.style.transform = `translate(${lx.value}px, ${ly.value}px)`;
        lozenge.style.width = `${lw.value}px`;
        lozenge.style.height = `${lh.value}px`;
        const busy = [lx, ly, lw, lh].some((d) => !d.settled);
        if (!busy) stopLozenge = null;
        return busy;
      });
    };
    const setActive = (i: number) => {
      active = i;
      panel.setAttribute('aria-activedescendant', rows[i]!.id);
      rows.forEach((r, k) => r.setAttribute('aria-selected', String(k === current)));
      rows.forEach((r, k) => r.classList.toggle('active', k === i));
      placeLozenge(false);
    };

    // Opening: list unfolds from the button; grid rises a little and fades in; pop-up grows from
    // the button's own outline so the current species sits where the button was.
    const show = () => {
      if (open) return;
      open = true;
      button.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      active = current;
      const b = button.getBoundingClientRect();
      const t = top.getBoundingClientRect();
      if (kind === 'popup') {
        // Put the current row over the button, but never past the top of the window (here the
        // stage), as desktop pop-up menus shift to stay on screen.
        const rowTop = rows[current]!.offsetTop;
        const s = stage.getBoundingClientRect();
        panel.style.left = `${b.left - t.left - 8}px`;
        panel.style.top = `${Math.max(b.top - t.top - rowTop - 4, s.top - t.top + 4)}px`;
      } else {
        panel.style.left = `${b.left - t.left}px`;
        panel.style.top = `${b.bottom - t.top + 6}px`;
      }
      setActive(current);
      placeLozenge(true);
      panel.focus();
      if (motion.reduced) {
        panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80 });
        return;
      }
      if (kind === 'list') {
        panel.animate([{ clipPath: 'inset(0 0 100% 0 round 6px)', opacity: 0.6 }, { clipPath: 'inset(0 0 0 0 round 6px)', opacity: 1 }], { duration: dur('medium'), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      } else if (kind === 'grid') {
        panel.animate([{ transform: 'translateY(-4px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: dur('medium'), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      } else {
        const p = panel.getBoundingClientRect();
        const ins = `inset(${b.top - p.top}px ${p.right - b.right}px ${p.bottom - b.bottom}px ${b.left - p.left}px round 4px)`;
        panel.animate([{ clipPath: ins }, { clipPath: 'inset(0 0 0 0 round 6px)' }], { duration: dur('medium'), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      }
    };
    const hide = (focusButton: boolean) => {
      if (!open) return;
      open = false;
      button.setAttribute('aria-expanded', 'false');
      const done = () => {
        if (!open) panel.hidden = true;
      };
      if (motion.reduced) {
        panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 80 }).onfinish = done;
      } else {
        panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur('small'), easing: 'cubic-bezier(0.2, 0, 0, 1)' }).onfinish = done;
      }
      if (focusButton) button.focus();
    };
    const choose = (i: number) => {
      current = i;
      button.textContent = SPECIES[i]!.name;
      hide(true);
    };

    button.addEventListener('click', () => (open ? hide(true) : show()));
    button.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show();
      }
    });
    panel.addEventListener('keydown', (e) => {
      const cols = kind === 'grid' ? 3 : 1;
      const moves: Record<string, number> = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: kind === 'grid' ? 1 : 0, ArrowLeft: kind === 'grid' ? -1 : 0 };
      if (e.key in moves && moves[e.key] !== 0) {
        e.preventDefault();
        setActive((active + moves[e.key]! + SPECIES.length) % SPECIES.length);
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        setActive(e.key === 'Home' ? 0 : SPECIES.length - 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(active);
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        if (e.key === 'Escape') e.preventDefault();
        hide(e.key === 'Escape');
      } else if (e.key.length === 1) {
        // Type to jump: the next species whose name starts with the letter.
        const k = e.key.toLowerCase();
        for (let n = 1; n <= SPECIES.length; n++) {
          const i = (active + n) % SPECIES.length;
          if (SPECIES[i]!.name.toLowerCase().startsWith(k)) {
            setActive(i);
            break;
          }
        }
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if (open && !panel.contains(e.target as Node) && e.target !== button) hide(false);
    });
  };
}

export function speciesSection(): HTMLElement {
  return section({
    id: 'species',
    title: 'Choosing a species',
    note: 'Milestone 22, from your answers: a menu from the top bar, short names, one line on the model. Click the button (or focus it and press the down arrow); arrows, Home, End and a first letter move; Enter chooses; Escape closes. Each grows past six without a redesign, as a longer list or more rows.',
    rows: true,
    variants: [
      { key: 'A', name: 'Drop list', note: 'A single column unfolds from under the button. The glass lozenge follows the pointer and the arrow keys.', build: menu('list') },
      { key: 'B', name: 'Grid', note: 'Two rows of three, so the menu stays short; a seventh species starts a third row. Arrows move in two directions.', build: menu('grid') },
      { key: 'C', name: 'Pop-up in place', note: 'The list grows out of the button with the current species sitting where the button was, as in a desktop pop-up menu, shifting down where it would leave the window. The least pointer travel to stay or to move one step.', build: menu('popup') },
    ],
  });
}
