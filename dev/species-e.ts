import { parseGenome, pigmentsOf, specimenName, wildType, writeModelValue } from '../src/genome';
import { Stage, type Organism } from '../src/render/stage';
import { SimClient } from '../src/ui/sim-client';

// Dev-only page (not part of the build): grows the species E wild type in the worker and shows its
// geometry hash and time to maturity, for the cross-browser check and the speed benchmark. It draws
// the colony with the species B sheet renderer, which takes the same geometry form (clarification
// 27); the app draws species E from milestone 23. ?genes=locus:value,… sets genes from model values.

/** Recorded in Node; must match in every browser. Kept in step with tests/sim/speciesE/behaviour.test.ts. */
const RECORDED_HASH = '7898a90fc62cd3bb';

const out = document.getElementById('out') as HTMLDListElement;
const again = document.getElementById('again') as HTMLButtonElement;
const client = new SimClient();
const stage = new Stage(document.getElementById('stage') as HTMLElement);
const query = new URLSearchParams(location.search);
if (query.get('view') === 'flat') stage.setView('flat');
const linked = query.get('code');
const parsed = linked ? parseGenome(linked) : null;
let code = parsed && parsed.ok && parsed.species === 'E' ? parsed.code : wildType('E');
for (const pair of (query.get('genes') ?? '').split(',').filter(Boolean)) {
  const [locus, value] = pair.split(':').map(Number);
  if (Number.isFinite(locus) && Number.isFinite(value)) code = writeModelValue(code, locus!, value!);
}

function show(rows: [string, string, string?][]): void {
  out.replaceChildren(
    ...rows.flatMap(([term, value, cls]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      if (cls) dd.className = cls;
      return [dt, dd];
    }),
  );
}

async function run(): Promise<void> {
  again.disabled = true;
  const started = performance.now();
  show([['Status', 'Growing… 0%']]);
  const outcome = await client.run('speciesE', { code }, (f) => show([['Status', `Growing… ${Math.round(f * 100)}%`]]));
  const seconds = (performance.now() - started) / 1000;
  again.disabled = false;
  if (outcome.status !== 'done') {
    show([['Status', outcome.status === 'failed' ? `Failed: ${outcome.message}` : 'Superseded', 'mismatch']]);
    return;
  }
  const g = outcome.output;
  const match = g.hash === RECORDED_HASH;
  show([
    ['Specimen', specimenName(code).full],
    ['Code', code],
    ['Geometry hash', g.hash, match ? 'match' : 'mismatch'],
    ['Recorded hash', `${RECORDED_HASH} (${match ? 'matches' : 'does not match'})`, match ? 'match' : 'mismatch'],
    ['Time to maturity', `${seconds.toFixed(2)} s (target under 10 s)`, seconds < 10 ? 'match' : 'mismatch'],
    ['Mesh', `${g.stats.polyps} polyps after ${g.stats.steps} steps (stopped: ${g.stats.stopReason}), ${g.stats.vertices} vertices, ${g.stats.triangles} triangles`],
    ['Browser', navigator.userAgent],
  ]);
  stage.setOrganism({ species: 'B', geometry: g as unknown as Extract<Organism, { species: 'B' }>['geometry'] });
  stage.setPigments(pigmentsOf(code));
  (window as unknown as { speciesE: unknown }).speciesE = { hash: g.hash, seconds, stats: g.stats };
}

again.addEventListener('click', () => void run());
void run();
