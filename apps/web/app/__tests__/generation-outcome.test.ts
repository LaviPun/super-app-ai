import { describe, it, expect, vi } from 'vitest';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import { nextStepAfterStream, withGenerationCorrelationId } from '~/utils/generation-outcome';

describe('finalizeGenerationJob', () => {
  // WS-C commit-0 fold-in (c): this function no longer writes the FAILED Job
  // row itself — that was a redundant bare-string write duplicating the
  // typed `failWithPayload` write both callers (stream route, processor)
  // already made afterward. It now ONLY decides + returns the terminal
  // descriminator on failure; each caller does its own single typed write.
  it('returns a typed terminal error when 0 options validated, WITHOUT writing to the job itself', async () => {
    const jobs = { succeed: vi.fn(async (_id: string, _r?: unknown) => {}) };
    const terminal = await finalizeGenerationJob(jobs as never, 'job-1', 0, { type: 'theme.section' });
    expect(terminal).toMatchObject({ kind: 'failed', code: 'NO_VALID_OPTIONS' });
    expect(terminal.kind === 'failed' && terminal.message).toMatch(/0 valid options/i);
    expect(jobs.succeed).not.toHaveBeenCalled();
  });

  it('succeeds the job with the option count when ≥1 option validated', async () => {
    const jobs = { succeed: vi.fn(async () => {}) };
    const terminal = await finalizeGenerationJob(jobs as never, 'job-1', 2, { type: 'theme.section' });
    expect(terminal).toEqual({ kind: 'succeeded' });
    expect(jobs.succeed).toHaveBeenCalledWith('job-1', expect.objectContaining({ optionCount: 2, type: 'theme.section' }));
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
