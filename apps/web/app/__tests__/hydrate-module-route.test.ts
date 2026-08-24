/**
 * WS-C Task 8. `POST /api/ai/hydrate-module` — queue-mode branch. Inline
 * mode (isAsyncJobsEnabled false) stays byte-identical to the pre-Task-8
 * synchronous path (untouched by this task); the new coverage here is the
 * async branch: Job creation carries the module's `generationCorrelationId`
 * when known, enqueues `AI_HYDRATE` with the schema-shaped payload/trace,
 * and returns `202 { async: true, jobId }` without ever calling
 * `hydrateRecipeSpec` on this request.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  enforceRateLimit: vi.fn(async () => {}),
  shopFindFirst: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })),
  moduleVersionUpdate: vi.fn(async () => ({})),
  quotaEnforce: vi.fn(async () => {}),
  getModule: vi.fn(),
  jobCreate: vi.fn(async () => ({ id: 'job-1', correlationId: 'corr-1' })),
  jobStart: vi.fn(async () => {}),
  jobSucceed: vi.fn(async () => {}),
  jobFail: vi.fn(async () => {}),
  jobFailWithPayload: vi.fn(async () => {}),
  isAsyncJobsEnabled: vi.fn(() => true),
  enqueueWebJob: vi.fn(async (input: { id: string }) => ({ queueName: 'ai-generation', jobId: input.id })),
  hydrateRecipeSpec: vi.fn(),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    shop: { findFirst: hoisted.shopFindFirst },
    moduleVersion: { update: hoisted.moduleVersionUpdate },
  }),
}));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    getModule = hoisted.getModule;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.quotaEnforce;
  },
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = hoisted.jobCreate;
    start = hoisted.jobStart;
    succeed = hoisted.jobSucceed;
    fail = hoisted.jobFail;
    failWithPayload = hoisted.jobFailWithPayload;
  },
}));
vi.mock('~/services/jobs/enqueue.server', () => ({
  isAsyncJobsEnabled: hoisted.isAsyncJobsEnabled,
  enqueueWebJob: hoisted.enqueueWebJob,
}));
vi.mock('~/services/ai/llm.server', () => ({
  hydrateRecipeSpec: hoisted.hydrateRecipeSpec,
  AiProviderNotConfiguredError: class extends Error {
    code = 'AI_PROVIDER_NOT_CONFIGURED';
  },
}));

const RECIPE_SPEC_JSON = JSON.stringify({
  type: 'theme.section',
  name: 'Test Section',
  category: 'STOREFRONT_UI',
  requires: [],
  config: {},
});

function moduleWithVersion(overrides?: { generationCorrelationId?: string | null }) {
  return {
    id: 'mod-1',
    generationCorrelationId: overrides?.generationCorrelationId ?? null,
    versions: [{ id: 'ver-1', status: 'DRAFT', hydratedAt: null, specJson: RECIPE_SPEC_JSON, validationReportJson: null }],
    activeVersion: null,
  };
}

function req(fields?: Record<string, string>) {
  const fd = new FormData();
  fd.set('moduleId', 'mod-1');
  for (const [k, v] of Object.entries(fields ?? {})) fd.set(k, v);
  return new Request('https://app.test/api/ai/hydrate-module', { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 'test-shop.myshopify.com' } });
  hoisted.shopFindFirst.mockResolvedValue({ id: 'shop-1', planTier: 'BASIC' });
  hoisted.quotaEnforce.mockResolvedValue(undefined);
  hoisted.getModule.mockResolvedValue(moduleWithVersion());
  hoisted.jobCreate.mockResolvedValue({ id: 'job-1', correlationId: 'corr-1' });
  hoisted.isAsyncJobsEnabled.mockReturnValue(true);
  hoisted.enqueueWebJob.mockImplementation(async (input: { id: string }) => ({
    queueName: 'ai-generation',
    jobId: input.id,
  }));
});

describe('POST /api/ai/hydrate-module — queue mode', () => {
  it('creates the Job with the module generationCorrelationId, enqueues AI_HYDRATE with the schema-shaped payload/trace/attempts:2, returns 202 { async: true, jobId }, and never calls hydrateRecipeSpec', async () => {
    hoisted.getModule.mockResolvedValue(moduleWithVersion({ generationCorrelationId: 'corr-gen-1' }));
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req() });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ async: true, jobId: 'job-1' });

    expect(hoisted.jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 'shop-1',
        type: 'AI_HYDRATE',
        correlationId: 'corr-gen-1',
        payload: { moduleId: 'mod-1', versionId: 'ver-1', moduleType: 'theme.section' },
      }),
    );
    expect(hoisted.enqueueWebJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-1',
        jobType: 'AI_HYDRATE',
        payload: expect.objectContaining({
          kind: 'WEB_AI_HYDRATE',
          shopId: 'shop-1',
          shopDomain: 'test-shop.myshopify.com',
          moduleId: 'mod-1',
          versionId: 'ver-1',
          moduleType: 'theme.section',
        }),
        trace: { correlationId: 'corr-1', shopId: 'shop-1' },
        opts: { attempts: 2 },
      }),
    );
    expect(hoisted.hydrateRecipeSpec).not.toHaveBeenCalled();
    expect(hoisted.jobStart).not.toHaveBeenCalled(); // the worker calls jobs.start, not this route
  });

  it('falls back to the request-context correlationId (jobs.create default) when the module has none', async () => {
    hoisted.getModule.mockResolvedValue(moduleWithVersion({ generationCorrelationId: null }));
    const { action } = await import('~/routes/api.ai.hydrate-module');
    await action({ request: req() });
    expect(hoisted.jobCreate).toHaveBeenCalledWith(expect.objectContaining({ correlationId: undefined }));
  });

  it('enqueueWebJob throws after the Job was created -> failWithPayload the orphaned QUEUED Job, returns a 5xx error body', async () => {
    hoisted.enqueueWebJob.mockRejectedValueOnce(new Error('redis connection refused'));
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req() });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ error: 'INTERNAL_ERROR' }),
    );
    const body = await res.json();
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('the already-hydrated fast path stays synchronous and never touches the job/enqueue seam', async () => {
    hoisted.getModule.mockResolvedValue({
      id: 'mod-1',
      generationCorrelationId: null,
      versions: [
        {
          id: 'ver-1',
          status: 'DRAFT',
          hydratedAt: new Date('2026-01-01T00:00:00Z'),
          specJson: RECIPE_SPEC_JSON,
          validationReportJson: JSON.stringify({ overall: 'PASS', checks: [] }),
        },
      ],
      activeVersion: null,
    });
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(hoisted.jobCreate).not.toHaveBeenCalled();
    expect(hoisted.enqueueWebJob).not.toHaveBeenCalled();
  });

  it('inline mode (isAsyncJobsEnabled false): unchanged synchronous path — calls hydrateRecipeSpec directly, never enqueues', async () => {
    hoisted.isAsyncJobsEnabled.mockReturnValue(false);
    hoisted.hydrateRecipeSpec.mockResolvedValue({
      adminConfig: { defaults: {} },
      themeEditorSettings: {},
      validationReport: { overall: 'PASS', checks: [] },
    });
    const { action } = await import('~/routes/api.ai.hydrate-module');
    const res = await action({ request: req() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(hoisted.enqueueWebJob).not.toHaveBeenCalled();
    expect(hoisted.hydrateRecipeSpec).toHaveBeenCalledTimes(1);
    expect(hoisted.jobStart).toHaveBeenCalledWith('job-1');
    expect(hoisted.jobSucceed).toHaveBeenCalled();
  });
});
