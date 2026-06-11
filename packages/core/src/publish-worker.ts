import { z } from 'zod';
import { DeployTargetSchema, RecipeSpecSchema, type DeployTarget, type RecipeSpec } from './recipe.js';

export const PublishJobSourceSchema = z.enum(['merchant_api', 'agent_api', 'system']);
export type PublishJobSource = z.infer<typeof PublishJobSourceSchema>;

export const PublishJobPayloadSchema = z.object({
  jobId: z.string().min(1),
  shopId: z.string().min(1).optional(),
  shopDomain: z.string().min(1),
  moduleId: z.string().min(1),
  versionId: z.string().min(1),
  idempotencyKey: z.string().min(8),
  source: PublishJobSourceSchema,
  target: DeployTargetSchema,
  spec: RecipeSpecSchema,
});
export type PublishJobPayload = z.infer<typeof PublishJobPayloadSchema>;

export type PublishProgressEvent =
  | 'MODULE_PUBLISH_REQUESTED'
  | 'MODULE_PUBLISH_VALIDATED'
  | 'MODULE_PUBLISH_APPLYING'
  | 'MODULE_PUBLISHED'
  | 'MODULE_PUBLISH_FAILED'
  | 'MODULE_PUBLISH_IDEMPOTENT';

export type PublishWorkerState = {
  moduleStatus: 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  versionStatus: 'DRAFT' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  activeVersionId?: string | null;
};

export type PublishDeployOperation =
  | { kind: 'SHOP_METAFIELD_SET'; namespace: string; key: string; type: string; value: string }
  | { kind: 'SHOP_METAFIELD_DELETE'; namespace: string; key: string }
  | { kind: 'FUNCTION_CONFIG_UPSERT'; functionKey: string; config: unknown }
  | { kind: 'METAOBJECT_ENSURE_DEF'; namespace: string; key: string; metaobjectType: string; isList: boolean }
  | { kind: 'THEME_MODULE_UPSERT'; moduleId: string; payload: Record<string, unknown> }
  | { kind: 'ADMIN_BLOCK_UPSERT'; moduleId: string; payload: Record<string, unknown> }
  | { kind: 'ADMIN_ACTION_UPSERT'; moduleId: string; payload: Record<string, unknown> }
  | { kind: 'CHECKOUT_UPSELL_UPSERT'; moduleId: string; payload: Record<string, unknown> }
  | { kind: 'CUSTOMER_ACCOUNT_BLOCK_UPSERT'; moduleId: string; payload: Record<string, unknown> }
  | { kind: 'PROXY_WIDGET_UPSERT'; payload: Record<string, unknown> }
  | { kind: 'AUDIT'; action: string; details?: string };

export type PublishCompiledOutput = {
  operations: PublishDeployOperation[];
  compiledJson?: string;
};

export type PublishWorkerAdapters = {
  compiler: {
    compile(spec: RecipeSpec, target: DeployTarget): Promise<PublishCompiledOutput> | PublishCompiledOutput;
  };
  shopify: {
    apply(input: {
      payload: PublishJobPayload;
      output: PublishCompiledOutput;
    }): Promise<void>;
  };
  state: {
    getCurrent(input: PublishJobPayload): Promise<PublishWorkerState>;
    markAttempt(input: PublishJobPayload): Promise<void>;
    markSucceeded(input: {
      payload: PublishJobPayload;
      output: PublishCompiledOutput;
    }): Promise<void>;
    markFailed(input: {
      payload: PublishJobPayload;
      error: PublishWorkerError;
    }): Promise<void>;
    markIdempotent(input: PublishJobPayload): Promise<void>;
  };
  events?: {
    emit(event: {
      jobId: string;
      moduleId: string;
      versionId: string;
      type: PublishProgressEvent;
      message?: string;
      metadata?: Record<string, unknown>;
    }): Promise<void> | void;
  };
};

export type PublishWorkerResult =
  | { status: 'published'; moduleId: string; versionId: string; compiledJson?: string }
  | { status: 'idempotent'; moduleId: string; versionId: string };

export class PublishWorkerError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_PAYLOAD'
      | 'INVALID_STATE'
      | 'UNSAFE_DEPLOY_OPERATION'
      | 'SHOPIFY_ADAPTER_FAILED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PublishWorkerError';
  }
}

export function isAlreadyPublished(input: PublishJobPayload, state: PublishWorkerState): boolean {
  return state.activeVersionId === input.versionId && state.versionStatus === 'PUBLISHED';
}

export function assertPublishableState(state: PublishWorkerState): void {
  const allowedModuleStates = new Set<PublishWorkerState['moduleStatus']>(['DRAFT', 'PUBLISHED']);
  const allowedVersionStates = new Set<PublishWorkerState['versionStatus']>(['DRAFT', 'PUBLISHED']);

  if (!allowedModuleStates.has(state.moduleStatus) || !allowedVersionStates.has(state.versionStatus)) {
    throw new PublishWorkerError(
      'INVALID_STATE',
      `Publish requires DRAFT or PUBLISHED state; got module=${state.moduleStatus}, version=${state.versionStatus}.`,
    );
  }
}

export function assertRecipeSpecOnlyOutput(output: PublishCompiledOutput): void {
  for (const operation of output.operations) {
    if (
      operation.kind === 'SHOP_METAFIELD_SET' ||
      operation.kind === 'SHOP_METAFIELD_DELETE' ||
      operation.kind === 'FUNCTION_CONFIG_UPSERT' ||
      operation.kind === 'METAOBJECT_ENSURE_DEF' ||
      operation.kind === 'THEME_MODULE_UPSERT' ||
      operation.kind === 'ADMIN_BLOCK_UPSERT' ||
      operation.kind === 'ADMIN_ACTION_UPSERT' ||
      operation.kind === 'CHECKOUT_UPSELL_UPSERT' ||
      operation.kind === 'CUSTOMER_ACCOUNT_BLOCK_UPSERT' ||
      operation.kind === 'PROXY_WIDGET_UPSERT' ||
      operation.kind === 'AUDIT'
    ) {
      continue;
    }

    throw new PublishWorkerError(
      'UNSAFE_DEPLOY_OPERATION',
      `Unsupported publish operation "${(operation as { kind?: string }).kind ?? 'unknown'}". Publish worker only accepts RecipeSpec/config-driven outputs.`,
    );
  }
}

export async function runPublishJob(
  rawPayload: unknown,
  adapters: PublishWorkerAdapters,
): Promise<PublishWorkerResult> {
  const parsed = PublishJobPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw new PublishWorkerError('INVALID_PAYLOAD', parsed.error.message, parsed.error);
  }
  const payload = parsed.data;

  await adapters.events?.emit({
    jobId: payload.jobId,
    moduleId: payload.moduleId,
    versionId: payload.versionId,
    type: 'MODULE_PUBLISH_REQUESTED',
  });

  const currentState = await adapters.state.getCurrent(payload);
  assertPublishableState(currentState);

  if (isAlreadyPublished(payload, currentState)) {
    await adapters.state.markIdempotent(payload);
    await adapters.events?.emit({
      jobId: payload.jobId,
      moduleId: payload.moduleId,
      versionId: payload.versionId,
      type: 'MODULE_PUBLISH_IDEMPOTENT',
      message: 'Version is already the active published version.',
    });
    return { status: 'idempotent', moduleId: payload.moduleId, versionId: payload.versionId };
  }

  await adapters.state.markAttempt(payload);
  await adapters.events?.emit({
    jobId: payload.jobId,
    moduleId: payload.moduleId,
    versionId: payload.versionId,
    type: 'MODULE_PUBLISH_VALIDATED',
  });

  try {
    const output = await adapters.compiler.compile(payload.spec, payload.target);
    assertRecipeSpecOnlyOutput(output);

    await adapters.events?.emit({
      jobId: payload.jobId,
      moduleId: payload.moduleId,
      versionId: payload.versionId,
      type: 'MODULE_PUBLISH_APPLYING',
    });
    await adapters.shopify.apply({ payload, output });
    await adapters.state.markSucceeded({ payload, output });
    await adapters.events?.emit({
      jobId: payload.jobId,
      moduleId: payload.moduleId,
      versionId: payload.versionId,
      type: 'MODULE_PUBLISHED',
    });

    return {
      status: 'published',
      moduleId: payload.moduleId,
      versionId: payload.versionId,
      compiledJson: output.compiledJson,
    };
  } catch (error) {
    const publishError =
      error instanceof PublishWorkerError
        ? error
        : new PublishWorkerError('SHOPIFY_ADAPTER_FAILED', error instanceof Error ? error.message : String(error), error);
    await adapters.state.markFailed({ payload, error: publishError });
    await adapters.events?.emit({
      jobId: payload.jobId,
      moduleId: payload.moduleId,
      versionId: payload.versionId,
      type: 'MODULE_PUBLISH_FAILED',
      message: publishError.message,
      metadata: { code: publishError.code },
    });
    throw publishError;
  }
}
