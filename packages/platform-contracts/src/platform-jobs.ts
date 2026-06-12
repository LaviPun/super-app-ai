import { z } from 'zod';
import { ASSET_STORAGE_QUEUE, IMAGE_WORKER_JOB_TYPES } from './image-worker-jobs.js';

export const PLATFORM_QUEUES = [
  ASSET_STORAGE_QUEUE,
  'ai-generation',
  'flow',
  'connector',
  'publish',
  'webhook',
  'retention',
] as const;

export const PlatformQueueNameSchema = z.enum(PLATFORM_QUEUES);
export type PlatformQueueName = z.infer<typeof PlatformQueueNameSchema>;

export const PlatformJobTypeSchema = z.enum([
  ...IMAGE_WORKER_JOB_TYPES,
  'AI_GENERATE',
  'AI_HYDRATE',
  'AI_MODIFY',
  'PUBLISH',
  'ROLLBACK',
  'CONNECTOR_TEST',
  'CONNECTOR_SYNC',
  'FLOW_RUN',
  'WEBHOOK_PROCESS',
  'THEME_ANALYZE',
  'RETENTION',
]);

export type PlatformJobType = z.infer<typeof PlatformJobTypeSchema>;

export const PLATFORM_JOB_QUEUE_BY_TYPE: Record<PlatformJobType, PlatformQueueName> = {
  IMAGE_INGESTION: ASSET_STORAGE_QUEUE,
  PREVIEW_EXPORT: ASSET_STORAGE_QUEUE,
  ASSET_CLEANUP: ASSET_STORAGE_QUEUE,
  AI_GENERATE: 'ai-generation',
  AI_HYDRATE: 'ai-generation',
  AI_MODIFY: 'ai-generation',
  PUBLISH: 'publish',
  ROLLBACK: 'publish',
  CONNECTOR_TEST: 'connector',
  CONNECTOR_SYNC: 'connector',
  FLOW_RUN: 'flow',
  WEBHOOK_PROCESS: 'webhook',
  THEME_ANALYZE: ASSET_STORAGE_QUEUE,
  RETENTION: 'retention',
};

export const PLATFORM_QUEUE_REGISTRY = {
  queues: PLATFORM_QUEUES,
  jobTypes: PlatformJobTypeSchema.options,
  queueByType: PLATFORM_JOB_QUEUE_BY_TYPE,
} as const;

/** Wrangler producer binding names keyed by platform queue. */
export const CLOUDFLARE_QUEUE_BINDING_BY_QUEUE: Record<PlatformQueueName, string> = {
  'asset-storage': 'ASSET_STORAGE_QUEUE',
  'ai-generation': 'AI_GENERATION_QUEUE',
  flow: 'FLOW_QUEUE',
  connector: 'CONNECTOR_QUEUE',
  publish: 'PUBLISH_QUEUE',
  webhook: 'WEBHOOK_QUEUE',
  retention: 'RETENTION_QUEUE',
};

export function resolvePlatformQueue(jobType: PlatformJobType): PlatformQueueName {
  return PLATFORM_JOB_QUEUE_BY_TYPE[jobType];
}

export function isPlatformJobType(value: string): value is PlatformJobType {
  return PlatformJobTypeSchema.safeParse(value).success;
}

export const JobTraceSchema = z.object({
  requestId: z.string().optional(),
  correlationId: z.string().min(1),
  shopId: z.string().optional(),
});

export type JobTrace = z.infer<typeof JobTraceSchema>;

export const JobEnvelopeSchema = z.object({
  id: z.string().min(1),
  queueName: PlatformQueueNameSchema,
  jobType: PlatformJobTypeSchema,
  payload: z.unknown(),
  trace: JobTraceSchema,
});

export type JobEnvelope = z.infer<typeof JobEnvelopeSchema>;

/**
 * Event emitted by platform-queue (Cloudflare) workers. Distinct from the
 * legacy BullMQ `WorkerEvent` in `jobs.ts`, which uses the incompatible
 * `QueueName` enum.
 */
export const PlatformWorkerEventSchema = z.object({
  type: z.enum(['JOB_STARTED', 'JOB_PROGRESS', 'JOB_COMPLETED', 'JOB_FAILED']),
  jobId: z.string().min(1),
  queueName: PlatformQueueNameSchema,
  trace: JobTraceSchema,
  timestamp: z.string().datetime(),
  progress: z.number().min(0).max(100),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type PlatformWorkerEvent = z.infer<typeof PlatformWorkerEventSchema>;
