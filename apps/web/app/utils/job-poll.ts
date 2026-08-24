/**
 * WS-C Task 7. Client-safe poll helper for async generation/hydrate/publish
 * jobs (C1). Deliberately has NO `.server` imports and NO dependency on the
 * poll route's server-only `GenerationJobSnapshot` type (Task 6 review
 * requirement #1) — `PolledJobSnapshot` below is a structural copy so the
 * client/server import graph never crosses.
 *
 * Reconnect semantics (Task 6 review requirement #3): this module only ever
 * performs a GET against `/api/ai/jobs/:jobId`. It never calls the enqueue
 * route and never re-runs anything — a dropped connection just re-fetches
 * the same job's current state, so polling again (or resuming a poll after
 * a reload) can never re-spend a billing unit.
 */
export type PolledJobSnapshot = {
  jobId: string;
  type: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  stage: string | null;
  correlationId: string | null;
  options: Array<{
    index: number;
    approach: string;
    explanation: string;
    recipe: unknown;
    score?: number;
    qualityBadges: string[];
    generationMode?: string;
  }>;
  recommendedIndex: number | null;
  result: unknown | null;
  error: { error: string; message: string; requestId?: string } | null;
};

export type PollJobOptions = {
  /** Delay between polls while the job is non-terminal. Default 1500ms. */
  intervalMs?: number;
  /** Test seam — defaults to the global `fetch`. */
  fetcher?: typeof fetch;
  /** Called once per successfully-fetched snapshot, including the terminal one. */
  onSnapshot?: (snapshot: PolledJobSnapshot) => void;
  signal?: AbortSignal;
};

const DEFAULT_INTERVAL_MS = 1500;
const MAX_BACKOFF_MS = 5000;

/**
 * Any `RUNNING` status — including a job mid-retry (`stage: 'retrying'`) —
 * is NON-TERMINAL (Task 6 review requirement #2). A BullMQ retry attempt
 * never surfaces as a failure to the merchant; only `SUCCESS`/`FAILED` end
 * the poll. `QUEUED` is also non-terminal.
 */
function isTerminal(status: PolledJobSnapshot['status']): boolean {
  return status === 'SUCCESS' || status === 'FAILED';
}

function makeAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The poll was aborted.', 'AbortError');
  }
  const err = new Error('The poll was aborted.');
  err.name = 'AbortError';
  return err;
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

/** Resolves after `ms`, or rejects immediately/early with an AbortError if `signal` fires. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(makeAbortError());
    }
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Polls `GET /api/ai/jobs/:jobId` until the job reaches a terminal status.
 * Transient fetch failures (network error, non-2xx, unparsable body) do NOT
 * throw — the poll is idempotent, so it just retries with a backoff capped
 * at 5s. The only ways this rejects are an aborted `signal`.
 */
export async function pollJobUntilTerminal(
  jobId: string,
  opts: PollJobOptions = {},
): Promise<PolledJobSnapshot> {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const fetcher = opts.fetcher ?? fetch;
  let backoffMs = intervalMs;

  for (;;) {
    if (opts.signal?.aborted) throw makeAbortError();

    let snapshot: PolledJobSnapshot | null = null;
    try {
      const res = await fetcher(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      if (!res.ok) throw new Error(`poll failed with status ${res.status}`);
      snapshot = (await res.json()) as PolledJobSnapshot;
    } catch (e) {
      if (isAbortError(e) || opts.signal?.aborted) throw makeAbortError();
      // Transient failure — retry, never throw, never re-enqueue/re-spend.
      await delay(Math.min(backoffMs, MAX_BACKOFF_MS), opts.signal);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      continue;
    }

    backoffMs = intervalMs;
    opts.onSnapshot?.(snapshot);
    if (isTerminal(snapshot.status)) return snapshot;

    await delay(intervalMs, opts.signal);
  }
}
