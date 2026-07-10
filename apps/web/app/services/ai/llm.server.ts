import type { RecipeSpec, ModuleType, RecipeBlueprint } from '@superapp/core';
import crypto from 'node:crypto';
import { RecipeSpecSchema, validateBlueprintCoherence } from '@superapp/core';
import type { BlueprintPlan } from '~/services/ai/blueprint-planner';
import { getBlueprintCatalogEntry, buildCompositeManifest } from '~/services/ai/blueprint-catalog';
import { isMerchantCodeExecutionAllowed } from '~/env.server';
import { AiUsageService } from '~/services/observability/ai-usage.service';
import { resolveProviderIdForShop, resolveShopProviderOverrideId } from '~/services/ai/provider-routing.server';
import { getCostRankedActiveProviders } from '~/services/ai/provider-cost-routing.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { openAiGenerateRecipe } from '~/services/ai/clients/openai-responses.client.server';
import { anthropicGenerateRecipe } from '~/services/ai/clients/anthropic-messages.client.server';
import { openAiCompatibleGenerateRecipe } from '~/services/ai/clients/openai-compatible.client.server';
import { geminiGenerateRecipe } from '~/services/ai/clients/gemini.client.server';
import { getModuleSummary, getAllTypesSummary } from '~/services/ai/module-summaries.server';
import { CONFIDENCE_THRESHOLDS } from '~/services/ai/classify.server';
import { getCatalogDetails, getCatalogDetailsForType } from '~/services/ai/catalog-details.server';
import {
  getPromptExpectations,
  getModifyPromptExpectations,
  PROMPT_PURPOSE_AND_GUIDANCE,
  UI_DESIGNER_REFINEMENT_PASS,
  FRONTEND_DEVELOPER_REFINEMENT_PASS,
  PREMIUM_OUTPUT_GUARDRAILS,
  getFullRecipeSchemaSpec,
  getStorefrontStyleSchemaSpec,
  getSettingsPack,
} from '~/services/ai/prompt-expectations.server';
import { buildHydratePrompt } from '~/services/ai/hydrate-prompt.server';
import { wrapUserRequestForPrompt } from '~/services/ai/injection-scan.server';
import {
  RecipeDiscriminatorError,
  assertKnownDiscriminator,
} from '~/services/ai/recipe-discriminator-guard.server';
import { HydrateEnvelopeSchema, type HydrateEnvelope, validatePerfectConfig } from '~/schemas/hydrate-envelope.server';
import { estimateCostCentsFromDbRates } from '~/services/ai/cost-estimate.server';
import {
  getRecipeTokenBudget,
  getRecipeOptionsTokenBudget,
  getRepairTokenBudget,
} from '~/services/ai/token-budget.server';
import {
  getRecipeOptionsJsonSchemaForType,
  getRecipeSingleJsonSchemaForType,
} from '~/services/ai/recipe-json-schema.server';
import type { PromptRouterDecision } from '~/schemas/prompt-router.server';
import { buildDesignReferencePromptBlock, buildDesignSystemDirectiveForReference, resolveDesignReferencePack, resolveStoreDesignReferencePack, type DesignReferencePack } from '~/services/ai/design-reference.server';
import { buildDesignQaCorrection, runDesignQa, summarizeQa } from '~/services/ai/design-qa.server';

import { getPrisma } from '~/db.server';

export type RecipeOption = { explanation: string; recipe: RecipeSpec };

/** JSON Schema hint passed to providers that support structured output. */
export interface ResponseSchemaHint {
  name?: string;
  schema: Record<string, unknown>;
}

export interface GenerateHints {
  previousError?: string;
  maxTokens?: number;
  responseSchema?: ResponseSchemaHint;
}

export interface LlmClient {
  generateRecipe(prompt: string, hints?: GenerateHints): Promise<GenerateResult>;
}

/**
 * Result of a single LLM call.
 * `servedProviderId` names the DB provider that actually served the request, so
 * cost/usage can be attributed to the real model even when a fallback served it.
 * It is `null`/absent for env-key clients (no DB provider row) and stamped with
 * the provider id by `ConfiguredLlmClient`.
 */
export interface GenerateResult {
  rawJson: string;
  tokensIn: number;
  tokensOut: number;
  model?: string;
  servedProviderId?: string | null;
}

export function guardAnthropicSkillsConfig(
  skillsConfig: { skills?: string[]; codeExecution?: boolean } | undefined,
  options: { blockMerchantCodeExecution: boolean },
): { skills?: string[]; codeExecution?: boolean } | undefined {
  if (!skillsConfig) return undefined;
  if (!skillsConfig.codeExecution) return skillsConfig;
  return {
    ...skillsConfig,
    codeExecution: !options.blockMerchantCodeExecution && isMerchantCodeExecutionAllowed(),
  };
}

export class StubLlmClient implements LlmClient {
  async generateRecipe(prompt: string, _hints?: GenerateHints): Promise<{ rawJson: string; tokensIn: number; tokensOut: number; model?: string }> {
    const lower = prompt.toLowerCase();
    const make = (spec: RecipeSpec): string => JSON.stringify(spec);

    let rawJson: string;
    if (lower.includes('exit-intent') || lower.includes('popup')) {
      rawJson = make({
        type: 'theme.section',
        name: 'Stub Popup',
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        config: { kind: 'popup', activation: 'overlay', title: 'Get 10% Off', trigger: 'ON_EXIT_INTENT', frequency: 'ONCE_PER_DAY', fields: {}, blocks: [] },
      } as RecipeSpec);
    } else if (lower.includes('notification bar') || lower.includes('dismissible')) {
      rawJson = make({
        type: 'theme.section',
        name: 'Stub Notification Bar',
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        config: { kind: 'notification-bar', activation: 'global', fields: { message: 'Free shipping on orders over $50', dismissible: true }, blocks: [] },
      } as RecipeSpec);
    } else if (lower.includes('store locator') || lower.includes('widget')) {
      rawJson = make({
        type: 'proxy.widget',
        name: 'Stub Widget',
        category: 'STOREFRONT_UI',
        requires: ['APP_PROXY'],
        config: { widgetId: 'store-finder', title: 'Find a Store', mode: 'HTML' },
      } as RecipeSpec);
    } else if (lower.includes('discount') || lower.includes('vip')) {
      rawJson = make({
        type: 'functions.discountRules',
        name: 'Stub Discount Rules',
        category: 'FUNCTION',
        requires: ['DISCOUNT_FUNCTION'],
        config: { rules: [{ when: { customerTags: ['VIP'], minSubtotal: 100 }, apply: { percentageOff: 15 } }], combineWithOtherDiscounts: true },
      } as RecipeSpec);
    } else if (lower.includes('shipping method') || lower.includes('cash on delivery')) {
      rawJson = make({
        type: 'functions.deliveryCustomization',
        name: 'Stub Delivery Customization',
        category: 'FUNCTION',
        requires: ['SHIPPING_FUNCTION'],
        config: { rules: [{ when: {}, actions: { hideMethodsContaining: ['Cash on Delivery'] } }] },
      } as RecipeSpec);
    } else if (lower.includes('payment method') || lower.includes('pay later')) {
      rawJson = make({
        type: 'functions.paymentCustomization',
        name: 'Stub Payment Customization',
        category: 'FUNCTION',
        requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'],
        config: { rules: [{ when: { minSubtotal: 50 }, actions: { hideMethodsContaining: ['Pay Later'] } }] },
      } as RecipeSpec);
    } else if (lower.includes('block checkout') || lower.includes('quantity exceeds')) {
      rawJson = make({
        type: 'functions.cartAndCheckoutValidation',
        name: 'Stub Cart Validation',
        category: 'FUNCTION',
        requires: ['VALIDATION_FUNCTION'],
        config: { rules: [{ when: { maxQuantityPerSku: 10 }, errorMessage: 'Max 10 per item' }] },
      } as RecipeSpec);
    } else if (lower.includes('automation') || lower.includes('order is created')) {
      rawJson = make({
        type: 'flow.automation',
        name: 'Stub Flow Automation',
        category: 'FLOW',
        requires: [],
        config: {
          trigger: 'SHOPIFY_WEBHOOK_ORDER_CREATED',
          steps: [{ kind: 'HTTP_REQUEST', connectorId: 'test-connector-id', path: '/api/orders', method: 'POST', bodyMapping: {} }],
        },
      } as RecipeSpec);
    } else {
      rawJson = make({
        type: 'theme.section',
        name: 'Stub Banner',
        category: 'STOREFRONT_UI',
        requires: ['THEME_ASSETS'],
        config: { kind: 'banner', activation: 'section', fields: { heading: prompt.slice(0, 40) || 'Hello', enableAnimation: false }, blocks: [] },
      } as RecipeSpec);
    }
    return { rawJson, tokensIn: Math.min(200, prompt.length), tokensOut: 300, model: 'stub' };
  }
}

export class ConfiguredLlmClient implements LlmClient {
  constructor(
    private readonly providerId: string,
    private readonly shopId?: string,
    private readonly blockMerchantCodeExecution = false,
  ) {}

  async generateRecipe(prompt: string, hints?: GenerateHints): Promise<GenerateResult> {
    // Stamp the served provider id so cost/usage attributes to this provider's
    // model even when this client is the fallback leg of a FallbackLlmClient.
    const res = await this.callProvider(prompt, hints);
    return { ...res, servedProviderId: this.providerId };
  }

  private async callProvider(prompt: string, hints?: GenerateHints): Promise<GenerateResult> {
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
      let openaiFeatures:
        | { reasoningEffort?: 'low' | 'medium' | 'high'; verbosity?: 'low' | 'medium' | 'high'; webSearch?: boolean }
        | undefined;
      if (provider.extraConfig) {
        try {
          const parsed = JSON.parse(provider.extraConfig) as {
            openaiFeatures?: { reasoningEffort?: 'low' | 'medium' | 'high'; verbosity?: 'low' | 'medium' | 'high'; webSearch?: boolean };
          };
          if (parsed.openaiFeatures) openaiFeatures = parsed.openaiFeatures;
        } catch {
          // ignore invalid extraConfig
        }
      }
      return openAiGenerateRecipe({
        apiKey,
        baseUrl: provider.baseUrl ?? undefined,
        model,
        prompt: augmentedPrompt,
        shopId: this.shopId,
        maxTokens: hints?.maxTokens,
        responseSchema: hints?.responseSchema,
        openaiFeatures,
      });
    }

    if (provider.provider === 'ANTHROPIC') {
      let skillsConfig: { skills?: string[]; codeExecution?: boolean } | undefined;
      if (provider.extraConfig) {
        try {
          const parsed = JSON.parse(provider.extraConfig) as {
            skills?: string[];
            codeExecution?: boolean;
            anthropicFeatures?: { skills?: string[]; codeExecution?: boolean };
          };
          const skills = parsed.anthropicFeatures?.skills ?? parsed.skills;
          const codeExecution = parsed.anthropicFeatures?.codeExecution ?? parsed.codeExecution;
          if (skills?.length || codeExecution !== undefined) {
            skillsConfig = { skills, codeExecution };
          }
        } catch {
          // ignore invalid extraConfig
        }
      }
      skillsConfig = guardAnthropicSkillsConfig(skillsConfig, {
        blockMerchantCodeExecution: this.blockMerchantCodeExecution,
      });
      return anthropicGenerateRecipe({
        apiKey,
        baseUrl: provider.baseUrl ?? undefined,
        model,
        prompt: augmentedPrompt,
        shopId: this.shopId,
        skillsConfig,
        maxTokens: hints?.maxTokens,
        responseSchema: hints?.responseSchema,
      });
    }

    if (provider.provider === 'GEMINI') {
      return geminiGenerateRecipe({
        apiKey,
        baseUrl: provider.baseUrl ?? undefined,
        model,
        prompt: augmentedPrompt,
        shopId: this.shopId,
        maxTokens: hints?.maxTokens,
        responseSchema: hints?.responseSchema,
      });
    }

    // CUSTOM or AZURE_OPENAI: treat as OpenAI-compatible
    return openAiCompatibleGenerateRecipe({
      apiKey,
      baseUrl: provider.baseUrl ?? 'https://api.openai.com',
      model,
      prompt: augmentedPrompt,
      shopId: this.shopId,
      maxTokens: hints?.maxTokens,
      responseSchema: hints?.responseSchema,
      openaiFeatures: (() => {
        if (!provider.extraConfig) return undefined;
        try {
          const parsed = JSON.parse(provider.extraConfig) as {
            openaiFeatures?: { reasoningEffort?: 'low' | 'medium' | 'high'; verbosity?: 'low' | 'medium' | 'high'; webSearch?: boolean };
          };
          return parsed.openaiFeatures;
        } catch {
          return undefined;
        }
      })(),
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

  async generateRecipe(prompt: string, hints?: GenerateHints) {
    const augmentedPrompt = hints?.previousError
      ? `${prompt}\n\n(Previous validation error: ${hints.previousError})`
      : prompt;
    return openAiGenerateRecipe({
      apiKey: this.apiKey,
      model: this.model,
      prompt: augmentedPrompt,
      shopId: this.shopId,
      maxTokens: hints?.maxTokens,
      responseSchema: hints?.responseSchema,
    });
  }
}

/** Uses ANTHROPIC_API_KEY (and optional ANTHROPIC_DEFAULT_MODEL, ANTHROPIC_SKILLS, ANTHROPIC_CODE_EXECUTION) from env. */
class EnvClaudeClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly shopId?: string,
    private readonly skillsConfig?: { skills?: string[]; codeExecution?: boolean },
    private readonly blockMerchantCodeExecution = false,
  ) {}

  async generateRecipe(prompt: string, hints?: GenerateHints) {
    const augmentedPrompt = hints?.previousError
      ? `${prompt}\n\n(Previous validation error: ${hints.previousError})`
      : prompt;
    return anthropicGenerateRecipe({
      apiKey: this.apiKey,
      model: this.model,
      prompt: augmentedPrompt,
      shopId: this.shopId,
      skillsConfig: guardAnthropicSkillsConfig(this.skillsConfig, {
        blockMerchantCodeExecution: this.blockMerchantCodeExecution,
      }),
      maxTokens: hints?.maxTokens,
      responseSchema: hints?.responseSchema,
    });
  }
}

/** Uses GEMINI_API_KEY (and optional GEMINI_DEFAULT_MODEL) from env. */
class EnvGeminiClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly shopId?: string,
  ) {}

  async generateRecipe(prompt: string, hints?: GenerateHints) {
    const augmentedPrompt = hints?.previousError
      ? `${prompt}\n\n(Previous validation error: ${hints.previousError})`
      : prompt;
    return geminiGenerateRecipe({
      apiKey: this.apiKey,
      model: this.model,
      prompt: augmentedPrompt,
      shopId: this.shopId,
      maxTokens: hints?.maxTokens,
      responseSchema: hints?.responseSchema,
    });
  }
}

/** Thrown when no AI provider is configured and no env key is set. Surface in API with setup CTA. */
export class AiProviderNotConfiguredError extends Error {
  readonly code = 'AI_PROVIDER_NOT_CONFIGURED';
  constructor() {
    super('AI provider not configured');
    this.name = 'AiProviderNotConfiguredError';
  }
}

/**
 * Wraps a primary and fallback LlmClient.
 * If the primary fails for any reason (rate limit, tool-use blocks, model error, etc.),
 * transparently retries with the fallback. If fallback also fails, throws the primary error.
 */
export class FallbackLlmClient implements LlmClient {
  constructor(
    private readonly primary: LlmClient,
    private readonly fallback: LlmClient,
  ) {}

  async generateRecipe(prompt: string, hints?: GenerateHints) {
    try {
      return await this.primary.generateRecipe(prompt, hints);
    } catch (primaryErr: unknown) {
      // Primary failed (rate limit, server tool-use response, model error, etc.) — try fallback
      try {
        return await this.fallback.generateRecipe(prompt, hints);
      } catch {
        // Both failed — throw primary error (more informative for debugging)
        throw primaryErr;
      }
    }
  }
}

/**
 * Chains ConfiguredLlmClients for the given provider ids (first = tried first)
 * by nesting FallbackLlmClient pairs. A single id collapses to a plain
 * ConfiguredLlmClient — identical behavior to the pre-chain code path.
 */
function buildProviderChain(providerIds: string[], shopId: string | null | undefined, block: boolean): LlmClient {
  if (providerIds.length === 0) throw new Error('buildProviderChain requires at least one provider id');
  const clients: LlmClient[] = providerIds.map((id) => new ConfiguredLlmClient(id, shopId ?? undefined, block));
  return clients.reduceRight((laterInChain, client) => new FallbackLlmClient(client, laterInChain));
}

/**
 * Appends the operator-assigned fallback provider (AppSettings.fallbackAiProviderId)
 * as the last-resort leg of the chain, unless it's already covered by `excludeIds`.
 */
async function withManualFallback(
  client: LlmClient,
  shopId: string | null | undefined,
  block: boolean,
  excludeIds: string[],
): Promise<LlmClient> {
  const prisma = getPrisma();
  const appSettings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const fallbackId = (appSettings?.fallbackAiProviderId ?? '').trim() || null;
  if (!fallbackId || excludeIds.includes(fallbackId)) return client;
  const fb = await prisma.aiProvider.findUnique({ where: { id: fallbackId } });
  if (!fb) return client;
  return new FallbackLlmClient(client, new ConfiguredLlmClient(fallbackId, shopId ?? undefined, block));
}

export async function getLlmClient(
  shopId?: string | null,
  options?: { blockMerchantCodeExecution?: boolean },
): Promise<{ client: LlmClient; providerId: string | null }> {
  const block = options?.blockMerchantCodeExecution === true;

  // An explicit per-shop provider pin (Shop.aiProviderOverrideId) is a deliberate
  // merchant/operator choice — it wins outright and is never re-ranked by cost.
  const overrideProviderId = await resolveShopProviderOverrideId(shopId);
  if (overrideProviderId) {
    const client = await withManualFallback(
      buildProviderChain([overrideProviderId], shopId, block),
      shopId,
      block,
      [overrideProviderId],
    );
    return { client, providerId: overrideProviderId };
  }

  // No override: route across every active, priced provider (Claude/OpenAI/Gemini/etc.)
  // cheapest-first. Falls through to the legacy single-provider path below when no
  // provider has pricing configured, so this is a no-op until AiModelPrice is populated.
  const ranked = await getCostRankedActiveProviders();
  const [cheapest, ...restRanked] = ranked;
  if (cheapest) {
    const chainProviderIds = [cheapest, ...restRanked].map((r) => r.providerId);
    const client = await withManualFallback(
      buildProviderChain(chainProviderIds, shopId, block),
      shopId,
      block,
      chainProviderIds,
    );
    return { client, providerId: cheapest.providerId };
  }

  const providerId = await resolveProviderIdForShop(shopId);
  if (providerId) {
    const client = await withManualFallback(
      buildProviderChain([providerId], shopId, block),
      shopId,
      block,
      [providerId],
    );
    return { client, providerId };
  }

  const prisma = getPrisma();
  const appSettings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const defaultAi = (appSettings?.defaultAiProvider ?? '').trim() || null;

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  const anthropicSkillsRaw = process.env.ANTHROPIC_SKILLS?.trim();
  const anthropicSkills = anthropicSkillsRaw
    ? anthropicSkillsRaw.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 8)
    : undefined;
  const anthropicCodeExecution = process.env.ANTHROPIC_CODE_EXECUTION?.toLowerCase() === 'true' || process.env.ANTHROPIC_CODE_EXECUTION === '1';
  const envClaudeSkillsConfig =
    anthropicSkills?.length || anthropicCodeExecution
      ? { skills: anthropicSkills, codeExecution: anthropicCodeExecution }
      : undefined;

  // When no DB provider: use Claude by default if configured (defaultAi is claude or unset), else OpenAI
  if ((defaultAi === 'claude' || defaultAi === null) && anthropicKey) {
    const model = process.env.ANTHROPIC_DEFAULT_MODEL?.trim() || 'claude-sonnet-4-20250514';
    const primary = new EnvClaudeClient(
      anthropicKey,
      model,
      shopId ?? undefined,
      envClaudeSkillsConfig,
      options?.blockMerchantCodeExecution === true,
    );
    // Wrap with OpenAI fallback when both keys are available
    if (openaiKey) {
      const fallbackModel = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-4o-mini';
      const fallback = new EnvOpenAiClient(openaiKey, fallbackModel, shopId ?? undefined);
      return { client: new FallbackLlmClient(primary, fallback), providerId: null };
    }
    return { client: primary, providerId: null };
  }
  if (defaultAi === 'gemini' && geminiKey) {
    const model = process.env.GEMINI_DEFAULT_MODEL?.trim() || 'gemini-2.5-flash';
    const primary = new EnvGeminiClient(geminiKey, model, shopId ?? undefined);
    if (openaiKey) {
      const fallbackModel = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-4o-mini';
      return {
        client: new FallbackLlmClient(primary, new EnvOpenAiClient(openaiKey, fallbackModel, shopId ?? undefined)),
        providerId: null,
      };
    }
    return { client: primary, providerId: null };
  }
  if ((defaultAi === 'openai' || defaultAi === null) && openaiKey) {
    const model = process.env.OPENAI_DEFAULT_MODEL?.trim() || 'gpt-4o-mini';
    return { client: new EnvOpenAiClient(openaiKey, model, shopId ?? undefined), providerId: null };
  }

  throw new AiProviderNotConfiguredError();
}

/** Surface-specific guidance per prompt_profile from ROUTING_TABLE (Phase 4.2). */
const PROFILE_GUIDANCE: Record<string, string> = {
  storefront_ui_v1: 'Surface context: STOREFRONT module — deploys as Theme App Extension (OS 2.0 only). Output RecipeSpec JSON. No raw Liquid, JS, or CSS in config fields.',
  admin_ui_v1: 'Surface context: ADMIN UI module or plan — targets Shopify admin surfaces and actions. Output RecipeSpec JSON.',
  workflow_v1: 'Surface context: WORKFLOW automation — targets Shopify Flow triggers, conditions, and steps. Output RecipeSpec JSON.',
  support_v1: 'Surface context: SUPPORT plan or how-to — focus on troubleshooting steps and merchant guidance. Output RecipeSpec JSON.',
  copy_v1: 'Surface context: COPY only — focus on headline, body, and CTA text. Output RecipeSpec JSON.',
};

function buildCatalogDetailsFromRouter(
  classification: { moduleType: ModuleType; intent?: string; surface?: string },
  routerDecision?: PromptRouterDecision,
): string | undefined {
  if (!routerDecision?.includeFlags.includeCatalog) return undefined;
  const filters = routerDecision.catalogFilters;
  if (!filters) {
    return getCatalogDetailsForType(classification.moduleType, classification.intent, classification.surface);
  }
  return getCatalogDetails({
    templateKind: filters.templateKind,
    intent: filters.intent,
    surface: filters.surface,
    limit: filters.limit,
  });
}

/**
 * All inputs are strings. Compiles into a single prompt to send to the AI.
 * Optional sections (fullSchemaSpec, styleSchemaSpec, catalogDetails) are omitted on first attempt to keep cost low; add on retry when needed.
 */
export function compileCreateModulePrompt(params: {
  purposeAndGuidance: string;
  typesList: string;
  moduleType: string;
  summary: string;
  expectations: string;
  userRequest: string;
  fullSchemaSpec?: string;
  styleSchemaSpec?: string;
  catalogDetails?: string;
  /** Search-augmented grounding examples (RAG) — already self-headed. */
  groundingBlock?: string;
  settingsPack?: string;
  previousError?: string;
  /** IntentPacket JSON (doc 15.8): structured intent so heavy AI only fills layout/copy/settings. */
  intentPacketJson?: string;
  /** Prompt profile from ROUTING_TABLE (e.g. storefront_ui_v1). Drives surface-specific guidance. */
  promptProfile?: string;
  designReferenceBlock?: string;
  designSystemDirective?: string;
  blueprintContext?: string;
  uiDesignerPass?: string;
  frontendDeveloperPass?: string;
  premiumGuardrails?: string;
}): string {
  const profileGuidance = params.promptProfile ? PROFILE_GUIDANCE[params.promptProfile] : undefined;

  const parts: string[] = [];
  if (params.designReferenceBlock) {
    parts.push(params.designReferenceBlock, '');
  }
  if (params.designSystemDirective) {
    parts.push(params.designSystemDirective, '');
  }
  if (params.blueprintContext) {
    parts.push(params.blueprintContext, '');
  }
  parts.push(
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
    wrapUserRequestForPrompt(params.userRequest),
  );
  if (profileGuidance) {
    parts.push('', profileGuidance);
  }
  if (params.uiDesignerPass) {
    parts.push('', params.uiDesignerPass);
  }
  if (params.frontendDeveloperPass) {
    parts.push('', params.frontendDeveloperPass);
  }
  if (params.premiumGuardrails) {
    parts.push('', params.premiumGuardrails);
  }
  if (params.settingsPack) {
    parts.push('', params.settingsPack);
  }
  if (params.intentPacketJson) {
    parts.push('', 'PromptIntentSeedV1 (compact intent+routing context; do not change it):', params.intentPacketJson);
  }
  if (params.fullSchemaSpec) {
    parts.push('', 'Full recipe schema (Zod validation — every field must match):', params.fullSchemaSpec);
  }
  if (params.styleSchemaSpec) {
    parts.push('', 'Style schema (storefront only):', params.styleSchemaSpec);
  }
  if (params.catalogDetails) {
    parts.push('', 'Catalog (examples for inspiration):', params.catalogDetails);
  }
  if (params.groundingBlock) {
    parts.push('', params.groundingBlock);
  }
  if (params.previousError) {
    parts.push('', '(Previous validation error — fix in next response):', params.previousError);
  }
  return parts.join('\n');
}

/**
 * Approach hints for parallel single-recipe generation. Each call gets a
 * different hint so the 3 options vary by behavior, not by random sampling.
 */
export const APPROACH_HINTS: ReadonlyArray<{ label: string; hint: string }> = [
  {
    label: 'Conservative',
    hint:
      'Approach: prioritize trust and clarity. Use low-friction trigger behavior, calm visual hierarchy, high readability, and one obvious CTA. Include subtle but clear interaction states. This should feel safe and premium for broad storefront audiences.',
  },
  {
    label: 'High-conversion',
    hint:
      'Approach: optimize for action. Use stronger trigger timing and placement, sharper value framing, and stronger CTA prominence while preserving accessibility and brand credibility. Include urgency only when contextually justified.',
  },
  {
    label: 'Targeted',
    hint:
      'Approach: optimize for a specific shopper segment or page context. Narrow audience, placement, and message fit, then adapt hierarchy and emphasis to that context. This should feel precise and non-generic.',
  },
];

/**
 * Quota weight for one option-call in the fan-out generation paths.
 *
 * A single merchant "generate" request fans out into N parallel option calls
 * (one per APPROACH_HINTS entry) so the merchant can pick from alternatives —
 * that's the app's design choice, not N separate merchant requests. So only the
 * first option call carries the billable unit toward the `aiRequestsPerMonth`
 * quota; the siblings are still fully cost-tracked (real `costCents` per call) and
 * still written as their own `AiUsage` rows, they just count 0 toward quota.
 *
 * Net effect: one create = 1 quota unit (matching how plans are marketed and how
 * a merchant thinks about "a generation"), while every provider call remains
 * individually visible for cost/observability. Every non-fan-out path already
 * records exactly 1 unit per operation, so this is the only place that needed it.
 */
export function optionCallBillableUnits(optionIndex: number): number {
  return optionIndex === 0 ? 1 : 0;
}

/**
 * Compile the prompt for a single-recipe generation call. Used by the parallel
 * path that fires N independent calls (one per approach hint), each with the
 * full per-type token budget.
 */
export function compileCreateSingleRecipePrompt(params: {
  purposeAndGuidance: string;
  moduleType: string;
  summary: string;
  expectations: string;
  userRequest: string;
  approachHint?: string;
  approachLabel?: string;
  fullSchemaSpec?: string;
  styleSchemaSpec?: string;
  catalogDetails?: string;
  /** Search-augmented grounding examples (RAG) — already self-headed. */
  groundingBlock?: string;
  settingsPack?: string;
  previousError?: string;
  intentPacketJson?: string;
  promptProfile?: string;
  designReferenceBlock?: string;
  designSystemDirective?: string;
  blueprintContext?: string;
  uiDesignerPass?: string;
  frontendDeveloperPass?: string;
  premiumGuardrails?: string;
}): string {
  const profileGuidance = params.promptProfile ? PROFILE_GUIDANCE[params.promptProfile] : undefined;
  const parts: string[] = [];
  if (params.designReferenceBlock) {
    parts.push(params.designReferenceBlock, '');
  }
  if (params.designSystemDirective) {
    parts.push(params.designSystemDirective, '');
  }
  if (params.blueprintContext) {
    parts.push(params.blueprintContext, '');
  }
  parts.push(
    params.purposeAndGuidance,
    '',
    `Task: Generate exactly 1 module of type "${params.moduleType}" for the merchant's request. Output a JSON object: { "explanation": "1-2 sentences", "recipe": { ...one full RecipeSpec... } }.`,
  );
  if (params.approachHint) {
    parts.push('', params.approachHint);
  }
  parts.push(
    '',
    `Recommended type for this request: ${params.moduleType}`,
    params.summary,
    '',
    params.expectations,
    '',
    wrapUserRequestForPrompt(params.userRequest),
  );
  if (profileGuidance) parts.push('', profileGuidance);
  if (params.uiDesignerPass) parts.push('', params.uiDesignerPass);
  if (params.frontendDeveloperPass) parts.push('', params.frontendDeveloperPass);
  if (params.premiumGuardrails) parts.push('', params.premiumGuardrails);
  if (params.settingsPack) parts.push('', params.settingsPack);
  if (params.intentPacketJson) {
    parts.push('', 'PromptIntentSeedV1 (compact intent+routing context; do not change it):', params.intentPacketJson);
  }
  if (params.fullSchemaSpec) {
    parts.push('', 'Full recipe schema (Zod validation — every field must match):', params.fullSchemaSpec);
  }
  if (params.styleSchemaSpec) {
    parts.push('', 'Style schema (storefront only):', params.styleSchemaSpec);
  }
  if (params.catalogDetails) {
    parts.push('', 'Catalog (examples for inspiration):', params.catalogDetails);
  }
  if (params.groundingBlock) {
    parts.push('', params.groundingBlock);
  }
  if (params.previousError) {
    parts.push('', '(Previous validation error — fix in next response):', params.previousError);
  }
  return parts.join('\n');
}

/**
 * Run the spec-level design-QA gate (Design System Bible §G) and return the
 * (safely auto-corrected) recipe. Re-validates after auto-fixes; falls back to
 * the original recipe if a fix somehow breaks Zod. Logs blocking issues.
 */
function applyDesignQaSafe(recipe: RecipeSpec): RecipeSpec {
  const qa = runDesignQa(recipe);
  if (!qa.pass) {
    console.warn(`[design-qa] ${summarizeQa(qa)} — ${qa.issues
      .filter((i) => i.severity === 'fail')
      .map((i) => i.id)
      .join(', ')}`);
  }
  return coerceValidRecipe(qa.recipe, recipe);
}

/** Re-validate a QA-produced recipe; fall back to `original` if a fix broke Zod. */
function coerceValidRecipe(candidate: RecipeSpec, original: RecipeSpec): RecipeSpec {
  const safe = RecipeSpecSchema.safeParse(candidate);
  return safe.success ? safe.data : original;
}

/**
 * Parse a raw `generateRecipe` JSON string into a validated RecipeSpec, taking
 * the fast Zod path and only invoking the LLM repair loop when it fails. Shared
 * by the design-QA corrective-regeneration path. May throw if the recipe is
 * unrepairable — callers of the QA retry treat that as "regeneration failed".
 */
async function parseValidateAndRepairRecipe(
  rawJson: string,
  client: LlmClient,
  ctx: { shopId?: string; moduleType: ModuleType },
): Promise<RecipeSpec> {
  const parsed = JSON.parse(rawJson);
  const raw = unwrapRecipe(parsed);
  const repaired = repairRecipeForValidation(raw);
  const safe = RecipeSpecSchema.safeParse(repaired);
  if (safe.success) return safe.data;
  const fix = await validateAndRepairRecipe(raw, client, ctx);
  return fix.recipe;
}

/**
 * Design-QA gate with a bounded (**at most ONE**) corrective-regeneration loop
 * (§9.1 stage 6 — "self-audits before returning; regenerates on `[AUTO]`
 * failure").
 *
 * Runs the spec-level QA gate. When it reports a blocking `[AUTO]` failure the
 * deterministic auto-fixes could not resolve, it asks the caller to regenerate
 * exactly once (with a corrective instruction summarizing the failed issues),
 * then re-validates + re-QAs the result. The single-retry cap keeps generation
 * inside the ~60s Cloudflare timeout budget (documented project constraint).
 *
 * Failure-safe: if regeneration throws, returns null, or still fails QA, it
 * returns the best auto-fixed recipe — it never throws and never blocks the
 * response. When QA already passes it is a pass-through (fully back-compat).
 */
/** Token/cost a corrective regeneration spent (always billed, even if its output is unusable). */
type QaRegenResult = { recipe: RecipeSpec | null; tokensIn: number; tokensOut: number; costCents: number };
/** The chosen recipe plus the EXTRA usage the retry spent, for the caller to add to recordAiUsage. */
type QaRetryResult = { recipe: RecipeSpec; extraTokensIn: number; extraTokensOut: number; extraCostCents: number };
const NO_EXTRA = { extraTokensIn: 0, extraTokensOut: 0, extraCostCents: 0 };

async function applyDesignQaWithRetry(
  recipe: RecipeSpec,
  regenerate: (correctiveInstruction: string) => Promise<QaRegenResult>,
): Promise<QaRetryResult> {
  const first = runDesignQa(recipe);
  if (first.pass) return { recipe: coerceValidRecipe(first.recipe, recipe), ...NO_EXTRA };

  const corrective = buildDesignQaCorrection(first);
  if (!corrective) return { recipe: coerceValidRecipe(first.recipe, recipe), ...NO_EXTRA };
  console.warn(`[design-qa] ${summarizeQa(first)} — attempting one corrective regeneration`);

  let regen: QaRegenResult | null = null;
  try {
    regen = await regenerate(corrective);
  } catch (err) {
    console.warn(`[design-qa] corrective regeneration failed: ${err instanceof Error ? err.message : String(err)}`);
    regen = null;
  }
  if (!regen) return { recipe: coerceValidRecipe(first.recipe, recipe), ...NO_EXTRA };

  // The regeneration LLM call was billed regardless of whether its output is usable.
  const extra = { extraTokensIn: regen.tokensIn, extraTokensOut: regen.tokensOut, extraCostCents: regen.costCents };
  const candidate = regen.recipe;
  if (!candidate) return { recipe: coerceValidRecipe(first.recipe, recipe), ...extra };

  const second = runDesignQa(candidate);
  if (second.pass) return { recipe: coerceValidRecipe(second.recipe, candidate), ...extra };

  // Retry still blocking — keep whichever has fewer blocking issues (tie → first,
  // i.e. the pre-retry auto-fixed recipe = current behavior).
  const firstFails = first.issues.filter((i) => i.severity === 'fail').length;
  const secondFails = second.issues.filter((i) => i.severity === 'fail').length;
  console.warn(`[design-qa] corrective regeneration still failing (${secondFails} blocking) — keeping best auto-fixed recipe`);
  return secondFails < firstFails
    ? { recipe: coerceValidRecipe(second.recipe, candidate), ...extra }
    : { recipe: coerceValidRecipe(first.recipe, recipe), ...extra };
}

/**
 * One corrective single-recipe regeneration for the design-QA retry loop: it
 * re-runs the exact single-recipe prompt with the QA correction appended, then
 * parses/validates/repairs the result. Returns null on any failure so the retry
 * loop can fall back to the best auto-fixed recipe.
 */
async function regenerateSingleRecipeForQa(args: {
  client: LlmClient;
  compiledPrompt: string;
  corrective: string;
  perBudget: number;
  singleSchema: Record<string, unknown> | undefined;
  moduleType: ModuleType;
  idx: number;
  shopId?: string;
  providerId: string | null;
}): Promise<QaRegenResult> {
  const { client, compiledPrompt, corrective, perBudget, singleSchema, moduleType, idx, shopId, providerId } = args;
  const result = await client.generateRecipe(`${compiledPrompt}\n\n${corrective}`, {
    maxTokens: perBudget,
    responseSchema: singleSchema
      ? { name: `RecipeSingle_${moduleType.replace(/[^a-zA-Z0-9_]/g, '_')}_${idx}_qa`, schema: singleSchema }
      : undefined,
  });
  // Capture the spend BEFORE parse/repair — the LLM call is billed even if its
  // output is unusable (the QA cost-tracking gap this closes).
  const { costCents } = await attributeServedCost(result, providerId, result.tokensIn, result.tokensOut);
  let recipe: RecipeSpec | null = null;
  try {
    recipe = await parseValidateAndRepairRecipe(result.rawJson, client, { shopId, moduleType });
  } catch {
    recipe = null;
  }
  return { recipe, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costCents };
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
    wrapUserRequestForPrompt(params.userInstruction),
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
export function unwrapRecipe(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'recipe' in raw) {
    return (raw as { recipe?: unknown }).recipe;
  }
  return raw;
}

/** Build a repair-only prompt (doc 15.9): fix schema violations without re-running full generation. */
function compileRepairPrompt(invalidRecipeJson: string, validationError: string): string {
  return `You are fixing a RecipeSpec JSON that failed schema validation. Do NOT change the intent or add new features — only fix the listed errors so the output is valid.

Validation errors:
${validationError}

Invalid RecipeSpec (fix only the fields mentioned above):
${invalidRecipeJson}

Respond with a JSON object containing a single key "recipe" whose value is the corrected RecipeSpec. Output nothing else.`;
}

const TYPE_CATEGORY_REQUIRES: Record<string, { category: string; requires: string[] }> = {
  'theme.section': { category: 'STOREFRONT_UI', requires: ['THEME_ASSETS'] },
  'proxy.widget': { category: 'STOREFRONT_UI', requires: ['APP_PROXY'] },
  'functions.discountRules': { category: 'FUNCTION', requires: ['DISCOUNT_FUNCTION'] },
  'functions.deliveryCustomization': { category: 'FUNCTION', requires: ['SHIPPING_FUNCTION'] },
  'functions.paymentCustomization': { category: 'FUNCTION', requires: ['PAYMENT_CUSTOMIZATION_FUNCTION'] },
  'functions.cartAndCheckoutValidation': { category: 'FUNCTION', requires: ['VALIDATION_FUNCTION'] },
  'functions.cartTransform': { category: 'FUNCTION', requires: ['CART_TRANSFORM_FUNCTION_UPDATE'] },
  'functions.fulfillmentConstraints': { category: 'FUNCTION', requires: [] },
  'functions.orderRoutingLocationRule': { category: 'FUNCTION', requires: [] },
  'checkout.upsell': { category: 'STOREFRONT_UI', requires: ['CHECKOUT_UI_INFO_SHIP_PAY'] },
  'integration.httpSync': { category: 'INTEGRATION', requires: [] },
  'flow.automation': { category: 'FLOW', requires: [] },
  'platform.extensionBlueprint': { category: 'ADMIN_UI', requires: [] },
  'customerAccount.blocks': { category: 'CUSTOMER_ACCOUNT', requires: ['CUSTOMER_ACCOUNT_UI'] },
};

const CONFIG_ENUM_KEYS: Record<string, string[]> = {
  'theme.section': ['trigger', 'frequency', 'showOnPages'],
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
/**
 * Recursively remove `null`-valued object properties and `null` array elements.
 * Structured-output makes optional fields nullable so the model can opt out with
 * `null`; Zod optionals reject `null`, so an opted-out field must be absent, not
 * null. Preserves empty strings, 0, and false (those are meaningful values).
 */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((v) => v !== null).map((v) => stripNulls(v));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null) continue;
      out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

export function repairRecipeForValidation(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  // Structured-output schemas mark originally-optional fields as nullable
  // (see recipe-json-schema.server `makeNullable`) so the model can emit `null`
  // to opt out. Zod `.optional()` means string|undefined, NOT nullable — a
  // literal `null` fails validation (e.g. `config.pricing.tiers.rows[].imageUrl`).
  // Drop null-valued keys / null array elements so "opted out" reads as absent.
  const o = stripNulls(JSON.parse(JSON.stringify(raw))) as Record<string, unknown>;
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
  let name = (o.name as string).trim();
  if (name.length < 3) name = name.padEnd(3, ' ');
  if (name.length > 80) name = name.slice(0, 80);
  o.name = name;

  const config = o.config as Record<string, unknown> | undefined;
  if (config && typeof config === 'object') {
    if (type === 'theme.section' && !config.title && typeof config.heading === 'string') {
      config.title = config.heading;
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
  const placement = o.placement as Record<string, unknown> | undefined;
  if (placement && typeof placement === 'object') {
    const hasEnabled = placement.enabled_on && typeof placement.enabled_on === 'object';
    const hasDisabled = placement.disabled_on && typeof placement.disabled_on === 'object';
    if (hasEnabled && hasDisabled) {
      // Keep the positive directive and drop the conflicting exclusion branch.
      delete placement.disabled_on;
    }
  }
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

const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Validate with RecipeSpecSchema; if invalid, run repair prompt (doc 15.9) and re-validate.
 * Caps at MAX_REPAIR_ATTEMPTS to keep cost predictable.
 */
async function validateAndRepairRecipe(
  raw: unknown,
  client: LlmClient,
  _options?: { shopId?: string; moduleType?: ModuleType },
): Promise<{ recipe: RecipeSpec; repaired: boolean }> {
  let current = repairRecipeForValidation(raw);
  let lastError: string | undefined;
  const repairBudget = _options?.moduleType ? getRepairTokenBudget(_options.moduleType) : 2000;
  const singleSchema = _options?.moduleType ? getRecipeSingleJsonSchemaForType(_options.moduleType) : undefined;
  for (let i = 0; i <= MAX_REPAIR_ATTEMPTS; i++) {
    const result = RecipeSpecSchema.safeParse(current);
    if (result.success) {
      return { recipe: result.data, repaired: i > 0 };
    }
    lastError = result.error.message;
    if (i === MAX_REPAIR_ATTEMPTS) break;
    if (isFatalValidationError(lastError)) break;
    const repairPrompt = compileRepairPrompt(JSON.stringify(current), lastError);
    const { rawJson } = await client.generateRecipe(repairPrompt, {
      maxTokens: repairBudget,
      responseSchema: singleSchema && _options?.moduleType
        ? { name: `RecipeSingle_${_options.moduleType.replace(/[^a-zA-Z0-9_]/g, '_')}`, schema: singleSchema }
        : undefined,
    });
    try {
      const parsed = JSON.parse(rawJson);
      current = repairRecipeForValidation(unwrapRecipe(parsed));
    } catch {
      break;
    }
  }
  throw new Error(lastError ?? 'Validation failed');
}

/**
 * Patterns that indicate the model can't recover via repair. Skip repair attempts
 * and fall through to outer-loop retry (or hard fail) instead of wasting tokens.
 */
function isFatalValidationError(message: string): boolean {
  if (!message) return false;
  // Wrong discriminator (type field) — repair can't fix without re-classifying.
  if (/Invalid discriminator value/i.test(message)) return true;
  // Schema branch chosen by the caller doesn't exist in the union at all.
  if (/Invalid literal value/i.test(message) && /type/i.test(message)) return true;
  return false;
}

export async function generateValidatedRecipe(
  prompt: string,
  options?: { shopId?: string; action?: string; maxAttempts?: number; maxTokens?: number; expectedType?: ModuleType }
): Promise<RecipeSpec> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const action = options?.action ?? 'RECIPE_GENERATION';
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();

  const wrappedPrompt = prompt + '\n\nRespond with a JSON object containing a single key "recipe" whose value is the RecipeSpec.';

  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const { rawJson, tokensIn, tokensOut, model, servedProviderId } = await client.generateRecipe(wrappedPrompt, {
      previousError: lastErr ? String(lastErr) : undefined,
      maxTokens: options?.maxTokens,
    });
    try {
      const candidate = unwrapRecipe(JSON.parse(rawJson));
      // Schema-bound invariant: wrong/unknown discriminator → reject, not repair.
      assertKnownDiscriminator(candidate, options?.expectedType);
      const parsed = RecipeSpecSchema.parse(candidate);
      const { providerId: servedId, costCents } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action,
        tokensIn,
        tokensOut,
        costCents,
        meta: { attempts: i + 1, model },
        requestCount: 1,
        prompt: wrappedPrompt,
      });
      return parsed;
    } catch (err) {
      // A rejected discriminator is non-recoverable — do not waste repair attempts.
      if (err instanceof RecipeDiscriminatorError) {
        throw err;
      }
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
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();

  const compactSpecJson = JSON.stringify(currentSpec);

  const modifyPrompt = `You are modifying an existing Shopify module. Here is the current RecipeSpec JSON:

${compactSpecJson}

User requested change: ${instruction}

Output a JSON object with a single key "recipe" whose value is the complete updated RecipeSpec. Keep the same "type" field ("${currentSpec.type}") unless the user explicitly asks to change module type. Preserve all existing fields that the user did not ask to change.`;

  const modifyBudget = getRecipeTokenBudget(currentSpec.type);
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    let tokensIn = 0;
    let tokensOut = 0;
    let model: string | undefined;
    let servedProviderId: string | null | undefined;
    try {
      const result = await client.generateRecipe(modifyPrompt, {
        previousError: lastErr ? String(lastErr) : undefined,
        maxTokens: modifyBudget,
      });
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      model = result.model;
      servedProviderId = result.servedProviderId;
      const parsed = RecipeSpecSchema.parse(unwrapRecipe(JSON.parse(result.rawJson)));
      if (!options?.allowTypeChange && parsed.type !== currentSpec.type) {
        throw new Error(`AI changed module type from "${currentSpec.type}" to "${parsed.type}". Type changes are not allowed in modify mode.`);
      }
      const { providerId: servedId, costCents } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_MODIFY',
        tokensIn,
        tokensOut,
        costCents,
        meta: { attempts: i + 1, model },
        requestCount: 1,
        prompt: modifyPrompt,
      });
      return parsed;
    } catch (err) {
      lastErr = err;
      const { providerId: servedId, costCents: failCost } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_MODIFY_FAILED',
        tokensIn,
        tokensOut,
        costCents: failCost,
        meta: { attempts: i + 1, model, error: String(err).slice(0, 500) },
        requestCount: 1,
        prompt: modifyPrompt,
      });
    }
  }
  throw new Error(`AI recipe modification failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

/**
 * Yielded by the streaming generator so the UI can show "Option 1 ready" as
 * soon as the first parallel call finishes — without waiting for the slowest.
 */
export type RecipeOptionStreamEvent =
  | { kind: 'started'; index: number; approach: string; total: number }
  | { kind: 'option'; index: number; approach: string; option: RecipeOption; durationMs: number }
  | { kind: 'option_failed'; index: number; approach: string; error: string; durationMs: number }
  | { kind: 'done'; valid: number; total: number };

/**
 * Streams parallel single-recipe generation. Internally identical to
 * `generateValidatedRecipeOptionsParallel` but yields events as each call
 * resolves, so the SSE route can emit progressive "ready / failed / done"
 * frames to the merchant UI instead of blocking until all 3 finish.
 *
 * Yields events in arrival order, not call order — the fastest call wins.
 */
export async function* generateValidatedRecipeOptionsStream(
  prompt: string,
  classification: { moduleType: ModuleType; intent?: string; surface?: string },
  options?: {
    shopId?: string;
    intentPacketJson?: string;
    confidenceScore?: number;
    promptProfile?: string;
    routerDecision?: PromptRouterDecision;
    optionCount?: number;
    /** Search-augmented grounding examples (RAG), injected into each prompt. */
    groundingBlock?: string;
    /** When this module is one member of a blueprint, coordination context for the prompt. */
    blueprintContext?: string;
  },
): AsyncGenerator<RecipeOptionStreamEvent, void, void> {
  const optionCount = Math.max(1, Math.min(3, options?.optionCount ?? 3));
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();
  const singleSchema = getRecipeSingleJsonSchemaForType(classification.moduleType);
  const perBudget = getRecipeTokenBudget(classification.moduleType);

  const purposeAndGuidance = PROMPT_PURPOSE_AND_GUIDANCE;
  const summary = getModuleSummary(classification.moduleType);
  const expectations = getPromptExpectations(classification.moduleType, 'single');
  const settingsPack = options?.routerDecision?.includeFlags.includeSettingsPack === false
    ? undefined
    : getSettingsPack(classification.moduleType);
  const isLowConfidence = (options?.confidenceScore ?? 1) < CONFIDENCE_THRESHOLDS.DIRECT;
  const includeFullSchema = options?.routerDecision
    ? options.routerDecision.includeFlags.includeFullSchema
    : isLowConfidence;
  const fullSchemaSpec = !singleSchema && includeFullSchema ? getFullRecipeSchemaSpec(classification.moduleType) : undefined;
  const storefrontTypes = ['theme.section', 'proxy.widget'];
  const isStorefront = storefrontTypes.includes(classification.moduleType);
  const includeStyleSchema = options?.routerDecision
    ? options.routerDecision.includeFlags.includeStyleSchema
    : isLowConfidence;
  const styleSchemaSpec = includeStyleSchema && storefrontTypes.includes(classification.moduleType)
    ? getStorefrontStyleSchemaSpec()
    : undefined;
  const catalogDetails = options?.routerDecision
    ? buildCatalogDetailsFromRouter(classification, options.routerDecision)
    : (isLowConfidence
      ? getCatalogDetailsForType(classification.moduleType, classification.intent, classification.surface)
      : undefined);
  const intentPacketJson = options?.routerDecision?.includeFlags.includeIntentPacket === false
    ? undefined
    : options?.intentPacketJson;
  const designReferencePack: DesignReferencePack | undefined = isStorefront
    ? (options?.shopId ? await resolveStoreDesignReferencePack(options.shopId) : await resolveDesignReferencePack())
    : undefined;
  const designReferenceBlock = designReferencePack ? buildDesignReferencePromptBlock(designReferencePack) : undefined;
  const designSystemDirective = designReferencePack ? buildDesignSystemDirectiveForReference(designReferencePack) : undefined;
  const uiDesignerPass = isStorefront ? UI_DESIGNER_REFINEMENT_PASS : undefined;
  const frontendDeveloperPass = isStorefront ? FRONTEND_DEVELOPER_REFINEMENT_PASS : undefined;
  const premiumGuardrails = isStorefront ? PREMIUM_OUTPUT_GUARDRAILS : undefined;

  type OneResult =
    | { kind: 'ok'; index: number; approach: string; option: RecipeOption; durationMs: number }
    | { kind: 'err'; index: number; approach: string; error: string; durationMs: number };

  const tasks: Promise<OneResult>[] = APPROACH_HINTS.slice(0, optionCount).map(async (approach, idx) => {
    const startedAt = Date.now();
    const compiledPrompt = compileCreateSingleRecipePrompt({
      purposeAndGuidance,
      moduleType: classification.moduleType,
      summary,
      expectations,
      userRequest: prompt,
      approachHint: approach.hint,
      approachLabel: approach.label,
      fullSchemaSpec,
      styleSchemaSpec,
      catalogDetails,
      groundingBlock: options?.groundingBlock,
      settingsPack,
      intentPacketJson,
      promptProfile: options?.promptProfile,
      designReferenceBlock,
      designSystemDirective,
      blueprintContext: options?.blueprintContext,
      uiDesignerPass,
      frontendDeveloperPass,
      premiumGuardrails,
    });

    let tokensIn = 0;
    let tokensOut = 0;
    let model: string | undefined;
    let costCents = 0;
    let servedId: string | null = providerId;
    try {
      const result = await client.generateRecipe(compiledPrompt, {
        maxTokens: perBudget,
        responseSchema: singleSchema
          ? { name: `RecipeSingle_${classification.moduleType.replace(/[^a-zA-Z0-9_]/g, '_')}_${idx}`, schema: singleSchema }
          : undefined,
      });
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      model = result.model;
      ({ providerId: servedId, costCents } = await attributeServedCost(result, providerId, tokensIn, tokensOut));

      const parsed = JSON.parse(result.rawJson);
      const raw = unwrapRecipe(parsed);
      const repaired = repairRecipeForValidation(raw);
      const safe = RecipeSpecSchema.safeParse(repaired);
      let recipe: RecipeSpec;
      let repairedFlag = false;
      if (safe.success) {
        recipe = safe.data;
      } else {
        const fix = await validateAndRepairRecipe(raw, client, {
          shopId: options?.shopId,
          moduleType: classification.moduleType,
        });
        recipe = fix.recipe;
        repairedFlag = fix.repaired;
      }

      const qaRetry = await applyDesignQaWithRetry(recipe, (corrective) =>
        regenerateSingleRecipeForQa({
          client,
          compiledPrompt,
          corrective,
          perBudget,
          singleSchema,
          moduleType: classification.moduleType,
          idx,
          shopId: options?.shopId,
          providerId: servedId,
        }),
      );
      recipe = qaRetry.recipe;
      // Fold the corrective-regeneration spend into the recorded usage so the
      // per-call cost is accurate even when QA triggered a retry.
      tokensIn += qaRetry.extraTokensIn;
      tokensOut += qaRetry.extraTokensOut;
      costCents += qaRetry.extraCostCents;

      const explanation = typeof (parsed as { explanation?: unknown })?.explanation === 'string'
        ? (parsed as { explanation: string }).explanation
        : `${approach.label} option`;

      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_GENERATION_OPTION',
        tokensIn,
        tokensOut,
        costCents,
        meta: { approach: approach.label, model, repaired: repairedFlag, durationMs: Date.now() - startedAt },
        requestCount: optionCallBillableUnits(idx),
        prompt: compiledPrompt,
      });
      return {
        kind: 'ok' as const,
        index: idx,
        approach: approach.label,
        option: { explanation, recipe },
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_GENERATION_OPTION_FAILED',
        tokensIn,
        tokensOut,
        costCents,
        meta: { approach: approach.label, model, error: String(err).slice(0, 500), durationMs: Date.now() - startedAt },
        requestCount: optionCallBillableUnits(idx),
        prompt: compiledPrompt,
      });
      return {
        kind: 'err' as const,
        index: idx,
        approach: approach.label,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      };
    }
  });

  for (let i = 0; i < APPROACH_HINTS.slice(0, optionCount).length; i++) {
    const a = APPROACH_HINTS[i];
    if (!a) continue;
    yield { kind: 'started', index: i, approach: a.label, total: optionCount };
  }

  let valid = 0;
  // Race tasks one-at-a-time so we yield in arrival order.
  const remaining = new Map<number, Promise<OneResult>>();
  tasks.forEach((p, i) => remaining.set(i, p));
  while (remaining.size > 0) {
    const next = await Promise.race(
      Array.from(remaining.entries()).map(async ([key, p]) => {
        const r = await p;
        return [key, r] as const;
      }),
    );
    remaining.delete(next[0]);
    const r = next[1];
    if (r.kind === 'ok') {
      valid++;
      yield {
        kind: 'option',
        index: r.index,
        approach: r.approach,
        option: r.option,
        durationMs: r.durationMs,
      };
    } else {
      yield {
        kind: 'option_failed',
        index: r.index,
        approach: r.approach,
        error: r.error,
        durationMs: r.durationMs,
      };
    }
  }

  yield { kind: 'done', valid, total: optionCount };
}

/**
 * Generate N recipe options in parallel — one independent LLM call per approach.
 * This is the preferred path when a per-type structured-output JSON Schema is
 * available: each call has the full per-recipe token budget (no truncation),
 * and validation/repair is per-option without blocking siblings.
 *
 * When a per-type schema is NOT available, callers should fall back to
 * `generateValidatedRecipeOptions` (legacy "ask for 3 in one call").
 *
 * Returns whichever options validated. Caller decides whether < N is acceptable.
 */
export async function generateValidatedRecipeOptionsParallel(
  prompt: string,
  classification: { moduleType: ModuleType; intent?: string; surface?: string },
  options?: {
    shopId?: string;
    intentPacketJson?: string;
    confidenceScore?: number;
    promptProfile?: string;
    routerDecision?: PromptRouterDecision;
    /** Number of parallel option calls (default 3). */
    optionCount?: number;
    /** Search-augmented grounding examples (RAG), injected into each prompt. */
    groundingBlock?: string;
    /** When this module is one member of a blueprint, coordination context for the prompt. */
    blueprintContext?: string;
  },
): Promise<RecipeOption[]> {
  const optionCount = Math.max(1, Math.min(3, options?.optionCount ?? 3));
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();
  const singleSchema = getRecipeSingleJsonSchemaForType(classification.moduleType);
  const perBudget = getRecipeTokenBudget(classification.moduleType);

  const purposeAndGuidance = PROMPT_PURPOSE_AND_GUIDANCE;
  const summary = getModuleSummary(classification.moduleType);
  const expectations = getPromptExpectations(classification.moduleType, 'single');
  const settingsPack = options?.routerDecision?.includeFlags.includeSettingsPack === false
    ? undefined
    : getSettingsPack(classification.moduleType);
  const isLowConfidence = (options?.confidenceScore ?? 1) < CONFIDENCE_THRESHOLDS.DIRECT;
  const includeFullSchema = options?.routerDecision
    ? options.routerDecision.includeFlags.includeFullSchema
    : isLowConfidence;
  const fullSchemaSpec = !singleSchema && includeFullSchema ? getFullRecipeSchemaSpec(classification.moduleType) : undefined;
  const storefrontTypes = ['theme.section', 'proxy.widget'];
  const isStorefront = storefrontTypes.includes(classification.moduleType);
  const includeStyleSchema = options?.routerDecision
    ? options.routerDecision.includeFlags.includeStyleSchema
    : isLowConfidence;
  const styleSchemaSpec = includeStyleSchema && storefrontTypes.includes(classification.moduleType)
    ? getStorefrontStyleSchemaSpec()
    : undefined;
  const catalogDetails = options?.routerDecision
    ? buildCatalogDetailsFromRouter(classification, options.routerDecision)
    : (isLowConfidence
      ? getCatalogDetailsForType(classification.moduleType, classification.intent, classification.surface)
      : undefined);
  const intentPacketJson = options?.routerDecision?.includeFlags.includeIntentPacket === false
    ? undefined
    : options?.intentPacketJson;
  const designReferencePack: DesignReferencePack | undefined = isStorefront
    ? (options?.shopId ? await resolveStoreDesignReferencePack(options.shopId) : await resolveDesignReferencePack())
    : undefined;
  const designReferenceBlock = designReferencePack ? buildDesignReferencePromptBlock(designReferencePack) : undefined;
  const designSystemDirective = designReferencePack ? buildDesignSystemDirectiveForReference(designReferencePack) : undefined;
  const uiDesignerPass = isStorefront ? UI_DESIGNER_REFINEMENT_PASS : undefined;
  const frontendDeveloperPass = isStorefront ? FRONTEND_DEVELOPER_REFINEMENT_PASS : undefined;
  const premiumGuardrails = isStorefront ? PREMIUM_OUTPUT_GUARDRAILS : undefined;

  const calls = APPROACH_HINTS.slice(0, optionCount).map(async (approach, idx) => {
    const compiledPrompt = compileCreateSingleRecipePrompt({
      purposeAndGuidance,
      moduleType: classification.moduleType,
      summary,
      expectations,
      userRequest: prompt,
      approachHint: approach.hint,
      approachLabel: approach.label,
      fullSchemaSpec,
      styleSchemaSpec,
      catalogDetails,
      groundingBlock: options?.groundingBlock,
      settingsPack,
      intentPacketJson,
      promptProfile: options?.promptProfile,
      designReferenceBlock,
      designSystemDirective,
      blueprintContext: options?.blueprintContext,
      uiDesignerPass,
      frontendDeveloperPass,
      premiumGuardrails,
    });

    let tokensIn = 0;
    let tokensOut = 0;
    let model: string | undefined;
    let costCents = 0;
    let servedId: string | null = providerId;

    try {
      const result = await client.generateRecipe(compiledPrompt, {
        maxTokens: perBudget,
        responseSchema: singleSchema
          ? { name: `RecipeSingle_${classification.moduleType.replace(/[^a-zA-Z0-9_]/g, '_')}_${idx}`, schema: singleSchema }
          : undefined,
      });
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      model = result.model;
      ({ providerId: servedId, costCents } = await attributeServedCost(result, providerId, tokensIn, tokensOut));

      const parsed = JSON.parse(result.rawJson);
      const raw = unwrapRecipe(parsed);
      const repaired = repairRecipeForValidation(raw);
      const safe = RecipeSpecSchema.safeParse(repaired);
      let recipe: RecipeSpec;
      let repairedFlag = false;
      if (safe.success) {
        recipe = safe.data;
      } else {
        const fix = await validateAndRepairRecipe(raw, client, {
          shopId: options?.shopId,
          moduleType: classification.moduleType,
        });
        recipe = fix.recipe;
        repairedFlag = fix.repaired;
      }

      const qaRetry = await applyDesignQaWithRetry(recipe, (corrective) =>
        regenerateSingleRecipeForQa({
          client,
          compiledPrompt,
          corrective,
          perBudget,
          singleSchema,
          moduleType: classification.moduleType,
          idx,
          shopId: options?.shopId,
          providerId: servedId,
        }),
      );
      recipe = qaRetry.recipe;
      // Fold the corrective-regeneration spend into the recorded usage so the
      // per-call cost is accurate even when QA triggered a retry.
      tokensIn += qaRetry.extraTokensIn;
      tokensOut += qaRetry.extraTokensOut;
      costCents += qaRetry.extraCostCents;

      const explanation = typeof (parsed as { explanation?: unknown })?.explanation === 'string'
        ? (parsed as { explanation: string }).explanation
        : `${approach.label} option`;

      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_GENERATION_OPTION',
        tokensIn,
        tokensOut,
        costCents,
        meta: { approach: approach.label, model, repaired: repairedFlag },
        requestCount: optionCallBillableUnits(idx),
        prompt: compiledPrompt,
      });
      return { ok: true as const, option: { explanation, recipe } };
    } catch (err) {
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_GENERATION_OPTION_FAILED',
        tokensIn,
        tokensOut,
        costCents,
        meta: { approach: approach.label, model, error: String(err).slice(0, 500) },
        requestCount: optionCallBillableUnits(idx),
        prompt: compiledPrompt,
      });
      return { ok: false as const, error: err };
    }
  });

  const settled = await Promise.all(calls);
  const validated = settled.filter((s): s is { ok: true; option: RecipeOption } => s.ok).map((s) => s.option);
  if (validated.length === 0) {
    const errors = settled.filter((s): s is { ok: false; error: unknown } => !s.ok).map((s) => s.error);
    const hasStatus = (e: unknown): e is Error & { statusCode?: number } =>
      e instanceof Error && typeof (e as { statusCode?: unknown }).statusCode === 'number';
    // Prefer a rate-limit error so the route's 429 handling still fires.
    const cause = errors.find((e) => hasStatus(e) && e.statusCode === 429) ?? errors[0];
    const wrapped = new Error(
      `AI recipe options generation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    if (hasStatus(cause)) (wrapped as Error & { statusCode?: number }).statusCode = cause.statusCode;
    throw wrapped;
  }
  return validated;
}

/**
 * Generate 3 recipe options for a given prompt. When the module type has a
 * per-type structured-output JSON Schema available (most types do), delegates
 * to `generateValidatedRecipeOptionsParallel`: 3 independent LLM calls each
 * with the full per-type token budget. This kills truncation and dramatically
 * reduces the per-call prompt size.
 *
 * For types that don't yet have a JSON Schema (rare), falls back to the legacy
 * "ask for 3 in one call" path.
 */
/**
 * Generate a coordinated multi-module blueprint from one request. For each
 * planned role, generates ONE best-fit validated recipe (optionCount: 1 to bound
 * cost) with cross-module coordination context injected into the prompt. Reuses
 * the full per-module pipeline (design directive + design-QA gate). Required
 * roles that fail to generate abort the blueprint; optional roles are skipped.
 */
export async function generateValidatedBlueprint(
  prompt: string,
  plan: Extract<BlueprintPlan, { kind: 'blueprint' }>,
  options?: {
    shopId?: string;
    intentPacketJson?: string;
    confidenceScore?: number;
    promptProfile?: string;
    routerDecision?: PromptRouterDecision;
    groundingBlock?: string;
  },
): Promise<RecipeBlueprint> {
  const roleList = plan.modules.map((m) => `${m.role} (${m.moduleType})`).join(', ');

  const generated = await Promise.all(
    plan.modules.map(async (m) => {
      const blueprintContext = [
        `BLUEPRINT CONTEXT — coordinate, do not duplicate:`,
        `This module is the "${m.role}" of the "${plan.name}" blueprint (${plan.summary}).`,
        `The full blueprint contains: ${roleList}.`,
        `This member's job: ${m.reason}`,
        `Do the "${m.role}" job only; the other members handle their own surfaces. Keep naming/behavior consistent with them.`,
        m.kindHint ? `Prefer config.kind "${m.kindHint}" for this member.` : '',
        m.recommendationHint ?? '',
      ]
        .filter(Boolean)
        .join(' ');

      const recipeOptions = await generateValidatedRecipeOptionsParallel(
        prompt,
        { moduleType: m.moduleType, intent: plan.intent },
        {
          shopId: options?.shopId,
          intentPacketJson: options?.intentPacketJson,
          confidenceScore: options?.confidenceScore,
          promptProfile: options?.promptProfile,
          routerDecision: options?.routerDecision,
          groundingBlock: options?.groundingBlock,
          optionCount: 1,
          blueprintContext,
        },
      ).catch((err) => {
        if (m.required) throw new Error(`Blueprint member "${m.role}" (${m.moduleType}) failed: ${err instanceof Error ? err.message : String(err)}`);
        return [] as RecipeOption[];
      });

      const best = recipeOptions[0];
      return best ? { role: m.role, explanation: best.explanation, recipe: best.recipe } : null;
    }),
  );

  const modules = generated.filter((x): x is NonNullable<typeof x> => x != null);
  if (modules.length === 0) throw new Error('Blueprint generation produced no valid modules.');

  const presentRoles = new Set(modules.map((m) => m.role));
  const links = plan.modules
    .filter((m) => m.role !== plan.primaryRole && presentRoles.has(m.role) && presentRoles.has(plan.primaryRole))
    .map((m) => ({ fromRole: plan.primaryRole, toRole: m.role, note: m.reason }));

  // R3.1 — when this intent is a COMPOSITE, deterministically attach the
  // shared-record manifest (record + per-member bindings). Backing is pinned per
  // kind (never model-chosen); members leave record-derived fields as placeholders
  // (filled at publish from the resolved record). Non-composite intents attach
  // nothing → a flat blueprint, byte-for-byte prior behavior.
  const catalogEntry = getBlueprintCatalogEntry(plan.intent);
  const manifest = catalogEntry ? buildCompositeManifest(catalogEntry, presentRoles) : null;

  const blueprint: RecipeBlueprint = {
    name: plan.name,
    summary: plan.summary,
    modules,
    ...(links.length ? { links } : {}),
    ...(manifest?.sharedRecords.length
      ? { sharedRecords: manifest.sharedRecords as RecipeBlueprint['sharedRecords'], bindings: manifest.bindings as RecipeBlueprint['bindings'] }
      : {}),
  };

  const coherence = validateBlueprintCoherence(blueprint);
  if (!coherence.ok) {
    console.warn(`[blueprint] coherence issues for "${plan.name}": ${coherence.issues.join(' | ')}`);
  }
  if (coherence.warnings.length) {
    console.warn(`[blueprint] coherence warnings for "${plan.name}": ${coherence.warnings.join(' | ')}`);
  }
  return blueprint;
}

export async function generateValidatedRecipeOptions(
  prompt: string,
  classification: { moduleType: ModuleType; intent?: string; surface?: string },
  options?: {
    shopId?: string;
    maxAttempts?: number;
    intentPacketJson?: string;
    confidenceScore?: number;
    promptProfile?: string;
    routerDecision?: PromptRouterDecision;
    /** Search-augmented grounding examples (RAG), injected into each prompt. */
    groundingBlock?: string;
    /** When this module is one member of a blueprint, coordination context for the prompt. */
    blueprintContext?: string;
  },
): Promise<RecipeOption[]> {
  if (getRecipeSingleJsonSchemaForType(classification.moduleType)) {
    return generateValidatedRecipeOptionsParallel(prompt, classification, {
      shopId: options?.shopId,
      intentPacketJson: options?.intentPacketJson,
      confidenceScore: options?.confidenceScore,
      promptProfile: options?.promptProfile,
      routerDecision: options?.routerDecision,
      optionCount: 3,
      groundingBlock: options?.groundingBlock,
      blueprintContext: options?.blueprintContext,
    });
  }
  const maxAttempts = options?.maxAttempts ?? 3;
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();

  const purposeAndGuidance = PROMPT_PURPOSE_AND_GUIDANCE;
  const summary = getModuleSummary(classification.moduleType);
  const expectations = getPromptExpectations(classification.moduleType);

  // Include full schema+style+catalog on attempt 0 when confidence is below the DIRECT threshold (0.8).
  // This front-loads context for ambiguous prompts rather than waiting for a retry.
  const routerConfidence = options?.routerDecision?.confidence ?? options?.confidenceScore ?? 1;
  const isLowConfidence = routerConfidence < CONFIDENCE_THRESHOLDS.DIRECT;
  const isHighConfidence = routerConfidence >= CONFIDENCE_THRESHOLDS.DIRECT;
  const storefrontTypes = ['theme.section', 'proxy.widget'];
  const isStorefront = storefrontTypes.includes(classification.moduleType);
  // Settings pack is always injected — it's lightweight and ensures the AI populates all relevant fields.
  const settingsPack = options?.routerDecision?.includeFlags.includeSettingsPack === false
    ? undefined
    : getSettingsPack(classification.moduleType);
  const designReferencePack: DesignReferencePack | undefined = isStorefront
    ? (options?.shopId ? await resolveStoreDesignReferencePack(options.shopId) : await resolveDesignReferencePack())
    : undefined;
  const designReferenceBlock = designReferencePack ? buildDesignReferencePromptBlock(designReferencePack) : undefined;
  const designSystemDirective = designReferencePack ? buildDesignSystemDirectiveForReference(designReferencePack) : undefined;
  const uiDesignerPass = isStorefront ? UI_DESIGNER_REFINEMENT_PASS : undefined;
  const frontendDeveloperPass = isStorefront ? FRONTEND_DEVELOPER_REFINEMENT_PASS : undefined;
  const premiumGuardrails = isStorefront ? PREMIUM_OUTPUT_GUARDRAILS : undefined;
  // Skip full types list when confidence is high — the type is already known, saves ~2K tokens.
  const typesList = isHighConfidence ? `Available type: ${classification.moduleType}` : getAllTypesSummary();

  // When a per-type JSON Schema is available, structured-output guarantees the
  // shape — so we don't need to spend tokens on the prose `fullSchemaSpec`.
  const optionsJsonSchema = getRecipeOptionsJsonSchemaForType(classification.moduleType);
  const hasStructuredSchema = Boolean(optionsJsonSchema);

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isRetry = attempt > 0;
    const includeFullSchema = options?.routerDecision
      ? options.routerDecision.includeFlags.includeFullSchema
      : (isRetry || isLowConfidence);
    const includeStyleSchema = options?.routerDecision
      ? options.routerDecision.includeFlags.includeStyleSchema
      : (isRetry || isLowConfidence);
    const includeCatalog = options?.routerDecision
      ? options.routerDecision.includeFlags.includeCatalog
      : (isRetry || isLowConfidence);
    const fullSchemaSpec = includeFullSchema && !hasStructuredSchema ? getFullRecipeSchemaSpec(classification.moduleType) : undefined;
    const styleSchemaSpec = includeStyleSchema && storefrontTypes.includes(classification.moduleType) ? getStorefrontStyleSchemaSpec() : undefined;
    const catalogDetails = includeCatalog
      ? (options?.routerDecision
        ? buildCatalogDetailsFromRouter(classification, options.routerDecision)
        : getCatalogDetailsForType(classification.moduleType, classification.intent, classification.surface))
      : undefined;

    // Skip intent packet on first attempt for high-confidence to reduce token count
    const includeIntentPacket = options?.routerDecision
      ? options.routerDecision.includeFlags.includeIntentPacket
      : (!isHighConfidence || isRetry);

    const compiledPrompt = compileCreateModulePrompt({
      purposeAndGuidance,
      typesList,
      moduleType: classification.moduleType,
      summary,
      expectations,
      userRequest: prompt,
      settingsPack,
      fullSchemaSpec,
      styleSchemaSpec,
      catalogDetails,
      groundingBlock: options?.groundingBlock,
      previousError: lastErr ? String(lastErr) : undefined,
      intentPacketJson: includeIntentPacket ? options?.intentPacketJson : undefined,
      promptProfile: options?.promptProfile,
      designReferenceBlock,
      designSystemDirective,
      blueprintContext: options?.blueprintContext,
      uiDesignerPass,
      frontendDeveloperPass,
      premiumGuardrails,
    });

    const optionsBudget = getRecipeOptionsTokenBudget(classification.moduleType, 3);
    let rawJson = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let model: string | undefined;
    let servedProviderId: string | null | undefined;

    try {
      ({ rawJson, tokensIn, tokensOut, model, servedProviderId } = await client.generateRecipe(compiledPrompt, {
        maxTokens: optionsBudget,
        responseSchema: optionsJsonSchema
          ? { name: `RecipeOptions_${classification.moduleType.replace(/[^a-zA-Z0-9_]/g, '_')}`, schema: optionsJsonSchema }
          : undefined,
      }));
      const parsed = JSON.parse(rawJson);
      const optionsArr = parsed?.options ?? (Array.isArray(parsed) ? parsed : null);
      if (!Array.isArray(optionsArr) || optionsArr.length === 0) {
        throw new Error('Response missing "options" array');
      }

      const validated: RecipeOption[] = [];
      let firstValidationError: string | undefined;
      for (const opt of optionsArr) {
        const raw = unwrapRecipe(opt?.recipe ?? opt);
        const repaired = repairRecipeForValidation(raw);
        const parsed = RecipeSpecSchema.safeParse(repaired);
        if (parsed.success) {
          validated.push({
            explanation: typeof opt?.explanation === 'string' ? opt.explanation : `Option ${validated.length + 1}`,
            recipe: applyDesignQaSafe(parsed.data),
          });
          continue;
        }
        if (!firstValidationError) firstValidationError = parsed.error.message;
        try {
          const { recipe } = await validateAndRepairRecipe(raw, client, {
            shopId: options?.shopId,
            moduleType: classification.moduleType,
          });
          validated.push({
            explanation: typeof opt?.explanation === 'string' ? opt.explanation : `Option ${validated.length + 1} (repaired)`,
            recipe: applyDesignQaSafe(recipe),
          });
        } catch (repairErr) {
          if (!firstValidationError) firstValidationError = repairErr instanceof Error ? repairErr.message : String(repairErr);
        }
      }

      if (validated.length === 0) {
        throw new Error(firstValidationError ?? 'All 3 options failed Zod validation');
      }

      const { providerId: servedId, costCents } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_GENERATION_OPTIONS',
        tokensIn,
        tokensOut,
        costCents,
        meta: { attempts: attempt + 1, model, validOptions: validated.length },
        requestCount: 1,
        prompt: compiledPrompt,
      });

      return validated;
    } catch (err) {
      lastErr = err;
      const { providerId: servedId, costCents: failCost } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_GENERATION_OPTIONS_FAILED',
        tokensIn,
        tokensOut,
        costCents: failCost,
        meta: { attempts: attempt + 1, model, error: String(err).slice(0, 500) },
        requestCount: 1,
        prompt: compiledPrompt,
      });
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
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();

  const summary = getModuleSummary(currentSpec.type);
  const expectations = getModifyPromptExpectations();
  const currentSpecJson = JSON.stringify(currentSpec);

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const compiledPrompt = compileModifyModulePrompt({
      summary: `Current module type: ${currentSpec.type}\n${summary}`,
      expectations,
      currentSpecJson,
      userInstruction: instruction,
      previousError: lastErr ? String(lastErr) : undefined,
    });

    const modifyOptionsBudget = getRecipeOptionsTokenBudget(currentSpec.type, 3);
    let tokensIn = 0;
    let tokensOut = 0;
    let model: string | undefined;
    let servedProviderId: string | null | undefined;

    try {
      const result = await client.generateRecipe(compiledPrompt, {
        maxTokens: modifyOptionsBudget,
      });
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
      model = result.model;
      servedProviderId = result.servedProviderId;

      const parsed = JSON.parse(result.rawJson);
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

      const { providerId: servedId, costCents } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_MODIFY_OPTIONS',
        tokensIn,
        tokensOut,
        costCents,
        meta: { attempts: attempt + 1, model, validOptions: validated.length },
        requestCount: 1,
        prompt: compiledPrompt,
      });

      return validated;
    } catch (err) {
      lastErr = err;
      const { providerId: servedId, costCents: failCost } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_MODIFY_OPTIONS_FAILED',
        tokensIn,
        tokensOut,
        costCents: failCost,
        meta: { attempts: attempt + 1, model, error: String(err).slice(0, 500) },
        requestCount: 1,
        prompt: compiledPrompt,
      });
    }
  }

  throw new Error(`AI recipe modify options failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

/**
 * Coerce common LLM output mistakes in the hydrate envelope before Zod validation.
 * Mirrors repairRecipeForValidation but for HydrateEnvelopeV1 shape issues.
 * Exported for the validation-report casing regression guard.
 */
export function repairHydrateEnvelope(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // surfacePlan: LLM sometimes returns an array instead of { selectedSurfaces, compatibility }
  if (Array.isArray(o.surfacePlan)) {
    o.surfacePlan = { compatibility: o.surfacePlan };
  }

  // themeEditorSettings.fields: repair individual field objects
  const tes = o.themeEditorSettings as Record<string, unknown> | undefined;
  if (tes && Array.isArray(tes.fields)) {
    tes.fields = (tes.fields as unknown[]).map((f: unknown) => {
      if (!f || typeof f !== 'object') return f;
      const field = f as Record<string, unknown>;
      // id: fall back to common alternative keys
      if (!field.id) field.id = field.name ?? field.key ?? field.field ?? 'field';
      // label: fall back to common alternative keys
      if (!field.label) field.label = field.title ?? field.displayName ?? String(field.id);
      // options: coerce string[] → { value, label }[]
      if (Array.isArray(field.options)) {
        field.options = (field.options as unknown[]).map((opt: unknown) =>
          typeof opt === 'string' ? { value: opt, label: opt } : opt,
        );
      }
      return field;
    });
  }

  // uiTokens: each category may be a plain object {key: value} instead of [{token, default}]
  const ut = o.uiTokens as Record<string, unknown> | undefined;
  if (ut && typeof ut === 'object') {
    for (const cat of ['colors', 'typography', 'spacing', 'radius', 'shadow'] as const) {
      const val = ut[cat];
      if (val && !Array.isArray(val) && typeof val === 'object') {
        ut[cat] = Object.entries(val as Record<string, unknown>).map(([token, def]) => ({
          token,
          default: def ?? '',
        }));
      }
      // If it's already an array, repair items that are missing token/default
      if (Array.isArray(ut[cat])) {
        ut[cat] = (ut[cat] as unknown[]).map((item: unknown) => {
          if (!item || typeof item !== 'object') return item;
          const t = item as Record<string, unknown>;
          if (!t.token) t.token = 'unknown';
          if (t.default === undefined) t.default = '';
          return t;
        });
      }
    }
  }

  // validationReport.checks: fill required fields if missing
  const vr = o.validationReport as Record<string, unknown> | undefined;
  if (vr && Array.isArray(vr.checks)) {
    vr.checks = (vr.checks as unknown[]).map((c: unknown, i: number) => {
      if (!c || typeof c !== 'object') return c;
      const check = c as Record<string, unknown>;
      if (!check.id) check.id = `check_${i}`;
      if (!check.severity) check.severity = 'low';
      // Status is a strict uppercase enum ('PASS'|'WARN'|'FAIL'), but the LLM
      // sometimes emits the wrong case ('pass'/'Fail'). Normalize case BEFORE the
      // schema validates it: without this, a lowercase 'pass' fails the Zod enum
      // (forcing a needless hydrate retry) and, if it slipped through, the module UI
      // renders it red because the consumer checks `status === 'PASS'` exactly.
      if (typeof check.status === 'string') check.status = check.status.toUpperCase();
      if (check.status !== 'PASS' && check.status !== 'WARN' && check.status !== 'FAIL') check.status = 'PASS';
      if (!check.description) check.description = String(check.id);
      return check;
    });
    // Ensure overall is valid (same case-normalization: 'pass' → 'PASS').
    if (typeof vr.overall === 'string') vr.overall = vr.overall.toUpperCase();
    if (vr.overall !== 'PASS' && vr.overall !== 'WARN') vr.overall = 'PASS';
  }

  return o;
}

const MAX_HYDRATE_ATTEMPTS = 2;

/**
 * Hydrate a RecipeSpec into a full config envelope (admin schema, defaults, theme editor settings, validation report).
 * Used after the merchant confirms a recipe; runs once per chosen module version.
 */
/** Hydration always requests the full MAX_BUDGET ceiling — the envelope's shape doesn't vary by module type. */
const HYDRATE_TOKEN_BUDGET = 16000;

export async function hydrateRecipeSpec(
  recipeSpec: RecipeSpec,
  options?: { shopId?: string; merchantContext?: { planTier?: string; locale?: string }; maxAttempts?: number },
): Promise<HydrateEnvelope> {
  const maxAttempts = options?.maxAttempts ?? MAX_HYDRATE_ATTEMPTS;
  const { client, providerId } = await getLlmClient(options?.shopId ?? null, {
    blockMerchantCodeExecution: true,
  });
  const usage = new AiUsageService();

  const prompt = buildHydratePrompt(recipeSpec, options?.merchantContext);
  const wrappedPrompt = prompt + '\n\nOutput only the HydrateEnvelope JSON object.';

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { rawJson, tokensIn, tokensOut, model, servedProviderId } = await client.generateRecipe(
      wrappedPrompt,
      { previousError: lastErr ? String(lastErr) : undefined, maxTokens: HYDRATE_TOKEN_BUDGET },
    );
    try {
      const parsed = repairHydrateEnvelope(JSON.parse(rawJson));
      const envelope = HydrateEnvelopeSchema.parse(parsed);
      const perfect = validatePerfectConfig(envelope);
      const envelopeToUse = perfect.envelope ?? envelope;
      const { providerId: servedId, costCents } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_HYDRATE',
        tokensIn,
        tokensOut,
        costCents,
        meta: { attempts: attempt + 1, model, moduleType: recipeSpec.type },
        requestCount: 1,
        prompt: wrappedPrompt,
      });
      return envelopeToUse;
    } catch (err) {
      lastErr = err;
      const { providerId: servedId, costCents: failCost } = await attributeServedCost(
        { servedProviderId, model },
        providerId,
        tokensIn,
        tokensOut,
      );
      await recordAiUsage(usage, {
        providerId: servedId,
        shopId: options?.shopId,
        action: 'RECIPE_HYDRATE_FAILED',
        tokensIn,
        tokensOut,
        costCents: failCost,
        meta: { attempt: attempt + 1, model, moduleType: recipeSpec.type, error: String(err) },
        requestCount: 1,
        prompt: wrappedPrompt,
      });
    }
  }
  throw new Error(`Hydrate envelope validation failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

async function estimateCostCentsFromDb(providerId: string, model: string, tokensIn: number, tokensOut: number) {
  return estimateCostCentsFromDbRates({ providerId, model, tokensIn, tokensOut });
}

/** Guesses the provider kind from a served model name, for env-key calls with no DB provider row. */
function guessProviderKindFromModel(model: string | undefined): 'ANTHROPIC' | 'OPENAI' | 'GEMINI' | null {
  const m = model?.trim().toLowerCase() ?? '';
  if (!m) return null;
  if (m.startsWith('claude')) return 'ANTHROPIC';
  if (m.startsWith('gemini')) return 'GEMINI';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'OPENAI';
  return null;
}

/**
 * Attribute cost/usage to the provider that actually served the request. When a
 * fallback provider serves, `result.servedProviderId` names it so the rate lookup
 * uses the served model's pricing (avoids attributing a fallback call to the
 * default provider's id, which would price at 0 until that model's rate exists).
 * Falls back to the configured `defaultProviderId` for env clients / failure paths.
 *
 * When there's no DB provider id at all (pure env-key deployment), cost is not
 * silently zeroed — the served model name still tells us the provider kind, so we
 * look up real pricing by kind (see `estimateCostCentsFromDbRates`'s kind-based
 * fallback). Only truly unpriced models (no matching AiModelPrice row anywhere)
 * still resolve to 0.
 */
async function attributeServedCost(
  result: { servedProviderId?: string | null; model?: string },
  defaultProviderId: string | null,
  tokensIn: number,
  tokensOut: number,
): Promise<{ providerId: string | null; costCents: number }> {
  const providerId = result.servedProviderId ?? defaultProviderId;
  if (providerId) {
    const costCents = await estimateCostCentsFromDb(providerId, result.model ?? '', tokensIn, tokensOut);
    return { providerId, costCents };
  }
  const kind = guessProviderKindFromModel(result.model);
  const costCents = kind
    ? await estimateCostCentsFromDbRates({ providerKinds: [kind], model: result.model ?? '', tokensIn, tokensOut })
    : 0;
  return { providerId: null, costCents };
}

/**
 * Records AI usage even when there is no DB-configured provider — env-only keys
 * land on a synthetic provider row so quota counts stay accurate.
 */
async function recordAiUsage(
  usage: AiUsageService,
  params: {
    providerId: string | null;
    shopId?: string;
    action: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    requestCount?: number;
    meta?: unknown;
    prompt?: string;
  },
) {
  try {
    const accountAudit = await getProviderAccountAudit(params.providerId);
    const promptAudit = buildPromptAudit(params.prompt);
    const mergedMeta = {
      ...(params.meta && typeof params.meta === 'object' ? (params.meta as Record<string, unknown>) : { value: params.meta }),
      promptAudit,
      accountAudit,
    };
    await usage.record({
      ...params,
      meta: mergedMeta,
      envSource: params.providerId ? undefined : inferEnvSource(),
    });
  } catch {
    // Never let usage logging fail the generation flow.
  }
}

function inferEnvSource(): 'env:openai' | 'env:anthropic' | 'env:custom' | 'env:unknown' {
  if (process.env.ANTHROPIC_API_KEY) return 'env:anthropic';
  if (process.env.OPENAI_API_KEY) return 'env:openai';
  return 'env:unknown';
}

export function buildPromptAudit(prompt?: string): { sha256: string; chars: number; preview?: string } | null {
  if (!prompt) return null;
  const audit = {
    sha256: crypto.createHash('sha256').update(prompt).digest('hex'),
    chars: prompt.length,
  };
  if (process.env.DEBUG_AI_CAPTURE === '1') {
    // Include enough context to surface DesignReferenceV1 and premium guidance blocks in audits.
    return { ...audit, preview: prompt.slice(0, 1200) };
  }
  return audit;
}

async function getProviderAccountAudit(providerId: string | null): Promise<Record<string, unknown>> {
  if (!providerId) {
    return {
      source: inferEnvSource(),
      accountId: null,
      accountEmail: null,
      dailyLimitUsd: null,
      alertLimitUsd: null,
      currentBalanceUsd: null,
    };
  }
  const prisma = getPrisma();
  const provider = await prisma.aiProvider.findUnique({ where: { id: providerId } });
  if (!provider) return { source: 'db', providerId };

  let parsed: {
    account?: { accountId?: string; accountEmail?: string; accountName?: string };
    billing?: { dailyLimitUsd?: number; alertLimitUsd?: number; currentBalanceUsd?: number; currency?: string };
  } = {};
  if (provider.extraConfig) {
    try {
      parsed = JSON.parse(provider.extraConfig) as typeof parsed;
    } catch {
      parsed = {};
    }
  }
  return {
    source: 'db',
    providerId,
    providerName: provider.name,
    providerKind: provider.provider,
    accountId: parsed.account?.accountId ?? null,
    accountEmail: parsed.account?.accountEmail ?? null,
    accountName: parsed.account?.accountName ?? null,
    dailyLimitUsd: parsed.billing?.dailyLimitUsd ?? null,
    alertLimitUsd: parsed.billing?.alertLimitUsd ?? null,
    currentBalanceUsd: parsed.billing?.currentBalanceUsd ?? null,
    currency: parsed.billing?.currency ?? 'USD',
  };
}
