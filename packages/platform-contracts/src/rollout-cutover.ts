import { z } from 'zod';

/** Job execution transport — legacy Remix inline remains default until operators enable queue mode. */
export const JobExecutionModeSchema = z.enum(['inline', 'queue', 'disabled']);
export type JobExecutionMode = z.infer<typeof JobExecutionModeSchema>;

/**
 * Single high-level switch for which API/job backend serves the platform.
 * - `cloudflare`: the CF Worker serves /v1 (Fastify stays gated); queue execution.
 * - `fastify`: Fastify serves /v1 with BullMQ; queue execution.
 * Individual flags (FASTIFY_API_ENABLED, JOB_EXECUTION_MODE) still override the
 * preset when set explicitly. Unset preserves legacy behavior (inline Remix).
 */
export const PlatformBackendSchema = z.enum(['cloudflare', 'fastify']);
export type PlatformBackend = z.infer<typeof PlatformBackendSchema>;

export function parsePlatformBackend(env: NodeJS.ProcessEnv = process.env): PlatformBackend | undefined {
  const parsed = PlatformBackendSchema.safeParse(env.PLATFORM_BACKEND?.trim().toLowerCase());
  return parsed.success ? parsed.data : undefined;
}

export const PlatformV2RolloutFlagsSchema = z.object({
  platformBackend: PlatformBackendSchema.optional(),
  frontendNextEnabled: z.boolean(),
  fastifyApiEnabled: z.boolean(),
  shopifyEmbeddedNextCutoverEnabled: z.boolean(),
  jobExecutionMode: JobExecutionModeSchema,
  aiGenerationAsyncEnabled: z.boolean(),
  aiGenerationStreamViaQueueEnabled: z.boolean(),
  flowAsyncEnabled: z.boolean(),
  webhookAsyncEnabled: z.boolean(),
  connectorWorkerEnabled: z.boolean(),
  publishWorkerEnabled: z.boolean(),
  previewSandboxEnabled: z.boolean(),
  intentGraphEnabled: z.boolean(),
});
export type PlatformV2RolloutFlags = z.infer<typeof PlatformV2RolloutFlagsSchema>;

export const PLATFORM_V2_ROLLOUT_ENV_KEYS = {
  PLATFORM_BACKEND: 'PLATFORM_BACKEND',
  FRONTEND_NEXT_ENABLED: 'FRONTEND_NEXT_ENABLED',
  FASTIFY_API_ENABLED: 'FASTIFY_API_ENABLED',
  SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED: 'SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED',
  JOB_EXECUTION_MODE: 'JOB_EXECUTION_MODE',
  AI_GENERATION_ASYNC_ENABLED: 'AI_GENERATION_ASYNC_ENABLED',
  AI_GENERATION_STREAM_VIA_QUEUE_ENABLED: 'AI_GENERATION_STREAM_VIA_QUEUE_ENABLED',
  FLOW_ASYNC_ENABLED: 'FLOW_ASYNC_ENABLED',
  WEBHOOK_ASYNC_ENABLED: 'WEBHOOK_ASYNC_ENABLED',
  CONNECTOR_WORKER_ENABLED: 'CONNECTOR_WORKER_ENABLED',
  PUBLISH_WORKER_ENABLED: 'PUBLISH_WORKER_ENABLED',
  PREVIEW_SANDBOX_ENABLED: 'PREVIEW_SANDBOX_ENABLED',
  INTENT_GRAPH_ENABLED: 'INTENT_GRAPH_ENABLED',
} as const;

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function readBooleanFlag(env: NodeJS.ProcessEnv, key: string, defaultValue = false): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return TRUTHY.has(raw);
}

export function parsePlatformV2RolloutFlags(env: NodeJS.ProcessEnv = process.env): PlatformV2RolloutFlags {
  const platformBackend = parsePlatformBackend(env);
  const jobExecutionMode = JobExecutionModeSchema.safeParse(env.JOB_EXECUTION_MODE?.trim());
  const jobExecutionModeDefault: JobExecutionMode = platformBackend ? 'queue' : 'inline';
  return PlatformV2RolloutFlagsSchema.parse({
    platformBackend,
    frontendNextEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.FRONTEND_NEXT_ENABLED, false),
    fastifyApiEnabled: readBooleanFlag(
      env,
      PLATFORM_V2_ROLLOUT_ENV_KEYS.FASTIFY_API_ENABLED,
      platformBackend === 'fastify',
    ),
    shopifyEmbeddedNextCutoverEnabled: readBooleanFlag(
      env,
      PLATFORM_V2_ROLLOUT_ENV_KEYS.SHOPIFY_EMBEDDED_NEXT_CUTOVER_ENABLED,
      false,
    ),
    jobExecutionMode: jobExecutionMode.success ? jobExecutionMode.data : jobExecutionModeDefault,
    aiGenerationAsyncEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.AI_GENERATION_ASYNC_ENABLED, false),
    aiGenerationStreamViaQueueEnabled: readBooleanFlag(
      env,
      PLATFORM_V2_ROLLOUT_ENV_KEYS.AI_GENERATION_STREAM_VIA_QUEUE_ENABLED,
      false,
    ),
    flowAsyncEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.FLOW_ASYNC_ENABLED, false),
    webhookAsyncEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.WEBHOOK_ASYNC_ENABLED, false),
    connectorWorkerEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.CONNECTOR_WORKER_ENABLED, false),
    publishWorkerEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.PUBLISH_WORKER_ENABLED, false),
    previewSandboxEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.PREVIEW_SANDBOX_ENABLED, false),
    intentGraphEnabled: readBooleanFlag(env, PLATFORM_V2_ROLLOUT_ENV_KEYS.INTENT_GRAPH_ENABLED, false),
  });
}

/** Paths that may be served by the Next.js V2 frontend when `frontendNextEnabled` is on. */
export const NEXT_INTERNAL_ROUTE_PREFIXES = [
  '/internal/ai-assistant',
  '/internal/jobs',
  '/internal/data',
  '/internal/monitoring',
  '/internal/configuration',
] as const;

export const NEXT_MERCHANT_ROUTE_PREFIXES = ['/modules', '/jobs', '/settings', '/billing', '/data', '/advanced'] as const;

export type RemixTrafficTarget = 'remix' | 'next-frontend' | 'fastify-api';

export function resolveRemixTrafficTarget(input: {
  pathname: string;
  flags: PlatformV2RolloutFlags;
  isEmbeddedMerchantSurface?: boolean;
}): RemixTrafficTarget {
  const { pathname, flags, isEmbeddedMerchantSurface = false } = input;

  if (flags.fastifyApiEnabled && pathname.startsWith('/api/v2')) {
    return 'fastify-api';
  }

  if (flags.frontendNextEnabled) {
    const internalMatch = NEXT_INTERNAL_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (internalMatch) return 'next-frontend';
  }

  if (flags.shopifyEmbeddedNextCutoverEnabled && isEmbeddedMerchantSurface) {
    const merchantMatch = NEXT_MERCHANT_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (merchantMatch) return 'next-frontend';
  }

  return 'remix';
}

export function shouldExposeFastifyV1Routes(flags: PlatformV2RolloutFlags): boolean {
  return flags.fastifyApiEnabled;
}

export function shouldRunPublishWorker(flags: PlatformV2RolloutFlags): boolean {
  return flags.publishWorkerEnabled && flags.jobExecutionMode === 'queue';
}
