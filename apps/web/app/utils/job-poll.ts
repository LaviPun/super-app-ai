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
  error: { error: string; message: string; requestId?: string; details?: Record<string, unknown> } | null;
};

export type PollJobOptions = {
  /** Delay between polls while the job is non-terminal. Default 1500ms. */
  intervalMs?: number;
  /** Test seam — defaults to the global `fetch`. */
  fetcher?: typeof fetch;
  /** Called once per successfully-fetched snapshot, including the terminal one. */
  onSnapshot?: (snapshot: PolledJobSnapshot) => void;
  signal?: AbortSignal;
  /**
   * Consecutive 404s (job truly not found — a wrong/expired jobId, never a
   * transient condition) before giving up. Default 5. Commit-0 fold-in (c):
   * without this, a permanently-unknown jobId (e.g. a stale `sa:gen:active`
   * session pointing at a job the DB no longer has) polls forever.
   */
  maxConsecutiveNotFound?: number;
  /**
   * WS-C final review (IMPORTANT-2b): max wall-clock time to keep polling a
   * job that keeps returning a real, non-404 snapshot but never reaches a
   * terminal status. Covers a worker hard-crash (SIGKILL/OOM) or an
   * event-loop stall on the FINAL BullMQ attempt — neither runs the normal
   * processor code path, so the Prisma Job row can be left RUNNING forever
   * with nothing else guaranteed to flip it terminal (the worker-runtime
   * `failed`-event reconciliation added alongside this fix covers the case
   * where BullMQ itself detects the failure; this covers the belt-and-
   * suspenders case where it doesn't — e.g. the whole container is killed
   * with no other worker instance around to notice the stall). Deliberately
   * generous — 10 minutes default — since this must never fire on a normal
   * generation (seconds), only stop a client spinning forever against a row
   * nothing will ever finish.
   */
  maxWallClockMs?: number;
};

const DEFAULT_INTERVAL_MS = 1500;
const MAX_BACKOFF_MS = 5000;
const DEFAULT_MAX_CONSECUTIVE_NOT_FOUND = 5;
const DEFAULT_MAX_WALL_CLOCK_MS = 10 * 60 * 1000;

/**
 * Synthetic terminal snapshot returned when polling gives up after too many
 * consecutive 404s. Shaped exactly like a real terminal snapshot so every
 * caller's existing `status === 'FAILED'` handling (toast the message, clear
 * the active-session record, etc.) applies unchanged — this is an honest
 * terminal error, not a special case callers need to know about.
 */
function jobNotFoundGiveUpSnapshot(jobId: string): PolledJobSnapshot {
  return {
    jobId,
    type: 'UNKNOWN',
    status: 'FAILED',
    stage: null,
    correlationId: null,
    options: [],
    recommendedIndex: null,
    result: null,
    error: {
      error: 'JOB_NOT_FOUND',
      message: 'We could not find this generation — it may have expired. Please try again.',
    },
  };
}

/**
 * Any `RUNNING` status — including a job mid-retry (`stage: 'retrying'`) —
 * is NON-TERMINAL (Task 6 review requirement #2). A BullMQ retry attempt
 * never surfaces as a failure to the merchant; only `SUCCESS`/`FAILED` end
 * the poll. `QUEUED` is also non-terminal.
 */
function isTerminal(status: PolledJobSnapshot['status']): boolean {
  return status === 'SUCCESS' || status === 'FAILED';
}

/**
 * Synthetic terminal snapshot returned when polling gives up after exceeding
 * `maxWallClockMs` (WS-C final review IMPORTANT-2b) — the job kept returning
 * a real, non-404 snapshot the whole time, it just never reached SUCCESS or
 * FAILED. Shaped exactly like a real terminal snapshot (status FAILED), same
 * pattern as `jobNotFoundGiveUpSnapshot` above, so every caller's existing
 * `status === 'FAILED'` handling (toast the message, clear the active-session
 * record, etc.) applies unchanged — an honest terminal error surfaced like
 * any other failure, not a special case callers need to know about.
 */
function pollTimedOutSnapshot(jobId: string): PolledJobSnapshot {
  return {
    jobId,
    type: 'UNKNOWN',
    status: 'FAILED',
    stage: null,
    correlationId: null,
    options: [],
    recommendedIndex: null,
    result: null,
    error: {
      error: 'POLL_TIMEOUT',
      message: 'This generation is taking far longer than expected and may have stalled. Please try again.',
    },
  };
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
  const maxConsecutiveNotFound = opts.maxConsecutiveNotFound ?? DEFAULT_MAX_CONSECUTIVE_NOT_FOUND;
  const maxWallClockMs = opts.maxWallClockMs ?? DEFAULT_MAX_WALL_CLOCK_MS;
  const startedAt = Date.now();
  let backoffMs = intervalMs;
  let consecutiveNotFound = 0;

  for (;;) {
    if (opts.signal?.aborted) throw makeAbortError();

    // WS-C final review (IMPORTANT-2b): give up on a job that keeps polling
    // as a real, non-terminal snapshot forever — see maxWallClockMs doc above.
    if (Date.now() - startedAt >= maxWallClockMs) {
      const timedOut = pollTimedOutSnapshot(jobId);
      opts.onSnapshot?.(timedOut);
      return timedOut;
    }

    let snapshot: PolledJobSnapshot | null = null;
    let notFound = false;
    try {
      const res = await fetcher(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      if (res.status === 404) {
        notFound = true;
      } else {
        if (!res.ok) throw new Error(`poll failed with status ${res.status}`);
        snapshot = (await res.json()) as PolledJobSnapshot;
      }
    } catch (e) {
      if (isAbortError(e) || opts.signal?.aborted) throw makeAbortError();
      // Transient failure — retry, never throw, never re-enqueue/re-spend.
      consecutiveNotFound = 0;
      await delay(Math.min(backoffMs, MAX_BACKOFF_MS), opts.signal);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      continue;
    }

    if (notFound) {
      // A 404 is NOT transient the way a 5xx or network blip is — the job
      // either never existed or the poll route deliberately says "not
      // yours/gone" (route Task 6: unknown job OR another shop's job both
      // 404 identically). One 404 could still be a race against the
      // enqueue-route's write landing, so this only gives up after several
      // in a row, not on the first one.
      consecutiveNotFound += 1;
      if (consecutiveNotFound >= maxConsecutiveNotFound) {
        const giveUp = jobNotFoundGiveUpSnapshot(jobId);
        opts.onSnapshot?.(giveUp);
        return giveUp;
      }
      await delay(Math.min(backoffMs, MAX_BACKOFF_MS), opts.signal);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      continue;
    }

    consecutiveNotFound = 0;
    backoffMs = intervalMs;
    opts.onSnapshot?.(snapshot!);
    if (isTerminal(snapshot!.status)) return snapshot!;

    await delay(intervalMs, opts.signal);
  }
}

/**
 * Commit-0 fold-in (a). A FAILED publish-job snapshot whose error carries
 * structured `details` (WS-E's `PublishPartialFailureError` — `failedOp`,
 * `completedOps`, `guidance` — persisted by the publish processor into
 * `Job.error.details` and now forwarded by the poll route's `parseJobError`)
 * should drive the same `setPublishFailure({ failedOp, guidance, message })`
 * banner the SYNC publish path already uses (`modules.$moduleId.tsx`), not a
 * toast-only message the merchant can't act on. Returns `null` when the
 * failure is a plain error (no `details`) — the caller falls back to a toast.
 *
 * Pulled out as a pure function (rather than inlined in the route component)
 * so it is unit-testable without a React/DOM test harness, which this repo
 * does not otherwise set up for route components.
 */
export function derivePublishFailureBanner(
  error: PolledJobSnapshot['error'],
): { failedOp?: string; guidance?: string; message: string } | null {
  if (!error || error.error !== 'PUBLISH_ERROR' || !error.details) return null;
  const { failedOp, guidance } = error.details;
  return {
    ...(typeof failedOp === 'string' ? { failedOp } : {}),
    ...(typeof guidance === 'string' ? { guidance } : {}),
    message: error.message,
  };
}
