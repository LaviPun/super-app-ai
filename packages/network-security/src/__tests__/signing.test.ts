import { describe, expect, it } from 'vitest';
import { signShopifyWebhookBody, verifyShopifyWebhookHmac } from '../signing.js';

describe('verifyShopifyWebhookHmac', () => {
  const secret = 'test-shopify-secret';
  const body = JSON.stringify({ id: 1 });

  it('allows missing HMAC when secret is unset (local dev)', () => {
    expect(verifyShopifyWebhookHmac(body, undefined, {})).toBe(true);
  });

  it('rejects missing HMAC when secret is configured', () => {
    expect(verifyShopifyWebhookHmac(body, undefined, { secret })).toBe(false);
  });

  it('accepts valid base64 HMAC signatures', () => {
    const signature = signShopifyWebhookBody(body, secret);
    expect(verifyShopifyWebhookHmac(body, signature, { secret })).toBe(true);
  });

  it('rejects tampered bodies', () => {
    const signature = signShopifyWebhookBody(body, secret);
    expect(verifyShopifyWebhookHmac(`${body}x`, signature, { secret })).toBe(false);
  });
});
