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
});
