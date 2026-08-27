import { describe, expect, it } from 'vitest';
import { ALLOWED_PROVIDER_KINDS, DEFAULT_BASE_URL_BY_KIND } from '~/services/internal/ai-provider.service';

describe('AI provider kind extension (WS-INT)', () => {
  it('includes GROK, DEEPSEEK, MISTRAL alongside the existing kinds', () => {
    for (const kind of ['OPENAI', 'ANTHROPIC', 'GEMINI', 'AZURE_OPENAI', 'CUSTOM', 'GROK', 'DEEPSEEK', 'MISTRAL']) {
      expect(ALLOWED_PROVIDER_KINDS).toContain(kind);
    }
  });

  it('each new kind has a sane OpenAI-compatible default base URL', () => {
    expect(DEFAULT_BASE_URL_BY_KIND.GROK).toBe('https://api.x.ai/v1');
    expect(DEFAULT_BASE_URL_BY_KIND.DEEPSEEK).toBe('https://api.deepseek.com');
    expect(DEFAULT_BASE_URL_BY_KIND.MISTRAL).toBe('https://api.mistral.ai/v1');
  });
});
