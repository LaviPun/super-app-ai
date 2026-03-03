import type { RecipeSpec } from '@superapp/core';
import { RecipeSpecSchema } from '@superapp/core';
import { AiUsageService } from '~/services/observability/ai-usage.service';
import { resolveProviderIdForShop } from '~/services/ai/provider-routing.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { openAiGenerateRecipe } from '~/services/ai/clients/openai-responses.client.server';
import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';
import { openAiCompatibleGenerateRecipe } from '~/services/ai/clients/openai-compatible.client.server';

import { getPrisma } from '~/db.server';

export interface LlmClient {
  generateRecipe(prompt: string, hints?: { previousError?: string }): Promise<{ rawJson: string; tokensIn: number; tokensOut: number; model?: string }>;
}

export class StubLlmClient implements LlmClient {
  async generateRecipe(prompt: string): Promise<{ rawJson: string; tokensIn: number; tokensOut: number; model?: string }> {
    const rawJson = JSON.stringify({
      type: 'theme.banner',
      name: 'AI Banner',
      requires: ['THEME_ASSETS'],
      config: { heading: prompt.slice(0, 40) || 'Hello', enableAnimation: false },
    });
    return { rawJson, tokensIn: Math.min(200, prompt.length), tokensOut: 300, model: 'stub' };
  }
}

export class ConfiguredLlmClient implements LlmClient {
  constructor(private readonly providerId: string, private readonly shopId?: string) {}

  async generateRecipe(prompt: string, hints?: { previousError?: string }) {
    const prisma = getPrisma();
    const provider = await prisma.aiProvider.findUnique({ where: { id: this.providerId } });
    if (!provider) throw new Error('AI provider not found');

    const apiKey = await new AiProviderService().getApiKey(provider.id);
    const model = provider.model ?? '';
    if (!model) throw new Error('Provider missing default model');

    const augmentedPrompt = hints?.previousError
      ? `${prompt}

(Previous validation error: ${hints.previousError})`
      : prompt;

    if (provider.provider === 'OPENAI') {
      return openAiGenerateRecipe({
        apiKey,
        baseUrl: provider.baseUrl ?? undefined,
        model,
        prompt: augmentedPrompt,
        shopId: this.shopId,
      });
    }

    if (provider.provider === 'ANTHROPIC') {
      return anthropicGenerateRecipe({
        apiKey,
        baseUrl: provider.baseUrl ?? undefined,
        model,
        prompt: augmentedPrompt,
        shopId: this.shopId,
      });
    }

    // CUSTOM or AZURE_OPENAI: treat as OpenAI-compatible
    return openAiCompatibleGenerateRecipe({
      apiKey,
      baseUrl: provider.baseUrl ?? 'https://api.openai.com',
      model,
      prompt: augmentedPrompt,
      shopId: this.shopId,
    });
  }
}

export async function getLlmClient(shopId?: string | null): Promise<{ client: LlmClient; providerId: string | null }> {
  const providerId = await resolveProviderIdForShop(shopId);
  if (!providerId) return { client: new StubLlmClient(), providerId: null };
  return { client: new ConfiguredLlmClient(providerId, shopId ?? undefined), providerId };
}

export async function generateValidatedRecipe(
  prompt: string,
  options?: { shopId?: string; action?: string; maxAttempts?: number }
): Promise<RecipeSpec> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const action = options?.action ?? 'RECIPE_GENERATION';
  const { client, providerId } = await getLlmClient(options?.shopId ?? null);
  const usage = new AiUsageService();

  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const { rawJson, tokensIn, tokensOut, model } = await client.generateRecipe(prompt, { previousError: lastErr ? String(lastErr) : undefined });
    try {
      const parsed = RecipeSpecSchema.parse(JSON.parse(rawJson));
      if (providerId) {
        const costCents = await estimateCostCentsFromDb(providerId, model ?? '', tokensIn, tokensOut);
        await usage.record({ providerId, shopId: options?.shopId, action, tokensIn, tokensOut, costCents, meta: { attempts: i + 1, model }, requestCount: 1 });
      }
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`AI recipe generation failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

async function estimateCostCentsFromDb(providerId: string, model: string, tokensIn: number, tokensOut: number) {
  const prisma = getPrisma();
  const price = await prisma.aiModelPrice.findFirst({
    where: { providerId, model, isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!price) return 0;
  const inCents = (tokensIn / 1_000_000) * price.inputPer1MTokensCents;
  const outCents = (tokensOut / 1_000_000) * price.outputPer1MTokensCents;
  return Math.round(inCents + outCents);
}
