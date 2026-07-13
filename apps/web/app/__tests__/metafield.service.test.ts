import { describe, expect, it, vi } from 'vitest';
import { MetafieldService } from '~/services/shopify/metafield.service';
import type { AdminApiContext } from '~/types/shopify';

function graphqlJsonResponse(payload: unknown) {
  return { json: async () => payload };
}

describe('MetafieldService', () => {
  it('sets a shop metafield', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1' } } }))
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { metafieldsSet: { userErrors: [] } } }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetafieldService(admin);

    await expect(service.setShopMetafield('superapp', 'key', 'single_line_text_field', 'v')).resolves.toBeUndefined();
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it('throws on a userError instead of silently succeeding', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1' } } }))
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { metafieldsSet: { userErrors: [{ field: ['value'], message: 'Value is invalid' }] } },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetafieldService(admin);

    await expect(
      service.setShopMetafield('superapp', 'key', 'single_line_text_field', 'v'),
    ).rejects.toThrow(/value is invalid/i);
  });

  it('throws instead of silently no-oping when a write hits a top-level GraphQL error', async () => {
    // Regression guard: setShopMetafield used to only check userErrors, so a transient
    // top-level error (data undefined) reported success even though nothing was written.
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1' } } }))
      .mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Internal error' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetafieldService(admin);

    await expect(
      service.setShopMetafield('superapp', 'key', 'single_line_text_field', 'v'),
    ).rejects.toThrow(/internal error/i);
  });

  it('throws instead of silently no-oping when a delete hits a top-level GraphQL error', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1' } } }))
      .mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Internal error' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetafieldService(admin);

    await expect(service.deleteShopMetafield('superapp', 'key')).rejects.toThrow(/internal error/i);
  });

  it('throws instead of returning null when a read hits a top-level GraphQL error', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Internal error' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetafieldService(admin);

    await expect(service.getShopMetafield('superapp', 'key')).rejects.toThrow(/internal error/i);
  });

  it('returns null when the metafield genuinely does not exist', async () => {
    const graphql = vi.fn().mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { metafield: null } } }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetafieldService(admin);

    await expect(service.getShopMetafield('superapp', 'key')).resolves.toBeNull();
  });
});
