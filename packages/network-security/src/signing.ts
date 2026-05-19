import { createHmac, timingSafeEqual } from 'node:crypto';

export type VerifyShopifyWebhookHmacOptions = {
  secret?: string;
};

/**
 * Verify Shopify webhook HMAC (base64 SHA-256 of raw body).
 * When `secret` is unset, returns true so local/dev ingress can run without credentials.
 */
export function verifyShopifyWebhookHmac(
  rawBody: string,
  headerHmac: string | undefined,
  options: VerifyShopifyWebhookHmacOptions = {},
): boolean {
  const secret = options.secret?.trim();
  if (!secret) return true;
  if (!headerHmac?.trim()) return false;

  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const expected = Buffer.from(digest);
  const received = Buffer.from(headerHmac);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function signShopifyWebhookBody(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
}
