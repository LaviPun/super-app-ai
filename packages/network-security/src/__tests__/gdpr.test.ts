import { describe, expect, it } from 'vitest';
import { assertGdprWebhookIngress, isShopifyGdprComplianceTopic } from '../gdpr.js';

describe('GDPR webhook boundaries', () => {
  it('recognizes mandatory compliance topics', () => {
    expect(isShopifyGdprComplianceTopic('customers/redact')).toBe(true);
    expect(isShopifyGdprComplianceTopic('orders/create')).toBe(false);
  });

  it('requires shop domain, event id, and compliance topic', () => {
    expect(() => assertGdprWebhookIngress({
      shopDomain: '',
      topic: 'customers/redact',
      eventId: 'evt-1',
    })).toThrow(/shopDomain/i);

    expect(() => assertGdprWebhookIngress({
      shopDomain: 'demo.myshopify.com',
      topic: 'orders/create',
      eventId: 'evt-1',
    })).toThrow(/GDPR compliance/i);
  });
});
