import type { ModuleType } from '@superapp/core';

/**
 * Per-module-type output token budgets. These are sized so a single recipe of the
 * given type fits comfortably without truncating, with headroom for the wrapping
 * `{ "options": [ { "explanation": "...", "recipe": {...} } ] }` envelope.
 *
 * Larger types (flow.automation, customerAccount.blocks, functions.*) get more.
 * Storefront types are compact. Default is 4000 — enough for one rich recipe.
 */
export const RECIPE_TOKEN_BUDGETS: Partial<Record<ModuleType, number>> = {
  'theme.banner': 2500,
  'theme.notificationBar': 2000,
  'theme.popup': 3000,
  'theme.effect': 2500,
  'theme.floatingWidget': 2500,
  'proxy.widget': 2500,
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
 * Compact-serialize an IntentPacket-like object for prompt injection.
 * Drops `input.text` (already in the prompt as `User request:`) and omits whitespace.
 * Returns undefined if the packet is missing.
 */
export function serializeIntentPacketForPrompt(packet: unknown): string | undefined {
  if (!packet || typeof packet !== 'object') return undefined;
  const clone = JSON.parse(JSON.stringify(packet)) as Record<string, unknown>;
  const input = clone.input as Record<string, unknown> | undefined;
  if (input && typeof input === 'object') {
    delete input.text;
  }
  return JSON.stringify(clone);
}
