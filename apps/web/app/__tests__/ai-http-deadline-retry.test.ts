/**
 * WS-C Task 10 (C7) fix round 1. `postJsonWithRetries`'s retry loop
 * previously computed `timeoutMs` ONCE before the loop and reused it across
 * every retry — including retries of deadline-triggered AbortErrors (which
 * are not `nonRetryable`) — so a single deadline-bound call could actually
 * spend up to `(maxRetries + 1) x timeoutMs` of wall-clock time, silently
 * multiplying the caller's budget. Covers:
 *  - each attempt re-derives its timeout window from the REMAINING deadline
 *    budget, so a retry after time has already passed gets a SHRUNK window,
 *    never a fresh full one;
 *  - once the remaining budget drops below the floor, no further attempt
 *    (initial or retry) fires at all — the failure is reported immediately
 *    as a typed, non-retryable `deadlineExhausted` error instead of
 *    sleeping into (or firing) a call with no realistic chance of finishing;
 *  - a regression check that retries behave exactly as before when no
 *    `deadlineAt` is passed at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postJsonWithRetries } from '~/services/ai/http/ai-http.server';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('postJsonWithRetries: per-attempt deadline re-derivation (WS-C Task 10, C7, fix round 1)', () => {
  it('a retry after time has passed gets a SHRUNK per-attempt window, not a fresh full one', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // deterministic backoff (jitter = 0)

    const start = Date.now();
    const deadlineAt = start + 10_000;

    let callIndex = 0;
    let secondAttemptWindowMs: number | null = null;

    const fetchMock = vi.fn((_url: unknown, init: { signal: AbortSignal }) => {
      const idx = callIndex++;
      if (idx === 0) {
        // Attempt 0 resolves normally (a 5xx) after 3s of simulated latency —
        // well within its ~10s deadline-bound window, so it is NOT the abort
        // timer that ends this attempt.
        return new Promise((resolve) => {
          setTimeout(
            () => resolve({ status: 503, headers: new Headers(), text: async () => '{}' } as unknown as Response),
            3_000,
          );
        });
      }
      // Attempt 1 never resolves on its own — only the abort timer ends it,
      // so its elapsed time IS the effective per-attempt timeout window.
      const callTime = Date.now();
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          secondAttemptWindowMs = Date.now() - callTime;
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      deadlineAt,
      maxRetries: 1,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondAttemptWindowMs).not.toBeNull();
    // Attempt 0's window was the full ~10s budget. Attempt 1 started after
    // ~3s (fetch latency) + ~400ms (deterministic backoff) had already
    // elapsed, so its window must be meaningfully SHORTER than attempt 0's —
    // proof each attempt re-derives against the shrinking deadline instead
    // of re-claiming a fresh full window.
    expect(secondAttemptWindowMs!).toBeLessThan(8_000);
    expect(secondAttemptWindowMs!).toBeGreaterThan(3_000);
  });

  it('exhausted remaining budget after a timeout: no further retry fires; fails as a typed nonRetryable deadlineExhausted error', async () => {
    vi.useFakeTimers();

    const start = Date.now();
    const deadlineAt = start + 1_500;

    const fetchMock = vi.fn((_url: unknown, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const promise = postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      deadlineAt,
      maxRetries: 2,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });
    const assertion = expect(promise).rejects.toMatchObject({ deadlineExhausted: true, nonRetryable: true });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    // The deadline is exhausted the instant attempt 0's own deadline-bound
    // window elapses — no second fetch call (retry) is ever attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a deadline already exhausted before the FIRST attempt: no fetch call at all, typed deadlineExhausted error', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      postJsonWithRetries({
        url: 'https://example.test/v1/messages',
        headers: {},
        body: {},
        deadlineAt: Date.now() - 1_000,
        maxRetries: 2,
        logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
      }),
    ).rejects.toMatchObject({ deadlineExhausted: true, nonRetryable: true });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('regression: without deadlineAt, retries still proceed exactly as before (5xx then success)', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return { status: 503, headers: new Headers(), text: async () => '{}' } as unknown as Response;
      }
      return { status: 200, headers: new Headers(), text: async () => JSON.stringify({ ok: true }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const { json } = await postJsonWithRetries({
      url: 'https://example.test/v1/messages',
      headers: {},
      body: {},
      maxRetries: 2,
      logMeta: { provider: 'ANTHROPIC', model: 'test-model', actor: 'INTERNAL' },
    });

    expect(json).toEqual({ ok: true });
    expect(calls).toBe(2);
  });
});
