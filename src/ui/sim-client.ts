import type { FromWorker, JobInputs, JobKind, JobOutputs, JobRequest, ToWorker } from '../sim/protocol';

// Main-thread side of the simulation worker. Each run gets an id; starting a new run supersedes the
// one in flight, whose promise resolves as superseded. Messages for old runs are ignored.

export type RunOutcome<T> =
  | { status: 'done'; output: T }
  | { status: 'superseded' }
  | { status: 'failed'; message: string };

export interface SimChannel {
  post(message: ToWorker): void;
  terminate(): void;
}

export type Connect = (onMessage: (message: FromWorker) => void) => SimChannel;

/** Connects to the real web worker. */
export const connectWorker: Connect = (onMessage) => {
  const worker = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<FromWorker>) => onMessage(event.data);
  return {
    post: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
  };
};

interface Pending {
  runId: number;
  resolve: (outcome: RunOutcome<unknown>) => void;
  onProgress?: (fraction: number) => void;
}

export class SimClient {
  private readonly channel: SimChannel;
  private nextRunId = 1;
  private pending: Pending | null = null;

  constructor(connect: Connect = connectWorker) {
    this.channel = connect((message) => this.receive(message));
  }

  /** Starts a run. Any run still in flight is cancelled and resolves as superseded. */
  run<K extends JobKind>(
    kind: K,
    input: JobInputs[K],
    onProgress?: (fraction: number) => void,
  ): Promise<RunOutcome<JobOutputs[K]>> {
    this.supersede();
    const runId = this.nextRunId++;
    return new Promise((resolve) => {
      this.pending = { runId, resolve: resolve as Pending['resolve'], onProgress };
      this.channel.post({ type: 'run', runId, job: { kind, input } as JobRequest });
    });
  }

  /** Cancels the run in flight, if any. */
  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.channel.post({ type: 'cancel', runId: pending.runId });
    this.supersede();
  }

  get busy(): boolean {
    return this.pending !== null;
  }

  dispose(): void {
    this.supersede();
    this.channel.terminate();
  }

  private supersede(): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve({ status: 'superseded' });
  }

  private receive(message: FromWorker): void {
    const pending = this.pending;
    if (!pending || message.runId !== pending.runId) return;
    switch (message.type) {
      case 'progress':
        pending.onProgress?.(message.fraction);
        break;
      case 'result':
        this.pending = null;
        pending.resolve({ status: 'done', output: message.output });
        break;
      case 'error':
        this.pending = null;
        pending.resolve({ status: 'failed', message: message.message });
        break;
      case 'cancelled':
        // Only sent for runs this client already gave up on.
        break;
    }
  }
}
