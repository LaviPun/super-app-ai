import { describe, expect, it } from 'vitest';
import { PublishPolicyService } from '~/services/publish/publish-policy.service';

describe('Publish contract drift checks', () => {
  it('rejects theme spec on PLATFORM target', () => {
    const result = new PublishPolicyService().evaluate({
      shopDomain: 'contract.myshopify.com',
      versionId: 'contract-v1',
      planTier: 'PLUS',
      requires: [],
      specType: 'theme.banner',
      targetKind: 'PLATFORM',
    });
    expect(result.allowed).toBe(false);
  });

  it('rejects non-theme spec on THEME target', () => {
    const result = new PublishPolicyService().evaluate({
      shopDomain: 'contract.myshopify.com',
      versionId: 'contract-v2',
      planTier: 'PLUS',
      requires: [],
      specType: 'integration.httpSync',
      targetKind: 'THEME',
    });
    expect(result.allowed).toBe(false);
  });

  it('allows theme spec on THEME target with valid capability plan', () => {
    const result = new PublishPolicyService().evaluate({
      shopDomain: 'contract.myshopify.com',
      versionId: 'contract-v3',
      planTier: 'PLUS',
      requires: ['THEME_ASSETS'],
      specType: 'theme.popup',
      targetKind: 'THEME',
    });
    expect(result.allowed).toBe(true);
  });
});

