import { describe, it, expect, vi } from 'vitest';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import {
  nextStepAfterStream,
  withGenerationCorrelationId,
  stampGenerationCorrelationId,
  resolveGenerationCorrelationId,
} from '~/utils/generation-outcome';

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

describe('stampGenerationCorrelationId (WS-C Task 13 fix round 1)', () => {
  // Regression guard for the review finding: streamGenerate() called
  // withGenerationCorrelationId(fd, uuid) but never wrote uuid into
  // genCorrelationIdRef — only asyncGenerate() did — so the save FormData's
  // correlationId (read from the ref) came out empty for every SSE-path
  // generation. This helper makes "stamp fd" and "stamp the ref" a single
  // atomic call so streamGenerate and asyncGenerate can't drift again.
  it('stamps the FormData and the ref with the SAME correlationId', () => {
    const fd = new FormData();
    fd.set('prompt', 'a size guide');
    const ref: { current: string | null } = { current: null };

    const returned = stampGenerationCorrelationId(fd, ref, 'sse-leg-correlation-id');

    expect(fd.get('correlationId')).toBe('sse-leg-correlation-id');
    expect(ref.current).toBe('sse-leg-correlation-id');
    expect(returned).toBe('sse-leg-correlation-id');
    // The exact invariant the save flow depends on (generate._index.tsx's
    // `fd.set('correlationId', genCorrelationIdRef.current ?? '')` on save):
    // whatever went out on the wire during generation is what a subsequent
    // save reads back out of the ref.
    expect(ref.current).toBe(fd.get('correlationId'));
  });

  it('overwrites a stale ref value from a previous attempt', () => {
    const fd = new FormData();
    const ref: { current: string | null } = { current: 'stale-previous-attempt-id' };

    stampGenerationCorrelationId(fd, ref, 'new-attempt-id');

    expect(ref.current).toBe('new-attempt-id');
    expect(fd.get('correlationId')).toBe('new-attempt-id');
  });
});

describe('resolveGenerationCorrelationId (WS-C final review, IMPORTANT-1)', () => {
  // Regression guard: asyncGenerate's fallback into streamGenerate on a
  // transport failure / unreadable-response must reuse the SAME
  // newCorrelationId it already sent to /api/ai/generate-async — that
  // enqueue route only returns 200 after jobs.create + enqueueWebJob both
  // succeed, so anything that goes wrong reading the response back leaves a
  // live orphaned worker job that will still bill under that id later. If
  // streamGenerate instead minted a fresh id here, the orphan and the SSE
  // fallback would bill under two different ids and the dedupe seam
  // (keyed on correlationId) could never collapse them into one unit.
  it('an explicit correlationId always wins over minting a fresh one', () => {
    expect(resolveGenerationCorrelationId('orphaned-job-correlation-id')).toBe('orphaned-job-correlation-id');
  });

  it('mints a fresh uuid only when no explicit id is given (a genuinely first attempt)', () => {
    const a = resolveGenerationCorrelationId();
    const b = resolveGenerationCorrelationId(undefined);
    expect(a).not.toBe(b);
    // crypto.randomUUID() shape — loose check, just confirms it's not an
    // empty/undefined fallthrough.
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('threading this through streamGenerate\'s stamp call produces the SAME id on the FormData that asyncGenerate already sent to the enqueue route', () => {
    // Mirrors the exact call streamGenerate makes:
    //   stampGenerationCorrelationId(fd, genCorrelationIdRef, resolveGenerationCorrelationId(correlationId))
    const newCorrelationId = 'async-enqueue-attempt-id';
    const fd = new FormData();
    const ref: { current: string | null } = { current: null };

    stampGenerationCorrelationId(fd, ref, resolveGenerationCorrelationId(newCorrelationId));

    expect(fd.get('correlationId')).toBe(newCorrelationId);
    expect(ref.current).toBe(newCorrelationId);
  });
});
