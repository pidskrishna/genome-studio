import { methodsText } from '../export/methods';
import { exportPng, renderPixels, type ExportRequest } from '../export/exporter';
import { cleanFileName, exportFileName, exportSize, printedSize, type Orientation, type Preset } from '../export/sizes';
import { LOOK_NAMES } from '../render/colour';
import type { Framing, Stage } from '../render/stage';
import { button, el } from './shell';
import { glassSegments } from './surface';

// The export dialog (spec section 9): one dialog, read top to bottom, with a live preview on one side.
// Size, orientation, framing, background, caption, methods file and file name, then one Export button.
// A progress bar follows the tiles, and Cancel stops the render at any point.

export interface ExportContext {
  stage: Stage;
  /** The code of the organism on the stage, or null while it is still growing (or a draft). */
  readyCode: () => string | null;
  /** Geometry hash of the organism on the stage, for the methods file. */
  hash: () => string | null;
}

const grouped = new Intl.NumberFormat('en-GB');

function choice<T extends string>(label: string, options: [T, string][], initial: T, onChange: (v: T) => void): { el: HTMLElement; get: () => T } {
  let value = initial;
  const buttons = options.map(([v, text]) => {
    const b = el('button', { type: 'button', textContent: text });
    b.setAttribute('aria-pressed', String(v === initial));
    b.addEventListener('click', () => {
      value = v;
      for (const [i, [ov]] of options.entries()) buttons[i]!.setAttribute('aria-pressed', String(ov === v));
      onChange(v);
    });
    return b;
  });
  const group = el('div', { className: 'segmented' }, ...buttons);
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  glassSegments(group);
  return { el: group, get: () => value };
}

function row(label: string, ...content: (Node | string)[]): HTMLElement {
  return el('div', { className: 'export-row' }, el('span', { className: 'export-label', textContent: label }), el('div', { className: 'export-field' }, ...content));
}

export class ExportDialog {
  readonly element: HTMLDialogElement;
  private readonly preview = el('img', { className: 'export-preview-img', alt: 'Preview of the export' });
  private readonly sizeNote = el('span', { className: 'export-note' });
  private readonly customBox = el('div', { className: 'export-custom', hidden: true });
  private readonly customW = el('input', { type: 'number', min: '1', max: '20000', step: '1', value: '3000' });
  private readonly customH = el('input', { type: 'number', min: '1', max: '20000', step: '1', value: '3000' });
  private readonly caption = el('input', { type: 'checkbox' });
  private readonly methods = el('input', { type: 'checkbox', checked: true });
  private readonly fileName = el('input', { type: 'text', spellcheck: false });
  private readonly status = el('p', { className: 'export-status' });
  private readonly bar = el('div', { className: 'export-bar-fill' });
  private readonly go: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private preset: () => Preset;
  private orientation: () => Orientation;
  private framing: () => Framing;
  private background: () => 'look' | 'transparent';
  private running: AbortController | null = null;
  private previewTimer = 0;
  private code = '';

  constructor(private readonly ctx: ExportContext) {
    const update = (): void => this.refresh();
    const size = choice<Preset>('Size', [['A4', 'A4'], ['A3', 'A3'], ['A2', 'A2'], ['custom', 'Custom']], 'A4', update);
    const orient = choice<Orientation>('Orientation', [['portrait', 'Portrait'], ['landscape', 'Landscape'], ['square', 'Square']], 'portrait', update);
    const framing = choice<Framing>('Framing', [['stage', 'As on the stage'], ['fit', 'Fit to the page']], 'fit', update);
    const background = choice<'look' | 'transparent'>('Background', [['look', 'The look’s background'], ['transparent', 'Transparent']], 'look', update);
    this.preset = size.get;
    this.orientation = orient.get;
    this.framing = framing.get;
    this.background = background.get;
    this.customW.setAttribute('aria-label', 'Width in pixels');
    this.customH.setAttribute('aria-label', 'Height in pixels');
    for (const input of [this.customW, this.customH]) input.addEventListener('input', update);
    this.customBox.append(this.customW, el('span', { textContent: '×' }), this.customH, el('span', { className: 'export-note', textContent: 'pixels' }));
    this.caption.addEventListener('change', update);
    this.fileName.setAttribute('aria-label', 'File name');

    this.go = button('Export');
    this.go.classList.add('export-go');
    this.go.addEventListener('click', () => void this.run());
    this.cancel = button('Cancel');
    this.cancel.addEventListener('click', () => (this.running ? this.running.abort() : this.close()));

    const form = el(
      'div',
      { className: 'export-form' },
      el('h2', { className: 'export-title', textContent: 'Export' }),
      row('Size', size.el, this.customBox, this.sizeNote),
      row('Orientation', orient.el),
      row('Framing', framing.el),
      row('Background', background.el),
      row('Caption', el('label', { className: 'export-check' }, this.caption, ' Name and code along the bottom edge')),
      row('Methods file', el('label', { className: 'export-check' }, this.methods, ' Save the parameter file with the image')),
      row('File name', el('div', { className: 'export-file' }, this.fileName, el('span', { className: 'export-note', textContent: '.png' }))),
      el('div', { className: 'export-bar' }, this.bar),
      this.status,
      el('div', { className: 'export-actions' }, this.cancel, this.go),
    );
    const previewPane = el('div', { className: 'export-preview' }, this.preview);
    this.element = el('dialog', { className: 'export-dialog glass layer-3' }, previewPane, form);
    this.element.setAttribute('aria-label', 'Export');
    this.status.setAttribute('aria-live', 'polite');
    // Escape cancels a render in progress before it closes the dialog.
    this.element.addEventListener('cancel', (e) => {
      if (this.running) {
        e.preventDefault();
        this.running.abort();
      }
    });
    document.body.append(this.element);
  }

  /** Whether the organism on the stage is ready to export (not growing, not a draft, swapped in). */
  get ready(): boolean {
    return this.ctx.readyCode() !== null;
  }

  open(): void {
    const code = this.ctx.readyCode();
    this.code = code ?? '';
    this.fileName.value = code ? exportFileName(code) : '';
    this.element.showModal();
    this.refresh();
  }

  close(): void {
    this.element.close();
  }

  /** The request for the current choices, at full size or scaled down for the preview. */
  request(scale = 1): ExportRequest {
    const { width, height } = exportSize(this.preset(), this.orientation(), { width: Number(this.customW.value), height: Number(this.customH.value) });
    const css = getComputedStyle(document.documentElement);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
      framing: this.framing(),
      transparent: this.background() === 'transparent',
      caption: this.caption.checked,
      code: this.code,
      ink: css.getPropertyValue('--ink').trim() || '#000',
      quiet: css.getPropertyValue('--ink-3').trim() || '#666',
    };
  }

  private refresh(): void {
    const custom = this.preset() === 'custom';
    this.customBox.hidden = !custom;
    const r = this.request();
    const mm = printedSize(r.width, r.height);
    this.sizeNote.textContent = `${grouped.format(r.width)} × ${grouped.format(r.height)} pixels, ${mm.width} × ${mm.height} mm at 300 dpi`;
    const ready = this.ctx.readyCode() !== null && this.code !== '';
    this.go.disabled = !ready || this.running !== null;
    if (!ready && !this.running) this.status.textContent = 'The organism is still growing. Export when it is ready.';
    else if (!this.running) this.status.textContent = '';
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => void this.drawPreview(), 120);
  }

  /** A small render of exactly what will be exported. */
  private async drawPreview(): Promise<void> {
    if (!this.element.open || this.running || !this.ctx.readyCode()) return;
    const full = this.request();
    const scale = Math.min(300 / full.width, 380 / full.height, 1);
    const pixels = await renderPixels(this.ctx.stage, this.request(scale));
    const canvas = document.createElement('canvas');
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    const c2d = canvas.getContext('2d') as CanvasRenderingContext2D;
    const img = c2d.createImageData(pixels.width, pixels.height);
    img.data.set(pixels.data);
    c2d.putImageData(img, 0, 0);
    this.preview.src = canvas.toDataURL('image/png');
    this.preview.classList.toggle('transparent', full.transparent);
  }

  private async run(): Promise<void> {
    if (this.running || !this.ctx.readyCode()) return;
    const controller = new AbortController();
    this.running = controller;
    this.go.disabled = true;
    this.cancel.textContent = 'Cancel export';
    const r = this.request();
    const name = cleanFileName(this.fileName.value, exportFileName(r.code));
    const show = (fraction: number, text: string): void => {
      this.bar.style.width = `${Math.round(fraction * 100)}%`;
      this.status.textContent = text;
    };
    try {
      const blob = await exportPng(this.ctx.stage, r, (f, stage) => show(stage === 'render' ? f * 0.8 : 0.8 + f * 0.2, stage === 'render' ? `Rendering ${Math.round(f * 100)}%` : `Writing the PNG ${Math.round(f * 100)}%`), controller.signal);
      save(blob, `${name}.png`);
      if (this.methods.checked) {
        const text = methodsText(r.code, { hash: this.ctx.hash() ?? undefined, look: LOOK_NAMES[this.ctx.stage.look], view: this.ctx.stage.view === 'flat' ? 'Flat' : '3D', size: { width: r.width, height: r.height } });
        save(new Blob([text], { type: 'text/plain' }), `${name} methods.txt`);
      }
      show(1, `Saved ${name}.png`);
    } catch (e) {
      show(0, (e as Error).name === 'AbortError' ? 'Export cancelled.' : `The export failed: ${(e as Error).message}`);
    } finally {
      this.running = null;
      this.cancel.textContent = 'Cancel';
      this.refresh();
    }
  }
}

/** Hands a file to the browser to save. */
export function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
