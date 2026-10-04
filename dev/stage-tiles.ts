import { pigmentsOf, wildType, type Pigments, type SpeciesId } from '../src/genome';
import { LOOK_NAMES, LOOKS, type LookId } from '../src/render/colour';
import { Stage, type Organism, type ViewMode } from '../src/render/stage';
import { comparePixels, seamDifferences, tileRects, tilesMatch, toStraightAlpha, TILE_TOLERANCE, type Pixels } from '../src/render/tiles';
import { SimClient } from '../src/ui/sim-client';

// Dev-only page (not part of the build): the tile check on the real graphics card (milestones 6 and
// 9). For every look, view, species and background, a frame drawn as stitched sub-rectangles (2 × 2
// and 3 × 3) must match the same frame drawn whole. The fluorescence look is also run with the glow
// gene at 1, whose wider bloom is blurred at a lower resolution (downsampling factor above 1).
//
// Query options: ?look=plate|fluorescence|glossy, ?species=A|B, ?view=3d|flat, ?bg=opaque|transparent.
// When done, window.tileSummary is { done: true, pass, passed, total, failures } and
// window.tileResults has one row per combination.

const WIDTH = 800;
const HEIGHT = 600;
const SPLITS = [
  [2, 2],
  [3, 3],
] as const;

const query = new URLSearchParams(location.search);
const pick = <T extends string>(name: string, all: readonly T[]): readonly T[] => {
  const v = query.get(name);
  return v && (all as readonly string[]).includes(v) ? [v as T] : all;
};

const stage = new Stage(document.getElementById('stage') as HTMLElement);
const client = new SimClient();
const rows = document.getElementById('rows') as HTMLTableSectionElement;
const images = document.getElementById('images') as HTMLDivElement;
const status = document.getElementById('status') as HTMLParagraphElement;
(document.getElementById('tolerance') as HTMLElement).textContent =
  `Pass mark: no differing pixel on a seam, and at most ${TILE_TOLERANCE.maxChannel} colour level on at most ${TILE_TOLERANCE.maxShare * 100}% of pixels, for every split.`;

function toCanvas(p: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  // Pixels are premultiplied; convert for display only (the comparison uses the raw values).
  const straight = new Uint8ClampedArray(toStraightAlpha(p).data);
  canvas.getContext('2d')!.putImageData(new ImageData(straight, p.width, p.height), 0, 0);
  return canvas;
}

async function grow(species: SpeciesId): Promise<Organism> {
  const code = wildType(species);
  const outcome = species === 'A' ? await client.run('speciesA', { code }) : await client.run('speciesB', { code });
  if (outcome.status !== 'done') throw new Error(`Species ${species} did not grow: ${outcome.status}`);
  return species === 'A'
    ? { species, geometry: outcome.output as Extract<Organism, { species: 'A' }>['geometry'] }
    : { species, geometry: outcome.output as Extract<Organism, { species: 'B' }>['geometry'] };
}

interface Result {
  species: SpeciesId;
  view: ViewMode;
  look: LookId;
  transparent: boolean;
  glow: number;
  split: string;
  differing: number;
  onSeam: number;
  maxChannel: number;
  total: number;
  pass: boolean;
}

const results: Result[] = [];
const summary = { done: false, pass: false, passed: 0, total: 0, failures: [] as string[] };
Object.assign(window, { tileResults: results, tileSummary: summary, stage, comparePixels });

const label = (r: Omit<Result, 'differing' | 'onSeam' | 'maxChannel' | 'total' | 'pass'>) =>
  `${r.species} ${r.view === '3d' ? '3D' : 'flat'} ${r.look}${r.glow === 1 ? ' (glow 1)' : ''} ${r.transparent ? 'transparent' : 'opaque'} ${r.split}`;

async function run(): Promise<void> {
  for (const species of pick('species', ['A', 'B'] as const)) {
    status.textContent = `Growing species ${species}…`;
    stage.setOrganism(await grow(species));
    const wild = pigmentsOf(wildType(species));
    for (const view of pick('view', ['3d', 'flat'] as const)) {
      stage.setView(view);
      for (const look of pick('look', LOOKS)) {
        stage.setLook(look);
        const glows = look === 'fluorescence' ? [wild.glow, 1] : [wild.glow];
        for (const glow of glows) {
          const pigments: Pigments = { ...wild, glow };
          stage.setPigments(pigments);
          for (const bg of pick('bg', ['opaque', 'transparent'] as const)) {
            const transparent = bg === 'transparent';
            stage.setTransparent(transparent);
            status.textContent = `Drawing ${label({ species, view, look, transparent, glow, split: '' })}…`;
            await new Promise((r) => setTimeout(r, 0));
            const whole = stage.renderImage(WIDTH, HEIGHT, 1, 1);
            for (const [cols, rowsN] of SPLITS) {
              const tiled = stage.renderImage(WIDTH, HEIGHT, cols, rowsN);
              const d = comparePixels(whole, tiled);
              const onSeam = seamDifferences(whole, tiled, tileRects(WIDTH, HEIGHT, cols, rowsN));
              const ok = tilesMatch(d, onSeam);
              const row: Result = { species, view, look, transparent, glow, split: `${cols}×${rowsN}`, onSeam, ...d, pass: ok };
              results.push(row);
              summary.total++;
              if (ok) summary.passed++;
              else summary.failures.push(label(row));
              const verdict = d.differing === 0 ? 'Exact match' : ok ? 'Match within tolerance' : 'Differs';
              const tr = document.createElement('tr');
              tr.innerHTML = `<td>${species}</td><td>${view === '3d' ? '3D' : 'Flat'}</td><td>${LOOK_NAMES[look]}${glow === 1 ? ' (glow 1)' : ''}</td><td>${transparent ? 'Transparent' : 'Opaque'}</td><td>${row.split}</td><td>${d.differing} of ${d.total}</td><td>${onSeam}</td><td>${d.maxChannel}</td><td class="${ok ? 'match' : 'mismatch'}">${verdict}</td>`;
              rows.appendChild(tr);
              if (cols === 2 || !ok) {
                const pair = document.createElement('div');
                pair.className = 'pair';
                pair.title = label(row);
                pair.append(toCanvas(whole), toCanvas(tiled));
                images.appendChild(pair);
              }
            }
          }
        }
      }
    }
  }
  summary.pass = summary.failures.length === 0;
  summary.done = true;
  status.textContent = summary.pass ? `All ${summary.total} frames match.` : `${summary.total - summary.passed} of ${summary.total} frames differ.`;
  status.className = summary.pass ? 'match' : 'mismatch';
}

run().catch((e: unknown) => {
  status.textContent = `Failed: ${String(e)}`;
  status.className = 'mismatch';
  summary.done = true;
  summary.failures.push(`error: ${String(e)}`);
});
