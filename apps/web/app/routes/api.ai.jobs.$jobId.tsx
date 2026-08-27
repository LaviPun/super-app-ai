import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { JobService } from '~/services/jobs/job.service';
import { AppError, toErrorResponse } from '~/services/errors/app-error.server';

/**
 * WS-C Task 6. Reconnect-safe snapshot of an async generation job (C1): a
 * dropped client connection re-fetches THIS route — nothing here re-runs
 * the pipeline or spends a second billing unit. Options are read back from
 * the persisted `AiGenerationOption` rows (written by the worker processor,
 * Task 5, as each option validates), never re-derived.
 *
 * STABLE CONTRACT — WS-F depends on this response shape.
 */
export type GenerationJobSnapshot = {
  jobId: string;
  type: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  stage: string | null;
  correlationId: string | null;
  /** VALID options only, ordered by index. */
  options: Array<{
    index: number;
    approach: string;
    explanation: string;
    recipe: unknown;
    score?: number;
    qualityBadges: string[];
    generationMode?: string;
  }>;
  /** From Job.result (set on SUCCESS by the generation processor); null otherwise. */
  recommendedIndex: number | null;
  /** Parsed Job.result — hydrate/publish consumers read job-type-specific fields off this. */
  result: unknown | null;
  /** Parsed AppErrorPayload (fallback: INTERNAL_ERROR wrap of a legacy plain-string Job.error). */
  error: { error: string; message: string; requestId?: string; details?: Record<string, unknown> } | null;
};

/** POST/etc disallowed — read-only poll route. */
export async function action() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function loader({ request, params }: { request: Request; params: { jobId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  try {
    const jobId = params.jobId;
    if (!jobId) {
      throw new AppError({ code: 'VALIDATION_ERROR', message: 'Missing job id.' });
    }

    const job = await new JobService().getForShop(jobId, session.shop);
    if (!job) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Generation job not found.' });
    }

    const options = (job.generationOptions ?? [])
      .filter((o) => o.status === 'VALID')
      // Ordered by index — `getForShop`'s query already sorts this way, but
      // sort again here defensively so the contract holds regardless of the
      // caller's query.
      .sort((a, b) => a.idx - b.idx)
      .flatMap((o) => {
        // A corrupt recipeJson row is skipped, never a 500 — the option
        // just doesn't show up in the snapshot.
        if (!o.recipeJson) return [];
        try {
          const recipe: unknown = JSON.parse(o.recipeJson);
          return [
            {
              index: o.idx,
              approach: o.approach,
              explanation: o.explanation ?? '',
              recipe,
              ...(o.score != null ? { score: o.score } : {}),
              qualityBadges: parseStringArray(o.badgesJson),
              ...(o.generationMode ? { generationMode: o.generationMode } : {}),
            },
          ];
        } catch {
          return [];
        }
      });

    const result = parseJson(job.result);
    const recommendedIndex =
      result &&
      typeof result === 'object' &&
      typeof (result as { recommendedIndex?: unknown }).recommendedIndex === 'number'
        ? (result as { recommendedIndex: number }).recommendedIndex
        : null;

    const snapshot: GenerationJobSnapshot = {
      jobId: job.id,
      type: job.type,
      status: job.status as GenerationJobSnapshot['status'],
      stage: job.stage ?? null,
      correlationId: job.correlationId ?? null,
      options,
      recommendedIndex,
      result,
      error: parseJobError(job.error),
    };

    return json(snapshot, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

function parseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * `Job.error` is either a typed `AppErrorPayload` JSON string (written by
 * `failWithPayload`) or a legacy bare string / `String(Error)` (written by
 * the older `jobs.fail`). Defensively re-hydrate both into the same shape —
 * a corrupt or unrecognized value never surfaces as a 500 here either.
 */
function parseJobError(raw: string | null): GenerationJobSnapshot['error'] {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { error?: unknown }).error === 'string' &&
      typeof (parsed as { message?: unknown }).message === 'string'
    ) {
      const p = parsed as { error: string; message: string; requestId?: string; details?: Record<string, unknown> };
      return {
        error: p.error,
        message: p.message,
        ...(p.requestId ? { requestId: p.requestId } : {}),
        // Commit-0 fold-in (a): structured guidance (e.g. PublishPartialFailureError's
        // failedOp/completedOps/guidance, WS-E finding 4) rides through the poll
        // path instead of being dropped — the client's ?publishing= FAILED branch
        // reuses it to drive the already-tested setPublishFailure banner.
        ...(p.details && typeof p.details === 'object' ? { details: p.details } : {}),
      };
    }
  } catch {
    // Not JSON — legacy bare-string format, fall through to the wrap below.
  }
  return { error: 'INTERNAL_ERROR', message: raw };
}
