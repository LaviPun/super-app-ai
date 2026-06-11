import {
  createCloudflareQueueAdapter,
  createJobOrchestrator,
  loadJobOrchestratorConfigFromRecord,
  type JobOrchestrator,
} from '@superapp/job-orchestration';
import {
  CLOUDFLARE_QUEUE_BINDING_BY_QUEUE,
  type PlatformQueueName,
} from '@superapp/platform-contracts';
import { createApiInlineHandlers } from './inline-handlers.js';

export type ApiRuntimeEnv = {
  JOB_EXECUTION_MODE?: string;
  PLATFORM_V2_ENABLED?: string;
  QUEUE_REDIS_URL?: string;
  REDIS_URL?: string;
  QUEUE_PREFIX?: string;
  QUEUE_DEFAULT_ATTEMPTS?: string;
  QUEUE_DEFAULT_BACKOFF_MS?: string;
  LOCAL_STORAGE_PATH?: string;
  R2_BUCKET_NAME?: string;
  ASSETS?: R2Bucket;
  ASSET_STORAGE_QUEUE?: Queue;
  AI_GENERATION_QUEUE?: Queue;
  FLOW_QUEUE?: Queue;
  CONNECTOR_QUEUE?: Queue;
  PUBLISH_QUEUE?: Queue;
  WEBHOOK_QUEUE?: Queue;
  RETENTION_QUEUE?: Queue;
};

function extractCloudflareQueueBindings(env: ApiRuntimeEnv) {
  const bindings: Partial<Record<PlatformQueueName, Queue>> = {};

  for (const [queueName, bindingKey] of Object.entries(CLOUDFLARE_QUEUE_BINDING_BY_QUEUE)) {
    const queue = env[bindingKey as keyof ApiRuntimeEnv];
    if (queue && typeof queue === 'object' && 'send' in queue) {
      bindings[queueName as PlatformQueueName] = queue as Queue;
    }
  }

  return bindings;
}

function toConfigRecord(env: ApiRuntimeEnv): Record<string, string | undefined> {
  return {
    JOB_EXECUTION_MODE: env.JOB_EXECUTION_MODE,
    PLATFORM_V2_ENABLED: env.PLATFORM_V2_ENABLED,
    QUEUE_REDIS_URL: env.QUEUE_REDIS_URL,
    REDIS_URL: env.REDIS_URL,
    QUEUE_PREFIX: env.QUEUE_PREFIX,
    QUEUE_DEFAULT_ATTEMPTS: env.QUEUE_DEFAULT_ATTEMPTS,
    QUEUE_DEFAULT_BACKOFF_MS: env.QUEUE_DEFAULT_BACKOFF_MS,
  };
}

export function createApiJobOrchestrator(env: ApiRuntimeEnv = process.env): JobOrchestrator {
  const config = loadJobOrchestratorConfigFromRecord(toConfigRecord(env));
  const cfBindings = extractCloudflareQueueBindings(env);
  const hasCloudflareQueues = Object.keys(cfBindings).length > 0;
  const queueAdapter =
    config.mode === 'queue' && hasCloudflareQueues
      ? createCloudflareQueueAdapter(cfBindings)
      : undefined;

  const effectiveConfig =
    queueAdapter && !config.queueRedisUrl ? { ...config, mode: 'queue' as const } : config;

  return createJobOrchestrator({
    config: effectiveConfig,
    inlineHandlers: createApiInlineHandlers(env),
    queueAdapter,
    externalQueueAvailable: hasCloudflareQueues,
  });
}
