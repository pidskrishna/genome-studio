import type { FromWorker, JobInputs, JobKind, JobOutputs, ToWorker } from './protocol';

// The worker's run loop. A job is a generator that yields its progress (0 to 1) after each step and
// returns its output. The host runs one job at a time; a new run supersedes the one in flight.
// Between steps it hands control back to the event loop so that new messages can arrive.

export interface JobDone<T> {
  output: T;
  /** Buffers to transfer rather than copy. */
  transfer?: Transferable[];
}

export type Job<K extends JobKind> = (input: JobInputs[K]) => Generator<number, JobDone<JobOutputs[K]>>;

export type JobTable = { [K in JobKind]: Job<K> };

export interface HostOptions {
  post: (message: FromWorker, transfer?: Transferable[]) => void;
  jobs: JobTable;
  /** Lets pending messages through. Defaults to a MessageChannel round trip. */
  yieldToEventLoop?: () => Promise<void>;
  /** Steps between yields to the event loop. */
  stepsPerYield?: number;
}

export interface SimHost {
  receive(message: ToWorker): void;
}

function messageChannelYield(): () => Promise<void> {
  const channel = new MessageChannel();
  const waiting: (() => void)[] = [];
  channel.port1.onmessage = () => waiting.shift()?.();
  return () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve);
      channel.port2.postMessage(null);
    });
}

export function createSimHost(options: HostOptions): SimHost {
  const { post, jobs } = options;
  const stepsPerYield = Math.max(1, options.stepsPerYield ?? 1);
  let yieldToEventLoop = options.yieldToEventLoop;
  let current: { runId: number; cancelled: boolean } | null = null;

  async function execute(token: { runId: number; cancelled: boolean }, kind: JobKind, input: JobInputs[JobKind]) {
    const { runId } = token;
    const yielder = (yieldToEventLoop ??= messageChannelYield());
    let lastPercent = -1;
    let sinceYield = 0;
    try {
      const run = (jobs[kind] as Job<JobKind>)(input);
      for (;;) {
        const step = run.next();
        if (step.done) {
          if (token.cancelled) post({ type: 'cancelled', runId });
          else post({ type: 'result', runId, kind, output: step.value.output }, step.value.transfer);
          break;
        }
        const percent = Math.floor(Math.min(1, Math.max(0, step.value)) * 100);
        if (percent !== lastPercent) {
          lastPercent = percent;
          post({ type: 'progress', runId, fraction: percent / 100 });
        }
        if (++sinceYield >= stepsPerYield) {
          sinceYield = 0;
          await yielder();
        }
        if (token.cancelled) {
          post({ type: 'cancelled', runId });
          break;
        }
      }
    } catch (error) {
      if (!token.cancelled) post({ type: 'error', runId, message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (current === token) current = null;
    }
  }

  return {
    receive(message) {
      if (message.type === 'cancel') {
        if (current && current.runId === message.runId) current.cancelled = true;
        return;
      }
      if (current) current.cancelled = true;
      const token = { runId: message.runId, cancelled: false };
      current = token;
      void execute(token, message.job.kind, message.job.input);
    },
  };
}
