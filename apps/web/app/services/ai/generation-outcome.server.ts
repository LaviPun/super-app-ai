import type { JobService } from '~/services/jobs/job.service';

export type StreamTerminal =
  | { kind: 'succeeded' }
  | { kind: 'failed'; code: 'NO_VALID_OPTIONS'; message: string };

/**
 * Terminal OUTCOME for a generation request (WS-QF / AI-2). A run that
 * completes with 0 valid options is a FAILURE — never jobs.succeed (which
 * hid total failure from ops and let the client silently re-bill via the
 * batch route).
 *
 * WS-C commit-0 fold-in (c): this function no longer writes the FAILED Job
 * row itself. It used to (`jobs.fail(jobId, new Error(...))`, a bare-string
 * write), and the async processor ALSO wrote a typed `failWithPayload` right
 * after — a redundant double-write to `Job.error` for the same outcome. Each
 * caller (the inline SSE route, the async worker processor) now makes the
 * SINGLE write itself, always via the typed `failWithPayload` (D8 — no
 * silent/untyped failures), because each has attempt/context-specific data
 * this function doesn't: the processor must gate that write on
 * `envelope.isFinalAttempt` (fold-in b) so a mid-retry job is never shown as
 * terminally failed by the poll route; the inline route has no such gate.
 */
export async function finalizeGenerationJob(
  jobs: Pick<JobService, 'succeed'>,
  jobId: string,
  validCount: number,
  meta: Record<string, unknown>,
): Promise<StreamTerminal> {
  if (validCount === 0) {
    return { kind: 'failed', code: 'NO_VALID_OPTIONS', message: 'Generation produced 0 valid options.' };
  }
  await jobs.succeed(jobId, { optionCount: validCount, ...meta });
  return { kind: 'succeeded' };
}
