import { specimenName } from '../genome';
import { el } from './shell';

// The specimen tray (spec section 6): thumbnails of recent organisms from this session, bottom right of
// the stage. Clicking one returns to it: the exact code is loaded again. Only full organisms join the
// tray, never drafts; a code already in the tray moves to the front instead of appearing twice.

/** Most organisms the tray keeps; the oldest leaves first. */
export const TRAY_SIZE = 10;

export interface TrayEntry {
  code: string;
  /** Thumbnail image (a data URL), or empty until it is drawn. */
  image: string;
}

/** The tray's list, kept apart from the DOM so its rules can be tested. */
export function addToTray(entries: readonly TrayEntry[], entry: TrayEntry, size = TRAY_SIZE): TrayEntry[] {
  return [entry, ...entries.filter((e) => e.code !== entry.code)].slice(0, size);
}

export class Tray {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private entries: TrayEntry[] = [];
  private current = '';

  constructor(private readonly restore: (code: string) => void) {
    this.list = el('div', { className: 'tray-list' });
    this.list.setAttribute('role', 'list');
    this.element = el('nav', { className: 'tray glass layer-2', hidden: true }, this.list);
    this.element.setAttribute('aria-label', 'Recent organisms');
  }

  /** Adds an organism (newest first). Its thumbnail can follow later with `setImage`. */
  add(code: string, image = ''): void {
    const old = this.entries.find((e) => e.code === code);
    this.entries = addToTray(this.entries, { code, image: image || old?.image || '' });
    this.current = code;
    this.render();
  }

  setImage(code: string, image: string): void {
    const e = this.entries.find((x) => x.code === code);
    if (!e) return;
    e.image = image;
    this.render();
  }

  /** Marks the organism now on the stage. */
  setCurrent(code: string): void {
    if (code === this.current) return;
    this.current = code;
    this.render();
  }

  get codes(): string[] {
    return this.entries.map((e) => e.code);
  }

  private render(): void {
    this.element.hidden = this.entries.length < 2;
    // Oldest on the left, newest on the right, nearest the organism it came before.
    this.list.replaceChildren(
      ...[...this.entries].reverse().map((e) => {
        const name = specimenName(e.code).full;
        const b = el('button', { type: 'button', className: 'tray-item' });
        b.setAttribute('role', 'listitem');
        b.setAttribute('aria-label', `Return to ${name}`);
        b.title = name;
        b.setAttribute('aria-current', String(e.code === this.current));
        if (e.image) b.append(el('img', { src: e.image, alt: '' }));
        b.addEventListener('click', () => this.restore(e.code));
        return b;
      }),
    );
  }
}
