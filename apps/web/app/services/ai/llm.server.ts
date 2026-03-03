import type { RecipeSpec, ModuleType } from '@superapp/core';
import { RecipeSpecSchema } from '@superapp/core';
import { AiUsageService } from '~/services/observability/ai-usage.service';
import { resolveProviderIdForShop } from '~/services/ai/provider-routing.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { openAiGenerateRecipe } from '~/services/ai/clients/openai-responses.client.server';
import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';
import { openAiCompatibleGenerateRecipe } from '~/services/ai/clients/openai-compatible.client.server';
import { getModuleSummary, getAllTypesSummary } from '~/services/ai/module-summaries.server';
import { getCatalogDetailsForType } from '~/services/ai/catalog-details.server';
import { getPromptExpectations, getModifyPromptExpectations, PROMPT_PURPOSE_AND_GUIDANCE } from '~/services/ai/prompt-expectations.server';

import { getPrisma } from '~/db.server';

export type RecipeOption = { explanation: string; recipe: RecipeSpec };

export interface LlmClient {
  generateRecipe(prompt: string, hints?: { previousError?: string }): Promise<{ rawJson: string; tokensIn: number; tokensOut: number; model?: string }>;
}

export class StubLlmClient implements LlmClient {
  async generateRecipe(prompt: string): Promise<{ rawJson: string; tokensIn: number; tokensOut: number; model?: string }> {
    const rawJson = JSON.stringify({
      recipe: {
        type: 'theme.banner',
        name: 'AI Banner',
        requires: ['THEME_ASSETS'],
        config: { heading: prompt.slice(0, 40) || 'Hello', enableAnimation: false },
      },
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

/** Uses OPENAI_API_KEY (and optional OPENAI_DEFAULT_MODEL) from env when no provider is in DB. */
class EnvOpenAiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly shopId?: string,
  ) {}

  async generateRecipe(prompt: string, hints?: { previousError?: string }) {
    const augmentedPrompt = hints?.previousError
      ? `${prompt}\n\n(Previous validation error: ${hints.previousError})`
      : prompt;
    return openAiGenerateRecipe({
      apiKey: this.apiKey,
      model: this.model,
      prompt: augmentedPrompt,
      shopId: this.shopId,
    });
  }
}

export async function getLlmClient(shopId?: string | null): Promise<{ client: LlmClient; providerId: string | null }> {
  const providerId = await resolveProviderIdForShop(shopId);
  if (providerId) return { client: new ConfiguredLlmClient(providerId, shopId ?? undefined), providerId };

  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) {
    const model = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-5-mini';
    return { client: new EnvOpenAiClient(envKey, model, shopId ?? undefined), providerId: null };
  }

  return { client: new StubLlmClient(), providerId: null };
}

/** All inputs are strings; returns a single compiled prompt string to send to the AI. */
export function compileCreateModulePrompt(params: {
  purposeAndGuidance: string;
  typesList: string;
  moduleType: string;
  summary: string;
  expectations: string;
  userRequest: string;
  catalogDetails?: string;
  previousError?: string;
}): string {
  const parts: string[] = [
    params.purposeAndGuidance,
    '',
    'Task: Generate exactly 3 different module options for the merchant\'s request. Vary by approach (content, trigger, when/where it shows, or styling).',
    '',
    params.typesList,
    '',
    `Recommended type for this request: ${params.moduleType}`,
    params.summary,
    '',
    params.expectations,
    '',
    `User request: ${params.userRequest}`,
  ];
  if (params.catalogDetails) {
    parts.push('', params.catalogDetails);
  }
  if (params.previousError) {
    parts.push('', `(Previous error: ${params.previousError})`);
  }
  return parts.join('\n');
}

/** All inputs are strings; returns a single compiled prompt string to send to the AI. */
export function compileModifyModulePrompt(params: {
  summary: string;
  expectations: string;
  currentSpecJson: string;
  userInstruction: string;
  previousError?: string;
}): string {
  const parts: string[] = [
    'You are modifying an existing Shopify module. Generate exactly 3 different modification options based on the user\'s instruction. Each option should take a different approach to the requested change.',
    '',
    params.summary,
    '',
    params.expectations,
    '',
    'Current RecipeSpec (preserve this shape; only change what the user asked):',
    params.currentSpecJson,
    '',
    `User requested change: ${params.userInstruction}`,
  ];
  if (params.previousError) {
    parts.push('', `(Previous error: ${params.previousError})`);
  }
  return parts.join('\n');
}

/**
 * Unwrap the `{ recipe: ... }` wrapper that structured output produces.
 * Falls back to treating the whole object as a recipe for backward compatibility.
 */
function unwrapRecipe(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'recipe' in raw) return (raw as any).recipe;
  return raw;
}

const TYPE_CATEGORY_REQUIRES: Record<string, { category: string; requires: string[] }> = {
  'theme.banner': { category: 'STOREFRONT_UI', requires: ['THEME_ASSETS'] },
  'theme.popup': { category: 'STOREFRONT_UI', requires: ['THEME_ASSETS'] },
  'theme.notificationBar': { category: 'STOREFRONT_UI', requires: ['THEME_ASSETS'] },
  'proxy.widget': { category: 'STOREFRONT_UI', requires: ['APP_PROXY'] },
  'functions.discountRules': { category: 'FUNCTION', requires: ['DISCOUNT_FUNCTION'] },
  'functions.deliveryCustomization': { category: 'FUNCTION', requires: ['SHIPPING_FUNCTION'] },
  'functions.paymentCustomization': { category: 'FUNCTION', requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'] },
  'functions.cartAndCheckoutValidation': { category: 'FUNCTION', requires: ['VALIDATION_FUNCTION'] },
  'functions.cartTransform': { category: 'FUNCTION', requires: ['CART_TRANSFORM_FUNCTION_UPDATE'] },
  'checkout.upsell': { category: 'STOREFRONT_UI', requires: ['CHECKOUT_UI_INFO_SHIP_PAY'] },
  'integration.httpSync': { category: 'INTEGRATION', requires: [] },
  'flow.automation': { category: 'FLOW', requires: [] },
  'platform.extensionBlueprint': { category: 'ADMIN_UI', requires: [] },
  'customerAccount.blocks': { category: 'CUSTOMER_ACCOUNT', requires: ['CUSTOMER_ACCOUNT_UI'] },
};

const CONFIG_ENUM_KEYS: Record<string, string[]> = {
  'theme.popup': ['trigger', 'frequency', 'showOnPages'],
  'theme.banner': [],
  'theme.notificationBar': [],
  'proxy.widget': ['mode'],
};

const ENUM_ALIASES: Record<string, Record<string, string>> = {
  trigger: {
    EXIT_INTENT: 'ON_EXIT_INTENT',
    EXIT: 'ON_EXIT_INTENT',
    SCROLL_25: 'ON_SCROLL_25',
    SCROLL_50: 'ON_SCROLL_50',
    SCROLL_75: 'ON_SCROLL_75',
    LOAD: 'ON_LOAD',
    CLICK: 'ON_CLICK',
    TIMED: 'TIMED',
  },
  frequency: {
    EVERY_VISIT: 'EVERY_VISIT',
    ONCE_PER_SESSION: 'ONCE_PER_SESSION',
    ONCE_PER_DAY: 'ONCE_PER_DAY',
    ONCE_PER_WEEK: 'ONCE_PER_WEEK',
    ONCE_EVER: 'ONCE_EVER',
    SESSION: 'ONCE_PER_SESSION',
    DAY: 'ONCE_PER_DAY',
    WEEK: 'ONCE_PER_WEEK',
  },
  showOnPages: {
    ALL: 'ALL',
    HOMEPAGE: 'HOMEPAGE',
    COLLECTION: 'COLLECTION',
    PRODUCT: 'PRODUCT',
    CART: 'CART',
    CUSTOM: 'CUSTOM',
    HOME: 'HOMEPAGE',
  },
};

function toUpperSnake(s: string): string {
  return String(s).replace(/\s+/g, '_').toUpperCase();
}

function normalizeEnumValue(key: string, value: string): string {
  const u = toUpperSnake(value);
  const map = ENUM_ALIASES[key];
  if (map && map[u]) return map[u];
  return u;
}

/**
 * Repair common AI output issues before Zod: default category/requires, normalize enums, coerce numbers, clamp name.
 * Merges AI's "settings" + "controls" into "config" and strips non-spec keys (assets, meta).
 */
function repairRecipeForValidation(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  const type = o.type as string | undefined;
  if (!type || typeof type !== 'string') return o;

  if (o.settings || o.controls) {
    o.config = {
      ...(typeof o.config === 'object' && o.config ? (o.config as object) : {}),
      ...(typeof o.settings === 'object' && o.settings ? (o.settings as object) : {}),
      ...(typeof o.controls === 'object' && o.controls ? (o.controls as object) : {}),
    };
    delete o.settings;
    delete o.controls;
  }
  delete o.assets;
  delete o.meta;

  const meta = TYPE_CATEGORY_REQUIRES[type];
  if (meta) {
    if (!o.category) o.category = meta.category;
    if (!Array.isArray(o.requires)) o.requires = meta.requires;
  }

  if (typeof o.name !== 'string') o.name = 'Unnamed module';
  let name = o.name.trim();
  if (name.length < 3) name = name.padEnd(3, ' ');
  if (name.length > 80) name = name.slice(0, 80);
  o.name = name;

  const config = o.config as Record<string, unknown> | undefined;
  if (config && typeof config === 'object') {
    if (type === 'theme.popup' && !config.title && typeof config.heading === 'string') {
      config.title = config.heading;
    }
    if (type === 'theme.banner' && !config.heading && typeof config.title === 'string') {
      config.heading = config.title;
    }
    const urlKeys = ['ctaUrl', 'secondaryCtaUrl', 'linkUrl'];
    for (const k of urlKeys) {
      if (config[k] === '' || (typeof config[k] === 'string' && !(config[k] as string).startsWith('http'))) {
        delete config[k];
      }
    }
    if (config.secondaryCtaText === '') delete config.secondaryCtaText;
  }
  const enumKeys = CONFIG_ENUM_KEYS[type];
  if (config && typeof config === 'object' && enumKeys?.length) {
    for (const key of enumKeys) {
      const v = config[key];
      if (typeof v === 'string') config[key] = normalizeEnumValue(key, v);
    }
    const numericKeys = ['delaySeconds', 'maxShowsPerDay', 'autoCloseSeconds', 'countdownSeconds'];
    for (const key of numericKeys) {
      if (config[key] !== undefined && typeof config[key] === 'string') {
        const n = Number((config[key] as string).replace(/\D/g, ''));
        if (!Number.isNaN(n)) config[key] = n;
      }
    }
  }

  const style = o.style as Record<string, unknown> | undefined;
  if (style?.layout && typeof style.layout === 'object') {
    const layout = style.layout as Record<string, unknown>;
    const anchor = layout.anchor;
    if (typeof anchor === 'string' && !['top', 'bottom', 'left', 'right', 'center'].includes(anchor)) {
      if (anchor.includes('bottom')) layout.anchor = 'bottom';
      else if (anchor.includes('top')) layout.anchor = 'top';
      else if (anchor.includes('right')) layout.anchor = 'right';
      else if (anchor.includes('left')) layout.anchor = 'left';
      else layout.anchor = 'center';
    }
    if (typeof layout.offsetX === 'string') layout.offsetX = Number(layout.offsetX) || 0;
    if (typeof layout.offsetY === 'string') layout.offsetY = Number(layout.offsetY) || 0;
  }

  return o;
}

export async function generateValidatedRecipe(
  prompt: string,
  options?: { shopId?: string; action?: string; maxAttempts?: number }
): Promise<RecipeSpec> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const action = options?.action ?? 'RECIPE_GENERATION';
  const { client, providerId } = await getLlmClient(options?.shopId ?? null);
  const usage = new AiUsageService();

  const wrappedPrompt = prompt + '\n\nRespond with a JSON object containing a single key "recipe" whose value is the RecipeSpec.';

  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const { rawJson, tokensIn, tokensOut, model } = await client.generateRecipe(wrappedPrompt, { previousError: lastErr ? String(lastErr) : undefined });
    try {
      const parsed = RecipeSpecSchema.parse(unwrapRecipe(JSON.parse(rawJson)));
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

/**
 * Takes an existing RecipeSpec + a user instruction and asks the AI to return
 * a modified version. Enforces same module type unless `allowTypeChange` is set.
 */
export async function modifyRecipeSpec(
  currentSpec: RecipeSpec,
  instruction: string,
  options?: { shopId?: string; maxAttempts?: number; allowTypeChange?: boolean },
): Promise<RecipeSpec> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const { client, providerId } = await getLlmClient(options?.shopId ?? null);
  const usage = new AiUsageService();

  const modifyPrompt = `You are modifying an existing Shopify module. Here is the current RecipeSpec JSON:

${JSON.stringify(currentSpec, null, 2)}

User requested change: ${instruction}

Output a JSON object with a single key "recipe" whose value is the complete updated RecipeSpec. Keep the same "type" field ("${currentSpec.type}") unless the user explicitly asks to change module type. Preserve all existing fields that the user did not ask to change.`;

  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const { rawJson, tokensIn, tokensOut, model } = await client.generateRecipe(modifyPrompt, {
      previousError: lastErr ? String(lastErr) : undefined,
    });
    try {
      const parsed = RecipeSpecSchema.parse(unwrapRecipe(JSON.parse(rawJson)));
      if (!options?.allowTypeChange && parsed.type !== currentSpec.type) {
        throw new Error(`AI changed module type from "${currentSpec.type}" to "${parsed.type}". Type changes are not allowed in modify mode.`);
      }
      if (providerId) {
        const costCents = await estimateCostCentsFromDb(providerId, model ?? '', tokensIn, tokensOut);
        await usage.record({ providerId, shopId: options?.shopId, action: 'RECIPE_MODIFY', tokensIn, tokensOut, costCents, meta: { attempts: i + 1, model }, requestCount: 1 });
      }
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`AI recipe modification failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

/**
 * Generate 3 recipe options for a given prompt. Compiles all prompt parts into a single string, then sends that to the AI.
 */
export async function generateValidatedRecipeOptions(
  prompt: string,
  classification: { moduleType: ModuleType; intent?: string; surface?: string },
  options?: { shopId?: string; maxAttempts?: number },
): Promise<RecipeOption[]> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const { client, providerId } = await getLlmClient(options?.shopId ?? null);
  const usage = new AiUsageService();

  const purposeAndGuidance = PROMPT_PURPOSE_AND_GUIDANCE;
  const typesList = getAllTypesSummary();
  const summary = getModuleSummary(classification.moduleType);
  const expectations = getPromptExpectations(classification.moduleType);

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const catalogDetails =
      attempt > 0 ? getCatalogDetailsForType(classification.moduleType, classification.intent, classification.surface) : undefined;
    const compiledPrompt = compileCreateModulePrompt({
      purposeAndGuidance,
      typesList,
      moduleType: classification.moduleType,
      summary,
      expectations,
      userRequest: prompt,
      catalogDetails,
      previousError: lastErr ? String(lastErr) : undefined,
    });

    const { rawJson, tokensIn, tokensOut, model } = await client.generateRecipe(compiledPrompt);

    try {
      const parsed = JSON.parse(rawJson);
      const optionsArr = parsed?.options ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(optionsArr) || optionsArr.length === 0) {
        throw new Error('Response missing "options" array');
      }

      const validated: RecipeOption[] = [];
      let firstValidationError: string | undefined;
      for (const opt of optionsArr) {
        try {
          const raw = unwrapRecipe(opt?.recipe ?? opt);
          const repaired = repairRecipeForValidation(raw);
          const recipe = RecipeSpecSchema.parse(repaired);
          validated.push({
            explanation: typeof opt?.explanation === 'string' ? opt.explanation : `Option ${validated.length + 1}`,
            recipe,
          });
        } catch (err) {
          if (!firstValidationError) firstValidationError = err instanceof Error ? err.message : String(err);
        }
      }

      if (validated.length === 0) {
        throw new Error(firstValidationError ?? 'All 3 options failed Zod validation');
      }

      if (providerId) {
        const costCents = await estimateCostCentsFromDb(providerId, model ?? '', tokensIn, tokensOut);
        await usage.record({
          providerId, shopId: options?.shopId, action: 'RECIPE_GENERATION_OPTIONS',
          tokensIn, tokensOut, costCents,
          meta: { attempts: attempt + 1, model, validOptions: validated.length },
          requestCount: 1,
        });
      }

      return validated;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`AI recipe options generation failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

/**
 * Generate 3 modified recipe options for an existing module.
 * Compiles all prompt parts into a single string, then sends that to the AI.
 */
export async function modifyRecipeSpecOptions(
  currentSpec: RecipeSpec,
  instruction: string,
  options?: { shopId?: string; maxAttempts?: number; allowTypeChange?: boolean },
): Promise<RecipeOption[]> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const { client, providerId } = await getLlmClient(options?.shopId ?? null);
  const usage = new AiUsageService();

  const summary = getModuleSummary(currentSpec.type);
  const expectations = getModifyPromptExpectations();
  const currentSpecJson = JSON.stringify(currentSpec, null, 2);

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const compiledPrompt = compileModifyModulePrompt({
      summary: `Current module type: ${currentSpec.type}\n${summary}`,
      expectations,
      currentSpecJson,
      userInstruction: instruction,
      previousError: lastErr ? String(lastErr) : undefined,
    });

    const { rawJson, tokensIn, tokensOut, model } = await client.generateRecipe(compiledPrompt);

    try {
      const parsed = JSON.parse(rawJson);
      const optionsArr = parsed?.options ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(optionsArr) || optionsArr.length === 0) {
        throw new Error('Response missing "options" array');
      }

      const validated: RecipeOption[] = [];
      let firstValidationError: string | undefined;
      for (const opt of optionsArr) {
        try {
          const raw = unwrapRecipe(opt?.recipe ?? opt);
          const repaired = repairRecipeForValidation(raw);
          const recipe = RecipeSpecSchema.parse(repaired);
          if (!options?.allowTypeChange && recipe.type !== currentSpec.type) continue;
          validated.push({
            explanation: typeof opt?.explanation === 'string' ? opt.explanation : `Modification ${validated.length + 1}`,
            recipe,
          });
        } catch (err) {
          if (!firstValidationError) firstValidationError = err instanceof Error ? err.message : String(err);
        }
      }

      if (validated.length === 0) {
        throw new Error(firstValidationError ?? 'All modification options failed validation');
      }

      if (providerId) {
        const costCents = await estimateCostCentsFromDb(providerId, model ?? '', tokensIn, tokensOut);
        await usage.record({
          providerId, shopId: options?.shopId, action: 'RECIPE_MODIFY_OPTIONS',
          tokensIn, tokensOut, costCents,
          meta: { attempts: attempt + 1, model, validOptions: validated.length },
          requestCount: 1,
        });
      }

      return validated;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(`AI recipe modify options failed after ${maxAttempts} attempts: ${String(lastErr)}`);
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
