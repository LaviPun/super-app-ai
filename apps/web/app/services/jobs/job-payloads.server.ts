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
