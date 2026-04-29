import { describe, expect, it, vi } from 'vitest';
import type { AdminApiContext } from '~/types/shopify';
import { runPublishPreflight } from '~/services/publish/publish-preflight.server';

function graphqlJsonResponse(payload: unknown) {
  return { json: async () => payload };
}

describe('runPublishPreflight', () => {
  it('passes when required scopes are granted', async () => {
    const graphql = vi.fn().mockResolvedValue(
      graphqlJsonResponse({
        data: {
          currentAppInstallation: {
            accessScopes: [{ handle: 'write_metaobjects' }, { handle: 'read_themes' }],
          },
        },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];

    const result = await runPublishPreflight(admin, { isThemeModule: true });

    expect(result.ok).toBe(true);
    expect(result.missingScopes).toEqual([]);
  });

  it('fails with missing scopes when not granted', async () => {
    const graphql = vi.fn().mockResolvedValue(
      graphqlJsonResponse({
        data: {
          currentAppInstallation: {
            accessScopes: [{ handle: 'read_products' }],
          },
        },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];

    const result = await runPublishPreflight(admin, { isThemeModule: true });

    expect(result.ok).toBe(false);
    expect(result.missingScopes).toEqual(['write_metaobjects', 'read_themes']);
  });

  it('returns error when GraphQL returns top-level errors', async () => {
    const graphql = vi.fn().mockResolvedValue(
      graphqlJsonResponse({
        errors: [{ message: 'Access denied' }],
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];

    const result = await runPublishPreflight(admin, { isThemeModule: false });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Access denied');
  });
});
