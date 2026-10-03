import { describe, expect, it } from 'vitest';
import { createSimHost } from '../../src/sim/host';
import { JOBS } from '../../src/sim/jobs';
import { probe } from '../../src/sim/probe';
import type { FromWorker } from '../../src/sim/protocol';
import { SimClient, type Connect } from '../../src/ui/sim-client';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function hostWithLog(jobs = JOBS) {
  const messages: FromWorker[] = [];
  let settled: () => void = () => {};
  const host = createSimHost({
    post: (m) => {
      messages.push(m);
      if (m.type !== 'progress') settled();
    },
    jobs,
    yieldToEventLoop: tick,
  });
  const waitForEnd = (count: number) =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (messages.filter((m) => m.type !== 'progress').length >= count) resolve();
      };
      settled = check;
      check();
    });
  return { host, messages, waitForEnd };
}

function runToEnd<T>(gen: Generator<number, T>): T {
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}

describe('probe job', () => {
  it('gives a fixed, recorded hash', () => {
    const done = runToEnd(probe({ seed: 1234567, steps: 50 }));
    expect(done.output.hash).toBe(PROBE_HASH);
  });
});

describe('worker host', () => {
  it('runs a job, reports progress, then the result', async () => {
    const { host, messages, waitForEnd } = hostWithLog();
    host.receive({ type: 'run', runId: 1, job: { kind: 'probe', input: { seed: 1234567, steps: 50 } } });
    await waitForEnd(1);
    const progress = messages.filter((m) => m.type === 'progress').map((m) => (m as { fraction: number }).fraction);
    expect(progress.length).toBeGreaterThan(10);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBe(1);
    expect(messages.at(-1)).toEqual({ type: 'result', runId: 1, kind: 'probe', output: { hash: PROBE_HASH } });
  });

  it('starting a second run cancels the first; only the second reports a result', async () => {
    const { host, messages, waitForEnd } = hostWithLog();
    host.receive({ type: 'run', runId: 1, job: { kind: 'probe', input: { seed: 1, steps: 1000 } } });
    // Let the first run get under way.
    while (!messages.some((m) => m.type === 'progress' && m.runId === 1 && m.fraction >= 0.01)) await tick();
    host.receive({ type: 'run', runId: 2, job: { kind: 'probe', input: { seed: 1234567, steps: 50 } } });
    await waitForEnd(2);
    await tick();

    const ends = messages.filter((m) => m.type !== 'progress');
    expect(ends).toEqual([
      { type: 'cancelled', runId: 1 },
      { type: 'result', runId: 2, kind: 'probe', output: { hash: PROBE_HASH } },
    ]);
    expect(messages.some((m) => m.type === 'result' && m.runId === 1)).toBe(false);
    // Once cancelled, the first run sends nothing more.
    const cancelledAt = messages.findIndex((m) => m.type === 'cancelled');
    expect(messages.slice(cancelledAt).some((m) => m.runId === 1 && m.type !== 'cancelled')).toBe(false);
  });

  it('a second run sent straight after the first also supersedes it', async () => {
    const { host, messages, waitForEnd } = hostWithLog();
    host.receive({ type: 'run', runId: 1, job: { kind: 'probe', input: { seed: 1, steps: 1000 } } });
    host.receive({ type: 'run', runId: 2, job: { kind: 'probe', input: { seed: 2, steps: 5 } } });
    await waitForEnd(2);
    expect(messages.filter((m) => m.type === 'result').map((m) => m.runId)).toEqual([2]);
  });

  it('an explicit cancel stops the run without a result', async () => {
    const { host, messages, waitForEnd } = hostWithLog();
    host.receive({ type: 'run', runId: 7, job: { kind: 'probe', input: { seed: 1, steps: 1000 } } });
    await tick();
    host.receive({ type: 'cancel', runId: 7 });
    await waitForEnd(1);
    expect(messages.filter((m) => m.type !== 'progress')).toEqual([{ type: 'cancelled', runId: 7 }]);
  });

  it('reports an error thrown by a job', async () => {
    const failing = {
      probe: function* (): Generator<number, never> {
        throw new Error('bad input');
      },
    };
    const { host, messages, waitForEnd } = hostWithLog(failing);
    host.receive({ type: 'run', runId: 3, job: { kind: 'probe', input: { seed: 1, steps: 1 } } });
    await waitForEnd(1);
    expect(messages).toEqual([{ type: 'error', runId: 3, message: 'bad input' }]);
  });
});

describe('client and host together', () => {
  /** Connects a client to an in-process host, with messages delivered asynchronously like a worker. */
  function inProcess(log: FromWorker[]): Connect {
    return (onMessage) => {
      const host = createSimHost({
        post: (m) => {
          log.push(m);
          setTimeout(() => onMessage(m), 0);
        },
        jobs: JOBS,
        yieldToEventLoop: tick,
      });
      return { post: (m) => setTimeout(() => host.receive(m), 0), terminate: () => {} };
    };
  }

  it('the first run resolves as superseded, only the second reports a result', async () => {
    const log: FromWorker[] = [];
    const client = new SimClient(inProcess(log));
    const firstProgress: number[] = [];
    const first = client.run('probe', { seed: 1, steps: 1000 }, (f) => firstProgress.push(f));
    while (firstProgress.length < 3) await tick();
    const second = client.run('probe', { seed: 1234567, steps: 50 });

    expect(await first).toEqual({ status: 'superseded' });
    expect(await second).toEqual({ status: 'done', output: { hash: PROBE_HASH } });
    expect(log.filter((m) => m.type === 'result').map((m) => m.runId)).toEqual([2]);
    expect(log.some((m) => m.type === 'cancelled' && m.runId === 1)).toBe(true);
    expect(client.busy).toBe(false);
  });

  it('cancel resolves the run as superseded', async () => {
    const client = new SimClient(inProcess([]));
    const run = client.run('probe', { seed: 1, steps: 1000 });
    client.cancel();
    expect(await run).toEqual({ status: 'superseded' });
  });
});

// Recorded in Node (V8). The same value must come back from the worker in every browser.
const PROBE_HASH = 'b66ac1398724d827';
