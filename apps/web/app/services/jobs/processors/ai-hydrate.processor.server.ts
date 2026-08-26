import { RecipeSpecSchema } from '@superapp/core';
import { AppError } from '~/services/errors/app-error.server';
import { runWithRequestContext } from '~/services/observability/correlation.server';
import { logger } from '~/services/observability/logger.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { hydrateRecipeSpec, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { getHydrateJobBudgetMs } from '~/env.server';
import { WebAiHydrateJobPayloadSchema } from '~/services/jobs/job-payloads.server';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';
import type { AppErrorPayload } from '~/services/errors/app-error.server';

/**
 * WS-C Task 8. The async worker handler for `AI_HYDRATE` jobs. Shares the
 * `ai-generation` queue with `AI_GENERATE` (`PLATFORM_JOB_QUEUE_BY_TYPE`
 * maps both there — one Worker per queue, Task 1's `processors/index.ts`
 * dispatches on `envelope.jobType`).
 *
 * Mirrors `api.ai.hydrate-module.tsx`'s post-Job-create body exactly
 * (hydrateRecipeSpec -> moduleVersion.update -> jobs.succeed) with one
 * difference: the RecipeSpec is re-read from `moduleVersion.specJson` here
 * rather than trusted off the queue payload — the DB row is the only source
 * of truth (the route already validated it once before enqueueing, but a
 * merchant could edit the draft again before the worker picks the job up).
 *
 * Billing (C8): `billingKey: hydrate:<jobId>` — stable across BullMQ retries
 * (same job id), so a retried attempt's successful write sees
 * `hasBilledUnit` already true and claims 0; a failed attempt always bills 0
 * regardless (the merchant got nothing from it).
 *
 * Final-attempt-only terminal FAILED (review fix, parity with
 * `ai-generation.processor.server.ts`'s `failFinalOnly`): with `attempts: 2`
 * on the enqueue, an attempt-1 failure must NOT write `Job.status = FAILED`
 * — `pollJobUntilTerminal`'s `isTerminal` check would stop polling for good
 * and the client would show a false "Hydration failed" while BullMQ quietly
 * retries (and may still succeed). Only the final attempt writes the typed
 * terminal failure; a non-final attempt just marks the stage 'retrying' and
 * leaves the Job row RUNNING (from `jobs.start` above) for the retry to
 * pick up. Either way the handler still returns `{ status: 'FAILED' }` so
 * the worker runtime throws and BullMQ always counts + retries the attempt.
 */
export function createAiHydrateJobHandler(): WebJobHandler {
  return async (envelope) => {
    const jobs = new JobService();
    const parsed = WebAiHydrateJobPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      await jobs.failWithPayload(envelope.id, {
        error: 'VALIDATION_ERROR',
        message: 'Hydrate job payload failed validation.',
        requestId: envelope.trace.requestId ?? envelope.id,
        details: { issues: JSON.stringify(parsed.error.flatten()) },
      });
      return { status: 'FAILED', result: { error: { message: 'invalid payload' } } };
    }
    const payload = parsed.data;

    return runWithRequestContext(
      {
        correlationId: payload.trace.correlationId,
        requestId: payload.trace.requestId,
        shopDomain: payload.shopDomain,
        actor: 'WORKER',
      },
      async () => {
        const prisma = getPrisma();
        await jobs.start(envelope.id);

        const failFinalOnly = async (payloadOut: AppErrorPayload) => {
          if (envelope.isFinalAttempt) {
            await jobs.failWithPayload(envelope.id, payloadOut);
          } else {
            await jobs.setStage(envelope.id, 'retrying');
            logger.warn('non-final attempt failed — leaving Job non-terminal for retry', {
              jobId: envelope.id,
              error: payloadOut.error,
            });
          }
        };

        try {
          const version = await prisma.moduleVersion.findUnique({ where: { id: payload.versionId } });
          if (!version || version.moduleId !== payload.moduleId) {
            throw new AppError({ code: 'NOT_FOUND', message: 'Module version not found.' });
          }

          let recipeSpec;
          try {
            recipeSpec = RecipeSpecSchema.parse(JSON.parse(version.specJson));
          } catch {
            throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid RecipeSpec on version.' });
          }

          const envelopeResult = await hydrateRecipeSpec(recipeSpec, {
            shopId: payload.shopId,
            deadlineAt: Date.now() + getHydrateJobBudgetMs(),
            billingKey: `hydrate:${envelope.id}`,
          });

          const hydratedAt = new Date();
          await prisma.moduleVersion.update({
            where: { id: version.id },
            data: {
              hydratedAt,
              adminConfigSchemaJson: JSON.stringify(envelopeResult.adminConfig),
              adminDefaultsJson: JSON.stringify(envelopeResult.adminConfig.defaults),
              themeEditorSettingsJson: JSON.stringify(envelopeResult.themeEditorSettings),
              uiTokensJson: envelopeResult.uiTokens ? JSON.stringify(envelopeResult.uiTokens) : null,
              validationReportJson: JSON.stringify(envelopeResult.validationReport),
              implementationPlanJson: envelopeResult.implementationPlan
                ? JSON.stringify(envelopeResult.implementationPlan)
                : null,
              previewHtmlJson: envelopeResult.previewHtml ?? null,
            },
          });

          await jobs.succeed(envelope.id, { validationOverall: envelopeResult.validationReport.overall });
          return { status: 'SUCCESS', result: { validationOverall: envelopeResult.validationReport.overall } };
        } catch (e) {
          const payloadOut: AppErrorPayload =
            e instanceof AiProviderNotConfiguredError
              ? { error: 'AI_PROVIDER_NOT_CONFIGURED', message: e.message, requestId: envelope.id }
              : e instanceof AppError
                ? e.toPayload()
                : {
                    error: 'INTERNAL_ERROR',
                    message: 'Hydration failed unexpectedly. Please try again — a retry will not double-bill.',
                    requestId: envelope.id,
                  };
          await failFinalOnly(payloadOut);
          return { status: 'FAILED', result: { error: { message: payloadOut.message } } };
        }
      },
    );
  };
}
