import { describe, expect, it, vi, beforeEach } from 'vitest';

// Isolated dispatch test: a GROK-kind AiProvider row must route through the
// existing OpenAI-compatible client (Decision G7) — no new HTTP client is
// added for GROK/DEEPSEEK/MISTRAL, they fall through the same branch CUSTOM/
// AZURE_OPENAI already use.
const findUniqueMock = vi.fn(async () => ({
  id: 'prov_grok',
  provider: 'GROK',
  model: 'grok-beta',
  baseUrl: 'https://api.x.ai/v1',
  extraConfig: null,
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ aiProvider: { findUnique: findUniqueMock } }),
}));

vi.mock('~/services/internal/ai-provider.service', async () => {
  const actual = await vi.importActual<typeof import('~/services/internal/ai-provider.service')>(
    '~/services/internal/ai-provider.service',
  );
  return {
    ...actual,
    AiProviderService: class {
      async getApiKey() {
        return 'xai-test-key';
      }
    },
  };
});

const openAiCompatibleMock = vi.fn(async () => ({ rawJson: '{"recipe":{}}', tokensIn: 1, tokensOut: 2, model: 'grok-beta' }));
vi.mock('~/services/ai/clients/openai-compatible.client.server', () => ({
  openAiCompatibleGenerateRecipe: openAiCompatibleMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueMock.mockResolvedValue({
    id: 'prov_grok',
    provider: 'GROK',
    model: 'grok-beta',
    baseUrl: 'https://api.x.ai/v1',
    extraConfig: null,
  });
});

describe('ConfiguredLlmClient provider dispatch — GROK/DEEPSEEK/MISTRAL (Decision G7)', () => {
  it('a GROK-kind provider routes to openAiCompatibleGenerateRecipe with its stored baseUrl', async () => {
    const { ConfiguredLlmClient } = await import('~/services/ai/llm.server');
    const client = new ConfiguredLlmClient('prov_grok');
    const result = await client.generateRecipe('make a banner');
    expect(openAiCompatibleMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'xai-test-key', baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' }),
    );
    expect(result.servedProviderId).toBe('prov_grok');
  });

  it('a DEEPSEEK-kind provider also routes to openAiCompatibleGenerateRecipe', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'prov_ds',
      provider: 'DEEPSEEK',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      extraConfig: null,
    });
    const { ConfiguredLlmClient } = await import('~/services/ai/llm.server');
    const client = new ConfiguredLlmClient('prov_ds');
    await client.generateRecipe('make a banner');
    expect(openAiCompatibleMock).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }));
  });

  it('a MISTRAL-kind provider also routes to openAiCompatibleGenerateRecipe', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'prov_mistral',
      provider: 'MISTRAL',
      model: 'mistral-large-latest',
      baseUrl: 'https://api.mistral.ai/v1',
      extraConfig: null,
    });
    const { ConfiguredLlmClient } = await import('~/services/ai/llm.server');
    const client = new ConfiguredLlmClient('prov_mistral');
    await client.generateRecipe('make a banner');
    expect(openAiCompatibleMock).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest' }));
  });
});
