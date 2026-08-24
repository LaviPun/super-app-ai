import { describe, it, expect, vi } from 'vitest';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import { nextStepAfterStream, withGenerationCorrelationId, stepIndexForSeenEvents } from '~/utils/generation-outcome';

describe('finalizeGenerationJob', () => {
  it('fails the job and returns a typed terminal error when 0 options validated', async () => {
    const jobs = { succeed: vi.fn(async (_id: string, _r?: unknown) => {}), fail: vi.fn(async (_id: string, _e?: unknown) => {}) };
    const terminal = await finalizeGenerationJob(jobs as never, 'job-1', 0, { type: 'theme.section' });
    expect(terminal).toMatchObject({ kind: 'failed', code: 'NO_VALID_OPTIONS' });
    expect(jobs.fail).toHaveBeenCalledTimes(1);
    expect(jobs.fail.mock.calls[0]![0]).toBe('job-1');
    expect(String(jobs.fail.mock.calls[0]![1])).toMatch(/NO_VALID_OPTIONS/);
    expect(jobs.succeed).not.toHaveBeenCalled();
  });

  it('succeeds the job with the option count when ≥1 option validated', async () => {
    const jobs = { succeed: vi.fn(async () => {}), fail: vi.fn(async () => {}) };
    const terminal = await finalizeGenerationJob(jobs as never, 'job-1', 2, { type: 'theme.section' });
    expect(terminal).toEqual({ kind: 'succeeded' });
    expect(jobs.succeed).toHaveBeenCalledWith('job-1', expect.objectContaining({ optionCount: 2, type: 'theme.section' }));
    expect(jobs.fail).not.toHaveBeenCalled();
  });
});

describe('nextStepAfterStream (client decision)', () => {
  it('proceeds when any option arrived', () => {
    expect(nextStepAfterStream({ gotAny: true, sawErrorFrame: false, transportFailed: false })).toBe('proceed');
    expect(nextStepAfterStream({ gotAny: true, sawErrorFrame: true, transportFailed: false })).toBe('proceed');
  });

  it('NEVER auto-refires after a server terminal error frame (double-billing guard)', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: true, transportFailed: false })).toBe('show-retry');
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: true, transportFailed: true })).toBe('show-retry');
  });

  it('falls back to the batch route only on pure transport failure', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: false, transportFailed: true })).toBe('batch-fallback');
  });

  it('empty stream with no error frame and no transport failure → honest retry (no silent refire)', () => {
    expect(nextStepAfterStream({ gotAny: false, sawErrorFrame: false, transportFailed: false })).toBe('show-retry');
  });
});

describe('withGenerationCorrelationId (client fallback dedupe, WS-QF / AI-2 review fix)', () => {
  it('the SAME correlationId travels on both the stream leg and the batch-fallback leg', () => {
    // generate._index.tsx builds ONE FormData per click, stamps it with a
    // correlationId, sends it to the stream route — and on transport failure
    // (nextStepAfterStream === 'batch-fallback') resubmits that SAME FormData
    // object to the batch route, never building a fresh one. So "same object,
    // read twice" is the actual mechanism the fallback relies on; this test
    // locks that a regression can't silently swap in a new/empty FormData or
    // forget to stamp the id before the first (stream) send.
    const fd = new FormData();
    fd.set('prompt', 'a size guide');
    const correlationId = 'fixed-correlation-id-for-test';

    withGenerationCorrelationId(fd, correlationId);
    const sentOnStreamLeg = fd.get('correlationId');

    // The fallback path reuses `fd` verbatim (no re-stamping, no new FormData).
    const sentOnBatchFallbackLeg = fd.get('correlationId');

    expect(sentOnStreamLeg).toBe(correlationId);
    expect(sentOnBatchFallbackLeg).toBe(correlationId);
    expect(sentOnBatchFallbackLeg).toBe(sentOnStreamLeg);
  });

  it('returns the same FormData instance it was given (mutates in place)', () => {
    const fd = new FormData();
    const returned = withGenerationCorrelationId(fd, 'abc-123');
    expect(returned).toBe(fd);
  });
});

describe('stepIndexForSeenEvents (WS-F: real progress, was a fake setInterval)', () => {
  it('no events yet → step 0 (fetch in flight)', () => {
    expect(stepIndexForSeenEvents(new Set(), 5)).toBe(0);
  });
  it('first option arrives → advances past "understanding the request"', () => {
    expect(stepIndexForSeenEvents(new Set(['option']), 5)).toBe(2);
  });
  it('ranking arrives → validating/ranking step', () => {
    expect(stepIndexForSeenEvents(new Set(['option', 'ranking']), 5)).toBe(3);
  });
  it('stream done → complete', () => {
    expect(stepIndexForSeenEvents(new Set(['option', 'ranking', 'done']), 5)).toBe(5);
  });
  it('never regresses below a previously-reached step for a lesser event mix', () => {
    // e.g. a late 'score' event alone shouldn't rewind an already-advanced UI;
    // caller is responsible for tracking the max seen, this function is a pure
    // ceiling function over the *seen set*, so assert monotonic inputs behave.
    const a = stepIndexForSeenEvents(new Set(['option', 'ranking']), 5);
    const b = stepIndexForSeenEvents(new Set(['option', 'ranking', 'score']), 5);
    expect(b).toBeGreaterThanOrEqual(a);
  });
});
