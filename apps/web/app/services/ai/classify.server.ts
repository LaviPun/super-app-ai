import type { ModuleType } from '@superapp/core';

export interface ClassifyResult {
  moduleType: ModuleType;
  intent?: string;
  surface?: string;
  confidence: 'high' | 'medium' | 'low';
}

type Rule = { keywords: string[]; type: ModuleType; intent?: string; surface?: string };

const RULES: Rule[] = [
  { keywords: ['popup', 'pop-up', 'pop up', 'modal', 'overlay', 'lightbox'], type: 'theme.popup' },
  { keywords: ['banner', 'hero', 'hero banner', 'announcement banner'], type: 'theme.banner' },
  { keywords: ['notification bar', 'announcement bar', 'top bar', 'info bar', 'notice bar'], type: 'theme.notificationBar' },
  { keywords: ['widget', 'store locator', 'proxy', 'app proxy'], type: 'proxy.widget' },
  { keywords: ['discount', 'coupon', 'percentage off', 'percent off', 'discount rule', 'price rule'], type: 'functions.discountRules' },
  { keywords: ['delivery', 'shipping', 'shipping method', 'hide shipping', 'delivery customization'], type: 'functions.deliveryCustomization' },
  { keywords: ['payment', 'payment method', 'hide payment', 'payment customization'], type: 'functions.paymentCustomization' },
  { keywords: ['validation', 'validate cart', 'checkout validation', 'block checkout', 'cart validation'], type: 'functions.cartAndCheckoutValidation' },
  { keywords: ['bundle', 'cart transform', 'product bundle', 'unbundle'], type: 'functions.cartTransform' },
  { keywords: ['upsell', 'checkout upsell', 'cross-sell at checkout', 'order bump'], type: 'checkout.upsell' },
  { keywords: ['integration', 'http sync', 'api sync', 'webhook sync', 'connector'], type: 'integration.httpSync' },
  { keywords: ['flow', 'automation', 'workflow', 'automate', 'trigger when'], type: 'flow.automation' },
  { keywords: ['extension', 'blueprint', 'scaffolding', 'extension blueprint'], type: 'platform.extensionBlueprint' },
  { keywords: ['customer account', 'account page', 'order status', 'order index', 'profile block', 'my account'], type: 'customerAccount.blocks' },
];

const INTENT_KEYWORDS: Record<string, string[]> = {
  promo: ['sale', 'promo', 'promotion', 'discount', 'offer', 'deal', 'coupon', 'off'],
  capture: ['email', 'subscribe', 'newsletter', 'sign up', 'signup', 'capture', 'lead'],
  upsell: ['upsell', 'upgrade', 'add-on', 'addon', 'recommended'],
  cross_sell: ['cross-sell', 'cross sell', 'also bought', 'similar', 'related'],
  trust: ['trust', 'review', 'testimonial', 'guarantee', 'badge'],
  urgency: ['urgent', 'countdown', 'limited', 'hurry', 'timer', 'expires', 'last chance'],
  info: ['info', 'information', 'notice', 'announcement', 'update'],
  support: ['support', 'help', 'contact', 'faq', 'chat'],
};

const SURFACE_KEYWORDS: Record<string, string[]> = {
  home: ['homepage', 'home page', 'landing'],
  product: ['product page', 'product detail', 'pdp'],
  collection: ['collection', 'category', 'catalog'],
  cart: ['cart', 'basket', 'checkout'],
  search: ['search', 'search results'],
  account: ['account', 'my account', 'customer account'],
};

/**
 * Classify user intent using keyword matching (zero LLM cost).
 * If preferredType is already set by the user, use that directly.
 */
export function classifyUserIntent(
  prompt: string,
  preferredType?: string,
): ClassifyResult {
  if (preferredType && preferredType !== 'Auto') {
    const validTypes = RULES.map(r => r.type);
    if (validTypes.includes(preferredType as ModuleType)) {
      return {
        moduleType: preferredType as ModuleType,
        intent: matchKeywords(prompt, INTENT_KEYWORDS),
        surface: matchKeywords(prompt, SURFACE_KEYWORDS),
        confidence: 'high',
      };
    }
  }

  const lower = prompt.toLowerCase();
  let bestMatch: Rule | null = null;
  let bestScore = 0;

  for (const rule of RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) score += kw.split(' ').length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  return {
    moduleType: bestMatch?.type ?? 'theme.banner',
    intent: matchKeywords(prompt, INTENT_KEYWORDS),
    surface: matchKeywords(prompt, SURFACE_KEYWORDS),
    confidence: bestScore >= 2 ? 'high' : bestScore >= 1 ? 'medium' : 'low',
  };
}

function matchKeywords(prompt: string, map: Record<string, string[]>): string | undefined {
  const lower = prompt.toLowerCase();
  let best: string | undefined;
  let bestScore = 0;
  for (const [key, keywords] of Object.entries(map)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  return best;
}
