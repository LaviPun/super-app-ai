import { DeployTargetSchema } from '@superapp/core';
import { RecipeService } from '~/services/recipes/recipe.service';
import { ModuleService } from '~/services/modules/module.service';
import {
  PublishService,
  ModuleNotPublishableError,
  PublishPartialFailureError,
  FunctionKeyAlreadyPublishedError,
} from '~/services/publish/publish.service';
import { provisionModuleDataStore } from '~/services/publish/provision-data-store.server';
import { getThemeEmbedStatus } from '~/services/publish/embed-status.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { AppError } from '~/services/errors/app-error.server';
import { runWithRequestContext } from '~/services/observability/correlation.server';
import { logger } from '~/services/observability/logger.server';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { getPublishJobBudgetMs } from '~/env.server';
import { WebPublishJobPayloadSchema } from '~/services/jobs/job-payloads.server';
import type { WebJobHandler } from '~/services/jobs/worker-runtime.server';
import type { AppErrorPayload } from '~/services/errors/app-error.server';

/** WS-C Task 9 (C7): bounds the Shopify-writing phase so a stuck Admin API
 * call can't hold a BullMQ job (and its WORKER_CONCURRENCY slot) open
 * forever — same principle as the generation/hydrate job budgets, just with
 * no downstream `hints.deadlineAt` to thread it through (PublishService has
 * no LLM calls). A timeout here always resolves to a plain FAILED (never
 * mistaken for a `PublishPartialFailureError`, since we can't safely read
 * back a ledger from a call we walked away from) — republish-is-idempotent
 * (WS-E) still makes the merchant's next attempt converge. */
function withBudget<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Publish job exceeded its ${ms}ms budget.`)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * WS-C Task 9. The async worker handler for `PUBLISH` jobs on the `publish`
 * queue — flag-gated behind `PUBLISH_ASYNC_ENABLED` (C10; the route only
 * ever enqueues here when that flag AND `isAsyncJobsEnabled()` are both on).
 *
 * Mirrors `api.publish.tsx`'s post-preflight body exactly (all pre-checks —
 * validation, plan-tier policy, feature flags, publish-cap — stay in the
 * route, which owns the request's `admin` context and needs to produce
 * immediate 4xx feedback; only the Shopify-writing phase moves here):
 *   PublishService.publish -> provisionModuleDataStore (non-fatal) ->
 *   markPublishedWithTransition (same idempotencyKey the sync path would
 *   have used) -> ActivityLog MODULE_PUBLISHED -> getThemeEmbedStatus
 *   (advisory) -> jobs.succeed.
 *
 * `PublishPartialFailureError` (WS-E finding 4) persists its structured
 * `failedOp`/`completedOps`/`guidance` into `Job.error.details` — the same
 * shape `publishPartialFailureResponse` returns synchronously — so a
 * merchant who published async sees identical "republish is safe" guidance
 * once the poll route (Task 6) surfaces `Job.error` back out.
 *
 * No compensation logic: every op `PublishService` performs is idempotent
 * (WS-E, proven task-by-task) — a republish is always the fix, never a
 * rollback. That is also why the enqueue side uses `attempts: 1`: an
 * automatic BullMQ retry of a partially-applied Shopify write is a decision
 * a human should make (by hitting Publish again), not something the queue
 * does silently on a timer.
 */
export function createPublishJobHandler(): WebJobHandler {
  return async (envelope) => {
    const jobs = new JobService();
    const parsed = WebPublishJobPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      await jobs.failWithPayload(envelope.id, {
        error: 'VALIDATION_ERROR',
        message: 'Publish job payload failed validation.',
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

        // Final-attempt-only terminal FAILED (failFinalOnly parity with
        // ai-generation/ai-hydrate processors). With `opts: { attempts: 1 }`
        // on the enqueue (see doc comment above), every attempt IS the
        // final attempt — this still guards correctly if that ever changes,
        // and keeps the three processors' shape identical for anyone
        // reading them side by side.
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
          const target = DeployTargetSchema.parse(payload.target);

          const version = await prisma.moduleVersion.findUnique({ where: { id: payload.versionId } });
          if (!version || version.moduleId !== payload.moduleId) {
            throw new AppError({ code: 'NOT_FOUND', message: 'Module version not found.' });
          }

          let spec;
          try {
            spec = new RecipeService().parse(version.specJson);
          } catch {
            throw new AppError({ code: 'VALIDATION_ERROR', message: 'Invalid RecipeSpec on version.' });
          }

          const { admin } = await shopify.unauthenticated.admin(payload.shopDomain);

          // ActivityLog attribution: mirrors `markPublishedWithTransition`'s
          // OWN default mapping (source -> actor) so the worker's audit
          // trail says who actually initiated the publish, not that a
          // worker executed it. `markPublishedWithTransition` below is left
          // to apply that same default itself (no explicit `actor:` passed)
          // — this local copy only feeds the two ActivityLogService calls,
          // which have no such built-in default.
          const activityActor: 'MERCHANT' | 'SYSTEM' | 'CRON' =
            payload.source === 'merchant_api' ? 'MERCHANT' : payload.source === 'agent_api' ? 'SYSTEM' : 'CRON';

          const publisher = new PublishService(admin, { shop: payload.shopDomain, shopId: payload.shopId });
          const publishResult = await withBudget(publisher.publish(spec, target), getPublishJobBudgetMs());

          // R3.3 (mirrors api.publish.tsx): non-fatal typed-data
          // provisioning — a DB upsert failure here must never roll back a
          // live extension; the merchant recovers by republishing
          // (idempotent), same as the sync route's policy.
          if (spec.dataModel) {
            try {
              const provisioned = await provisionModuleDataStore(payload.shopId, payload.moduleId, spec.dataModel);
              if (provisioned) {
                await new ActivityLogService().log({
                  actor: activityActor,
                  action: 'DATA_STORE_PROVISIONED',
                  resource: `datastore:${provisioned.storeKey}`,
                  shopId: payload.shopId,
                  details: { moduleId: payload.moduleId, storeKey: provisioned.storeKey },
                });
              }
            } catch (provisionErr) {
              logger.warn('publish job: data-store provisioning failed (non-fatal)', {
                jobId: envelope.id,
                moduleId: payload.moduleId,
                error: provisionErr instanceof Error ? provisionErr.message : String(provisionErr),
              });
            }
          }

          await new ModuleService().markPublishedWithTransition({
            shopId: payload.shopId,
            moduleId: payload.moduleId,
            versionId: payload.versionId,
            targetThemeId: target.kind === 'THEME' ? target.themeId : undefined,
            source: payload.source,
            idempotencyKey: payload.idempotencyKey,
          });

          await new ActivityLogService().log({
            actor: activityActor,
            action: 'MODULE_PUBLISHED',
            resource: `module:${payload.moduleId}`,
            shopId: payload.shopId,
            details: { target: target.kind, versionId: payload.versionId },
          });

          // WS-E finding 5: advisory-only (getThemeEmbedStatus never
          // throws) — a successful publish can never be turned into a
          // reported failure by this check.
          const isThemeModule = spec.type.startsWith('theme.');
          const embedStatus = isThemeModule
            ? await getThemeEmbedStatus(admin, target.kind === 'THEME' ? target.themeId : undefined)
            : undefined;

          const resultPayload = { ok: true as const, ledger: publishResult.ledger, embedStatus };
          await jobs.succeed(envelope.id, resultPayload);
          return { status: 'SUCCESS', result: resultPayload };
        } catch (e) {
          let payloadOut: AppErrorPayload;
          if (e instanceof PublishPartialFailureError) {
            // WS-E finding 4, carried through to the async surface: the
            // exact op that failed + every op that already completed
            // (idempotent) + explicit republish guidance — never degraded
            // to a flat error string, matching `publishPartialFailureResponse`.
            payloadOut = {
              error: 'PUBLISH_ERROR',
              message: e.message,
              requestId: envelope.trace.requestId ?? envelope.id,
              details: {
                failedOp: e.failedOp,
                completedOps: JSON.stringify(e.completed),
                guidance: 'Republish to converge — completed steps are idempotent and will not duplicate.',
              },
            };
          } else if (e instanceof ModuleNotPublishableError) {
            payloadOut = {
              error: 'PUBLISH_ERROR',
              message: e.message,
              requestId: envelope.trace.requestId ?? envelope.id,
              details: { status: e.preflight.status, reasons: JSON.stringify(e.preflight.reasons) },
            };
          } else if (e instanceof FunctionKeyAlreadyPublishedError) {
            payloadOut = {
              error: 'PUBLISH_ERROR',
              message: e.message,
              requestId: envelope.trace.requestId ?? envelope.id,
            };
          } else if (e instanceof AppError) {
            payloadOut = e.toPayload();
          } else {
            payloadOut = {
              error: 'PUBLISH_ERROR',
              message:
                e instanceof Error
                  ? e.message
                  : 'Publish failed unexpectedly. Please try again — republishing is safe.',
              requestId: envelope.trace.requestId ?? envelope.id,
            };
          }
          await failFinalOnly(payloadOut);
          return { status: 'FAILED', result: { error: { message: payloadOut.message } } };
        }
      },
    );
  };
}
