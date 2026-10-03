import { specimenName, wildType } from '../src/genome';
import { SimClient } from '../src/ui/sim-client';

// Dev-only page (not part of the build): grows the species A wild type in the worker and shows its
// geometry hash and time to maturity, for the cross-browser check and the speed benchmark.

/** Recorded in Node; must match in every browser. Kept in step with tests/sim/speciesA/behaviour.test.ts. */
const RECORDED_HASH = '642a289e51e48070';

const out = document.getElementById('out') as HTMLDListElement;
const again = document.getElementById('again') as HTMLButtonElement;
const client = new SimClient();

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
  const code = wildType('A');
  again.disabled = true;
  const started = performance.now();
  show([['Status', 'Growing… 0%']]);
  const outcome = await client.run('speciesA', { code }, (f) => show([['Status', `Growing… ${Math.round(f * 100)}%`]]));
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
    ['Nodes', `${g.parents.length} (${g.stats.grownNodes} grown, ${g.stats.steps} steps, stopped: ${g.stats.stopReason})`],
    ['Attraction points', `${g.stats.pointCount} (${g.stats.pointsLeft} left)`],
    ['Browser', navigator.userAgent],
  ]);
  document.body.dataset.hash = g.hash;
  document.body.dataset.seconds = String(seconds);
}

again.addEventListener('click', () => void run());
void run();
