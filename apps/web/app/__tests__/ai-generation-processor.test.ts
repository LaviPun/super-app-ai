/**
 * WS-C Task 5. The async worker processor for AI_GENERATE jobs: parses the
 * job payload, runs `runGenerationPipeline` (Task 4) with hooks that persist
 * each option to `AiGenerationOption` as it validates (so a dropped client
 * connection can re-fetch state via the poll route without re-spending), and
 * finalizes the Job the same way the inline SSE route does
 * (`finalizeGenerationJob` — 0 valid options is a FAILURE, never succeed).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JobEnvelope } from '@superapp/platform-contracts';
import type {
  GenerationPipelineInput,
  GenerationPipelineHooks,
  GenerationPipelineResult,
} from '~/services/ai/generation-pipeline.server';

const hoisted = vi.hoisted(() => ({
  pipelineImpl: vi.fn(
    async (
      _input: GenerationPipelineInput,
      _hooks: GenerationPipelineHooks,
    ): Promise<GenerationPipelineResult> => ({ validCount: 0, moduleType: 'theme.section', collected: new Map() }),
  ),
  jobStart: vi.fn(async () => {}),
  jobSetStage: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  jobFailWithPayload: vi.fn(async () => {}),
  jobUpdatePayload: vi.fn(async () => {}),
  optionUpsert: vi.fn(async () => ({})),
  optionUpdateMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { unauthenticated: { admin: vi.fn(async () => ({ admin: {} })) } },
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiGenerationOption: { upsert: hoisted.optionUpsert, updateMany: hoisted.optionUpdateMany },
  }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    start = hoisted.jobStart;
    setStage = hoisted.jobSetStage;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
    failWithPayload = hoisted.jobFailWithPayload;
    updatePayload = hoisted.jobUpdatePayload;
  },
}));
vi.mock('~/services/ai/generation-pipeline.server', () => ({
  runGenerationPipeline: hoisted.pipelineImpl,
}));
vi.mock('~/services/ai/llm.server', () => ({
  AiProviderNotConfiguredError: class extends Error {
    code = 'AI_PROVIDER_NOT_CONFIGURED';
    constructor() {
      super('AI provider not configured');
    }
  },
}));

import { createAiGenerationJobHandler } from '~/services/jobs/processors/ai-generation.processor.server';

function envelope(payload: Record<string, unknown>): JobEnvelope {
  return {
    id: 'job-1',
    queueName: 'ai-generation',
    jobType: 'AI_GENERATE',
    payload,
    trace: { correlationId: 'corr-1', shopId: 'shop-1' },
  };
}

const validPayload = {
  kind: 'WEB_AI_GENERATE',
  shopId: 'shop-1',
  shopDomain: 'x.myshopify.com',
  prompt: 'make a banner',
  preferredType: 'Auto',
  preferredCategory: 'Auto',
  preferredBlockType: 'Auto',
  matchStoreColors: true,
  optionCount: 2,
  planTier: 'BASIC',
  trace: { correlationId: 'corr-1', shopId: 'shop-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createAiGenerationJobHandler', () => {
  it('invalid payload -> failWithPayload VALIDATION_ERROR, FAILED, no throw', async () => {
    const handler = createAiGenerationJobHandler();
    const result = await handler(envelope({ kind: 'WEB_AI_GENERATE' }));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
    expect(hoisted.jobStart).not.toHaveBeenCalled();
  });

  it('starts the job and sets stage classifying before the pipeline runs', async () => {
    const order: string[] = [];
    hoisted.jobStart.mockImplementationOnce(async () => {
      order.push('start');
    });
    hoisted.jobSetStage.mockImplementationOnce(async () => {
      order.push('setStage:classifying');
    });
    hoisted.pipelineImpl.mockImplementationOnce(async () => {
      order.push('pipeline');
      return { validCount: 0, moduleType: 'theme.section', collected: new Map() };
    });
    const handler = createAiGenerationJobHandler();
    await handler(envelope(validPayload));
    expect(order).toEqual(['start', 'setStage:classifying', 'pipeline']);
  });

  it('parity with the stream route (commit-0 fold-in b): onIntent persists classifiedType/intent/exemplar metadata via jobs.updatePayload', async () => {
    hoisted.pipelineImpl.mockImplementationOnce(async (_input, hooks) => {
      await hooks.onIntent?.({
        intent: 'banner',
        surface: 'storefront',
        confidence: 0.9,
        confidenceBand: 'direct',
        alternatives: [],
        reasons: [],
        routing: {},
        moduleType: 'theme.section',
        routerDecision: {},
        exemplarTier: 2,
        exemplarTemplateId: 'tpl_123',
      });
      return { validCount: 0, moduleType: 'theme.section', collected: new Map() };
    });
    const handler = createAiGenerationJobHandler();
    await handler(envelope(validPayload));
    expect(hoisted.jobUpdatePayload).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        classifiedType: 'theme.section',
        intent: 'banner',
        exemplarTier: 2,
        exemplarTemplateId: 'tpl_123',
      }),
    );
  });

  it('persists each option via onOption/onOptionFailed as VALID/FAILED rows, writes score+badges on ranking, and succeeds the job with optionCount/recommendedIndex/type', async () => {
    hoisted.pipelineImpl.mockImplementationOnce(async (_input, hooks) => {
      await hooks.onOption?.({
        index: 0,
        approach: 'polished',
        option: {
          explanation: 'e0',
          recipe: { type: 'theme.section', name: 'A' } as never,
          generationMode: 'freeform',
        },
        durationMs: 5,
      });
      await hooks.onOptionFailed?.({ index: 1, approach: 'bold', error: 'schema invalid', durationMs: 3 });
      await hooks.onRanking?.({ recommendedIndex: 0, scores: [{ index: 0, score: 0.9, badges: ['fast'] }] });
      return { validCount: 1, moduleType: 'theme.section', collected: new Map([[0, {} as never]]) };
    });
    const handler = createAiGenerationJobHandler();
    const result = await handler(envelope(validPayload));

    expect(result.status).toBe('SUCCESS');
    expect(hoisted.optionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId_idx: { jobId: 'job-1', idx: 0 } },
        create: expect.objectContaining({
          status: 'VALID',
          explanation: 'e0',
          recipeJson: JSON.stringify({ type: 'theme.section', name: 'A' }),
          generationMode: 'freeform',
          qaIssuesJson: null,
        }),
      }),
    );
    expect(hoisted.optionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId_idx: { jobId: 'job-1', idx: 1 } },
        create: expect.objectContaining({ status: 'FAILED', error: 'schema invalid' }),
      }),
    );
    expect(hoisted.optionUpdateMany).toHaveBeenCalledWith({
      where: { jobId: 'job-1', idx: 0 },
      data: { score: 0.9, badgesJson: JSON.stringify(['fast']) },
    });
    expect(hoisted.jobSucceed).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ optionCount: 1, recommendedIndex: 0, type: 'theme.section' }),
    );
    expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();
  });

  it('validCount === 0 -> failWithPayload NO_VALID_OPTIONS ("not billed") and returns FAILED (billing-safe retry)', async () => {
    hoisted.pipelineImpl.mockImplementationOnce(async () => ({
      validCount: 0,
      moduleType: 'theme.section',
      collected: new Map(),
    }));
    const handler = createAiGenerationJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({
        error: 'NO_VALID_OPTIONS',
        message: expect.stringMatching(/not billed/),
      }),
    );
  });

  it('pipeline throws AiProviderNotConfiguredError -> failWithPayload AI_PROVIDER_NOT_CONFIGURED, FAILED', async () => {
    const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
    hoisted.pipelineImpl.mockImplementationOnce(async () => {
      throw new AiProviderNotConfiguredError();
    });
    const handler = createAiGenerationJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ error: 'AI_PROVIDER_NOT_CONFIGURED' }),
    );
  });
});
