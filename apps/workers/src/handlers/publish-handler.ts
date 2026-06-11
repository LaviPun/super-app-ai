import {
  PublishPreflightPayloadSchema,
  PublishPreflightResultSchema,
} from '@superapp/platform-contracts';
import type { JobHandler } from '@superapp/job-orchestration';
import { failureResult, successResult } from './handler-utils.js';

export function createPublishHandler(): JobHandler {
  return async (job) => {
    const parsed = PublishPreflightPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      return failureResult(job, 'publish', {
        code: 'INVALID_PUBLISH_PAYLOAD',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }, 'Publish worker rejected invalid payload');
    }

    const payload = parsed.data;
    const hasModules =
      typeof payload.recipeSpec === 'object' &&
      payload.recipeSpec !== null &&
      Array.isArray((payload.recipeSpec as { modules?: unknown }).modules) &&
      ((payload.recipeSpec as { modules: unknown[] }).modules.length > 0);

    const checks = [
      {
        name: 'recipe_spec_present',
        passed: hasModules,
        message: hasModules ? 'RecipeSpec contains modules' : 'RecipeSpec modules array is required',
      },
      {
        name: 'idempotency_key_present',
        passed: payload.idempotencyKey.length > 0,
        message: 'Idempotency key is required for publish',
      },
      {
        name: 'target_allowed',
        passed: ['theme', 'checkout', 'customer_account', 'admin'].includes(payload.target),
        message: `Target ${payload.target} is supported`,
      },
    ];

    const blocked = checks.some((check) => !check.passed);
    const result = PublishPreflightResultSchema.parse({
      jobId: payload.jobId,
      status: blocked ? 'blocked' : 'ready',
      checks,
      idempotencyKey: payload.idempotencyKey,
    });

    if (blocked) {
      return failureResult(job, 'publish', {
        code: 'PUBLISH_PREFLIGHT_BLOCKED',
        message: checks.filter((check) => !check.passed).map((check) => check.message).join('; '),
      }, 'Publish preflight blocked');
    }

    return successResult(
      job,
      'publish',
      result,
      `Publish preflight ready for module ${payload.moduleId}`,
    );
  };
}
