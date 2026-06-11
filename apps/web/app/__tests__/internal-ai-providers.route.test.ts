import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireInternalAdminMock = vi.fn();
const upsertDefaultOpenAIMock = vi.fn();
const upsertDefaultClaudeMock = vi.fn();
const updateExtraConfigMock = vi.fn();
const activityLogMock = vi.fn(async () => undefined);
const syncProviderCatalogToDbMock = vi.fn(async () => ({ syncedCount: 1 }));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: requireInternalAdminMock,
}));

vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    upsertDefaultOpenAI = upsertDefaultOpenAIMock;
    upsertDefaultClaude = upsertDefaultClaudeMock;
    updateExtraConfig = updateExtraConfigMock;
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
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
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
