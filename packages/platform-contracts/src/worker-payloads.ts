import { z } from 'zod';

export const AiGenerationPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  intentKey: z.string().min(1),
  prompt: z.string().min(1),
  outputSchema: z.string().min(1).default('RecipeSpecV1'),
  traceId: z.string().min(1).optional(),
});

export type AiGenerationPayload = z.infer<typeof AiGenerationPayloadSchema>;

export const AiGenerationResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(['success', 'failed']),
  recipeSpec: z.record(z.unknown()).optional(),
  model: z.string().min(1),
  tokensUsed: z.number().int().nonnegative(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
});

export type AiGenerationResult = z.infer<typeof AiGenerationResultSchema>;

export const WebhookPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  topic: z.string().min(1),
  webhookId: z.string().min(1),
  payload: z.record(z.unknown()),
  receivedAt: z.string().datetime(),
});

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

export const FlowRunPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  flowId: z.string().min(1),
  trigger: z.enum(['manual', 'webhook', 'schedule']),
  input: z.record(z.unknown()).default({}),
});

export type FlowRunPayload = z.infer<typeof FlowRunPayloadSchema>;

export const ConnectorJobPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  connectorId: z.string().min(1),
  operation: z.enum(['CONNECTOR_TEST', 'CONNECTOR_SYNC']),
  baseUrl: z.string().url(),
  allowlistDomains: z.array(z.string().min(1)).default([]),
  endpoint: z.string().min(1).optional(),
});

export type ConnectorJobPayload = z.infer<typeof ConnectorJobPayloadSchema>;

export const PublishPreflightPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1),
  moduleId: z.string().min(1),
  revisionId: z.string().min(1),
  target: z.enum(['theme', 'checkout', 'customer_account', 'admin']),
  recipeSpec: z.record(z.unknown()),
  idempotencyKey: z.string().min(1),
});

export type PublishPreflightPayload = z.infer<typeof PublishPreflightPayloadSchema>;

export const PublishPreflightResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.enum(['ready', 'blocked']),
  checks: z.array(
    z.object({
      name: z.string().min(1),
      passed: z.boolean(),
      message: z.string().min(1),
    }),
  ),
  idempotencyKey: z.string().min(1),
});

export type PublishPreflightResult = z.infer<typeof PublishPreflightResultSchema>;
