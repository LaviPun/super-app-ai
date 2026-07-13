import { describe, expect, it, vi } from 'vitest';
import { BundleProductService } from '~/services/bundles/bundle-product.service';
import type { AdminApiContext } from '~/types/shopify';

function graphqlJsonResponse(payload: unknown) {
  return { json: async () => payload };
}

/** Build an admin whose `graphql` returns the given payloads in order (each already the `{ data }`/`{ errors }` envelope). */
function mockAdmin(...responses: unknown[]): AdminApiContext['admin'] {
  const graphql = vi.fn();
  for (const payload of responses) {
    graphql.mockResolvedValueOnce(graphqlJsonResponse(payload));
  }
  return { graphql } as unknown as AdminApiContext['admin'];
}

describe('BundleProductService.ensureParentBundleProduct', () => {
  it('passes identifier:{handle} so productSet actually upserts by handle', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(
      graphqlJsonResponse({
        data: {
          productSet: {
            product: { variants: { nodes: [{ id: 'gid://shopify/ProductVariant/1' }] } },
            userErrors: [],
          },
        },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new BundleProductService(admin);

    const variantId = await service.ensureParentBundleProduct({
      bundleId: 'summer-combo',
      title: 'Summer Combo',
      components: [],
    });

    expect(variantId).toBe('gid://shopify/ProductVariant/1');
    const call = graphql.mock.calls[0]?.[1] as { variables: { identifier?: { handle?: string } } };
    expect(call.variables.identifier).toEqual({ handle: 'superapp-bundle-summer-combo' });
  });

  it('throws instead of silently succeeding on a top-level GraphQL error', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Access denied' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new BundleProductService(admin);

    await expect(
      service.ensureParentBundleProduct({ bundleId: 'b', title: 'B', components: [] }),
    ).rejects.toThrow(/access denied/i);
  });
});

describe('BundleProductService.activateCartTransform', () => {
  it('does not create a duplicate cart transform when the existence check hits a top-level error', async () => {
    // Regression guard: an unchecked top-level error on the existence query used to
    // look identical to "no cart transform exists yet" and fall through to create a
    // second one — an app is only supposed to ever have one.
    const graphql = vi.fn().mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Throttled' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new BundleProductService(admin);

    await expect(service.activateCartTransform({ bundles: [] })).rejects.toThrow(/throttled/i);
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing cart transform via metafieldsSet', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlJsonResponse({ data: { cartTransforms: { nodes: [{ id: 'gid://shopify/CartTransform/1' }] } } }),
      )
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { metafieldsSet: { userErrors: [] } } }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new BundleProductService(admin);

    const id = await service.activateCartTransform({ bundles: [] });
    expect(id).toBe('gid://shopify/CartTransform/1');
  });

  it('creates a new cart transform when none exists', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { cartTransforms: { nodes: [] } } }))
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { cartTransformCreate: { cartTransform: { id: 'gid://shopify/CartTransform/2' }, userErrors: [] } },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new BundleProductService(admin);

    const id = await service.activateCartTransform({ bundles: [] });
    expect(id).toBe('gid://shopify/CartTransform/2');
  });
});

describe('BundleProductService.setAppJsonMetafield', () => {
  it('throws instead of silently no-oping on a top-level GraphQL error', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Access denied' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new BundleProductService(admin);

    await expect(service.setAppJsonMetafield('gid://shopify/CartTransform/1', 'bundle_config', '{}')).rejects.toThrow(
      /access denied/i,
    );
  });
});

describe('BundleProductService.writeBundlePricingRules', () => {
  it('replaces previous bundle:* rules and preserves module-authored rules', async () => {
    // getFunctionConfigByKey returns { metaobjectId, config } (not the raw config).
    const mo = {
      getFunctionConfigByKey: vi.fn().mockResolvedValue({
        metaobjectId: 'gid://shopify/Metaobject/9',
        config: {
          rules: [
            { when: { minSubtotal: 100 }, apply: { percentageOff: 10 } }, // module-authored
            { id: 'bundle:old-bundle', when: { skuIn: ['OLD'] }, apply: { fixedPricePerUnit: 9 } }, // stale managed
          ],
        },
      }),
      upsertFunctionConfigObject: vi.fn().mockResolvedValue('gid://shopify/Metaobject/9'),
    };
    const svc = new BundleProductService(mockAdmin());
    await svc.writeBundlePricingRules(mo as never, [
      { id: 'bundle:candle-trio', when: { skuIn: ['BUNDLE-CANDLE'] }, apply: { fixedPricePerUnit: 27 } },
    ]);
    expect(mo.upsertFunctionConfigObject).toHaveBeenCalledWith('discountRules', {
      rules: [
        { when: { minSubtotal: 100 }, apply: { percentageOff: 10 } },
        { id: 'bundle:candle-trio', when: { skuIn: ['BUNDLE-CANDLE'] }, apply: { fixedPricePerUnit: 27 } },
      ],
    });
  });

  it('no-ops when there are no new rules and no stale managed rules', async () => {
    const mo = {
      getFunctionConfigByKey: vi.fn().mockResolvedValue({
        metaobjectId: 'gid://shopify/Metaobject/9',
        config: { rules: [{ apply: { percentageOff: 5 } }] },
      }),
      upsertFunctionConfigObject: vi.fn(),
    };
    const svc = new BundleProductService(mockAdmin());
    await svc.writeBundlePricingRules(mo as never, []);
    expect(mo.upsertFunctionConfigObject).not.toHaveBeenCalled();
  });
});

describe('BundleProductService.ensureAutomaticBundleDiscount', () => {
  it('returns the existing node without creating a duplicate', async () => {
    const admin = mockAdmin({
      // 1st call: lookup existing automatic app discounts
      data: {
        automaticDiscountNodes: {
          nodes: [
            {
              id: 'gid://shopify/DiscountAutomaticNode/1',
              automaticDiscount: { __typename: 'DiscountAutomaticApp', title: 'SuperApp Bundle Pricing' },
            },
          ],
        },
      },
    });
    const svc = new BundleProductService(admin);
    await expect(svc.ensureAutomaticBundleDiscount()).resolves.toBe('gid://shopify/DiscountAutomaticNode/1');
  });

  it('creates the node when absent (function id looked up, then created)', async () => {
    const admin = mockAdmin(
      { data: { automaticDiscountNodes: { nodes: [] } } },
      {
        data: {
          shopifyFunctions: { nodes: [{ id: 'fn-1', apiType: 'product_discounts', title: 'superapp-discount' }] },
        },
      },
      {
        data: {
          discountAutomaticAppCreate: {
            automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/2' },
            userErrors: [],
          },
        },
      },
    );
    const svc = new BundleProductService(admin);
    await expect(svc.ensureAutomaticBundleDiscount()).resolves.toBe('gid://shopify/DiscountAutomaticNode/2');
  });
});
