import { z } from 'zod';

// ─── Workflow Status ───────────────────────────────────────────────────
export const WorkflowStatusSchema = z.enum(['draft', 'active', 'paused', 'archived']);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

// ─── Expression Tree (safe, typed — no eval) ──────────────────────────
export const ContextRefSchema = z.object({
  $ref: z.string().min(1).describe('Context path, e.g. $.trigger.payload.order.id or $.steps.node1.result'),
});
export type ContextRef = z.infer<typeof ContextRefSchema>;

export const TemplateStringSchema = z.object({
  $tmpl: z.string().min(1).describe('Template string, e.g. "Order {{$.trigger.payload.order.name}}"'),
});
export type TemplateString = z.infer<typeof TemplateStringSchema>;

export const ValueOrTemplateSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  ContextRefSchema,
  TemplateStringSchema,
  z.array(z.lazy(() => ValueOrTemplateSchema)),
  z.record(z.string(), z.lazy(() => ValueOrTemplateSchema)),
]);
export type ValueOrTemplate = z.infer<typeof ValueOrTemplateSchema>;

const ExpressionOps = z.enum([
  'and', 'or', 'not',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'contains', 'exists',
]);

export const ExpressionSchema: z.ZodType<{ op: string; args?: unknown[] }> = z.object({
  op: ExpressionOps,
  args: z.array(z.lazy(() => z.union([ValueOrTemplateSchema, ExpressionSchema]))).optional(),
});
export type Expression = z.infer<typeof ExpressionSchema>;

// ─── Retry Policy ─────────────────────────────────────────────────────
export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(0).default(3),
  backoff: z.enum(['fixed', 'exponential']).default('exponential'),
  baseDelayMs: z.number().int().min(0).default(500),
  maxDelayMs: z.number().int().min(0).default(30000),
  jitter: z.boolean().default(true),
  retryOn: z.array(z.enum([
    'timeout', 'network', '5xx', '429', 'connector_retryable',
  ])).default(['timeout', 'network', '5xx', '429', 'connector_retryable']),
}).strict();
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// ─── Error Handler ────────────────────────────────────────────────────
export const ErrorHandlerSchema = z.object({
  mode: z.enum(['fail_run', 'continue', 'route_to_error_edge']).default('fail_run'),
  captureErrorAs: z.string().default('lastError'),
}).strict();
export type ErrorHandler = z.infer<typeof ErrorHandlerSchema>;

// ─── Action Spec ──────────────────────────────────────────────────────
export const ActionSpecSchema = z.object({
  provider: z.string().min(1),
  operation: z.string().min(1),
  inputs: z.record(z.string(), ValueOrTemplateSchema),
  retry: RetryPolicySchema.optional(),
  timeoutMs: z.number().int().min(100).default(30000),
  idempotencyKey: ValueOrTemplateSchema.optional(),
  outputs: z.record(z.string(), z.string()).optional()
    .describe('Mapping of returned fields to context paths'),
}).strict();
export type ActionSpec = z.infer<typeof ActionSpecSchema>;

// ─── Transform Spec ───────────────────────────────────────────────────
export const TransformSpecSchema = z.object({
  assign: z.record(z.string(), ValueOrTemplateSchema),
}).strict();
export type TransformSpec = z.infer<typeof TransformSpecSchema>;

// ─── Delay Spec ───────────────────────────────────────────────────────
export const DelaySpecSchema = z.object({
  mode: z.enum(['duration', 'until']),
  durationMs: z.number().int().min(1).optional(),
  until: ValueOrTemplateSchema.optional(),
}).strict();
export type DelaySpec = z.infer<typeof DelaySpecSchema>;

// ─── Node ─────────────────────────────────────────────────────────────
export const NodeTypeSchema = z.enum(['condition', 'action', 'transform', 'delay', 'end']);
export type NodeType = z.infer<typeof NodeTypeSchema>;

const NodeIdPattern = /^[a-zA-Z0-9_-]{3,64}$/;

export const NodeSchema = z.object({
  id: z.string().regex(NodeIdPattern),
  type: NodeTypeSchema,
  name: z.string().min(1).max(120),
  condition: ExpressionSchema.optional(),
  action: ActionSpecSchema.optional(),
  transform: TransformSpecSchema.optional(),
  delay: DelaySpecSchema.optional(),
  onError: ErrorHandlerSchema.optional(),
}).strict().superRefine((node, ctx) => {
  if (node.type === 'condition' && !node.condition) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Condition node requires "condition" field', path: ['condition'] });
  }
  if (node.type === 'action' && !node.action) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Action node requires "action" field', path: ['action'] });
  }
  if (node.type === 'transform' && !node.transform) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Transform node requires "transform" field', path: ['transform'] });
  }
  if (node.type === 'delay' && !node.delay) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Delay node requires "delay" field', path: ['delay'] });
  }
});
export type WorkflowNode = z.infer<typeof NodeSchema>;

// ─── Edge ─────────────────────────────────────────────────────────────
export const EdgeLabelSchema = z.enum(['next', 'true', 'false', 'error']);

export const EdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: EdgeLabelSchema.default('next'),
  guard: ExpressionSchema.optional(),
}).strict();
export type WorkflowEdge = z.infer<typeof EdgeSchema>;

// ─── Trigger ──────────────────────────────────────────────────────────
export const TriggerTypeSchema = z.enum(['event', 'schedule', 'manual']);

export const TriggerSchema = z.object({
  type: TriggerTypeSchema,
  provider: z.string().min(1),
  event: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).optional()
    .describe('JSON Schema describing trigger payload shape'),
  filter: ExpressionSchema.optional(),
}).strict();
export type WorkflowTrigger = z.infer<typeof TriggerSchema>;

// ─── Workflow Settings ────────────────────────────────────────────────
export const WorkflowSettingsSchema = z.object({
  timezone: z.string().default('UTC'),
  maxRunSeconds: z.number().int().min(1).default(900),
  concurrencyKey: z.string().optional()
    .describe('If set, runs with same key are serialized (e.g., per orderId)'),
  errorPolicy: z.enum(['fail_run', 'continue_on_error']).default('fail_run'),
}).strict();
export type WorkflowSettings = z.infer<typeof WorkflowSettingsSchema>;

// ─── Top-level Workflow ───────────────────────────────────────────────
const WorkflowIdPattern = /^[a-zA-Z0-9_-]{8,64}$/;

export const WorkflowSchema = z.object({
  id: z.string().regex(WorkflowIdPattern),
  version: z.number().int().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  status: WorkflowStatusSchema,

  tenantId: z.string().min(1),
  createdBy: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),

  trigger: TriggerSchema,

  nodes: z.array(NodeSchema).min(1).max(200),
  edges: z.array(EdgeSchema).max(500),

  settings: WorkflowSettingsSchema.optional(),
  variables: z.record(z.string(), z.unknown()).optional()
    .describe('Workflow-level constant vars / secrets references'),

  ui: z.record(z.string(), z.unknown()).optional()
    .describe('Layout metadata for the builder UI (node positions, zoom, etc.)'),
}).strict();

export type Workflow = z.infer<typeof WorkflowSchema>;

// ─── Run Context (runtime) ────────────────────────────────────────────
export type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'RETRYING' | 'SKIPPED' | 'WAITING';

export interface StepState {
  nodeId: string;
  status: StepStatus;
  attempt: number;
  startedAt?: string;
  endedAt?: string;
  inputs?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

export interface RunContext {
  trigger: {
    provider: string;
    event: string;
    payload: Record<string, unknown>;
  };
  workflow: {
    id: string;
    version: number;
  };
  run: {
    id: string;
    startedAt: string;
  };
  vars: Record<string, unknown>;
  steps: Record<string, StepState>;
  lastError: unknown | null;
}
