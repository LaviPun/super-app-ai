import type { JobService } from '~/services/jobs/job.service';

export type StreamTerminal =
  | { kind: 'succeeded' }
  | { kind: 'failed'; code: 'NO_VALID_OPTIONS'; message: string };

/**
 * Terminal job state for a generation request (WS-QF / AI-2). A stream that
 * completes with 0 valid options is a FAILURE: jobs.fail + a typed terminal
 * error frame — never jobs.succeed (which hid total failure from ops and let
 * the client silently re-bill via the batch route).
 */
export async function finalizeGenerationJob(
  jobs: Pick<JobService, 'succeed' | 'fail'>,
  jobId: string,
  validCount: number,
  meta: Record<string, unknown>,
): Promise<StreamTerminal> {
  if (validCount === 0) {
    const message = 'Generation produced 0 valid options.';
    await jobs.fail(jobId, new Error(`NO_VALID_OPTIONS: ${message}`));
    return { kind: 'failed', code: 'NO_VALID_OPTIONS', message };
  }
  await jobs.succeed(jobId, { optionCount: validCount, ...meta });
  return { kind: 'succeeded' };
}
