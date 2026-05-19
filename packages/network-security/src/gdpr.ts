/** Mandatory Shopify compliance webhook topics (App Store). */
export const SHOPIFY_GDPR_COMPLIANCE_TOPICS = [
  'customers/data_request',
  'customers/redact',
  'shop/redact',
] as const;

export type ShopifyGdprComplianceTopic = (typeof SHOPIFY_GDPR_COMPLIANCE_TOPICS)[number];

export function isShopifyGdprComplianceTopic(topic: string): boolean {
  return (SHOPIFY_GDPR_COMPLIANCE_TOPICS as readonly string[]).includes(topic);
}

export type GdprWebhookIngress = {
  shopDomain: string;
  topic: string;
  eventId: string;
};

/**
 * Validates ingress shape for GDPR/compliance webhooks before enqueue.
 * Does not perform HMAC — callers must verify signatures separately.
 */
export function assertGdprWebhookIngress(input: GdprWebhookIngress): void {
  if (!input.shopDomain.trim()) {
    throw new Error('GDPR webhook ingress requires shopDomain');
  }
  if (!input.eventId.trim()) {
    throw new Error('GDPR webhook ingress requires eventId');
  }
  if (!isShopifyGdprComplianceTopic(input.topic)) {
    throw new Error(`Topic is not a Shopify GDPR compliance webhook: ${input.topic}`);
  }
}
