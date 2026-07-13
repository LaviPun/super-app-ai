import { describe, expect, it, vi } from 'vitest';
import { BundleProductService } from '~/services/bundles/bundle-product.service';
import type { AdminApiContext } from '~/types/shopify';

function graphqlJsonResponse(payload: unknown) {
  return { json: async () => payload };
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
