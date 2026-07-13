import { describe, expect, it, vi } from 'vitest';
import { WebPixelService } from '~/services/shopify/web-pixel.service';
import type { AdminApiContext } from '~/types/shopify';

function graphqlJsonResponse(payload: unknown) {
  return { json: async () => payload };
}

describe('WebPixelService.upsert', () => {
  it('creates a pixel when none exists', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { webPixel: null } }))
      .mockResolvedValueOnce(
        graphqlJsonResponse({ data: { webPixelCreate: { webPixel: { id: 'gid://shopify/WebPixel/1' }, userErrors: [] } } }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new WebPixelService(admin);

    const id = await service.upsert({ trackingId: 'abc' });
    expect(id).toBe('gid://shopify/WebPixel/1');
  });

  it('updates the existing pixel and returns its id', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { webPixel: { id: 'gid://shopify/WebPixel/1' } } }))
      .mockResolvedValueOnce(
        graphqlJsonResponse({ data: { webPixelUpdate: { webPixel: { id: 'gid://shopify/WebPixel/1' }, userErrors: [] } } }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new WebPixelService(admin);

    const id = await service.upsert({ trackingId: 'abc' });
    expect(id).toBe('gid://shopify/WebPixel/1');
  });

  it('throws instead of reporting the stale pixel as updated when webPixelUpdate hits a top-level error', async () => {
    // Regression guard: only userErrors was checked, so a top-level error (e.g. access
    // denied for a missing scope) left `data` undefined and the `?? existingId` fallback
    // silently returned the pre-existing pixel id as if the update had succeeded.
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { webPixel: { id: 'gid://shopify/WebPixel/1' } } }))
      .mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Access denied for webPixelUpdate' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new WebPixelService(admin);

    await expect(service.upsert({ trackingId: 'abc' })).rejects.toThrow(/access denied/i);
  });

  it('throws when webPixelCreate hits a top-level error', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { webPixel: null } }))
      .mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Access denied for webPixelCreate' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new WebPixelService(admin);

    await expect(service.upsert({ trackingId: 'abc' })).rejects.toThrow(/access denied/i);
  });

  it('throws on a userError instead of silently succeeding', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { webPixel: null } }))
      .mockResolvedValueOnce(
        graphqlJsonResponse({ data: { webPixelCreate: { webPixel: null, userErrors: [{ message: 'Invalid settings' }] } } }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new WebPixelService(admin);

    await expect(service.upsert({ trackingId: 'abc' })).rejects.toThrow(/invalid settings/i);
  });
});
