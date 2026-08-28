import type { ModuleType } from '@superapp/core';

/**
 * Per-module-type output token budgets. These are sized so a single recipe of the
 * given type fits comfortably without truncating, with headroom for the wrapping
 * `{ "options": [ { "explanation": "...", "recipe": {...} } ] }` envelope.
 *
 * Larger types (flow.automation, customerAccount.blocks, functions.*) get more.
 * Default is 4000 — enough for one rich recipe.
 *
 * `theme.section`/`proxy.widget` (generation-aesthetics quality pass, 2026-08):
 * were 3000/2500 — the SMALLEST budgets in this table — despite carrying the
 * single richest prompt payload in the system (the module-design-system.md
 * directive: Apple-HIG floor + pack grammar + effects catalog + F1-F8
 * micro-interactions + composition rules, ~1.5-2K tokens on its own) and being
 * the only visually-judged, aesthetically-scrutinized surface. Empirically
 * reproduced on real Anthropic calls through the live pipeline
 * (generateValidatedRecipeOptions): a countdown-announcement-bar prompt
 * truncated (`stop_reason=max_tokens`) on ALL 3 parallel option attempts at the
 * old 3000 budget — a total, silent generation failure, not just thinner
 * output — and a free-shipping-bar / email-capture-popup prompt each lost 1-2
 * of 3 options the same way. Raising the budget measurably fixed the total
 * failure (0/3 -> 1/3 succeeding at both 6000 and 8000, no further gain past
 * 6000 in that same trial) — this is a token-budget floor, not a richness/
 * prompt-quality problem: the model runs out of room mid-recipe and produces
 * unparseable JSON, which silently drops the option from the result set
 * (generateValidatedRecipeOptionsParallel swallows per-option failures) and
 * biases the surviving options toward whichever approach happened to be
 * terser — the opposite of what a "raise the bar" pass wants. See
 * docs/design-system/module-design-system.md and the PR description for the
 * full evidence.
 */
export const RECIPE_TOKEN_BUDGETS: Partial<Record<ModuleType, number>> = {
  'theme.section': 7000,
  'proxy.widget': 5500,
  'flow.automation': 6000,
  'customerAccount.blocks': 4500,
  'functions.discountRules': 3500,
  'functions.deliveryCustomization': 3000,
  'functions.paymentCustomization': 3000,
  'functions.cartAndCheckoutValidation': 3500,
  'functions.cartTransform': 3500,
  'functions.fulfillmentConstraints': 3000,
  'functions.orderRoutingLocationRule': 3000,
  'checkout.upsell': 4000,
  'integration.httpSync': 3500,
  'platform.extensionBlueprint': 4500,
};

const DEFAULT_BUDGET = 4000;
/**
 * Hard ceiling per provider call. Beyond this we risk cost spikes and provider
 * rate-limit pressure. Keep in sync with provider model context windows.
 */
const MAX_BUDGET = 16000;
/** Floor used for repair calls so the model never gets less than this. */
const MIN_BUDGET = 1500;

/**
 * Return the per-recipe token budget for a single recipe of this type.
 * Used by the streaming/parallel path: each recipe call gets its own budget.
 */
export function getRecipeTokenBudget(type: ModuleType): number {
  return RECIPE_TOKEN_BUDGETS[type] ?? DEFAULT_BUDGET;
}

/**
 * When asking for N recipes in one call (legacy non-parallel path), scale the
 * budget by N and clamp to the provider ceiling so we don't blow context.
 * Adds 500 tokens of envelope overhead.
 */
export function getRecipeOptionsTokenBudget(type: ModuleType, optionCount: number): number {
  const per = getRecipeTokenBudget(type);
  return Math.min(MAX_BUDGET, per * Math.max(1, optionCount) + 500);
}

/**
 * Repair calls fix small validation issues; they don't need the full budget.
 * Half the per-recipe budget is plenty.
 */
export function getRepairTokenBudget(type: ModuleType): number {
  return Math.max(MIN_BUDGET, Math.floor(getRecipeTokenBudget(type) / 2));
}

/**
 * Floor for a delta (JSON merge patch) call — a patch is small, but must clear
 * this. Sized proportionally to the 0.75x ratio below (was 1200 under the old
 * 0.5x ratio); left unmoved because it doesn't currently bind (the smallest
 * listed recipe budget, 2500, yields 1875 at 0.75x) — if a future, smaller
 * RECIPE_TOKEN_BUDGETS entry makes this floor start binding, raise it
 * proportionally then.
 */
const MIN_DELTA_BUDGET = 1200;

/**
 * Delta (Tier-1 instantiate + merge-patch) calls emit only the *diff* against an
 * inline template spec, not a whole recipe. Originally set to half the
 * per-recipe budget, but production logs on Sonnet 5 showed every Tier-1 delta
 * call truncating (`stop_reason=max_tokens`) and silently falling back to
 * freeform — Sonnet 5's outputs (explanation + patch, with longer adapted copy)
 * run longer than the older default model's. Raised to 0.75x so the patch call
 * has realistic headroom. Floored at MIN_DELTA_BUDGET so even the most compact
 * types leave room for a non-trivial patch plus its wrapping envelope.
 */
export function getDeltaTokenBudget(type: ModuleType): number {
  return Math.max(MIN_DELTA_BUDGET, Math.floor(getRecipeTokenBudget(type) * 0.75));
}

/**
 * Compact-serialize an IntentPacket-like object for prompt injection.
 * Drops `input.text` (already in the prompt as `User request:`) and omits whitespace.
 * Returns undefined if the packet is missing.
 */
export function serializeIntentPacketForPrompt(packet: unknown): string | undefined {
  if (!packet || typeof packet !== 'object') return undefined;
  const clone = JSON.parse(JSON.stringify(packet)) as Record<string, unknown>;

  const input = clone.input as Record<string, unknown> | undefined;
  const classification = clone.classification as Record<string, unknown> | undefined;
  const routing = clone.routing as Record<string, unknown> | undefined;

  const storeContext = input && typeof input === 'object' && input.store_context && typeof input.store_context === 'object'
    ? (input.store_context as Record<string, unknown>)
    : undefined;
  const alternatives = classification && Array.isArray(classification.alternatives)
    ? (classification.alternatives as unknown[]).slice(0, 2).map((alt) => {
        if (!alt || typeof alt !== 'object') return null;
        const a = alt as Record<string, unknown>;
        return {
          intent: typeof a.intent === 'string' ? a.intent : undefined,
          confidence: typeof a.confidence === 'number' ? a.confidence : undefined,
        };
      }).filter(Boolean)
    : [];

  // PromptIntentSeedV1: minimal payload for heavy AI. Keep only routing/classification
  // data that materially changes generation, and drop verbose raw-input fields.
  const compact = {
    schema_version: '1.0',
    classification: {
      intent: classification?.intent,
      surface: classification?.surface,
      module_archetype: classification?.module_archetype,
      mode: classification?.mode,
      confidence: classification?.confidence,
      alternatives,
    },
    routing: {
      prompt_profile: routing?.prompt_profile,
      output_schema: routing?.output_schema,
      model_tier: routing?.model_tier,
    },
    store_context: {
      theme_os2: storeContext?.theme_os2,
      primary_language: storeContext?.primary_language,
      currency: storeContext?.currency,
    },
  };

  return JSON.stringify(compact);
}
