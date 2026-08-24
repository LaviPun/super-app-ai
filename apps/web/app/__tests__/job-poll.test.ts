/**
 * WS-C Task 7. `pollJobUntilTerminal` — client-safe poll loop for async
 * generation/hydrate/publish jobs. Covers: onSnapshot fires per poll and
 * resolves on the terminal snapshot; a transient fetch failure retries
 * instead of throwing (reconnect = re-fetch, never re-spend — the loop
 * never does anything but GET the poll route); an aborted signal rejects
 * with an AbortError-named error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollJobUntilTerminal, type PolledJobSnapshot } from '~/utils/job-poll';

function snapshot(overrides: Partial<PolledJobSnapshot>): PolledJobSnapshot {
  return {
    jobId: 'job_1',
    type: 'AI_GENERATE',
    status: 'RUNNING',
    stage: 'generating',
    correlationId: 'corr_1',
    options: [],
    recommendedIndex: null,
    result: null,
    error: null,
    ...overrides,
  };
}

function okResponse(body: PolledJobSnapshot) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pollJobUntilTerminal', () => {
  it('calls onSnapshot per poll and resolves with the terminal snapshot', async () => {
    const snaps = [
      snapshot({ status: 'RUNNING', options: [{ index: 0, approach: 'a', explanation: 'e0', recipe: {}, qualityBadges: [] }] }),
      snapshot({
        status: 'RUNNING',
        options: [
          { index: 0, approach: 'a', explanation: 'e0', recipe: {}, qualityBadges: [] },
          { index: 1, approach: 'b', explanation: 'e1', recipe: {}, qualityBadges: [] },
        ],
      }),
      snapshot({ status: 'SUCCESS', recommendedIndex: 0 }),
    ];
    let call = 0;
    const fetcher = vi.fn(async () => okResponse(snaps[call++]!));
    const onSnapshot = vi.fn();

    const promise = pollJobUntilTerminal('job_1', { fetcher, onSnapshot, intervalMs: 1000 });
    // Flush the whole poll loop (fetch -> onSnapshot -> sleep, three times).
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(onSnapshot).toHaveBeenCalledTimes(3);
    expect(result.status).toBe('SUCCESS');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith('/api/ai/jobs/job_1', expect.objectContaining({ method: 'GET' }));
  });

  it('a RUNNING job mid-retry (stage: retrying) is treated as non-terminal, not a failure', async () => {
    const snaps = [
      snapshot({ status: 'RUNNING', stage: 'retrying' }),
      snapshot({ status: 'SUCCESS' }),
    ];
    let call = 0;
    const fetcher = vi.fn(async () => okResponse(snaps[call++]!));
    const onSnapshot = vi.fn();

    const promise = pollJobUntilTerminal('job_1', { fetcher, onSnapshot, intervalMs: 1000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('SUCCESS');
    expect(onSnapshot).toHaveBeenCalledTimes(2);
    // Never presented as failed while RUNNING, even mid-retry.
    expect(onSnapshot.mock.calls[0]![0].status).toBe('RUNNING');
  });

  it('retries a rejected/failed fetch instead of throwing', async () => {
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('network blip');
      if (call === 2) return { ok: false, status: 500, json: async () => ({}) } as Response;
      return okResponse(snapshot({ status: 'SUCCESS' }));
    });

    const promise = pollJobUntilTerminal('job_1', { fetcher, intervalMs: 1000 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe('SUCCESS');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects with an AbortError-named error when the signal aborts', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => okResponse(snapshot({ status: 'RUNNING' })));

    const promise = pollJobUntilTerminal('job_1', { fetcher, signal: controller.signal, intervalMs: 1000 });
    // Attach the rejection assertion before advancing timers so the promise
    // is never briefly unhandled (avoids a spurious unhandledRejection
    // warning — the implementation itself is fine either way).
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // Let the first poll land (RUNNING -> enters the inter-poll delay), then abort
    // while it's waiting.
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
  });

  it('rejects immediately if the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn(async () => okResponse(snapshot({ status: 'RUNNING' })));

    await expect(
      pollJobUntilTerminal('job_1', { fetcher, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  // Commit-0 fold-in (c): a permanently-unknown jobId (stale session, wrong
  // id, evicted job) must not poll forever — after N consecutive 404s it
  // gives up with an honest terminal FAILED snapshot instead of a real one.
  describe('permanent-404 give-up', () => {
    function notFoundResponse() {
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }

    it('gives up after maxConsecutiveNotFound (default 5) consecutive 404s', async () => {
      const fetcher = vi.fn(async () => notFoundResponse());
      const onSnapshot = vi.fn();

      const promise = pollJobUntilTerminal('job_ghost', { fetcher, onSnapshot, intervalMs: 1000 });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetcher).toHaveBeenCalledTimes(5);
      expect(result.status).toBe('FAILED');
      expect(result.error).toMatchObject({ error: 'JOB_NOT_FOUND' });
      // The give-up snapshot is reported to the caller like any other
      // terminal snapshot, so existing FAILED handling (toast + session
      // cleanup) applies without a special case.
      expect(onSnapshot).toHaveBeenCalledTimes(1);
      expect(onSnapshot).toHaveBeenCalledWith(result);
    });

    it('honors a custom maxConsecutiveNotFound', async () => {
      const fetcher = vi.fn(async () => notFoundResponse());

      const promise = pollJobUntilTerminal('job_ghost', { fetcher, intervalMs: 1000, maxConsecutiveNotFound: 2 });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('FAILED');
    });

    it('a 404 followed by a real snapshot resets the counter (no premature give-up)', async () => {
      let call = 0;
      const fetcher = vi.fn(async () => {
        call += 1;
        if (call <= 3) return notFoundResponse();
        if (call === 4) return okResponse(snapshot({ status: 'RUNNING' }));
        return okResponse(snapshot({ status: 'SUCCESS' }));
      });

      const promise = pollJobUntilTerminal('job_1', { fetcher, intervalMs: 1000 });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.status).toBe('SUCCESS');
      expect(fetcher).toHaveBeenCalledTimes(5);
    });

    it('an aborted signal during the 404 backoff still rejects with AbortError, not a give-up snapshot', async () => {
      const controller = new AbortController();
      const fetcher = vi.fn(async () => notFoundResponse());

      const promise = pollJobUntilTerminal('job_ghost', { fetcher, signal: controller.signal, intervalMs: 1000 });
      const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(0);
      controller.abort();
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    });
  });
});
