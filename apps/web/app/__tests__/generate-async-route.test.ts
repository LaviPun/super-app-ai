/**
 * WS-C Task 5. `POST /api/ai/generate-async` — enqueue-only route (C1): no
 * generation work happens on this request, it just creates the Job and
 * hands it to the queue. Everything heavy (auth, quota, the worker itself)
 * is mocked; the real code under test is auth/rate-limit/quota wiring,
 * ASYNC_DISABLED gating, the exact enqueue call shape, and AppError passthrough.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' }, admin: {} })),
  enforceRateLimit: vi.fn(async () => {}),
  shopUpsert: vi.fn(async () => ({ id: 'shop-1', planTier: 'BASIC' })),
  jobCreate: vi.fn(async () => ({ id: 'job-1' })),
  jobFailWithPayload: vi.fn(async () => {}),
  quotaEnforce: vi.fn(async () => {}),
  refreshPlanTier: vi.fn(async () => 'BASIC'),
  isAsyncJobsEnabled: vi.fn(() => true),
  enqueueWebJob: vi.fn(async (input: { id: string }) => ({ queueName: 'ai-generation', jobId: input.id })),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/security/rate-limit.server', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ shop: { upsert: hoisted.shopUpsert } }),
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    create = hoisted.jobCreate;
    failWithPayload = hoisted.jobFailWithPayload;
  },
}));
vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = hoisted.quotaEnforce;
  },
}));
vi.mock('~/services/shopify/capability.service', () => ({
  CapabilityService: class {
    refreshPlanTier = hoisted.refreshPlanTier;
  },
}));
vi.mock('~/services/jobs/enqueue.server', () => ({
  isAsyncJobsEnabled: hoisted.isAsyncJobsEnabled,
  enqueueWebJob: hoisted.enqueueWebJob,
}));

function req(fields?: Record<string, string>) {
  const fd = new FormData();
  fd.set('prompt', 'make a hero banner');
  for (const [k, v] of Object.entries(fields ?? {})) fd.set(k, v);
  return new Request('https://app.test/api/ai/generate-async', { method: 'POST', body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 'test-shop.myshopify.com' }, admin: {} });
  hoisted.shopUpsert.mockResolvedValue({ id: 'shop-1', planTier: 'BASIC' });
  hoisted.jobCreate.mockResolvedValue({ id: 'job-1' });
  hoisted.quotaEnforce.mockResolvedValue(undefined);
  hoisted.refreshPlanTier.mockResolvedValue('BASIC');
  hoisted.isAsyncJobsEnabled.mockReturnValue(true);
  hoisted.enqueueWebJob.mockImplementation(async (input: { id: string }) => ({
    queueName: 'ai-generation',
    jobId: input.id,
  }));
});

describe('POST /api/ai/generate-async', () => {
  it('inline mode (isAsyncJobsEnabled false) -> 503 ASYNC_DISABLED, never enqueues', async () => {
    hoisted.isAsyncJobsEnabled.mockReturnValue(false);
    const { action } = await import('~/routes/api.ai.generate-async');
    const res = await action({ request: req() });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('ASYNC_DISABLED');
    expect(hoisted.enqueueWebJob).not.toHaveBeenCalled();
    expect(hoisted.jobCreate).not.toHaveBeenCalled();
  });

  it('queue mode -> creates the Job, enqueues AI_GENERATE with the schema-shaped payload/trace/attempts:2, returns { jobId, correlationId }', async () => {
    const { action } = await import('~/routes/api.ai.generate-async');
    const res = await action({ request: req({ correlationId: 'corr-async-1', preferredType: 'theme.section' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ jobId: 'job-1', correlationId: 'corr-async-1' });

    expect(hoisted.jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 'shop-1', type: 'AI_GENERATE', correlationId: 'corr-async-1' }),
    );
    expect(hoisted.enqueueWebJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-1',
        jobType: 'AI_GENERATE',
        payload: expect.objectContaining({
          kind: 'WEB_AI_GENERATE',
          shopId: 'shop-1',
          shopDomain: 'test-shop.myshopify.com',
          prompt: 'make a hero banner',
          preferredType: 'theme.section',
          optionCount: 3,
          planTier: 'BASIC',
        }),
        trace: { correlationId: 'corr-async-1', shopId: 'shop-1' },
        opts: { attempts: 2 },
      }),
    );
  });

  // WS-builder-ux: the Builder's 1/2/3 concept-count control threads through
  // to the job payload the worker actually reads (payload.optionCount ->
  // runGenerationPipeline's optionCount, see ai-generation.processor.server.ts).
  it('threads a merchant-chosen optionCount (2) through to the enqueued payload', async () => {
    const { action } = await import('~/routes/api.ai.generate-async');
    await action({ request: req({ optionCount: '2' }) });
    expect(hoisted.enqueueWebJob).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ optionCount: 2 }) }),
    );
  });

  it('clamps an out-of-range optionCount to 3 rather than trusting the client value', async () => {
    const { action } = await import('~/routes/api.ai.generate-async');
    await action({ request: req({ optionCount: '99' }) });
    expect(hoisted.enqueueWebJob).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ optionCount: 3 }) }),
    );
  });

  it('generates a correlationId when the client omits one', async () => {
    const { action } = await import('~/routes/api.ai.generate-async');
    const res = await action({ request: req() });
    const body = await res.json();
    expect(typeof body.correlationId).toBe('string');
    expect(body.correlationId.length).toBeGreaterThan(0);
  });

  it('missing prompt -> 422 VALIDATION_ERROR AppError payload, never enqueues', async () => {
    const fd = new FormData();
    const { action } = await import('~/routes/api.ai.generate-async');
    const res = await action({ request: new Request('https://app.test/api/ai/generate-async', { method: 'POST', body: fd }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(hoisted.enqueueWebJob).not.toHaveBeenCalled();
  });

  // WS-C commit-0 fold-in (c): enqueueWebJob runs AFTER jobs.create — if it
  // throws (Redis blip, adapter error), the Job row already exists as
  // QUEUED but nothing will ever pick it up or finish it. That orphan must
  // be failed explicitly rather than left as a phantom row a merchant's
  // poll would hang against forever.
  it('enqueueWebJob throws after the Job was created -> failWithPayload the orphaned QUEUED Job, then surfaces the error', async () => {
    hoisted.enqueueWebJob.mockRejectedValueOnce(new Error('redis connection refused'));
    const { action } = await import('~/routes/api.ai.generate-async');
    const res = await action({ request: req() });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(hoisted.jobFailWithPayload).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ error: expect.any(String), message: expect.any(String) }),
    );
  });

  it('quota exceeded (QuotaService.enforce throws AppError RATE_LIMITED) -> its toResponse() (429) passes through unmodified', async () => {
    const { AppError } = await import('~/services/errors/app-error.server');
    hoisted.quotaEnforce.mockRejectedValueOnce(
      new AppError({ code: 'RATE_LIMITED', message: 'Monthly aiRequest quota exceeded.' }),
    );
    const { action } = await import('~/routes/api.ai.generate-async');
    const res = await action({ request: req() });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('RATE_LIMITED');
    expect(hoisted.enqueueWebJob).not.toHaveBeenCalled();
  });
});
