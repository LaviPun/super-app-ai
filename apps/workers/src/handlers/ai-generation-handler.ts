import {
  AiGenerationPayloadSchema,
  AiGenerationResultSchema,
} from '@superapp/platform-contracts';
import type { JobHandler } from '@superapp/job-orchestration';
import { failureResult, successResult } from './handler-utils.js';

const STUB_MODEL = 'platform-v2-stub';

function buildStubRecipeSpec(payload: { intentKey: string; prompt: string; outputSchema: string }) {
  return {
    schemaVersion: '1.0',
    intentKey: payload.intentKey,
    outputSchema: payload.outputSchema,
    modules: [
      {
        catalogId: 'generic.config_block',
        config: {
          headline: payload.prompt.slice(0, 120),
          generatedBy: STUB_MODEL,
        },
      },
    ],
  };
}

export function createAiGenerationHandler(): JobHandler {
  return async (job) => {
    const parsed = AiGenerationPayloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      return failureResult(job, 'ai-generation', {
        code: 'INVALID_AI_GENERATION_PAYLOAD',
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      }, 'AI generation rejected invalid payload');
    }

    const payload = parsed.data;
    const recipeSpec = buildStubRecipeSpec(payload);
    const result = AiGenerationResultSchema.parse({
      jobId: payload.jobId,
      status: 'success',
      recipeSpec,
      model: STUB_MODEL,
      tokensUsed: Math.min(payload.prompt.length, 4096),
    });

    return successResult(
      job,
      'ai-generation',
      result,
      `AI generation completed for ${payload.intentKey}`,
    );
  };
}
