import { AppError } from '~/services/errors/app-error.server';
import { runWithRequestContext } from '~/services/observability/correlation.server';
import { logger } from '~/services/observability/logger.server';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { runGenerationPipeline } from '~/services/ai/generation-pipeline.server';
import { AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { finalizeGenerationJob } from '~/services/ai/generation-outcome.server';
import { getGenerationJobBudgetMs } from '~/env.server';
import { WebAiGenerateJobPayloadSchema } from '~/services/jobs/job-payloads.server';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';
import type { AppErrorPayload } from '~/services/errors/app-error.server';

type PersistOptionInput = {
  index: number;
  approach: string;
  option?: {
    explanation: string;
    recipe: unknown;
    generationMode?: string;
    qaSummary?: { issueIds?: string[] };
  };
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
      // Malformed payloads never become valid on retry. Correction (WS-C
      // final review, MINOR-1): returning `{status:'FAILED'}` here does NOT
      // avoid burning attempts — worker-runtime.server.ts throws on ANY
      // FAILED result, so BullMQ still retries up to the queue's attempts
      // cap regardless. What actually makes that harmless: the Job row is
      // already terminal FAILED (via failWithPayload above) before we
      // return, so every retry's processor run just re-hits this same guard
      // and re-writes the SAME terminal payload — an idempotent no-op, not
      // a fresh attempt at generation.
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
            // Task 15: non-autofixed QA issue ids from this option's final gate
            // pass, feeding qa-telemetry.service.ts aggregation + the ops
            // promote-to-blocking loop.
            qaIssuesJson: o.option?.qaSummary?.issueIds?.length
              ? JSON.stringify(o.option.qaSummary.issueIds)
              : null,
            error: o.error ?? null,
          };
          await prisma.aiGenerationOption.upsert({
            where: { jobId_idx: { jobId: envelope.id, idx: o.index } },
            create: { jobId: envelope.id, shopId: payload.shopId, idx: o.index, approach: o.approach, ...data },
            update: data,
          });
        };

        // WS-C commit-0 fold-in (b): a non-final attempt's failure must NOT
        // present as terminally FAILED to the poll route (Task 6) — BullMQ
        // is about to retry this same job. The typed `failWithPayload`
        // (terminal Job.status=FAILED) write only happens on the attempt
        // that will not be retried; a non-final attempt just marks the
        // stage so ops/the funnel can see a retry is in flight, and leaves
        // the Job row in its current non-terminal state (still RUNNING from
        // `jobs.start` above). Either way the handler still returns
        // `{ status: 'FAILED' }` — the worker runtime throws on that, so
        // BullMQ always counts + retries the attempt regardless of what got
        // written to the Job row.
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
                // WS-C commit-0 fold-in (a): best-effort telemetry write, not
                // load-bearing pipeline work — a transient DB blip here must
                // never kill an otherwise-healthy generation job.
                try {
                  await jobs.updatePayload(envelope.id, {
                    classifiedType: frame.moduleType,
                    intent: frame.intent,
                    exemplarTier: frame.exemplarTier ?? null,
                    exemplarTemplateId: frame.exemplarTemplateId ?? null,
                  });
                } catch (err) {
                  logger.warn('onIntent telemetry write failed — generation continues', {
                    jobId: envelope.id,
                    error: err instanceof Error ? err.message : String(err),
                  });
                }
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
            const payloadOut: AppErrorPayload = {
              error: 'NO_VALID_OPTIONS',
              message: `${terminal.message} Please try again — this attempt was not billed.`,
              requestId: payload.trace.requestId ?? envelope.id,
            };
            await failFinalOnly(payloadOut);
            return { status: 'FAILED', result: { error: { message: terminal.message } } };
          }
          return { status: 'SUCCESS', result: { optionCount: result.validCount } };
        } catch (e) {
          const payloadOut: AppErrorPayload =
            e instanceof AiProviderNotConfiguredError
              ? { error: 'AI_PROVIDER_NOT_CONFIGURED', message: e.message, requestId: envelope.id }
              : e instanceof AppError
                ? e.toPayload()
                : {
                    error: 'INTERNAL_ERROR',
                    message: 'Generation failed unexpectedly. Please try again — a retry will not double-bill.',
                    requestId: envelope.id,
                  };
          await failFinalOnly(payloadOut);
          return { status: 'FAILED', result: { error: { message: payloadOut.message } } };
        }
      },
    );
  };
}
