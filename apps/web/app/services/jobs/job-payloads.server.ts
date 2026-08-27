import { z } from 'zod';
import { JobTraceSchema } from '@superapp/platform-contracts';

/**
 * WS-C Task 5. BullMQ job payload schemas for `apps/web`'s own async jobs.
 *
 * Dual job-queue naming rule (project memory): these names are DISTINCT from
 * the V2 Cloudflare-worker contracts in `packages/platform-contracts/src/jobs.ts`
 * (e.g. `AiGeneratePayloadSchema`) — never reuse or shadow those. The web-side
 * schemas are the only ones `createWebWorkerRuntime`/`enqueueWebJob` (Task 1)
 * ever see.
 */
export const WebAiGenerateJobPayloadSchema = z.object({
  kind: z.literal('WEB_AI_GENERATE'),
  shopId: z.string().min(1),
  shopDomain: z.string().min(1),
  prompt: z.string().min(1),
  preferredType: z.string().default('Auto'),
  preferredCategory: z.string().default('Auto'),
  preferredBlockType: z.string().default('Auto'),
  matchStoreColors: z.boolean().default(true),
  optionCount: z.number().int().min(1).max(3).default(3),
  planTier: z.string().default('UNKNOWN'),
  // Embedded by enqueueWebJob (trace-in-payload, C3) — rebuilt into
  // envelope.trace by createWebWorkerRuntime, but also parsed here so a
  // handler that only has `envelope.payload` (as BullMQ actually delivers
  // it) can still recover it directly off the validated payload.
  trace: JobTraceSchema,
});
export type WebAiGenerateJobPayload = z.infer<typeof WebAiGenerateJobPayloadSchema>;

/**
 * WS-C Task 8. `AI_HYDRATE` shares the `ai-generation` queue with
 * `AI_GENERATE` (PLATFORM_JOB_QUEUE_BY_TYPE maps both there — one Worker per
 * queue, Task 1). The RecipeSpec itself is deliberately NOT carried in the
 * payload: the worker re-reads `moduleVersion.specJson` fresh from the DB
 * (the only source of truth) instead of trusting a possibly-stale queue copy.
 */
export const WebAiHydrateJobPayloadSchema = z.object({
  kind: z.literal('WEB_AI_HYDRATE'),
  shopId: z.string().min(1),
  shopDomain: z.string().min(1),
  moduleId: z.string().min(1),
  versionId: z.string().min(1),
  moduleType: z.string().min(1),
  trace: JobTraceSchema,
});
export type WebAiHydrateJobPayload = z.infer<typeof WebAiHydrateJobPayloadSchema>;

/**
 * WS-C Task 9 (flag-gated behind `PUBLISH_ASYNC_ENABLED`, C10). `target` is
 * carried as `z.unknown()` here and re-validated in the processor via
 * `DeployTargetSchema` (`@superapp/core`) — the queue payload is never
 * trusted verbatim for a Shopify-writing decision. Likewise the RecipeSpec
 * itself is NOT carried: the worker re-reads `moduleVersion.specJson` fresh
 * from the DB (same "DB is the source of truth" rule Task 8 established for
 * hydrate). `idempotencyKey` is computed once in the route (before enqueue)
 * and passed through unchanged so `markPublishedWithTransition` sees the
 * SAME key the inline path would have used for this exact
 * shop/module/version/target combination.
 */
export const WebPublishJobPayloadSchema = z.object({
  kind: z.literal('WEB_PUBLISH'),
  shopId: z.string().min(1),
  shopDomain: z.string().min(1),
  moduleId: z.string().min(1),
  versionId: z.string().min(1),
  target: z.unknown(),
  source: z.enum(['merchant_api', 'agent_api', 'system']),
  idempotencyKey: z.string().min(8),
  trace: JobTraceSchema,
});
export type WebPublishJobPayload = z.infer<typeof WebPublishJobPayloadSchema>;
