import { describe, expect, it, vi } from 'vitest';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import type { AdminApiContext } from '~/types/shopify';

function graphqlJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
  };
}

describe('MetaobjectService.ensureMetafieldDefinition', () => {
  // superapp.theme / superapp.admin / superapp.functions / superapp.checkout /
  // superapp.customer_account are all merchant-owned (non app-reserved — the
  // reserved namespace literal is exactly "$app") metafield namespaces. Per
  // Shopify's metafield access-control rules, a non app-reserved definition's
  // admin access can ONLY be the implicit default (PUBLIC_READ_WRITE) — and
  // PUBLIC_READ_WRITE is not even a legal value in the MetafieldAdminAccessInput
  // enum (verified against the live 2026-07 schema), so the only way to get it
  // is to omit `access.admin` from the mutation entirely. Explicitly setting
  // `admin: MERCHANT_READ_WRITE` (or any other value) on these namespaces is
  // rejected by Shopify with "Setting this access control is not permitted. It
  // must be one of [\"public_read_write\"]." — this was the launch-blocking bug.
  it('creates definition without an admin access override by default', async () => {
    const graphql = vi.fn().mockResolvedValue(
      graphqlJsonResponse({
        data: { metafieldDefinitionCreate: { userErrors: [] } },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(graphql).toHaveBeenCalledTimes(1);
    const call = graphql.mock.calls[0]?.[1] as { variables: { definition: { access?: Record<string, string> } } };
    expect(call.variables.definition.access).not.toHaveProperty('admin');
    expect(call.variables.definition.access).toEqual({ storefront: 'PUBLIC_READ' });
  });

  function policyConstraintResponse() {
    return graphqlJsonResponse({
      data: {
        metafieldDefinitionCreate: {
          userErrors: [
            {
              message:
                'Setting this access control is not permitted. It must be one of ["public_read_write"].',
            },
          ],
        },
      },
    });
  }

  it('falls back to no access override at all when the storefront-paired candidate is rejected, and succeeds', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(policyConstraintResponse())
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { metafieldDefinitionCreate: { userErrors: [] } },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(graphql).toHaveBeenCalledTimes(2);
    const firstCall = graphql.mock.calls[0]?.[1] as { variables: { definition: { access?: unknown } } };
    const secondCall = graphql.mock.calls[1]?.[1] as { variables: { definition: { access?: unknown } } };
    expect(firstCall.variables.definition.access).toEqual({ storefront: 'PUBLIC_READ' });
    expect(secondCall.variables.definition).not.toHaveProperty('access');
  });

  it('throws when even the no-access-override candidate is rejected (no third candidate to fall back to)', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(policyConstraintResponse())
      .mockResolvedValueOnce(policyConstraintResponse());
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await expect(
      service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true),
    ).rejects.toThrow(/public_read_write/i);

    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it('emits fallback telemetry once when the first candidate is rejected', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(policyConstraintResponse())
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { metafieldDefinitionCreate: { userErrors: [] } },
        }),
      );
    const onMetafieldAccessFallback = vi.fn();
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin, { onMetafieldAccessFallback });

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(onMetafieldAccessFallback).toHaveBeenCalledTimes(1);
    expect(onMetafieldAccessFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'superapp.theme',
        key: 'module_refs',
        metaobjectType: '$app:superapp_module',
        isList: true,
      }),
    );
  });

  it('fails fast without exhausting candidates when the error is not an access-policy constraint', async () => {
    const unrelatedError = new Error('Internal error. Please try again in a few seconds.');
    const graphql = vi.fn().mockRejectedValueOnce(unrelatedError);
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await expect(
      service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true),
    ).rejects.toThrow(/internal error/i);

    expect(graphql).toHaveBeenCalledTimes(1);
  });
});

describe('MetaobjectService core operations', () => {
  it('upserts a module metaobject and returns its id', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: {
            metaobjectUpsert: {
              userErrors: [],
              metaobject: { id: 'gid://shopify/Metaobject/123' },
            },
          },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    const payload = {
      type: 'theme.section',
      name: 'Banner',
      activationType: 'AUTO',
      config: { kind: 'banner', title: 'Hello' },
      style: { color: '#000' },
    } as unknown as Parameters<MetaobjectService['upsertModuleObject']>[1];

    const id = await service.upsertModuleObject('module-1', payload);

    expect(id).toBe('gid://shopify/Metaobject/123');
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('writes list.metaobject_reference values with setModuleGidList', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1' } } }))
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: {
            metafieldsSet: {
              userErrors: [],
              metafields: [{ id: 'gid://shopify/Metafield/1' }],
            },
          },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await service.setModuleGidList('superapp.theme', 'module_refs', ['gid://shopify/Metaobject/11']);

    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        variables: expect.objectContaining({
          metafields: [
            expect.objectContaining({
              namespace: 'superapp.theme',
              key: 'module_refs',
              type: 'list.metaobject_reference',
            }),
          ],
        }),
      }),
    );
  });

  it('throws instead of returning an empty list when the module-refs read hits a top-level GraphQL error', async () => {
    // Regression guard: getModuleGidList used to read json.data?.shop?.metafield?.value
    // without checking json.errors, so a transient error silently looked like "no refs
    // yet" — and a caller that then writes back [newGid] would wipe every other
    // published module's reference from the shop metafield.
    const graphql = vi.fn().mockResolvedValueOnce(
      graphqlJsonResponse({
        errors: [{ message: 'Internal error' }],
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await expect(
      service.getModuleGidList('superapp.theme', 'module_refs'),
    ).rejects.toThrow(/internal error/i);
  });

  it('throws instead of silently no-oping when setModuleGidList hits a top-level GraphQL error', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(graphqlJsonResponse({ data: { shop: { id: 'gid://shopify/Shop/1' } } }))
      .mockResolvedValueOnce(graphqlJsonResponse({ errors: [{ message: 'Internal error' }] }));
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await expect(
      service.setModuleGidList('superapp.theme', 'module_refs', ['gid://shopify/Metaobject/11']),
    ).rejects.toThrow(/internal error/i);
  });

  it('deletes a metaobject by gid', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: {
            metaobjectDelete: {
              deletedId: 'gid://shopify/Metaobject/111',
              userErrors: [],
            },
          },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await expect(service.deleteMetaobject('gid://shopify/Metaobject/111')).resolves.toBeUndefined();
    expect(graphql).toHaveBeenCalledTimes(1);
  });
});
