import { describe, expect, it, vi } from 'vitest';
import { MetaobjectService } from '~/services/shopify/metaobject.service';
import type { AdminApiContext } from '~/types/shopify';

function graphqlJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
  };
}

describe('MetaobjectService.ensureMetafieldDefinition', () => {
  it('creates definition with MERCHANT_READ_WRITE admin access by default', async () => {
    const graphql = vi.fn().mockResolvedValue(
      graphqlJsonResponse({
        data: { metafieldDefinitionCreate: { userErrors: [] } },
      }),
    );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        variables: expect.objectContaining({
          definition: expect.objectContaining({
            access: expect.objectContaining({
              admin: 'MERCHANT_READ_WRITE',
            }),
          }),
        }),
      }),
    );
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

  // NOTE: MetafieldAdminAccessInput (the type metafieldDefinitionCreate actually accepts)
  // only has MERCHANT_READ / MERCHANT_READ_WRITE in the 2026-04 schema — PUBLIC_READ_WRITE
  // is output-only (MetafieldAdminAccess) and is never a legal candidate to retry with. When
  // the shop's business rules reject MERCHANT_READ_WRITE, there is no valid fallback: the
  // function must fail loudly, not loop on values Shopify will always reject anyway.
  it('throws when merchant access is rejected and no compatible admin enum exists', async () => {
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
    const firstCall = graphql.mock.calls[0]?.[1] as { variables: { definition: { access: unknown } } };
    const secondCall = graphql.mock.calls[1]?.[1] as { variables: { definition: { access: unknown } } };
    expect(firstCall.variables.definition.access).toEqual({
      admin: 'MERCHANT_READ_WRITE',
      storefront: 'PUBLIC_READ',
    });
    expect(secondCall.variables.definition.access).toEqual({
      admin: 'MERCHANT_READ_WRITE',
    });
  });

  it('succeeds on the narrower MERCHANT_READ_WRITE-only candidate when the storefront-paired one is rejected', async () => {
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
