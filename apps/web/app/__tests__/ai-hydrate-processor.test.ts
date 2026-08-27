/**
 * WS-C Task 8. The async worker processor for AI_HYDRATE jobs: parses the
 * job payload, re-reads the RecipeSpec fresh from `moduleVersion.specJson`
 * (never trusts the queue payload for it — the DB is the source of truth),
 * runs `hydrateRecipeSpec` with a stable per-job `billingKey` (C8 retry-safe
 * billing), persists the resulting envelope onto the version, and succeeds
 * the Job — mirroring `api.ai.hydrate-module.tsx`'s inline body exactly.
 *
 * `hydrateRecipeSpec` itself is mocked here (processor orchestration only —
 * its OWN billing-dedupe logic is covered by
 * `app/__tests__/hydrate-billing-dedupe.test.ts`, a separate file because
 * exercising the REAL `hydrateRecipeSpec` needs the opposite mocking
 * strategy for `~/services/ai/llm.server` than these orchestration tests
 * do — vitest module mocks are file-scoped, so the two can't share a file).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { JobEnvelope } from '@superapp/platform-contracts';
import type { WebJobEnvelope } from '~/services/jobs/worker-runtime.server';

const hoisted = vi.hoisted(() => ({
  hydrateRecipeSpec: vi.fn(),
  jobStart: vi.fn(async () => {}),
  jobSetStage: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFailWithPayload: vi.fn(async () => {}),
  versionFindUnique: vi.fn(),
  versionUpdate: vi.fn(async () => ({})),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    moduleVersion: { findUnique: hoisted.versionFindUnique, update: hoisted.versionUpdate },
  }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    start = hoisted.jobStart;
    setStage = hoisted.jobSetStage;
    succeed = hoisted.jobSucceed;
    failWithPayload = hoisted.jobFailWithPayload;
  },
}));
vi.mock('~/services/ai/llm.server', () => ({
  hydrateRecipeSpec: hoisted.hydrateRecipeSpec,
  AiProviderNotConfiguredError: class extends Error {
    code = 'AI_PROVIDER_NOT_CONFIGURED';
    constructor() {
      super('AI provider not configured');
    }
  },
}));
vi.mock('~/env.server', () => ({
  getHydrateJobBudgetMs: () => 90_000,
}));

import { createAiHydrateJobHandler } from '~/services/jobs/processors/ai-hydrate.processor.server';

const RECIPE_SPEC_JSON = JSON.stringify({
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: [],
  config: {},
});

const validPayload = {
  kind: 'WEB_AI_HYDRATE',
  shopId: 'shop-1',
  shopDomain: 'x.myshopify.com',
  moduleId: 'mod-1',
  versionId: 'ver-1',
  moduleType: 'theme.section',
  trace: { correlationId: 'corr-1', shopId: 'shop-1' },
};

const validEnvelopeResult = {
  version: '1.0',
  moduleKey: 'exit-intent-popup',
  recipeRef: { type: 'theme.section', name: 'Test Section', category: 'STOREFRONT_UI' },
  summary: 'A summary.',
  assumptions: [],
  adminConfig: {
    schemaVersion: '1.0',
    jsonSchema: { type: 'object', properties: {}, required: [] },
    uiSchema: {},
    defaults: { content: {} },
  },
  themeEditorSettings: { fields: [{ id: 'enabled', type: 'boolean', label: 'Enable', default: true }], limitsNotes: [] },
  validationReport: { overall: 'PASS', checks: [], notes: [] },
};

function envelope(
  payload: Record<string, unknown>,
  attempt?: Partial<Pick<WebJobEnvelope, 'attemptsMade' | 'attemptsTotal' | 'isFinalAttempt'>>,
): WebJobEnvelope {
  const base: JobEnvelope = {
    id: 'job-hydrate-1',
    queueName: 'ai-generation',
    jobType: 'AI_HYDRATE',
    payload,
    trace: { correlationId: 'corr-1', shopId: 'shop-1' },
  };
  return { ...base, attemptsMade: 0, attemptsTotal: 1, isFinalAttempt: true, ...attempt };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.versionFindUnique.mockResolvedValue({
    id: 'ver-1',
    moduleId: 'mod-1',
    specJson: RECIPE_SPEC_JSON,
  });
  hoisted.hydrateRecipeSpec.mockResolvedValue(validEnvelopeResult);
});

describe('createAiHydrateJobHandler', () => {
  it('invalid payload -> failWithPayload VALIDATION_ERROR, FAILED, no throw', async () => {
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope({ kind: 'WEB_AI_HYDRATE' }));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-hydrate-1',
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
    expect(hoisted.jobStart).not.toHaveBeenCalled();
  });

  it('parses payload, starts the job, loads the version, calls hydrateRecipeSpec with billingKey + deadlineAt, persists the envelope, and succeeds the job', async () => {
    const before = Date.now();
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope(validPayload));

    expect(hoisted.jobStart).toHaveBeenCalledWith('job-hydrate-1');
    expect(hoisted.versionFindUnique).toHaveBeenCalledWith({ where: { id: 'ver-1' } });

    expect(hoisted.hydrateRecipeSpec).toHaveBeenCalledTimes(1);
    const [recipeArg, optionsArg] = hoisted.hydrateRecipeSpec.mock.calls[0]!;
    expect(recipeArg).toMatchObject({ type: 'theme.section', name: 'Test Section' });
    expect(optionsArg).toMatchObject({ shopId: 'shop-1', billingKey: 'hydrate:job-hydrate-1' });
    expect(optionsArg.deadlineAt).toBeGreaterThanOrEqual(before + 90_000);
    expect(optionsArg.deadlineAt).toBeLessThanOrEqual(Date.now() + 90_000);

    expect(hoisted.versionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ver-1' },
        data: expect.objectContaining({
          hydratedAt: expect.any(Date),
          adminConfigSchemaJson: JSON.stringify(validEnvelopeResult.adminConfig),
          adminDefaultsJson: JSON.stringify(validEnvelopeResult.adminConfig.defaults),
          themeEditorSettingsJson: JSON.stringify(validEnvelopeResult.themeEditorSettings),
          validationReportJson: JSON.stringify(validEnvelopeResult.validationReport),
        }),
      }),
    );
    expect(hoisted.jobSucceed).toHaveBeenCalledWith('job-hydrate-1', { validationOverall: 'PASS' });
    expect(result).toEqual({ status: 'SUCCESS', result: { validationOverall: 'PASS' } });
    expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();
  });

  it('hydrateRecipeSpec throw -> failWithPayload (AppError-shaped), returns FAILED', async () => {
    hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new Error('provider blew up'));
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-hydrate-1',
      expect.objectContaining({ error: 'INTERNAL_ERROR', message: expect.stringMatching(/not double-bill/) }),
    );
    expect(hoisted.jobSucceed).not.toHaveBeenCalled();
    expect(hoisted.versionUpdate).not.toHaveBeenCalled();
  });

  it('AiProviderNotConfiguredError -> failWithPayload AI_PROVIDER_NOT_CONFIGURED, FAILED', async () => {
    const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
    hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new AiProviderNotConfiguredError());
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-hydrate-1',
      expect.objectContaining({ error: 'AI_PROVIDER_NOT_CONFIGURED' }),
    );
  });

  it('unknown versionId -> failWithPayload NOT_FOUND, FAILED (never calls hydrateRecipeSpec)', async () => {
    hoisted.versionFindUnique.mockResolvedValueOnce(null);
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-hydrate-1',
      expect.objectContaining({ error: 'NOT_FOUND' }),
    );
    expect(hoisted.hydrateRecipeSpec).not.toHaveBeenCalled();
  });

  it('a version whose moduleId does not match the payload -> failWithPayload NOT_FOUND (defense against a stale/mismatched payload)', async () => {
    hoisted.versionFindUnique.mockResolvedValueOnce({
      id: 'ver-1',
      moduleId: 'some-other-module',
      specJson: RECIPE_SPEC_JSON,
    });
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-hydrate-1',
      expect.objectContaining({ error: 'NOT_FOUND' }),
    );
    expect(hoisted.hydrateRecipeSpec).not.toHaveBeenCalled();
  });

  it('invalid RecipeSpec JSON on the version -> failWithPayload VALIDATION_ERROR, FAILED', async () => {
    hoisted.versionFindUnique.mockResolvedValueOnce({
      id: 'ver-1',
      moduleId: 'mod-1',
      specJson: '{not json',
    });
    const handler = createAiHydrateJobHandler();
    const result = await handler(envelope(validPayload));
    expect(result.status).toBe('FAILED');
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-hydrate-1',
      expect.objectContaining({ error: 'VALIDATION_ERROR' }),
    );
    expect(hoisted.hydrateRecipeSpec).not.toHaveBeenCalled();
  });

  // Review fix: parity with ai-generation.processor.server.ts's failFinalOnly.
  // With attempts: 2 on the enqueue, an attempt-1 failure must NOT write a
  // terminal Job.status=FAILED — pollJobUntilTerminal's isTerminal check
  // would stop polling for good and the client would show a false
  // "Hydration failed" while BullMQ quietly retries (and may still succeed).
  describe('attempt-aware terminal writes (review fix, failFinalOnly parity)', () => {
    it('hydrateRecipeSpec throw on a NON-final attempt -> returns FAILED (so BullMQ retries) WITHOUT calling failWithPayload; sets stage retrying', async () => {
      hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new Error('transient provider blip'));
      const handler = createAiHydrateJobHandler();
      const result = await handler(
        envelope(validPayload, { attemptsMade: 0, attemptsTotal: 2, isFinalAttempt: false }),
      );
      expect(result.status).toBe('FAILED'); // still throws so BullMQ counts + retries the attempt
      expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();
      expect(hoisted.jobSetStage).toHaveBeenCalledWith('job-hydrate-1', 'retrying');
    });

    it('hydrateRecipeSpec throw on the FINAL attempt -> calls failWithPayload INTERNAL_ERROR (terminal)', async () => {
      hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new Error('transient provider blip'));
      const handler = createAiHydrateJobHandler();
      const result = await handler(
        envelope(validPayload, { attemptsMade: 1, attemptsTotal: 2, isFinalAttempt: true }),
      );
      expect(result.status).toBe('FAILED');
      expect(hoisted.jobFailWithPayload).toHaveBeenCalledTimes(1);
      expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
        'job-hydrate-1',
        expect.objectContaining({ error: 'INTERNAL_ERROR' }),
      );
    });

    it('AiProviderNotConfiguredError on a NON-final attempt -> returns FAILED WITHOUT calling failWithPayload', async () => {
      const { AiProviderNotConfiguredError } = await import('~/services/ai/llm.server');
      hoisted.hydrateRecipeSpec.mockRejectedValueOnce(new AiProviderNotConfiguredError());
      const handler = createAiHydrateJobHandler();
      const result = await handler(
        envelope(validPayload, { attemptsMade: 0, attemptsTotal: 2, isFinalAttempt: false }),
      );
      expect(result.status).toBe('FAILED');
      expect(hoisted.jobFailWithPayload).not.toHaveBeenCalled();
      expect(hoisted.jobSetStage).toHaveBeenCalledWith('job-hydrate-1', 'retrying');
    });

    it('the malformed-payload branch stays un-gated (unconditional failWithPayload) even on a non-final attempt — malformed payloads never become valid on retry', async () => {
      const handler = createAiHydrateJobHandler();
      const result = await handler(
        envelope({ kind: 'WEB_AI_HYDRATE' }, { attemptsMade: 0, attemptsTotal: 2, isFinalAttempt: false }),
      );
      expect(result.status).toBe('FAILED');
      expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
        'job-hydrate-1',
        expect.objectContaining({ error: 'VALIDATION_ERROR' }),
      );
      expect(hoisted.jobSetStage).not.toHaveBeenCalled();
    });
  });
});
