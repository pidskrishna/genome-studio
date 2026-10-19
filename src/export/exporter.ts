import { specimenName } from '../genome';
import type { Framing, Stage } from '../render/stage';
import { imageTiles, placeTile, toStraightAlpha, type Pixels } from '../render/tiles';
import { encodePng } from './png';

// The export render (spec section 9): the organism in the current view and look at print size, drawn
// in tiles and stitched, so size is not limited by the graphics card. It yields between tiles, so a
// progress bar can follow it and it can be cancelled. Optionally a transparent background and a plate
// caption (the specimen name and code along the bottom edge). Rendering only reads the stage; nothing
// here touches the code or the simulation.

export interface ExportRequest {
  width: number;
  height: number;
  framing: Framing;
  transparent: boolean;
  caption: boolean;
  code: string;
  /** Caption colours: the look's ink for the name, and a quieter tone for the code. */
  ink: string;
  quiet: string;
  /** Force at least this many tiles across and down (the seam check renders the same image both ways). */
  minTiles?: { cols: number; rows: number };
}

export interface Progress {
  (fraction: number, stage: 'render' | 'encode'): void;
}

const nextTask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function abortIf(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/** The tile grid: tiles plus the bloom's margin stay within the largest render target. */
export function tileGrid(width: number, height: number, maxTile: number, margin: number, min = { cols: 1, rows: 1 }): { cols: number; rows: number } {
  const limit = Math.max(64, maxTile - 2 * margin);
  return { cols: Math.max(min.cols, Math.ceil(width / limit)), rows: Math.max(min.rows, Math.ceil(height / limit)) };
}

/** Renders the image's pixels (straight alpha, rows from the top), with the caption if asked. */
export async function renderPixels(stage: Stage, r: ExportRequest, onProgress?: Progress, signal?: AbortSignal): Promise<Pixels> {
  const wasTransparent = stage.transparent;
  if (r.transparent !== wasTransparent) stage.setTransparent(r.transparent);
  try {
    const { cols, rows } = tileGrid(r.width, r.height, stage.maxTileSize, stage.tileMargin(r.width, r.height), r.minTiles);
    const rects = imageTiles(r.width, r.height, cols, rows, stage.maxViewport);
    const full: Pixels = { width: r.width, height: r.height, data: new Uint8Array(r.width * r.height * 4) };
    for (let i = 0; i < rects.length; i++) {
      abortIf(signal);
      placeTile(full, rects[i]!, stage.renderRegion(r.width, r.height, rects[i]!, r.framing));
      onProgress?.((i + 1) / rects.length, 'render');
      await nextTask();
    }
    // Render targets hold premultiplied colour; a PNG wants straight alpha (opaque pixels are unchanged).
    if (r.transparent) toStraightAlpha(full, full);
    if (r.caption) await drawCaption(full, r);
    return full;
  } finally {
    stage.finishRegions();
    if (stage.transparent !== wasTransparent) stage.setTransparent(wasTransparent);
  }
}

/** Renders and encodes the PNG, with the genome code (and the name) in its metadata. */
export async function exportPng(stage: Stage, r: ExportRequest, onProgress?: Progress, signal?: AbortSignal): Promise<Blob> {
  const pixels = await renderPixels(stage, r, onProgress, signal);
  abortIf(signal);
  return encodePng(pixels, {
    text: {
      'Genome code': r.code,
      Title: specimenName(r.code).full,
      Software: 'Genome studio',
      Description: `${specimenName(r.code).full}, grown from the genome code ${r.code}`,
    },
    rowsPerBatch: 128,
    signal,
    onProgress: async (f) => {
      onProgress?.(f, 'encode');
      await nextTask();
    },
  });
}

/**
 * The plate caption: the specimen name in italic and the code in a fine mono, set along the bottom
 * edge inside the margin, drawn on a strip and blended over the image (straight alpha).
 */
async function drawCaption(image: Pixels, r: ExportRequest): Promise<void> {
  const short = Math.min(image.width, image.height);
  const margin = Math.round(short * 0.04);
  const nameSize = Math.max(10, Math.round(short * 0.02));
  const codeSize = Math.max(7, Math.round(short * 0.0095));
  const sans = `'IBM Plex Sans', system-ui, sans-serif`;
  const mono = `'IBM Plex Mono', ui-monospace, monospace`;
  await Promise.all([document.fonts.load(`italic 400 ${nameSize}px 'IBM Plex Sans'`), document.fonts.load(`400 ${codeSize}px 'IBM Plex Mono'`)]).catch(() => undefined);

  const measure = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
  measure.font = `400 ${codeSize}px ${mono}`;
  const charWidth = measure.measureText('ACGT').width / 4;
  const perLine = Math.max(6, Math.floor((image.width - 2 * margin) / charWidth / 6) * 6);
  const lines: string[] = [];
  for (let i = 0; i < r.code.length; i += perLine) lines.push(r.code.slice(i, i + perLine));
  const lineHeight = Math.round(codeSize * 1.45);
  const stripHeight = Math.round(nameSize * 1.6 + lines.length * lineHeight + codeSize * 0.6);
  const top = image.height - margin - stripHeight;
  if (top < 0) return;

  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = stripHeight;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = r.ink;
  ctx.font = `italic 400 ${nameSize}px ${sans}`;
  ctx.fillText(specimenName(r.code).full, margin, Math.round(nameSize * 1.1));
  ctx.fillStyle = r.quiet;
  ctx.font = `400 ${codeSize}px ${mono}`;
  lines.forEach((line, k) => ctx.fillText(line, margin, Math.round(nameSize * 1.6 + codeSize + k * lineHeight)));

  // Blend the strip over the image, "source over" in straight alpha.
  const strip = ctx.getImageData(0, 0, image.width, stripHeight).data;
  const d = image.data;
  for (let y = 0; y < stripHeight; y++) {
    const row = (top + y) * image.width * 4;
    for (let x = 0; x < image.width; x++) {
      const s = (y * image.width + x) * 4;
      const sa = strip[s + 3]! / 255;
      if (sa === 0) continue;
      const o = row + x * 4;
      const da = d[o + 3]! / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) d[o + c] = Math.round((strip[s + c]! * sa + d[o + c]! * da * (1 - sa)) / oa);
      d[o + 3] = Math.round(oa * 255);
    }
  }
}
