import { wildType, type SpeciesId } from '../src/genome';
import { Stage, type Organism, type ViewMode } from '../src/render/stage';
import { comparePixels, seamDifferences, tileRects, tilesMatch, TILE_TOLERANCE, type Pixels } from '../src/render/tiles';
import { SimClient } from '../src/ui/sim-client';

// Dev-only page (not part of the build): the milestone 6 tile check on the real graphics card. A frame
// drawn as four stitched sub-rectangles must match the same frame drawn whole.

const WIDTH = 800;
const HEIGHT = 600;

const stage = new Stage(document.getElementById('stage') as HTMLElement);
const client = new SimClient();
const rows = document.getElementById('rows') as HTMLTableSectionElement;
const images = document.getElementById('images') as HTMLDivElement;
const status = document.getElementById('status') as HTMLParagraphElement;
(document.getElementById('tolerance') as HTMLElement).textContent =
  `Pass mark: no differing pixel on a seam, and at most ${TILE_TOLERANCE.maxChannel} colour level on at most ${TILE_TOLERANCE.maxShare * 100}% of pixels.`;

function toCanvas(p: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
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

const results: { species: SpeciesId; view: ViewMode; differing: number; onSeam: number; maxChannel: number; total: number; pass: boolean }[] = [];


async function run(): Promise<void> {
  for (const species of ['A', 'B'] as const) {
    stage.setOrganism(await grow(species));
    for (const view of ['3d', 'flat'] as const) {
      stage.setView(view);
      const whole = stage.renderImage(WIDTH, HEIGHT, 1, 1);
      const tiled = stage.renderImage(WIDTH, HEIGHT, 2, 2);
      const d = comparePixels(whole, tiled);
      const onSeam = seamDifferences(whole, tiled, tileRects(WIDTH, HEIGHT, 2, 2));
      const ok = tilesMatch(d, onSeam);
      results.push({ species, view, onSeam, ...d, pass: ok });
      const verdict = d.differing === 0 ? 'Exact match' : ok ? 'Match within tolerance' : 'Differs';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${species}</td><td>${view === '3d' ? '3D' : 'Flat'}</td><td>${d.differing} of ${d.total}</td><td>${onSeam}</td><td>${d.maxChannel}</td><td class="${ok ? 'match' : 'mismatch'}">${verdict}</td>`;
      rows.appendChild(tr);
      const pair = document.createElement('div');
      pair.className = 'pair';
      pair.append(toCanvas(whole), toCanvas(tiled));
      images.appendChild(pair);
    }
  }
  status.textContent = results.every((r) => r.pass) ? 'All frames match.' : 'Some frames differ.';
  Object.assign(window, { tileResults: results, stage, comparePixels });
}

run().catch((e: unknown) => {
  status.textContent = `Failed: ${String(e)}`;
  status.className = 'mismatch';
});
