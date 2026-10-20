import { ALL_SPECIES, type SpeciesId } from '../genome';
import { SPECIES_LINES, SPECIES_SHORT } from './gene-info';
import { Damped, dur, loop, motion } from './motion';

// The species switch (DESIGN.md section 7, "Choosing a species: drop list"; spec clarification 30):
// a glass button in the top bar showing the current species' short name, which opens a single
// column listing every species with one line on its model. A glass lozenge follows the pointer and
// the arrow keys. Choosing a species loads its wild type; the caller does that in `onChoose`.

/** Past this many rows the list keeps its height and scrolls inside. */
const MAX_ROWS = 10;

export class SpeciesMenu {
  readonly button: HTMLButtonElement;
  readonly list: HTMLElement;
  private readonly rows: HTMLElement[];
  private readonly lozenge: HTMLElement;
  private readonly box = [new Damped(0, dur('medium')), new Damped(0, dur('medium')), new Damped(0, dur('medium')), new Damped(0, dur('medium'))];
  private stopLozenge: (() => void) | null = null;
  private current: SpeciesId = 'A';
  private active = 0;
  private open = false;

  constructor(private readonly onChoose: (species: SpeciesId) => void) {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'btn glass species-button';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', 'Species');

    this.list = document.createElement('div');
    this.list.className = 'species-menu glass layer-3';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'Species');
    this.list.tabIndex = -1;
    this.list.hidden = true;
    this.lozenge = document.createElement('span');
    this.lozenge.className = 'species-lozenge';
    this.lozenge.setAttribute('aria-hidden', 'true');
    this.list.append(this.lozenge);
    this.rows = ALL_SPECIES.map((species, i) => {
      const row = document.createElement('div');
      row.className = 'species-row';
      row.id = `species-option-${species}`;
      row.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'species-name';
      name.textContent = SPECIES_SHORT[species];
      const line = document.createElement('span');
      line.className = 'species-line';
      line.textContent = SPECIES_LINES[species];
      row.append(name, line);
      row.addEventListener('pointerenter', () => this.setActive(i));
      row.addEventListener('click', () => this.choose(i));
      this.list.append(row);
      return row;
    });
    this.list.style.setProperty('--max-rows', String(MAX_ROWS));
    // On the page itself, not inside the top bar: frost nested in another glass layer cannot blur
    // what is behind that layer (DESIGN.md section 3).
    document.body.append(this.list);
    window.addEventListener('resize', () => this.hide(false));

    this.button.addEventListener('click', () => (this.open ? this.hide(true) : this.show()));
    this.button.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      this.show();
    });
    this.list.addEventListener('keydown', (e) => this.key(e));
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !this.list.contains(e.target as Node) && !this.button.contains(e.target as Node)) this.hide(false);
    });
    this.set('A');
  }

  /** Shows `species` as the current one, without choosing it. */
  set(species: SpeciesId): void {
    this.current = species;
    this.button.textContent = SPECIES_SHORT[species];
    this.rows.forEach((row, i) => row.setAttribute('aria-selected', String(ALL_SPECIES[i] === species)));
  }

  private show(): void {
    if (this.open) return;
    this.open = true;
    this.button.setAttribute('aria-expanded', 'true');
    this.list.hidden = false;
    const b = this.button.getBoundingClientRect();
    this.list.style.left = `${b.left}px`;
    this.list.style.top = `${b.bottom + 6}px`;
    this.setActive(ALL_SPECIES.indexOf(this.current), true);
    this.list.focus();
    if (motion.reduced) {
      this.list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80 });
      return;
    }
    this.list.animate([{ clipPath: 'inset(0 0 100% 0 round 6px)', opacity: 0.6 }, { clipPath: 'inset(0 0 0 0 round 6px)', opacity: 1 }], { duration: dur('medium'), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  }

  private hide(focusButton: boolean): void {
    if (!this.open) return;
    this.open = false;
    this.button.setAttribute('aria-expanded', 'false');
    const fade = this.list.animate([{ opacity: 1 }, { opacity: 0 }], { duration: motion.reduced ? 80 : dur('small'), easing: 'cubic-bezier(0.2, 0, 0, 1)' });
    fade.onfinish = () => {
      if (!this.open) this.list.hidden = true;
    };
    if (focusButton) this.button.focus();
  }

  private choose(i: number): void {
    const species = ALL_SPECIES[i]!;
    this.hide(true);
    if (species !== this.current) this.onChoose(species);
  }

  private setActive(i: number, instant = false): void {
    this.active = i;
    this.list.setAttribute('aria-activedescendant', this.rows[i]!.id);
    this.rows.forEach((row, k) => row.classList.toggle('active', k === i));
    const row = this.rows[i]!;
    if (row.offsetTop < this.list.scrollTop) this.list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > this.list.scrollTop + this.list.clientHeight) this.list.scrollTop = row.offsetTop + row.offsetHeight - this.list.clientHeight;
    const [x, y, w, h] = this.box as [Damped, Damped, Damped, Damped];
    x.target = row.offsetLeft;
    y.target = row.offsetTop;
    w.target = row.offsetWidth;
    h.target = row.offsetHeight;
    if (instant || motion.reduced) for (const d of this.box) d.snap(d.target);
    if (this.stopLozenge) return;
    this.stopLozenge = loop((dt) => {
      for (const d of this.box) d.step(dt);
      this.lozenge.style.transform = `translate(${x.value}px, ${y.value}px)`;
      this.lozenge.style.width = `${w.value}px`;
      this.lozenge.style.height = `${h.value}px`;
      const busy = this.box.some((d) => !d.settled);
      if (!busy) this.stopLozenge = null;
      return busy;
    });
  }

  private key(e: KeyboardEvent): void {
    const n = this.rows.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.setActive((this.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      this.setActive(e.key === 'Home' ? 0 : n - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.choose(this.active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.hide(true);
    } else if (e.key === 'Tab') {
      this.hide(false);
    } else if (e.key.length === 1) {
      // A letter jumps to the next species whose short name starts with it.
      const k = e.key.toLowerCase();
      for (let step = 1; step <= n; step++) {
        const i = (this.active + step) % n;
        if (SPECIES_SHORT[ALL_SPECIES[i]!].toLowerCase().startsWith(k)) {
          this.setActive(i);
          break;
        }
      }
    }
  }
}
