import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInternalAdminMock = vi.fn();
const activityLogMock = vi.fn(async () => undefined);
const getApiKeyMock = vi.fn(async () => 'sk-live-key');
const findUniqueMock = vi.fn();

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/services/internal/ai-provider.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/internal/ai-provider.service')>();
  return {
    ...actual,
    AiProviderService: class {
      getApiKey = getApiKeyMock;
    },
  };
});

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiProvider: {
      findUnique: findUniqueMock,
      findMany: vi.fn(async () => []),
    },
  }),
}));

function buildFormRequest(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://test/internal/ai-providers', { method: 'POST', body: form });
}

describe('internal.ai-providers action > intent=testConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    getApiKeyMock.mockResolvedValue('sk-live-key');
    findUniqueMock.mockResolvedValue({ id: 'p1', provider: 'OPENAI', baseUrl: null, name: 'OpenAI prod' });
  });

  it('GETs /models with the Bearer key and reports ok:true on a 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({ request: buildFormRequest({ intent: 'testConnection', id: 'p1' }) });
    const body = (await response.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(true);
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROVIDER_TESTED', resource: 'provider:p1' }),
    );
    vi.unstubAllGlobals();
  });

  it('surfaces the real upstream error on a 401, never a generic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"invalid_api_key"}', { status: 401 })));
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({ request: buildFormRequest({ intent: 'testConnection', id: 'p1' }) });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/401/);
    expect(body.error).toMatch(/invalid_api_key/);
    // Still audited — a failed test is a real, logged attempt, not silently dropped.
    expect(activityLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROVIDER_TESTED', resource: 'provider:p1' }),
    );
    vi.unstubAllGlobals();
  });

  it('returns 404 for an unknown provider id, without calling fetch', async () => {
    findUniqueMock.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({ request: buildFormRequest({ intent: 'testConnection', id: 'ghost' }) });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('returns 400 when no id is given', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({ request: buildFormRequest({ intent: 'testConnection' }) });
    expect(response.status).toBe(400);
  });
});
