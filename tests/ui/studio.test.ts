import { describe, expect, it } from 'vitest';
import { geneTable, pigmentsOf, readGene, wildType, withChecksum, writeGene, type Pigments, type SpeciesId } from '../../src/genome';
import type { Organism, ViewMode } from '../../src/render/stage';
import type { FromWorker, ToWorker } from '../../src/sim/protocol';
import { SimClient, type Connect } from '../../src/ui/sim-client';
import { Studio, type NoticeTone } from '../../src/ui/studio';
import { wildA, wildB } from '../render/fixtures';

// The studio with the real simulation client over a fake worker channel, so the test controls when
// progress and results arrive. Geometry comes from real growth runs.

function setup() {
  const posted: ToWorker[] = [];
  let send: (m: FromWorker) => void = () => {};
  const connect: Connect = (onMessage) => {
    send = onMessage;
    return { post: (m) => posted.push(m), terminate: () => {} };
  };
  const shown: Organism[] = [];
  const views: ViewMode[] = [];
  const pigments: Pigments[] = [];
  const progress = { visible: false, fraction: -1, history: [] as string[] };
  const notices: { message: string; tone: NoticeTone }[] = [];
  const studio = new Studio({
    sim: new SimClient(connect),
    stage: { setOrganism: (o) => shown.push(o), setPigments: (p) => pigments.push(p), setView: (v) => views.push(v) },
    progress: {
      show: (f) => {
        progress.visible = true;
        progress.fraction = f;
        progress.history.push(`show ${f}`);
      },
      hide: () => {
        progress.visible = false;
        progress.history.push('hide');
      },
    },
    notice: (message, tone) => notices.push({ message, tone }),
  });
  const lastRun = () => {
    const m = posted.filter((p) => p.type === 'run').at(-1);
    if (!m || m.type !== 'run') throw new Error('No run posted');
    return m;
  };
  const finish = (output: unknown) => {
    const run = lastRun();
    send({ type: 'result', runId: run.runId, kind: run.job.kind, output } as FromWorker);
  };
  const report = (fraction: number) => send({ type: 'progress', runId: lastRun().runId, fraction });
  return { studio, posted, shown, views, pigments, progress, notices, lastRun, finish, report, send };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('pasting a code', () => {
  it('a different code changes the organism', async () => {
    const t = setup();
    const first = t.studio.load(wildType('A'));
    expect(t.lastRun().job).toEqual({ kind: 'speciesA', input: { code: wildType('A') } });
    t.finish(wildA());
    expect(await first).toMatchObject({ status: 'grown', species: 'A', hash: wildA().hash });
    expect(t.shown.at(-1)?.species).toBe('A');

    const second = t.studio.load(wildType('B'));
    expect(t.lastRun().job).toEqual({ kind: 'speciesB', input: { code: wildType('B') } });
    t.finish(wildB());
    expect(await second).toMatchObject({ status: 'grown', species: 'B', hash: wildB().hash });
    expect(t.shown).toHaveLength(2);
    expect(t.shown[1]!.species).toBe('B');
    expect(t.shown[1]!.geometry.hash).not.toBe(t.shown[0]!.geometry.hash);
    expect(t.studio.code).toBe(wildType('B'));
    expect(t.studio.hash).toBe(wildB().hash);
  });

  it('accepts lower case, spaces and line breaks', async () => {
    const t = setup();
    const messy = wildType('A').toLowerCase().replace(/(.{40})/g, '$1 \n');
    const done = t.studio.load(messy);
    expect(t.lastRun().job.input).toEqual({ code: wildType('A') });
    t.finish(wildA());
    expect((await done).status).toBe('grown');
  });

  it('a rejected code leaves the current organism in place and says why', async () => {
    const t = setup();
    const first = t.studio.load(wildType('A'));
    t.finish(wildA());
    await first;
    const runs = t.posted.length;
    const outcome = await t.studio.load('ACGTX');
    expect(outcome.status).toBe('rejected');
    expect(t.posted).toHaveLength(runs);
    expect(t.shown).toHaveLength(1);
    expect(t.studio.hash).toBe(wildA().hash);
    expect(t.notices.at(-1)?.tone).toBe('error');
    expect(t.progress.visible).toBe(false);
  });

  it('a code with a wrong checksum grows with a typo warning and the corrected code', async () => {
    const t = setup();
    const good = wildType('A');
    const typo = good.slice(0, 156) + (good[156] === 'A' ? 'C' : 'A') + good.slice(157);
    const done = t.studio.load(typo);
    expect(t.lastRun().job.input).toEqual({ code: withChecksum(typo) });
    expect(t.notices.at(-1)?.tone).toBe('warning');
    t.finish(wildA());
    expect(await done).toMatchObject({ status: 'grown', code: good });
  });
});

describe('progress indicator', () => {
  it('shows during a regrow, follows progress, and clears when the organism is ready', async () => {
    const t = setup();
    const done = t.studio.load(wildType('B'));
    expect(t.progress.visible).toBe(true);
    t.report(0.25);
    t.report(0.8);
    expect(t.progress.visible).toBe(true);
    expect(t.progress.fraction).toBe(0.8);
    expect(t.shown).toHaveLength(0);
    t.finish(wildB());
    await done;
    expect(t.progress.visible).toBe(false);
    expect(t.progress.history).toEqual(['show 0', 'show 0.25', 'show 0.8', 'hide']);
    expect(t.shown).toHaveLength(1);
  });

  it('stays on while a newer code supersedes the regrow in flight, and clears when that one is ready', async () => {
    const t = setup();
    const first = t.studio.load(wildType('A'));
    const second = t.studio.load(wildType('B'));
    expect(await first).toEqual({ status: 'superseded' });
    await tick();
    expect(t.progress.visible).toBe(true);
    t.finish(wildB());
    expect((await second).status).toBe('grown');
    expect(t.progress.visible).toBe(false);
    expect(t.shown.map((o) => o.species)).toEqual(['B']);
  });

  it('clears and reports an error if the regrow fails', async () => {
    const t = setup();
    const done = t.studio.load(wildType('A'));
    t.send({ type: 'error', runId: t.lastRun().runId, message: 'boom' });
    expect((await done).status).toBe('failed');
    expect(t.progress.visible).toBe(false);
    expect(t.notices.at(-1)).toMatchObject({ tone: 'error' });
    expect(t.shown).toHaveLength(0);
  });
});

describe('view toggle', () => {
  it('passes flat and 3D to the stage', () => {
    const t = setup();
    t.studio.setView('flat');
    t.studio.setView('3d');
    expect(t.views).toEqual(['flat', '3d']);
    expect(t.studio.view).toBe('3d');
  });
});

describe('which edits regrow', () => {
  const runs = (t: ReturnType<typeof setup>) => t.posted.filter((p) => p.type === 'run').length;
  const other = (code: string, locus: number) => (readGene(code, locus) + 1) % 4096;

  async function grown(species: SpeciesId) {
    const t = setup();
    const done = t.studio.update(wildType(species));
    t.finish(species === 'A' ? wildA() : wildB());
    expect((await done).status).toBe('grown');
    return t;
  }

  it('changing any pigment gene does not start a simulation run', async () => {
    for (const species of ['A', 'B'] as const) {
      const t = await grown(species);
      for (const def of geneTable(species).filter((g) => g.group === 'pigment')) {
        const code = writeGene(t.studio.code!, def.locus, other(t.studio.code!, def.locus));
        expect(await t.studio.update(code)).toEqual({ status: 'unchanged' });
        expect(t.studio.code).toBe(code);
      }
      expect(runs(t)).toBe(1);
      expect(t.progress.history).toEqual(['show 0', 'hide']);
      expect(t.shown).toHaveLength(1);
    }
  });

  it('changing any pigment gene to any of several values does not start a run, and the stage gets the new pigments at once', async () => {
    // Ends of the range, the middle, bin edges of the gradient driver, and spread values.
    const values = [0, 1, 1023, 1024, 2047, 2048, 3071, 3072, 4094, 4095, 777, 3333];
    for (const species of ['A', 'B'] as const) {
      const t = await grown(species);
      const pigmentLoci = geneTable(species).filter((g) => g.group === 'pigment');
      expect(pigmentLoci.map((g) => g.locus)).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
      expect(t.pigments.at(-1)).toEqual(pigmentsOf(wildType(species)));
      let edits = 0;
      for (const def of pigmentLoci) {
        for (const v of values) {
          const code = writeGene(t.studio.code!, def.locus, v);
          expect(await t.studio.update(code)).toEqual({ status: 'unchanged' });
          edits++;
          expect(t.studio.code).toBe(code);
          expect(t.pigments).toHaveLength(1 + edits);
          expect(t.pigments.at(-1)).toEqual(pigmentsOf(code));
        }
      }
      expect(runs(t)).toBe(1);
      expect(t.progress.history).toEqual(['show 0', 'hide']);
      expect(t.shown).toHaveLength(1);
    }
  });

  it('pigment edits change what the stage is given', async () => {
    const t = await grown('A');
    const ids = ['hueA', 'hueB', 'saturation', 'lightness', 'driver', 'contrast', 'gloss', 'glow'] as const;
    for (const [i, def] of geneTable('A').filter((g) => g.group === 'pigment').entries()) {
      const before = t.pigments.at(-1)!;
      const target = readGene(t.studio.code!, def.locus) < 2048 ? 4095 : 0;
      await t.studio.update(writeGene(t.studio.code!, def.locus, target));
      const after = t.pigments.at(-1)!;
      expect(after[ids[i]!]).not.toBe(before[ids[i]!]);
      for (const other of ids) if (other !== ids[i]) expect(after[other]).toBe(before[other]);
    }
  });

  it('changing any form gene or the seed regrows', async () => {
    for (const species of ['A', 'B'] as const) {
      const t = await grown(species);
      let expected = 1;
      for (const def of geneTable(species).filter((g) => g.group !== 'pigment')) {
        const max = def.kind === 'seed' ? 16_777_215 : 4095;
        const code = writeGene(wildType(species), def.locus, (readGene(wildType(species), def.locus) + 1) % (max + 1));
        void t.studio.update(code);
        expected++;
        expect(runs(t)).toBe(expected);
        expect(t.lastRun().job.input).toEqual({ code });
      }
    }
  });

  it('switching species regrows', async () => {
    const t = await grown('A');
    void t.studio.update(wildType('B'));
    expect(t.lastRun().job).toEqual({ kind: 'speciesB', input: { code: wildType('B') } });
  });

  it('a pigment edit made during a regrow does not restart it, and the latest code is kept', async () => {
    const t = setup();
    const done = t.studio.update(wildType('A'));
    const pigmented = writeGene(wildType('A'), 16, other(wildType('A'), 16));
    expect(await t.studio.update(pigmented)).toEqual({ status: 'unchanged' });
    expect(runs(t)).toBe(1);
    t.finish(wildA());
    expect(await done).toMatchObject({ status: 'grown', code: pigmented });
    expect(t.studio.code).toBe(pigmented);
  });
});

describe('drafting while a slider is dragged (milestone 11)', () => {
  async function grown() {
    const t = setup();
    const done = t.studio.update(wildType('A'));
    t.finish(wildA());
    expect((await done).status).toBe('grown');
    return { t };
  }

  it('a form-gene change grows a draft job, and the draft is never taken for the organism', async () => {
    const { t } = await grown();
    const code = writeGene(wildType('A'), 1, (readGene(wildType('A'), 1) + 300) % 4096);
    const pending = t.studio.draft(code);
    expect(t.lastRun().job).toEqual({ kind: 'speciesADraft', input: { code } });
    t.finish({ ...wildA(), hash: 'draft' });
    const outcome = await pending;
    expect(outcome.status).toBe('drafted');
    expect(t.shown).toHaveLength(2);
    // The organism's hash and code are still the last full run's.
    expect(t.studio.hash).toBe(wildA().hash);
    expect(t.studio.code).toBe(wildType('A'));
  });

  it('releasing (an update with the same code) regrows the organism itself', async () => {
    const { t } = await grown();
    const code = writeGene(wildType('A'), 1, (readGene(wildType('A'), 1) + 300) % 4096);
    const draft = t.studio.draft(code);
    t.finish({ ...wildA(), hash: 'draft' });
    await draft;
    const release = t.studio.update(code);
    expect(t.lastRun().job).toEqual({ kind: 'speciesA', input: { code } });
    t.finish({ ...wildA(), hash: 'full' });
    const outcome = await release;
    expect(outcome.status).toBe('grown');
    expect(t.studio.hash).toBe('full');
    expect(t.studio.code).toBe(code);
  });

  it('a pigment change while dragging starts no run', async () => {
    const { t } = await grown();
    const runs = t.posted.filter((p) => p.type === 'run').length;
    const code = writeGene(wildType('A'), 16, (readGene(wildType('A'), 16) + 100) % 4096);
    expect((await t.studio.draft(code)).status).toBe('unchanged');
    expect(t.posted.filter((p) => p.type === 'run')).toHaveLength(runs);
    expect(t.pigments.at(-1)).toEqual(pigmentsOf(code));
  });

  it('tells the stage when a draft is shown and when the organism replaces it', async () => {
    const posted: ToWorker[] = [];
    let send: (m: FromWorker) => void = () => {};
    const connect: Connect = (onMessage) => {
      send = onMessage;
      return { post: (m) => posted.push(m), terminate: () => {} };
    };
    const flags: boolean[] = [];
    const studio = new Studio({
      sim: new SimClient(connect),
      stage: { setOrganism: () => {}, setPigments: () => {}, setView: () => {} },
      progress: { show: () => {}, hide: () => {} },
      notice: () => {},
      drafted: (d) => flags.push(d),
    });
    const finish = (output: unknown) => {
      const run = posted.filter((p) => p.type === 'run').at(-1)!;
      if (run.type !== 'run') throw new Error('No run');
      send({ type: 'result', runId: run.runId, kind: run.job.kind, output } as FromWorker);
    };
    const code = writeGene(wildType('A'), 2, (readGene(wildType('A'), 2) + 500) % 4096);
    const d = studio.draft(code);
    finish({ ...wildA(), hash: 'draft' });
    await d;
    const u = studio.update(code);
    finish(wildA());
    await u;
    expect(flags).toEqual([true, false]);
  });
});
