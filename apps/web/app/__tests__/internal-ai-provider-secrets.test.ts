import { describe, expect, it, vi, beforeEach } from 'vitest';

const { providerRows, prismaMock, serviceMocks } = vi.hoisted(() => ({
  providerRows: [
    {
      id: 'provider-1',
      name: 'OpenAI default',
      provider: 'OPENAI' as const,
      baseUrl: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      apiKeyEnc: 'encrypted-secret-blob',
      costInPer1kCents: null,
      costOutPer1kCents: null,
      isActive: true,
      extraConfig: JSON.stringify({ modelCatalog: [{ model: 'gpt-4o-mini', displayName: 'GPT 4o mini' }] }),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ],
  prismaMock: {
    aiModelPrice: { findMany: vi.fn() },
    aiUsage: { findMany: vi.fn() },
  },
  serviceMocks: {
    list: vi.fn(),
    getApiKeyMasked: vi.fn(),
    getDefaultProvidersForSettings: vi.fn(),
  },
}));

vi.mock('~/internal-admin/session.server', () => ({
  requireInternalAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

vi.mock('~/services/internal/ai-provider.service', () => ({
  AiProviderService: class {
    list = serviceMocks.list;
    getApiKeyMasked = serviceMocks.getApiKeyMasked;
    getDefaultProvidersForSettings = serviceMocks.getDefaultProvidersForSettings;
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('~/services/ai/provider-model-catalog.server', () => ({
  syncProviderCatalogToDb: vi.fn(),
  getLatestProviderFeaturePreset: vi.fn(),
}));

import { loader as aiProvidersLoader } from '../routes/internal.ai-providers';
import { buildPromptAudit } from '~/services/ai/llm.server';

describe('internal AI provider secret handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMocks.list.mockResolvedValue(providerRows);
    serviceMocks.getApiKeyMasked.mockResolvedValue('********mini');
    serviceMocks.getDefaultProvidersForSettings.mockResolvedValue({ openai: null, claude: null });
    prismaMock.aiModelPrice.findMany.mockResolvedValue([
      {
        id: 'price-1',
        providerId: 'provider-1',
        provider: providerRows[0],
        model: 'gpt-4o-mini',
        inputPer1MTokensCents: 10,
        outputPer1MTokensCents: 40,
        cachedInputPer1MTokensCents: null,
        isActive: true,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    prismaMock.aiUsage.findMany.mockResolvedValue([]);
  });

  it('does not serialize encrypted provider key material to the browser', async () => {
    const response = await aiProvidersLoader({ request: new Request('http://localhost/internal/ai-providers') });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain('apiKeyEnc');
    expect(serialized).not.toContain('encrypted-secret-blob');
    expect(body.providers[0].apiKeyMasked).toBe('********mini');
    expect(body.prices[0].provider).toEqual({
      id: 'provider-1',
      name: 'OpenAI default',
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
    });
  });

  it('stores prompt audit metadata without raw prompt previews', () => {
    const prompt = 'customer email jane@example.com and private discount notes';
    const audit = buildPromptAudit(prompt);

    expect(audit).toMatchObject({ chars: prompt.length });
    expect(JSON.stringify(audit)).not.toContain('jane@example.com');
    expect(JSON.stringify(audit)).not.toContain('private discount notes');
  });
});
