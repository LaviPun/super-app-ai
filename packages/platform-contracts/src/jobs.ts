import { z } from 'zod';

/** Job types from Platform V2 migration plan § Phase 2 / Phase 5 */
export const JobTypeSchema = z.enum([
  'AI_GENERATE',
  'AI_HYDRATE',
  'AI_MODIFY',
  'INTERNAL_TOOL_RUN',
  'PUBLISH',
  'CONNECTOR_TEST',
  'CONNECTOR_CALL',
  'FLOW_RUN',
  'WEBHOOK_RECEIVED',
  'THEME_ANALYZE',
  'RETENTION_RUN',
]);

export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED']);

export type JobStatus = z.infer<typeof JobStatusSchema>;

export const QueueNameSchema = z.enum([
  'ai-generation',
  'internal-tool-run',
  'flow-execution',
  'webhook-processing',
  'connector-execution',
  'publish-execution',
  'theme-analyze',
  'retention',
]);

export type QueueName = z.infer<typeof QueueNameSchema>;

export const JobTypeQueueName = {
  AI_GENERATE: 'ai-generation',
  AI_HYDRATE: 'ai-generation',
  AI_MODIFY: 'ai-generation',
  INTERNAL_TOOL_RUN: 'internal-tool-run',
  PUBLISH: 'publish-execution',
  CONNECTOR_TEST: 'connector-execution',
  CONNECTOR_CALL: 'connector-execution',
  FLOW_RUN: 'flow-execution',
  WEBHOOK_RECEIVED: 'webhook-processing',
  THEME_ANALYZE: 'theme-analyze',
  RETENTION_RUN: 'retention',
} as const satisfies Record<JobType, QueueName>;

export const TraceContextSchema = z.object({
  requestId: z.string().min(1).optional(),
  correlationId: z.string().min(1),
  shopId: z.string().min(1).optional(),
  /** W3C traceparent for OpenTelemetry propagation across queue boundaries. */
  traceparent: z.string().min(1).optional(),
  tracestate: z.string().optional(),
});

export type TraceContext = z.infer<typeof TraceContextSchema>;

export const IdempotencyKeySchema = z.string().min(8).max(128);

export const AiGeneratePayloadSchema = z.object({
  prompt: z.string().min(1),
  moduleTypeHint: z.string().optional(),
  catalogId: z.string().optional(),
});

export const AiHydratePayloadSchema = z.object({
  moduleId: z.string().min(1),
  sourceSpec: z.record(z.unknown()).optional(),
});

export const AiModifyPayloadSchema = z.object({
  moduleId: z.string().min(1),
  instruction: z.string().min(1),
});

export const InternalToolRunPayloadSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  target: z.enum(['localMachine', 'modalRemote']).default('localMachine'),
  clientRequestId: z.string().trim().min(8).max(120).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
});

export const PublishPayloadSchema = z.object({
  moduleId: z.string().min(1),
  versionId: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
});

export const ConnectorHttpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const ConnectorTestPayloadSchema = z
  .object({
    connectorId: z.string().min(1),
    shopDomain: z.string().min(1).optional(),
    endpointId: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    method: ConnectorHttpMethodSchema.optional(),
    headers: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.endpointId && !value.path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'path is required when endpointId is omitted',
        path: ['path'],
      });
    }
  });

export const ConnectorCallPayloadSchema = z.object({
  connectorId: z.string().min(1),
  shopDomain: z.string().min(1).optional(),
  endpointId: z.string().min(1),
  input: z.record(z.unknown()).optional(),
});

export const FlowRunPayloadSchema = z.object({
  flowId: z.string().min(1),
  trigger: z.enum(['MANUAL', 'SCHEDULED', 'SHOPIFY_WEBHOOK_ORDER_CREATED', 'SHOPIFY_WEBHOOK_PRODUCT_UPDATED']),
  event: z.record(z.unknown()).optional(),
  replayOfJobId: z.string().min(1).optional(),
});

export const WebhookReceivedPayloadSchema = z.object({
  shopDomain: z.string().min(1),
  topic: z.string().min(1),
  eventId: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

export const ThemeAnalyzePayloadSchema = z.object({
  themeId: z.string().min(1).optional(),
});

export const RetentionRunPayloadSchema = z.object({
  policy: z.enum(['api_logs', 'ai_audit', 'ai_chat', 'jobs']),
  shopId: z.string().optional(),
});

export const JobPayloadByType = {
  AI_GENERATE: AiGeneratePayloadSchema,
  AI_HYDRATE: AiHydratePayloadSchema,
  AI_MODIFY: AiModifyPayloadSchema,
  INTERNAL_TOOL_RUN: InternalToolRunPayloadSchema,
  PUBLISH: PublishPayloadSchema,
  CONNECTOR_TEST: ConnectorTestPayloadSchema,
  CONNECTOR_CALL: ConnectorCallPayloadSchema,
  FLOW_RUN: FlowRunPayloadSchema,
  WEBHOOK_RECEIVED: WebhookReceivedPayloadSchema,
  THEME_ANALYZE: ThemeAnalyzePayloadSchema,
  RETENTION_RUN: RetentionRunPayloadSchema,
} as const satisfies Record<JobType, z.ZodTypeAny>;

export const EnqueueJobRequestSchema = z.object({
  type: JobTypeSchema,
  payload: z.record(z.unknown()),
  idempotencyKey: IdempotencyKeySchema.optional(),
  trace: TraceContextSchema,
});

export type EnqueueJobRequest = z.infer<typeof EnqueueJobRequestSchema>;

export function validateJobPayload<T extends JobType>(
  type: T,
  payload: unknown,
): z.infer<(typeof JobPayloadByType)[T]> {
  return JobPayloadByType[type].parse(payload) as z.infer<(typeof JobPayloadByType)[T]>;
}

export const EnqueueJobResponseSchema = z.object({
  jobId: z.string().min(1),
  queueName: QueueNameSchema,
  status: z.literal('QUEUED'),
  deduped: z.boolean(),
});

export type EnqueueJobResponse = z.infer<typeof EnqueueJobResponseSchema>;

export const JobRecordSchema = z.object({
  id: z.string().min(1),
  type: JobTypeSchema,
  queueName: QueueNameSchema,
  status: JobStatusSchema,
  payload: z.record(z.unknown()),
  trace: TraceContextSchema,
  idempotencyKey: IdempotencyKeySchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type JobRecord = z.infer<typeof JobRecordSchema>;

export const WorkerEventTypeSchema = z.enum([
  'JOB_QUEUED',
  'JOB_STARTED',
  'JOB_PROGRESS',
  'JOB_COMPLETED',
  'JOB_FAILED',
  'JOB_CANCELLED',
]);

export const WorkerEventSchema = z.object({
  type: WorkerEventTypeSchema,
  jobId: z.string().min(1),
  queueName: QueueNameSchema,
  trace: TraceContextSchema,
  timestamp: z.string().datetime(),
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type WorkerEvent = z.infer<typeof WorkerEventSchema>;

export const ServiceErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  statusCode: z.number().int().min(400).max(599),
  details: z.unknown().optional(),
});

export type ServiceError = z.infer<typeof ServiceErrorSchema>;
