import { AppError } from '~/services/errors/app-error.server';
import { runWithRequestContext } from '~/services/observability/correlation.server';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { runGenerationPipeline } from '~/services/ai/generation-pipeline.server';
import { AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import { getGenerationJobBudgetMs } from '~/env.server';
import { WebAiGenerateJobPayloadSchema } from '~/services/jobs/job-payloads.server';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';

type PersistOptionInput = {
  index: number;
  approach: string;
  option?: { explanation: string; recipe: unknown; generationMode?: string };
  error?: string;
};

/**
 * WS-C Task 5. The async worker handler for `AI_GENERATE` jobs on the
 * `ai-generation` queue. Runs the SAME `runGenerationPipeline` (Task 4) the
 * inline SSE route drives, wiring its hooks to persist each option to
 * `AiGenerationOption` as it validates — a dropped client connection just
 * re-fetches state via the poll route (Task 6); nothing re-runs, nothing
 * re-bills (billing dedupe rides `payload.trace.correlationId`, stable
 * across BullMQ retries, through the existing `seedBillingStateForCorrelation`
 * seam inside `generateValidatedRecipeOptionsStream` — untouched by this
 * task, per the controller's ruling).
 */
export function createAiGenerationJobHandler(): WebJobHandler {
  return async (envelope) => {
    const jobs = new JobService();
    const parsed = WebAiGenerateJobPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      await jobs.failWithPayload(envelope.id, {
        error: 'VALIDATION_ERROR',
        message: 'Generation job payload failed validation.',
        requestId: envelope.trace.requestId ?? envelope.id,
        details: { issues: JSON.stringify(parsed.error.flatten()) },
      });
      // Malformed payloads never become valid on retry — report FAILED
      // without throwing so BullMQ's attempts cap (not an infinite loop)
      // bounds it; the queue attempts:2 policy still applies at the
      // enqueue side, this just avoids burning both attempts on a payload
      // that will fail identically both times.
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
        await jobs.setStage(envelope.id, 'classifying');
        const { admin } = await shopify.unauthenticated.admin(payload.shopDomain);
        const deadlineAt = Date.now() + getGenerationJobBudgetMs();

        const persistOption = async (o: PersistOptionInput) => {
          const data = {
            status: o.option ? 'VALID' : 'FAILED',
            explanation: o.option?.explanation ?? null,
            recipeJson: o.option ? JSON.stringify(o.option.recipe) : null,
            generationMode: o.option?.generationMode ?? null,
            // Task 15 populates this from OptionQaSummary.issueIds once that
            // field exists; qaSummary today only carries fails/warns/autofixes
            // counts, so there is nothing to persist here yet.
            qaIssuesJson: null,
            error: o.error ?? null,
          };
          await prisma.aiGenerationOption.upsert({
            where: { jobId_idx: { jobId: envelope.id, idx: o.index } },
            create: { jobId: envelope.id, shopId: payload.shopId, idx: o.index, approach: o.approach, ...data },
            update: data,
          });
        };

        try {
          let recommendedIndex: number | null = null;
          const result = await runGenerationPipeline(
            {
              shopId: payload.shopId,
              shopDomain: payload.shopDomain,
              prompt: payload.prompt,
              preferredType: payload.preferredType,
              preferredCategory: payload.preferredCategory,
              preferredBlockType: payload.preferredBlockType,
              matchStoreColors: payload.matchStoreColors,
              optionCount: payload.optionCount,
              correlationId: payload.trace.correlationId,
              planTier: payload.planTier,
              admin,
              deadlineAt,
            },
            {
              onStage: async (stage) => {
                await jobs.setStage(envelope.id, stage);
              },
              // Parity with the stream route's WS-C commit-0 fold-in (b):
              // jobs.create (in api.ai.generate-async.tsx) also runs before
              // classify, so this is the only place the async path's
              // classifiedType/intent/exemplar metadata becomes durable —
              // the funnel spine (Task 13) reads it back off Job.payload.
              onIntent: async (frame) => {
                await jobs.updatePayload(envelope.id, {
                  classifiedType: frame.moduleType,
                  intent: frame.intent,
                  exemplarTier: frame.exemplarTier ?? null,
                  exemplarTemplateId: frame.exemplarTemplateId ?? null,
                });
              },
              onOption: (o) => persistOption({ index: o.index, approach: o.approach, option: o.option }),
              onOptionFailed: (o) => persistOption({ index: o.index, approach: o.approach, error: o.error }),
              onRanking: async (r) => {
                recommendedIndex = r.recommendedIndex;
                for (const s of r.scores) {
                  await prisma.aiGenerationOption.updateMany({
                    where: { jobId: envelope.id, idx: s.index },
                    data: { score: s.score, badgesJson: JSON.stringify(s.badges) },
                  });
                }
              },
              // No HTTP client to disconnect on the worker side — the job
              // always runs to completion (or its own budget/throw path).
              isAborted: () => false,
            },
          );

          const terminal = await finalizeGenerationJob(jobs, envelope.id, result.validCount, {
            type: result.moduleType,
            recommendedIndex,
            async: true,
          });
          if (terminal.kind === 'failed') {
            await jobs.failWithPayload(envelope.id, {
              error: 'NO_VALID_OPTIONS',
              message: `${terminal.message} Please try again — this attempt was not billed.`,
              requestId: payload.trace.requestId ?? envelope.id,
            });
            return { status: 'FAILED', result: { error: { message: terminal.message } } };
          }
          return { status: 'SUCCESS', result: { optionCount: result.validCount } };
        } catch (e) {
          const payloadOut =
            e instanceof AiProviderNotConfiguredError
              ? { error: 'AI_PROVIDER_NOT_CONFIGURED' as const, message: e.message, requestId: envelope.id }
              : e instanceof AppError
                ? e.toPayload()
                : {
                    error: 'INTERNAL_ERROR' as const,
                    message: 'Generation failed unexpectedly. Please try again — a retry will not double-bill.',
                    requestId: envelope.id,
                  };
          await jobs.failWithPayload(envelope.id, payloadOut);
          return { status: 'FAILED', result: { error: { message: payloadOut.message } } };
        }
      },
    );
  };
}
