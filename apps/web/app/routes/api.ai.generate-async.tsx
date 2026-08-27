import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { QuotaService } from '~/services/billing/quota.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { enqueueWebJob, isAsyncJobsEnabled } from '~/services/jobs/enqueue.server';
import { AppError, toErrorResponse } from '~/services/errors/app-error.server';
import { generateCorrelationId } from '~/services/observability/correlation.server';
import { clampOptionCount } from '~/utils/generation-outcome';

/** GET disallowed; this is an enqueue-only POST endpoint. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * WS-C Task 5. Async generation enqueue (C1): returns `{ jobId, correlationId }`
 * immediately — no generation work happens on this request. The client polls
 * `GET /api/ai/jobs/:jobId` (Task 6) for progress/results. A reconnect or
 * reload is the SAME poll — nothing here re-runs, nothing re-bills; the
 * worker (`ai-generation.processor.server.ts`) is the only executor, and
 * BullMQ retries (attempts: 2) reuse this job's `correlationId` through the
 * existing `seedBillingStateForCorrelation` dedupe seam (untouched by this
 * task) so a retry never double-bills (C2).
 *
 * Sibling of `api.ai.create-module.stream.tsx` (the inline/dev SSE path,
 * kept for JOB_EXECUTION_MODE=inline) — auth/rate-limit/quota/plan-tier
 * resolution mirrors that route exactly; only the "how generation runs"
 * differs (enqueue vs. inline pipeline call).
 */
export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  try {
    await enforceRateLimit(`ai:${session.shop}`);

    const form = await request.formData();
    const prompt = String(form.get('prompt') ?? '').trim();
    if (!prompt) {
      throw new AppError({ code: 'VALIDATION_ERROR', message: 'Please describe what you want to build.' });
    }

    if (!isAsyncJobsEnabled()) {
      return json(
        {
          error: 'ASYNC_DISABLED',
          message: 'Async generation requires JOB_EXECUTION_MODE=queue (Redis configured).',
        },
        { status: 503 },
      );
    }

    // Client-generated per-click id (WS-QF / AI-2 pattern) — reused verbatim
    // as this Job's correlationId so the worker's billing dedupe and (once
    // the poll-route/funnel land) any future retry all key off the same id.
    const correlationId = String(form.get('correlationId') ?? '').trim() || generateCorrelationId();

    const prisma = getPrisma();
    const shopRow = await prisma.shop.upsert({
      where: { shopDomain: session.shop },
      create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
      update: {},
    });

    await new QuotaService().enforce(shopRow.id, 'aiRequest');

    let planTier = shopRow.planTier ?? 'UNKNOWN';
    if (planTier === 'UNKNOWN') {
      planTier = await new CapabilityService().refreshPlanTier(session.shop, admin);
    }

    const jobs = new JobService();
    const job = await jobs.create({
      shopId: shopRow.id,
      type: 'AI_GENERATE',
      correlationId,
      payload: { promptLen: prompt.length, async: true },
    });

    try {
      await enqueueWebJob({
        id: job.id,
        jobType: 'AI_GENERATE',
        payload: {
          kind: 'WEB_AI_GENERATE',
          shopId: shopRow.id,
          shopDomain: session.shop,
          prompt,
          preferredType: String(form.get('preferredType') ?? 'Auto').trim(),
          preferredCategory: String(form.get('preferredCategory') ?? 'Auto').trim(),
          preferredBlockType: String(form.get('preferredBlockType') ?? 'Auto').trim(),
          matchStoreColors: String(form.get('matchStoreColors') ?? 'true').trim() !== 'false',
          // WS-builder-ux: merchant-chosen concept count (Builder's 1/2/3
          // segmented control), clamped to 1..3 (WebAiGenerateJobPayloadSchema
          // re-validates this same range server-side too — defense in depth).
          optionCount: clampOptionCount(form.get('optionCount')),
          planTier,
        },
        trace: { correlationId, shopId: shopRow.id },
        // Billing-safe via the correlationId dedupe seam (C2) — a retried
        // attempt reuses this Job's correlationId, so at most one unit bills
        // regardless of how many of the 2 attempts actually run.
        opts: { attempts: 2 },
      });
    } catch (enqueueErr) {
      // WS-C commit-0 fold-in (c): jobs.create already committed a QUEUED
      // Job row above — if the enqueue itself throws (Redis blip, adapter
      // error), that row is now an orphan nothing will ever pick up or
      // finish, and the client never received a jobId to poll against.
      // Fail it explicitly (typed) rather than leaving a phantom QUEUED
      // job a merchant's poll would hang against forever (D8).
      await jobs.failWithPayload(job.id, {
        error: 'INTERNAL_ERROR',
        message: 'Failed to enqueue the generation job. Please try again.',
        requestId: job.id,
      });
      throw enqueueErr;
    }

    return json({ jobId: job.id, correlationId });
  } catch (e) {
    return toErrorResponse(e);
  }
}
