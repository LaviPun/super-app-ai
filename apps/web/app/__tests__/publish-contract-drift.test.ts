import { describe, expect, it } from 'vitest';
import { RecipeSpecSchema } from '@superapp/core';
import { PublishPolicyService } from '~/services/publish/publish-policy.service';
import { compileRecipe } from '~/services/recipes/compiler';

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

  it('keeps admin.block compiler payload aligned with admin extension reader', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'admin.block',
      name: 'Admin Card',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.block.render',
        label: 'Order card',
      },
    });
    const compiled = compileRecipe(spec, { kind: 'PLATFORM' });
    const payload = compiled.adminBlockPayload;
    expect(payload).toBeTruthy();
    expect(payload?.target).toBe('admin.order-details.block.render');
    expect(payload?.config).toMatchObject({
      target: 'admin.order-details.block.render',
      label: 'Order card',
    });
  });

  it('keeps admin.action compiler payload aligned with admin action reader', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'admin.action',
      name: 'Admin Action',
      category: 'ADMIN_UI',
      requires: [],
      config: {
        target: 'admin.order-details.action.render',
        label: 'Run action',
      },
    });
    const compiled = compileRecipe(spec, { kind: 'PLATFORM' });
    const payload = compiled.adminActionPayload;
    expect(payload).toBeTruthy();
    expect(payload?.target).toBe('admin.order-details.action.render');
    expect(payload?.title).toBe('Run action');
  });

  it('keeps checkout upsell payload aligned with checkout extension config reader', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'checkout.upsell',
      name: 'Upsell',
      category: 'STOREFRONT_UI',
      requires: ['CHECKOUT_UI_INFO_SHIP_PAY'],
      config: {
        offerTitle: 'Protection plan',
        productVariantGid: 'gid://shopify/ProductVariant/123456789012',
        discountPercent: 10,
      },
    });
    const compiled = compileRecipe(spec, { kind: 'PLATFORM' });
    expect(compiled.checkoutUpsellPayload?.config).toMatchObject({
      offerTitle: 'Protection plan',
      productVariantGid: 'gid://shopify/ProductVariant/123456789012',
      discountPercent: 10,
    });
  });

  it('keeps customer account payload aligned with customer account config reader', () => {
    const spec = RecipeSpecSchema.parse({
      type: 'customerAccount.blocks',
      name: 'Loyalty',
      category: 'CUSTOMER_ACCOUNT',
      requires: ['CUSTOMER_ACCOUNT_UI'],
      config: {
        target: 'customer-account.order-index.block.render',
        title: 'Points',
        blocks: [{ kind: 'TEXT', content: '100 points' }],
        b2bOnly: false,
      },
    });
    const compiled = compileRecipe(spec, { kind: 'PLATFORM' });
    expect(compiled.customerAccountBlockPayload?.target).toBe(
      'customer-account.order-index.block.render'
    );
    expect(compiled.customerAccountBlockPayload?.config).toMatchObject({
      title: 'Points',
      blocks: [{ kind: 'TEXT', content: '100 points' }],
      b2bOnly: false,
    });
  });
});

