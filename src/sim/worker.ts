/// <reference lib="webworker" />
import { createSimHost } from './host';
import { JOBS } from './jobs';
import type { ToWorker } from './protocol';

// Web worker entry. All simulation runs here, on this one thread.

const scope = self as unknown as DedicatedWorkerGlobalScope;

const host = createSimHost({
  post: (message, transfer) => scope.postMessage(message, transfer ?? []),
  jobs: JOBS,
});

scope.onmessage = (event: MessageEvent<ToWorker>) => host.receive(event.data);
