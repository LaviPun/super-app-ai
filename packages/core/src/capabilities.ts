export type PlanTier =
  | 'STARTER'
  | 'BASIC'
  | 'GROW'
  | 'ADVANCED'
  | 'PLUS'
  | 'ENTERPRISE'
  | 'UNKNOWN';

/**
 * Capabilities represent a Shopify platform surface (doc 8.1). Each recipe declares what it needs.
 */
export const CAPABILITIES = [
  'THEME_ASSETS',
  'THEME_APP_EXTENSION',
  'APP_PROXY',
  'DISCOUNT_FUNCTION',
  'SHIPPING_FUNCTION',
  'PAYMENT_CUSTOMIZATION_FUNCTION',
  'VALIDATION_FUNCTION',
  'CART_TRANSFORM_FUNCTION_UPDATE',
  'CHECKOUT_UI_INFO_SHIP_PAY',
  'CUSTOMER_ACCOUNT_UI',
  'CUSTOMER_ACCOUNT_B2B_PROFILE',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Minimum plan required for capabilities that are plan-gated.
 * Keep this centralized so it's easy to update if Shopify changes availability.
 */
export const MIN_PLAN_FOR_CAPABILITY: Partial<Record<Capability, PlanTier>> = {
  // Checkout UI extension steps in checkout
  CHECKOUT_UI_INFO_SHIP_PAY: 'PLUS',
  // Cart transform update operations
  CART_TRANSFORM_FUNCTION_UPDATE: 'PLUS',
};

const tierRank: Record<PlanTier, number> = {
  STARTER: 10,
  BASIC: 20,
  GROW: 30,
  ADVANCED: 40,
  PLUS: 50,
  ENTERPRISE: 60,
  UNKNOWN: 0,
};

export function isCapabilityAllowed(plan: PlanTier, cap: Capability): boolean {
  const min = MIN_PLAN_FOR_CAPABILITY[cap];
  if (!min) return true; // allow by default (capability might be generally available)
  return tierRank[plan] >= tierRank[min];
}
