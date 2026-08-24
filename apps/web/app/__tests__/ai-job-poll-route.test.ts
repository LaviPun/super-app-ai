/**
 * WS-C Task 6. `GET /api/ai/jobs/:jobId` — reconnect-safe snapshot of an
 * async generation job (C1): a dropped client connection just re-fetches
 * THIS route; nothing re-runs the pipeline, nothing re-bills. Options are
 * read back from the persisted `AiGenerationOption` rows (Task 5), never
 * re-derived. WS-F depends on this response shape staying stable — see
 * `GenerationJobSnapshot` in the route file.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'test-shop.myshopify.com' } })),
  getForShop: vi.fn(async (_jobId: string, _shopDomain: string) => null as unknown),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/jobs/job.service', () => ({
  JobService: class {
    getForShop = hoisted.getForShop;
  },
}));

function req(jobId: string) {
  return new Request(`https://app.test/api/ai/jobs/${jobId}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 'test-shop.myshopify.com' } });
  hoisted.getForShop.mockResolvedValue(null);
});

describe('GET /api/ai/jobs/:jobId', () => {
  it("unknown job (or another shop's job — getForShop returns null either way) -> 404 NOT_FOUND AppError payload", async () => {
    hoisted.getForShop.mockResolvedValueOnce(null);
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req('job-x'), params: { jobId: 'job-x' } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('NOT_FOUND');
    expect(hoisted.getForShop).toHaveBeenCalledWith('job-x', 'test-shop.myshopify.com');
  });

  it('RUNNING job with 2 VALID + 1 FAILED option rows -> snapshot has 2 options ordered by idx with parsed recipes/badges, status RUNNING, stage generating', async () => {
    hoisted.getForShop.mockResolvedValueOnce({
      id: 'job-1',
      type: 'AI_GENERATE',
      status: 'RUNNING',
      stage: 'generating',
      correlationId: 'corr-1',
      result: null,
      error: null,
      generationOptions: [
        {
          idx: 1,
          approach: 'bold',
          status: 'VALID',
          explanation: 'e1',
          recipeJson: JSON.stringify({ type: 'theme.section', name: 'B' }),
          score: 0.8,
          badgesJson: JSON.stringify(['fast']),
          generationMode: 'freeform',
        },
        {
          idx: 0,
          approach: 'polished',
          status: 'VALID',
          explanation: 'e0',
          recipeJson: JSON.stringify({ type: 'theme.section', name: 'A' }),
          score: null,
          badgesJson: null,
          generationMode: null,
        },
        {
          idx: 2,
          approach: 'minimal',
          status: 'FAILED',
          explanation: null,
          recipeJson: null,
          score: null,
          badgesJson: null,
          generationMode: null,
        },
      ],
    });
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req('job-1'), params: { jobId: 'job-1' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.status).toBe('RUNNING');
    expect(body.stage).toBe('generating');
    expect(body.correlationId).toBe('corr-1');
    // FAILED row (idx 2) excluded; VALID rows ordered by idx ascending.
    expect(body.options.map((o: { index: number }) => o.index)).toEqual([0, 1]);
    expect(body.options[0]).toMatchObject({
      index: 0,
      approach: 'polished',
      explanation: 'e0',
      recipe: { type: 'theme.section', name: 'A' },
      qualityBadges: [],
    });
    expect(body.options[0].score).toBeUndefined();
    expect(body.options[1]).toMatchObject({
      index: 1,
      approach: 'bold',
      score: 0.8,
      qualityBadges: ['fast'],
      generationMode: 'freeform',
    });
    expect(body.recommendedIndex).toBeNull();
    expect(body.error).toBeNull();
  });

  it('FAILED job with a typed AppErrorPayload JSON error -> error.error === NO_VALID_OPTIONS, passed through verbatim', async () => {
    hoisted.getForShop.mockResolvedValueOnce({
      id: 'job-1',
      type: 'AI_GENERATE',
      status: 'FAILED',
      stage: 'finalizing',
      correlationId: 'corr-1',
      result: null,
      error: JSON.stringify({
        error: 'NO_VALID_OPTIONS',
        message: 'Generation produced 0 valid options. Please try again — this attempt was not billed.',
        requestId: 'job-1',
      }),
      generationOptions: [],
    });
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req('job-1'), params: { jobId: 'job-1' } });
    const body = await res.json();
    expect(body.status).toBe('FAILED');
    expect(body.error).toEqual({
      error: 'NO_VALID_OPTIONS',
      message: 'Generation produced 0 valid options. Please try again — this attempt was not billed.',
      requestId: 'job-1',
    });
  });

  it('FAILED job with a legacy plain-string error -> wrapped as { error: INTERNAL_ERROR, message: <string> }, never a 500', async () => {
    hoisted.getForShop.mockResolvedValueOnce({
      id: 'job-1',
      type: 'AI_GENERATE',
      status: 'FAILED',
      stage: null,
      correlationId: null,
      result: null,
      error: 'Error: boom',
      generationOptions: [],
    });
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req('job-1'), params: { jobId: 'job-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toEqual({ error: 'INTERNAL_ERROR', message: 'Error: boom' });
  });

  it('SUCCESS job -> recommendedIndex read from parsed Job.result', async () => {
    hoisted.getForShop.mockResolvedValueOnce({
      id: 'job-1',
      type: 'AI_GENERATE',
      status: 'SUCCESS',
      stage: 'finalizing',
      correlationId: 'corr-1',
      result: JSON.stringify({ optionCount: 2, type: 'theme.section', recommendedIndex: 1, async: true }),
      error: null,
      generationOptions: [],
    });
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req('job-1'), params: { jobId: 'job-1' } });
    const body = await res.json();
    expect(body.status).toBe('SUCCESS');
    expect(body.recommendedIndex).toBe(1);
    expect(body.result).toEqual({ optionCount: 2, type: 'theme.section', recommendedIndex: 1, async: true });
  });

  it('a corrupt recipeJson row is skipped, never a 500', async () => {
    hoisted.getForShop.mockResolvedValueOnce({
      id: 'job-1',
      type: 'AI_GENERATE',
      status: 'RUNNING',
      stage: 'generating',
      correlationId: 'corr-1',
      result: null,
      error: null,
      generationOptions: [
        { idx: 0, approach: 'polished', status: 'VALID', explanation: 'e0', recipeJson: '{not json', score: null, badgesJson: null, generationMode: null },
        {
          idx: 1,
          approach: 'bold',
          status: 'VALID',
          explanation: 'e1',
          recipeJson: JSON.stringify({ type: 'theme.section', name: 'B' }),
          score: null,
          badgesJson: null,
          generationMode: null,
        },
      ],
    });
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req('job-1'), params: { jobId: 'job-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options).toHaveLength(1);
    expect(body.options[0].index).toBe(1);
  });

  it('missing jobId param -> 422 VALIDATION_ERROR, never calls getForShop', async () => {
    const { loader } = await import('~/routes/api.ai.jobs.$jobId');
    const res = await loader({ request: req(''), params: {} });
    expect(res.status).toBe(422);
    expect(hoisted.getForShop).not.toHaveBeenCalled();
  });
});
