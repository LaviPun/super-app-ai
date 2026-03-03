import { RecipeSpecSchema } from '@superapp/core';
import { compileRecipe } from '~/services/recipes/compiler';
import type { LlmClient } from '~/services/ai/llm.server';
import { StubLlmClient } from '~/services/ai/llm.server';

export type GoldenPrompt = {
  id: string;
  prompt: string;
  expectedType?: string;
  description: string;
};

export type EvalResult = {
  promptId: string;
  prompt: string;
  schemaValid: boolean;
  compilerSuccess: boolean;
  matchedExpectedType: boolean;
  attempts: number;
  durationMs: number;
  error?: string;
};

export type EvalSummary = {
  total: number;
  schemaValidCount: number;
  compilerSuccessCount: number;
  schemaValidRate: number;
  compilerSuccessRate: number;
  results: EvalResult[];
};

export const GOLDEN_PROMPTS: GoldenPrompt[] = [
  { id: 'banner-basic', prompt: 'Show a promotional banner with the heading "Summer Sale - 20% off" and a CTA button', expectedType: 'theme.banner', description: 'Basic theme banner' },
  { id: 'banner-with-image', prompt: 'Create a hero banner with heading "New Arrivals", subheading "Shop the latest collection", CTA "Shop Now" linking to /collections/new', expectedType: 'theme.banner', description: 'Banner with image and CTA' },
  { id: 'popup-exit', prompt: 'Show an exit-intent popup offering 10% off for email subscribers', expectedType: 'theme.popup', description: 'Exit intent popup' },
  { id: 'notification-bar', prompt: 'Add a dismissible notification bar saying "Free shipping on orders over $50"', expectedType: 'theme.notificationBar', description: 'Notification bar' },
  { id: 'proxy-widget', prompt: 'Create a store locator widget called store-finder that displays a title "Find a Store"', expectedType: 'proxy.widget', description: 'App proxy widget' },
  { id: 'discount-rule', prompt: 'Give 15% discount to customers with tag "VIP" on orders over $100', expectedType: 'functions.discountRules', description: 'Discount function' },
  { id: 'shipping-rule', prompt: 'Hide "Cash on Delivery" shipping method for customers outside the US', expectedType: 'functions.deliveryCustomization', description: 'Delivery customization' },
  { id: 'payment-rule', prompt: 'Hide "Pay Later" payment method for orders under $50', expectedType: 'functions.paymentCustomization', description: 'Payment customization' },
  { id: 'validation-rule', prompt: 'Block checkout if any item quantity exceeds 10 units with message "Max 10 per item"', expectedType: 'functions.cartAndCheckoutValidation', description: 'Cart validation' },
  { id: 'flow-order', prompt: 'Create an automation: when an order is created, send a POST request to /api/orders endpoint of my ERP connector', expectedType: 'flow.automation', description: 'Order webhook automation' },
];

/**
 * Run the evals harness against a given LLM client.
 * Uses StubLlmClient by default for CI/local — pass a real client for production eval runs.
 */
export async function runEvals(client: LlmClient = new StubLlmClient(), maxAttempts = 3): Promise<EvalSummary> {
  const results: EvalResult[] = [];

  for (const gp of GOLDEN_PROMPTS) {
    const start = Date.now();
    let schemaValid = false;
    let compilerSuccess = false;
    let matchedExpectedType = false;
    let error: string | undefined;
    let attempts = 0;
    let lastErr: unknown;

    for (let i = 0; i < maxAttempts; i++) {
      attempts = i + 1;
      try {
        const { rawJson } = await client.generateRecipe(
          gp.prompt,
          { previousError: lastErr ? String(lastErr) : undefined }
        );

        const parsed = RecipeSpecSchema.parse(JSON.parse(rawJson));
        schemaValid = true;
        matchedExpectedType = !gp.expectedType || parsed.type === gp.expectedType;

        // Try compilation
        try {
          const target = String(parsed.type).startsWith('theme.')
            ? { kind: 'THEME' as const, themeId: 'eval-theme-id' }
            : { kind: 'PLATFORM' as const };
          compileRecipe(parsed as any, target);
          compilerSuccess = true;
        } catch (compErr) {
          error = `Compiler error: ${String(compErr)}`;
        }
        break;
      } catch (err) {
        lastErr = err;
        error = String(err);
      }
    }

    results.push({
      promptId: gp.id,
      prompt: gp.prompt,
      schemaValid,
      compilerSuccess,
      matchedExpectedType,
      attempts,
      durationMs: Date.now() - start,
      error: schemaValid ? undefined : error,
    });
  }

  const schemaValidCount = results.filter(r => r.schemaValid).length;
  const compilerSuccessCount = results.filter(r => r.compilerSuccess).length;

  return {
    total: results.length,
    schemaValidCount,
    compilerSuccessCount,
    schemaValidRate: results.length > 0 ? schemaValidCount / results.length : 0,
    compilerSuccessRate: results.length > 0 ? compilerSuccessCount / results.length : 0,
    results,
  };
}
