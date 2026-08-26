/**
 * WS-C Task 16 (friendly terminal errors). Uniform `AppError` mapping shared
 * by every AI route's catch block (`api.ai.create-module.tsx`,
 * `.stream.tsx`, `.hydrate-module.tsx`, `.modify-module.tsx`,
 * `.create-module-from-recipe.tsx`, `.fill-settings.tsx`).
 *
 * Before this, each route hand-rolled its own error shape — some leaked raw
 * internals (`json({ error: e.message }, 500)`), some had no typed rate-limit
 * or truncation branch, and `Job.error` (bare `String(e)` via `jobs.fail`)
 * told a different story than the HTTP response. This collapses all of that
 * into one place: the SAME `AppError` a route sends back to the merchant is
 * also what it persists via `jobs.failWithPayload` (see each route's catch
 * block: `jobs.failWithPayload(job.id, appError.toPayload())`), so the Job
 * ledger and the merchant response always agree.
 */
import { AppError, toErrorResponse, type ErrorCode } from '~/services/errors/app-error.server';
import { AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { TruncatedOutputError } from '~/services/ai/clients/truncation.server';

/** Detect a provider 429 without depending on any specific provider SDK's error class. */
export function isRateLimitShapedError(e: unknown): boolean {
  const statusCode = (e as { statusCode?: number } | null | undefined)?.statusCode;
  return statusCode === 429 || (e instanceof Error && e.message.includes('rate_limit'));
}

/**
 * Map any thrown value from an AI route's pipeline call into the ONE typed
 * `AppError` the route uses for both its HTTP response and its Job ledger
 * write. `fallbackCode`/`fallbackStatus` let a route preserve its own
 * historical status for the untyped "everything else" case (e.g. the hydrate
 * route has always answered 422 there) while still getting the identical
 * AiProviderNotConfigured/RATE_LIMITED/OUTPUT_TRUNCATED handling as every
 * other AI route.
 */
export function toAiRouteAppError(
  e: unknown,
  opts?: { setupUrl?: string; fallbackCode?: ErrorCode; fallbackStatus?: number },
): AppError {
  if (e instanceof AppError) return e;

  if (e instanceof AiProviderNotConfiguredError) {
    return new AppError({
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: e.message,
      details: opts?.setupUrl ? { setupUrl: opts.setupUrl } : undefined,
    });
  }

  if (isRateLimitShapedError(e)) {
    return new AppError({
      code: 'RATE_LIMITED',
      message: 'AI providers are busy right now. Wait a moment and try again — this attempt was not billed.',
    });
  }

  if (e instanceof TruncatedOutputError) {
    return new AppError({
      code: 'OUTPUT_TRUNCATED',
      message: 'Try again — the model returned an incomplete answer.',
    });
  }

  // Everything else: same production/dev message discipline as
  // `toErrorResponse` (production hides internals, dev shows them) — just
  // returned as an AppError instead of a Response so the caller can also
  // pull `.toPayload()` for the Job write.
  const message =
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : e instanceof Error
        ? e.message
        : String(e);
  return new AppError({ code: opts?.fallbackCode ?? 'INTERNAL_ERROR', message, status: opts?.fallbackStatus });
}

// Re-exported so callers that want the raw Response (no Job payload needed)
// can still reach for the shared implementation in one import.
export { toErrorResponse };
