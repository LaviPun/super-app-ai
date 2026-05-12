import { describe, expect, it } from 'vitest';
import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';

describe('anthropicGenerateRecipe', () => {
  it('rejects combining responseSchema with skills', async () => {
    await expect(
      anthropicGenerateRecipe({
        apiKey: 'test',
        model: 'claude-3-5-sonnet-latest',
        prompt: '{}',
        skillsConfig: { skills: ['xlsx'] },
        responseSchema: { name: 'emit_recipe', schema: { type: 'object' } },
      }),
    ).rejects.toThrow(/skills\/code execution cannot be combined/);
  });
});
