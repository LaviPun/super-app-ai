import { describe, it, expect } from 'vitest';
import { PublishPolicyService } from '~/services/publish/publish-policy.service';

describe('PublishPolicyService', () => {
  it('blocks Plus-gated capability on non-Plus tier', () => {
    const service = new PublishPolicyService();
    const result = service.evaluate({
      shopDomain: 'shop-a.myshopify.com',
      versionId: 'v1',
      planTier: 'BASIC',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      specType: 'checkout.upsell',
      targetKind: 'PLATFORM',
    });

    expect(result.allowed).toBe(false);
    expect(result.blocked).toContain('CHECKOUT_UI_INFO_SHIP_PAY');
  });

  it('blocks mismatched surface target', () => {
    const service = new PublishPolicyService();
    const result = service.evaluate({
      shopDomain: 'shop-a.myshopify.com',
      versionId: 'v2',
      planTier: 'PLUS',
      requires: [],
      specType: 'theme.banner',
      targetKind: 'PLATFORM',
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons.join(' ')).toMatch(/not allowed/i);
  });

  it('returns cached snapshot for same key', () => {
    const service = new PublishPolicyService();
    const input = {
      shopDomain: 'shop-a.myshopify.com',
      versionId: 'v3',
      planTier: 'PLUS' as const,
      requires: [],
      specType: 'theme.banner',
      targetKind: 'THEME' as const,
    };
    const first = service.evaluate(input);
    const second = service.evaluate(input);

    expect(first.snapshotKey).toBe(second.snapshotKey);
    expect(first.evaluatedAt).toBe(second.evaluatedAt);
  });
});

