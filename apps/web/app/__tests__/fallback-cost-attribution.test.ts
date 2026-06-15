import { describe, it, expect } from 'vitest';
import { FallbackLlmClient, type GenerateResult, type LlmClient } from '~/services/ai/llm.server';

/**
 * Regression: when a fallback provider actually serves the request, usage/cost
 * must attribute to the served provider — not the default. The seam is
 * `servedProviderId` on the result: each ConfiguredLlmClient stamps its own id,
 * and FallbackLlmClient returns whichever leg served verbatim. `attributeServedCost`
 * then keys the price lookup on the served provider id.
 */
class StubClient implements LlmClient {
  constructor(
    private readonly result: GenerateResult | null,
    private readonly servedProviderId: string | null,
  ) {}
  async generateRecipe(): Promise<GenerateResult> {
    if (!this.result) throw new Error('stub failure');
    return { ...this.result, servedProviderId: this.servedProviderId };
  }
}

const ok: GenerateResult = { rawJson: '{"recipe":{}}', tokensIn: 1, tokensOut: 2, model: 'm' };

describe('FallbackLlmClient served-provider attribution', () => {
  it('reports the primary provider id when the primary serves', async () => {
    const client = new FallbackLlmClient(
      new StubClient(ok, 'prov_primary'),
      new StubClient(ok, 'prov_fallback'),
    );
    const r = await client.generateRecipe('p');
    expect(r.servedProviderId).toBe('prov_primary');
  });

  it('reports the fallback provider id when the primary fails and the fallback serves', async () => {
    const client = new FallbackLlmClient(
      new StubClient(null, 'prov_primary'),
      new StubClient(ok, 'prov_fallback'),
    );
    const r = await client.generateRecipe('p');
    expect(r.servedProviderId).toBe('prov_fallback');
  });

  it('rethrows the primary error when both legs fail (no attribution)', async () => {
    const client = new FallbackLlmClient(
      new StubClient(null, 'prov_primary'),
      new StubClient(null, 'prov_fallback'),
    );
    await expect(client.generateRecipe('p')).rejects.toThrow('stub failure');
  });
});
