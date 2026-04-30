import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchProviderCatalog } from '~/services/ai/provider-model-catalog.server';

describe('fetchProviderCatalog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes OpenAI models and converts pricing to cents per 1M', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'openai/gpt-4o-mini',
            name: 'GPT-4o mini',
            description: 'Fast small model',
            context_length: 128000,
            pricing: { prompt: '0.00000015', completion: '0.0000006', cached: '0.000000075' },
          },
        ],
      }),
    } as Response);

    const rows = await fetchProviderCatalog('OPENAI');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'gpt-4o-mini',
      displayName: 'GPT-4o mini',
      inputPer1MTokensCents: 15,
      outputPer1MTokensCents: 60,
      cachedInputPer1MTokensCents: 8,
    });
  });

  it('filters by provider prefix', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'openai/gpt-4.1', pricing: { prompt: '0.0000002', completion: '0.0000008' } },
          { id: 'anthropic/claude-sonnet-4', pricing: { prompt: '0.000003', completion: '0.000015' } },
        ],
      }),
    } as Response);

    const rows = await fetchProviderCatalog('ANTHROPIC');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe('claude-sonnet-4');
  });
});
