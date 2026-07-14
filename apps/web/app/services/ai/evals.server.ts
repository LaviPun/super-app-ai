import { MODULE_CATEGORIES, RECIPE_SPEC_TYPES, RecipeSpecSchema, type DeployTarget, type RecipeSpec } from '@superapp/core';
import { isTargetAllowedForType } from '@superapp/core';
import { compileRecipe } from '../recipes/compiler/index.js';
import { checkNonDestructive } from '../recipes/compiler/non-destructive.js';
import type { LlmClient } from './llm.server.js';
import { StubLlmClient } from './llm.server.js';
import { parityChecklist, type ParityFamily } from './eval-quality.server.js';
import { runRichnessQa, detectRichnessExempt } from './richness-qa.server.js';
import { rankOptions } from './option-ranking.server.js';
import { buildJudgePrompt } from '../tournament/agents.js';
import { FindingSchema } from '../tournament/types.js';

export type GoldenPrompt = {
  id: string;
  prompt: string;
  expectedType?: string;
  description: string;
  /**
   * The user explicitly asked for something simple/minimal — richness floors do
   * NOT apply. Threaded into `runRichnessQa` so an intentionally plain module is
   * never penalized. Defaults to `detectRichnessExempt(prompt)` when omitted.
   */
  richnessExempt?: boolean;
};

export type EvalResult = {
  promptId: string;
  prompt: string;
  schemaValid: boolean;
  compilerSuccess: boolean;
  nonDestructive: boolean;
  nonDestructiveViolations: string[];
  allowedValuesCompliant: boolean;
  forbiddenSurfaceRejected: boolean;
  matchedExpectedType: boolean;
  /** Competitor-parity checklist score in [0,1] (0 when schema-invalid). */
  qualityScore: number;
  /** Parity family the checklist selected for this recipe. */
  qualityFamily: ParityFamily;
  /** Count of blocking richness-QA `fail` issues (0 when exempt or schema-invalid). */
  richnessFails: number;
  /** Deterministic option-ranking composite score (higher = better; 0 when schema-invalid). */
  rankScore: number;
  /** LLM-judge overall score (0-10) — present ONLY when a judge client was passed (nightly live). */
  judgeScore?: number;
  attempts: number;
  durationMs: number;
  error?: string;
};

export type EvalSummary = {
  total: number;
  schemaValidCount: number;
  compilerSuccessCount: number;
  nonDestructiveCount: number;
  allowedValuesCompliantCount: number;
  forbiddenSurfaceRejectCount: number;
  schemaValidRate: number;
  compilerSuccessRate: number;
  nonDestructiveRate: number;
  allowedValuesCompliantRate: number;
  forbiddenSurfaceRejectRate: number;
  /** Mean competitor-parity score across all prompts, in [0,1]. */
  avgQualityScore: number;
  /** Fraction of prompts with ≥1 blocking richness `fail`. */
  richnessFailRate: number;
  /** Mean deterministic option-ranking score across schema-valid prompts. */
  avgRankScore: number;
  /** Mean LLM-judge score — present ONLY when a judge client was used. */
  avgJudgeScore?: number;
  results: EvalResult[];
};

/** Options for {@link runEvals}. */
export type RunEvalsOptions = {
  /**
   * When set, each schema-valid recipe is additionally scored by an LLM judge
   * (reusing the tournament's `buildJudgePrompt`). This costs real tokens and is
   * ONLY passed by nightly live runs — the deterministic CI path leaves it unset.
   */
  judgeClient?: LlmClient;
};

export const GOLDEN_PROMPTS: GoldenPrompt[] = [
  // ── Original golden fixtures (kept, ids stable) ─────────────────────────────
  { id: 'banner-basic', prompt: 'Show a promotional banner with the heading "Summer Sale - 20% off" and a CTA button', expectedType: 'theme.section', description: 'Basic theme banner' },
  { id: 'banner-with-image', prompt: 'Create a hero banner with heading "New Arrivals", subheading "Shop the latest collection", CTA "Shop Now" linking to /collections/new', expectedType: 'theme.section', description: 'Banner with image and CTA' },
  { id: 'popup-exit', prompt: 'Show an exit-intent popup offering 10% off for email subscribers', expectedType: 'theme.section', description: 'Exit intent popup' },
  { id: 'notification-bar', prompt: 'Add a dismissible notification bar saying "Free shipping on orders over $50"', expectedType: 'theme.section', description: 'Notification bar' },
  { id: 'proxy-widget', prompt: 'Create a store locator widget called store-finder that displays a title "Find a Store"', expectedType: 'proxy.widget', description: 'App proxy widget' },
  { id: 'discount-rule', prompt: 'Give 15% discount to customers with tag "VIP" on orders over $100', expectedType: 'functions.discountRules', description: 'Discount function' },
  { id: 'shipping-rule', prompt: 'Hide "Cash on Delivery" shipping method for customers outside the US', expectedType: 'functions.deliveryCustomization', description: 'Delivery customization' },
  { id: 'payment-rule', prompt: 'Hide "Pay Later" payment method for orders under $50', expectedType: 'functions.paymentCustomization', description: 'Payment customization' },
  { id: 'validation-rule', prompt: 'Block checkout if any item quantity exceeds 10 units with message "Max 10 per item"', expectedType: 'functions.cartAndCheckoutValidation', description: 'Cart validation' },
  { id: 'flow-order', prompt: 'Create an automation: when an order is created, send a POST request to /api/orders endpoint of my ERP connector', expectedType: 'flow.automation', description: 'Order webhook automation' },

  // ── Function-surface type coverage (the remaining functions.* members) ──────
  { id: 'cart-transform-bundle', prompt: 'Bundle three t-shirts into a discounted 3-pack merged as one cart line via a cart transform', expectedType: 'functions.cartTransform', description: 'Cart transform bundle' },
  { id: 'fulfillment-constraint', prompt: 'Prevent frozen and ambient grocery items from being fulfilled together in one shipment', expectedType: 'functions.fulfillmentConstraints', description: 'Fulfillment grouping constraint' },
  { id: 'order-routing-rule', prompt: 'Route each order to the closest warehouse location that has all items in stock', expectedType: 'functions.orderRoutingLocationRule', description: 'Order routing location rule' },
  { id: 'shipping-discount', prompt: 'Give free shipping on orders over $75 as a shipping discount', expectedType: 'functions.shippingDiscount', description: 'Shipping discount function' },
  { id: 'local-pickup', prompt: 'Offer local in-store pickup at our downtown flagship location at checkout', expectedType: 'functions.localPickupDeliveryOption', description: 'Local pickup delivery option' },
  { id: 'pickup-point', prompt: 'Offer parcel-locker and post-office pickup points as delivery options at checkout', expectedType: 'functions.pickupPointDeliveryOption', description: 'Pickup point delivery option' },

  // ── Checkout / post-purchase surfaces ───────────────────────────────────────
  { id: 'checkout-upsell', prompt: 'Add an in-checkout upsell offering a shipping-protection warranty add-on with a recommendation fallback', expectedType: 'checkout.upsell', description: 'In-checkout upsell' },
  { id: 'checkout-block', prompt: 'Add a checkout block with a gift-message text input on the shipping step', expectedType: 'checkout.block', description: 'Checkout content block' },
  { id: 'post-purchase-offer', prompt: 'Show a one-click post-purchase offer for a matching accessory at a 15% discount', expectedType: 'postPurchase.offer', description: 'Post-purchase offer' },

  // ── Admin surfaces ──────────────────────────────────────────────────────────
  { id: 'admin-block', prompt: 'Add an admin block on the order details page showing the customer lifetime value', expectedType: 'admin.block', description: 'Admin block' },
  { id: 'admin-action', prompt: 'Add an admin action button on the customer page to tag high-value customers as VIP', expectedType: 'admin.action', description: 'Admin action' },
  { id: 'admin-discount-ui', prompt: 'Add an admin settings UI to configure a spend-to-save volume discount', expectedType: 'admin.discountUi', description: 'Admin discount UI' },
  { id: 'admin-link', prompt: 'Add an admin deep link from a product page to that product\'s external analytics dashboard', expectedType: 'admin.link', description: 'Admin link' },
  { id: 'admin-print', prompt: 'Add an admin print action that produces a packing slip document for selected orders', expectedType: 'admin.print', description: 'Admin print action' },
  { id: 'admin-segment-template', prompt: 'Provide a customer-segment template for lapsed buyers who have not ordered in 90 days', expectedType: 'admin.segmentTemplate', description: 'Admin segment template' },

  // ── POS · analytics · integration · agentic · platform · customer account ───
  { id: 'pos-extension', prompt: 'Add a POS smart-grid tile that looks up a customer\'s gift-card balance', expectedType: 'pos.extension', description: 'POS extension' },
  { id: 'analytics-pixel', prompt: 'Add a web pixel that tracks add-to-cart and checkout-started events to our analytics endpoint', expectedType: 'analytics.pixel', description: 'Web pixel' },
  { id: 'http-sync', prompt: 'On order creation, sync the order payload to our ERP over an HTTPS endpoint', expectedType: 'integration.httpSync', description: 'HTTP sync integration' },
  { id: 'agentic-feed', prompt: 'Publish a structured product-data catalog feed that AI shopping agents can fetch', expectedType: 'agentic.catalogProfile', description: 'Agentic catalog profile' },
  { id: 'extension-blueprint', prompt: 'Scaffold a custom checkout UI extension blueprint for a delivery-date picker', expectedType: 'platform.extensionBlueprint', description: 'Extension blueprint' },
  { id: 'customer-account-block', prompt: 'Add a reorder block to the customer account order-history page', expectedType: 'customerAccount.blocks', description: 'Customer account block' },
  { id: 'messaging-email', prompt: 'Send an abandoned-cart recovery email to shoppers who leave a cart, respecting marketing consent', expectedType: 'messaging.campaign', description: 'Messaging campaign — email' },

  // ── Storefront parity-family exemplars (exercise the checklist families) ────
  { id: 'hero-split', prompt: 'Create a two-column homepage hero with a headline, subheading, product image, and two CTA buttons', expectedType: 'theme.section', description: 'Rich split hero' },
  { id: 'pricing-table', prompt: 'Add a three-tier pricing comparison table that highlights the Pro plan as most popular', expectedType: 'theme.section', description: 'Pricing comparison' },
  { id: 'faq-section', prompt: 'Add an FAQ accordion section covering shipping, returns, sizing, and warranty questions', expectedType: 'theme.section', description: 'FAQ accordion' },
  { id: 'testimonials', prompt: 'Add a customer testimonials section with three five-star review cards', expectedType: 'theme.section', description: 'Testimonials social proof' },
  { id: 'gallery-lookbook', prompt: 'Add a product lookbook image gallery for the new collection', expectedType: 'theme.section', description: 'Gallery lookbook' },
  { id: 'countdown-bar', prompt: 'Add a countdown timer announcement bar for a 24-hour flash sale', expectedType: 'theme.section', description: 'Countdown bar' },
  { id: 'newsletter-capture', prompt: 'Add an inline newsletter email-capture section that reveals a welcome discount on signup', expectedType: 'theme.section', description: 'Newsletter capture' },
  { id: 'upsell-fbt', prompt: 'Add a frequently-bought-together upsell on the product page that recommends complementary items with a manual fallback', expectedType: 'theme.section', description: 'FBT upsell section' },
  { id: 'discount-tiered', prompt: 'Create spend-to-save tiers: 5% off at $75, 10% off at $150, and 15% off at $300', expectedType: 'functions.discountRules', description: 'Tiered spend-to-save discount' },
  { id: 'messaging-drip', prompt: 'Set up a three-email welcome drip series for new subscribers, respecting consent', expectedType: 'messaging.campaign', description: 'Messaging drip sequence' },

  // ── Adversarial: vague / over-broad (must not throw; no expected type) ───────
  { id: 'adv-vague-1', prompt: 'make my store better', description: 'Vague — no concrete surface named' },
  { id: 'adv-vague-2', prompt: 'I want more sales, can you help', description: 'Vague — outcome, not a module' },
  { id: 'adv-broad', prompt: 'Build me a complete marketing suite with popups, discounts, email campaigns, and upsells all at once', description: 'Over-broad multi-surface request' },

  // ── Adversarial: competitor name-dropping (parity phrasing, still a module) ──
  { id: 'adv-competitor-privy', prompt: 'Add an email-capture exit popup like Privy with a discount reveal', expectedType: 'theme.section', description: 'Competitor-named popup (Privy)' },
  { id: 'adv-competitor-ninja', prompt: 'Set up tiered volume discounts like Discount Ninja', expectedType: 'functions.discountRules', description: 'Competitor-named discount (Discount Ninja)' },
  { id: 'adv-competitor-reconvert', prompt: 'Add a post-purchase upsell funnel like ReConvert', expectedType: 'postPurchase.offer', description: 'Competitor-named upsell (ReConvert)' },

  // ── Adversarial: explicit simplicity (richness-EXEMPT — must NOT be penalized) ──
  { id: 'adv-simple-banner', prompt: 'just a simple banner that says Welcome to our store', expectedType: 'theme.section', richnessExempt: true, description: 'Explicit-simplicity banner (exempt)' },
  { id: 'adv-minimal-bar', prompt: 'only a minimal notification bar with free shipping text', expectedType: 'theme.section', richnessExempt: true, description: 'Explicit-simplicity notification bar (exempt)' },
  { id: 'adv-plain-hero', prompt: 'just a plain hero with only a heading, nothing else', expectedType: 'theme.section', richnessExempt: true, description: 'Explicit-simplicity hero (exempt)' },
];

/**
 * Score one schema-valid recipe with the LLM judge (reusing the tournament's
 * `buildJudgePrompt`). Returns the 0-10 overall score, or `undefined` when the
 * judge response doesn't parse (kept lenient so a flaky judge never fails CI).
 */
async function judgeRecipe(judgeClient: LlmClient, prompt: string, recipe: RecipeSpec): Promise<number | undefined> {
  try {
    const judgePrompt = buildJudgePrompt(
      { id: 'eval', explanation: 'eval candidate', recipe },
      [], // no per-dimension audit findings in the eval path — judge sees the recipe alone
      prompt,
    );
    const { rawJson } = await judgeClient.generateRecipe(judgePrompt, { maxTokens: 1800 });
    const finding = FindingSchema.parse(JSON.parse(rawJson));
    return finding.score;
  } catch {
    return undefined;
  }
}

/**
 * Run the evals harness against a given LLM client.
 * Uses StubLlmClient by default for CI/local — pass a real client for production eval runs.
 *
 * The deterministic gates (schema/compiler/non-destructive/allowed-values/
 * forbidden-surface) plus the quality signals (parity checklist, richness fails,
 * option-ranking score) run on EVERY call and need no network. The LLM-judge
 * score is added ONLY when `opts.judgeClient` is passed (nightly live runs).
 */
export async function runEvals(
  client: LlmClient = new StubLlmClient(),
  maxAttempts = 3,
  opts: RunEvalsOptions = {},
): Promise<EvalSummary> {
  const results: EvalResult[] = [];

  for (const gp of GOLDEN_PROMPTS) {
    const start = Date.now();
    let schemaValid = false;
    let compilerSuccess = false;
    let nonDestructive = false;
    let nonDestructiveViolations: string[] = [];
    let allowedValuesCompliant = false;
    let forbiddenSurfaceRejected = false;
    let matchedExpectedType = false;
    let qualityScore = 0;
    let qualityFamily: ParityFamily = 'generic';
    let richnessFails = 0;
    let rankScore = 0;
    let judgeScore: number | undefined;
    let error: string | undefined;
    let attempts = 0;
    let lastErr: unknown;
    let parsedRecipe: RecipeSpec | undefined;

    const richnessExempt = gp.richnessExempt ?? detectRichnessExempt(gp.prompt);

    for (let i = 0; i < maxAttempts; i++) {
      attempts = i + 1;
      try {
        const { rawJson } = await client.generateRecipe(
          gp.prompt,
          { previousError: lastErr ? String(lastErr) : undefined }
        );

        const parsed = RecipeSpecSchema.parse(JSON.parse(rawJson));
        parsedRecipe = parsed;
        schemaValid = true;
        matchedExpectedType = !gp.expectedType || parsed.type === gp.expectedType;
        allowedValuesCompliant =
          RECIPE_SPEC_TYPES.includes(parsed.type) &&
          MODULE_CATEGORIES.includes(parsed.category);

        // ── Quality signals (deterministic, no network) ─────────────────────
        const checklist = parityChecklist(parsed);
        qualityScore = checklist.score;
        qualityFamily = checklist.family;
        richnessFails = runRichnessQa(parsed, { richnessExempt }).filter((issue) => issue.severity === 'fail').length;
        try {
          rankScore = rankOptions([{ recipe: parsed }]).scores[0]?.score ?? 0;
        } catch {
          rankScore = 0;
        }

        const forbiddenTarget = parsed.type.startsWith('theme.')
          ? { kind: 'PLATFORM' as const }
          : { kind: 'THEME' as const, themeId: 'forbidden-theme', moduleId: 'eval-module-id' };
        if (!isTargetAllowedForType(parsed.type, forbiddenTarget.kind)) {
          try {
            compileRecipe(parsed, forbiddenTarget as DeployTarget);
            forbiddenSurfaceRejected = false;
          } catch {
            forbiddenSurfaceRejected = true;
          }
        } else {
          forbiddenSurfaceRejected = true;
        }

        // Try compilation
        try {
          const target = String(parsed.type).startsWith('theme.')
            ? { kind: 'THEME' as const, themeId: 'eval-theme-id', moduleId: 'eval-module-id' }
            : { kind: 'PLATFORM' as const };
          const { ops } = compileRecipe(parsed, target);
          compilerSuccess = true;

          // Check non-destructive invariants
          const nd = checkNonDestructive(ops);
          nonDestructive = nd.ok;
          nonDestructiveViolations = nd.violations;
          if (!nd.ok) {
            error = `Non-destructive violation: ${nd.violations.join('; ')}`;
          }
        } catch (compErr) {
          error = `Compiler error: ${String(compErr)}`;
        }
        break;
      } catch (err) {
        lastErr = err;
        error = String(err);
      }
    }

    // Optional LLM-judge scoring (nightly live only). Runs once per schema-valid
    // recipe, outside the generation retry loop so it never costs extra tokens on
    // a failed generation.
    if (opts.judgeClient && parsedRecipe) {
      judgeScore = await judgeRecipe(opts.judgeClient, gp.prompt, parsedRecipe);
    }

    results.push({
      promptId: gp.id,
      prompt: gp.prompt,
      schemaValid,
      compilerSuccess,
      nonDestructive,
      nonDestructiveViolations,
      allowedValuesCompliant,
      forbiddenSurfaceRejected,
      matchedExpectedType,
      qualityScore,
      qualityFamily,
      richnessFails,
      rankScore,
      judgeScore,
      attempts,
      durationMs: Date.now() - start,
      error: schemaValid ? undefined : error,
    });
  }

  const schemaValidCount = results.filter(r => r.schemaValid).length;
  const compilerSuccessCount = results.filter(r => r.compilerSuccess).length;
  const nonDestructiveCount = results.filter(r => r.nonDestructive).length;
  const allowedValuesCompliantCount = results.filter(r => r.allowedValuesCompliant).length;
  const forbiddenSurfaceRejectCount = results.filter(r => r.forbiddenSurfaceRejected).length;

  const n = results.length;
  const mean = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const avgQualityScore = mean(results.map(r => r.qualityScore));
  const richnessFailRate = n > 0 ? results.filter(r => r.richnessFails > 0).length / n : 0;
  const avgRankScore = mean(results.filter(r => r.schemaValid).map(r => r.rankScore));
  const judgeScores = results.map(r => r.judgeScore).filter((s): s is number => typeof s === 'number');
  const avgJudgeScore = judgeScores.length > 0 ? mean(judgeScores) : undefined;

  return {
    total: n,
    schemaValidCount,
    compilerSuccessCount,
    nonDestructiveCount,
    allowedValuesCompliantCount,
    forbiddenSurfaceRejectCount,
    schemaValidRate: n > 0 ? schemaValidCount / n : 0,
    compilerSuccessRate: n > 0 ? compilerSuccessCount / n : 0,
    nonDestructiveRate: n > 0 ? nonDestructiveCount / n : 0,
    allowedValuesCompliantRate: n > 0 ? allowedValuesCompliantCount / n : 0,
    forbiddenSurfaceRejectRate: n > 0 ? forbiddenSurfaceRejectCount / n : 0,
    avgQualityScore,
    richnessFailRate,
    avgRankScore,
    avgJudgeScore,
    results,
  };
}
