import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInternalAdminMock = vi.fn();
const upsertDefaultOpenAIMock = vi.fn();
const upsertDefaultClaudeMock = vi.fn();
const updateExtraConfigMock = vi.fn();
const listMock = vi.fn(async () => [] as unknown[]);
const getApiKeyMock = vi.fn(async () => 'sk-ant-api03-abcXYZdefUVWcAAA');
const getApiKeyMaskedMock = vi.fn(async () => '••••••••cAAA');
const getApiKeyPreviewMock = vi.fn(async () => 'sk-ant-…cAAA');
const getDefaultProvidersForSettingsMock = vi.fn(async () => ({ openai: null, claude: null }));
const activityLogMock = vi.fn(async (_input: Record<string, unknown>) => undefined);
const syncProviderCatalogToDbMock = vi.fn(async () => ({ syncedCount: 1 }));
const findUniqueAiProviderMock = vi.fn(async () => null as unknown);
const findManyAiProviderMock = vi.fn(async () => [] as unknown[]);
const findManyAiModelPriceMock = vi.fn(async () => [] as unknown[]);
const findManyAiUsageMock = vi.fn(async () => [] as unknown[]);
const findUniqueAppSettingsMock = vi.fn(async () => null as unknown);
const listProviderAccountSnapshotsMock = vi.fn(async () => [] as unknown[]);

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/internal/ai-provider.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/internal/ai-provider.service')>();
  return {
    ...actual,
    AiProviderService: class {
      upsertDefaultOpenAI = upsertDefaultOpenAIMock;
      upsertDefaultClaude = upsertDefaultClaudeMock;
      updateExtraConfig = updateExtraConfigMock;
      list = listMock;
      getApiKey = getApiKeyMock;
      getApiKeyMasked = getApiKeyMaskedMock;
      getApiKeyPreview = getApiKeyPreviewMock;
      getDefaultProvidersForSettings = getDefaultProvidersForSettingsMock;
    },
  };
});

vi.mock('~/services/internal/ai-account-observability.service', () => ({
  AiAccountObservabilityService: class {
    listProviderAccountSnapshots = listProviderAccountSnapshotsMock;
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = activityLogMock;
  },
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    aiProvider: {
      findUnique: findUniqueAiProviderMock,
      findMany: findManyAiProviderMock,
    },
    aiModelPrice: {
      findMany: findManyAiModelPriceMock,
    },
    aiUsage: {
      findMany: findManyAiUsageMock,
    },
    appSettings: {
      findUnique: findUniqueAppSettingsMock,
    },
  }),
}));

vi.mock('~/services/ai/provider-model-catalog.server', () => ({
  syncProviderCatalogToDb: syncProviderCatalogToDbMock,
  getLatestProviderFeaturePreset: vi.fn(() => ({})),
}));

function buildFormRequest(values: Record<string, string>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return new Request('http://test/internal/ai-providers', { method: 'POST', body: form });
}

describe('internal.ai-providers action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    upsertDefaultOpenAIMock.mockResolvedValue({ id: 'openai-1', provider: 'OPENAI' });
    upsertDefaultClaudeMock.mockResolvedValue({ id: 'claude-1', provider: 'ANTHROPIC' });
    listMock.mockResolvedValue([]);
    getApiKeyMock.mockResolvedValue('sk-ant-api03-abcXYZdefUVWcAAA');
    getApiKeyMaskedMock.mockResolvedValue('••••••••cAAA');
    getApiKeyPreviewMock.mockResolvedValue('sk-ant-…cAAA');
    getDefaultProvidersForSettingsMock.mockResolvedValue({ openai: null, claude: null });
    findUniqueAiProviderMock.mockResolvedValue(null);
    findManyAiProviderMock.mockResolvedValue([]);
    findManyAiModelPriceMock.mockResolvedValue([]);
    findManyAiUsageMock.mockResolvedValue([]);
    findUniqueAppSettingsMock.mockResolvedValue(null);
    listProviderAccountSnapshotsMock.mockResolvedValue([]);
  });

  it('saveOpenAI upserts provider and syncs catalog', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({
      request: buildFormRequest({
        intent: 'saveOpenAI',
        openaiApiKey: 'sk-live',
        openaiModel: 'gpt-4o-mini',
      }),
    });

    expect(upsertDefaultOpenAIMock).toHaveBeenCalledWith({
      apiKey: 'sk-live',
      model: 'gpt-4o-mini',
    });
    expect(syncProviderCatalogToDbMock).toHaveBeenCalledWith({
      providerId: 'openai-1',
      providerKind: 'OPENAI',
    });
    expect(response.status).toBe(302);
  });

  it('saveClaude persists codeExecution in extraConfig', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({
      request: buildFormRequest({
        intent: 'saveClaude',
        claudeApiKey: 'claude-key',
        claudeModel: 'claude-sonnet-4',
        claudeSkills: 'pptx,xlsx',
        claudeCodeExecution: 'true',
      }),
    });

    expect(upsertDefaultClaudeMock).toHaveBeenCalledWith({
      apiKey: 'claude-key',
      model: 'claude-sonnet-4',
      extraConfig: { skills: ['pptx', 'xlsx'], codeExecution: true },
    });
    expect(response.status).toBe(302);
  });

  it('updateExtraConfig stores openai profile defaults', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({
      request: buildFormRequest({
        intent: 'updateExtraConfig',
        id: 'provider-openai',
        providerKind: 'OPENAI',
        openaiReasoningEffort: 'high',
        openaiVerbosity: 'low',
        openaiWebSearch: 'true',
      }),
    });

    expect(updateExtraConfigMock).toHaveBeenCalledWith('provider-openai', {
      openaiFeatures: { reasoningEffort: 'high', verbosity: 'low', webSearch: true },
    });
    expect(response.status).toBe(302);
  });
});

describe('internal.ai-providers loader (key-reveal masking)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    listMock.mockResolvedValue([
      { id: 'provider-1', name: 'Claude (default)', provider: 'ANTHROPIC', baseUrl: null, model: 'claude-sonnet-4', isActive: true, extraConfig: null },
    ]);
    getApiKeyMaskedMock.mockResolvedValue('••••••••cAAA');
    getApiKeyPreviewMock.mockResolvedValue('sk-ant-…cAAA');
    getDefaultProvidersForSettingsMock.mockResolvedValue({ openai: null, claude: null });
    findManyAiModelPriceMock.mockResolvedValue([]);
    findManyAiUsageMock.mockResolvedValue([]);
    findUniqueAppSettingsMock.mockResolvedValue(null);
    listProviderAccountSnapshotsMock.mockResolvedValue([]);
  });

  it('never ships the full decrypted API key in the initial loader payload', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.loader({ request: new Request('http://test/internal/ai-providers') });
    const body = (await response.json()) as { providers: Array<Record<string, unknown>> };

    const fullKey = 'sk-ant-api03-abcXYZdefUVWcAAA';
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(fullKey);
    // getApiKey (the decrypting call) must never be invoked by the loader path.
    expect(getApiKeyMock).not.toHaveBeenCalled();

    expect(body.providers).toHaveLength(1);
    expect(body.providers[0]).not.toHaveProperty('apiKeyEnc');
    expect(body.providers[0]).not.toHaveProperty('apiKey');
  });

  it('includes a server-computed masked preview (prefix + last 4) per provider', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.loader({ request: new Request('http://test/internal/ai-providers') });
    const body = (await response.json()) as { providers: Array<{ apiKeyPreview: string }> };

    expect(body.providers[0]?.apiKeyPreview).toBe('sk-ant-…cAAA');
    expect(getApiKeyPreviewMock).toHaveBeenCalledWith('provider-1');
  });

  it('requires internal-admin auth — redirects when unauthenticated', async () => {
    requireInternalAdminMock.mockImplementationOnce(() => {
      throw new Response(null, { status: 302, headers: { Location: '/internal/login?to=%2Finternal%2Fai-providers' } });
    });
    const mod = await import('~/routes/internal.ai-providers');
    await expect(mod.loader({ request: new Request('http://test/internal/ai-providers') })).rejects.toMatchObject({
      status: 302,
    });
  });
});

describe('internal.ai-providers action — revealApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalAdminMock.mockResolvedValue(undefined);
    getApiKeyMock.mockResolvedValue('sk-ant-api03-abcXYZdefUVWcAAA');
    findUniqueAiProviderMock.mockResolvedValue({
      id: 'provider-1',
      name: 'Claude (default)',
      provider: 'ANTHROPIC',
      isActive: true,
    });
  });

  it('requires internal-admin auth — rejects with redirect when unauthenticated', async () => {
    requireInternalAdminMock.mockImplementationOnce(() => {
      throw new Response(null, { status: 302, headers: { Location: '/internal/login?to=%2Finternal%2Fai-providers' } });
    });
    const mod = await import('~/routes/internal.ai-providers');
    await expect(
      mod.action({
        request: buildFormRequest({ intent: 'revealApiKey', id: 'provider-1' }),
      }),
    ).rejects.toMatchObject({ status: 302 });
    expect(getApiKeyMock).not.toHaveBeenCalled();
    expect(activityLogMock).not.toHaveBeenCalled();
  });

  it('returns the decrypted key on demand and writes an audit row with no key material', async () => {
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({
      request: buildFormRequest({ intent: 'revealApiKey', id: 'provider-1' }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; apiKey: string };
    expect(body.apiKey).toBe('sk-ant-api03-abcXYZdefUVWcAAA');
    expect(getApiKeyMock).toHaveBeenCalledWith('provider-1');

    expect(activityLogMock).toHaveBeenCalledTimes(1);
    const entry = activityLogMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry.actor).toBe('INTERNAL_ADMIN');
    expect(entry.action).toBe('AI_PROVIDER_KEY_REVEALED');
    expect(entry.resource).toBe('provider:provider-1');
    // No key material anywhere in the logged entry.
    expect(JSON.stringify(entry)).not.toContain('sk-ant-api03-abcXYZdefUVWcAAA');
  });

  it('404s when the provider does not exist', async () => {
    findUniqueAiProviderMock.mockResolvedValueOnce(null);
    const mod = await import('~/routes/internal.ai-providers');
    const response = await mod.action({
      request: buildFormRequest({ intent: 'revealApiKey', id: 'missing-provider' }),
    });
    expect(response.status).toBe(404);
    expect(activityLogMock).not.toHaveBeenCalled();
  });
});
