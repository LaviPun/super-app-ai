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

  it('throws when merchant access is rejected and no compatible admin enum exists', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlJsonResponse({
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
        }),
      )
      .mockResolvedValueOnce(
        graphqlJsonResponse({
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
        }),
      );
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

  it('emits fallback telemetry when compatibility retry is used', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        graphqlJsonResponse({
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
        }),
      )
      .mockResolvedValueOnce(
        graphqlJsonResponse({
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
        }),
      );
    const onMetafieldAccessFallback = vi.fn();
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin, { onMetafieldAccessFallback });

    await expect(
      service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true),
    ).rejects.toThrow(/public_read_write/i);

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

  it('fails fast when Shopify rejects admin enum at GraphQL validation level', async () => {
    const graphql = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Variable $definition of type MetafieldDefinitionInput! was provided invalid value for access.admin (Expected "MERCHANT_READ_WRITE" to be one of: PUBLIC_READ_WRITE)',
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          'Variable $definition of type MetafieldDefinitionInput! was provided invalid value for access.admin (Expected "PUBLIC_READ_WRITE" to be one of: MERCHANT_READ, MERCHANT_READ_WRITE).',
        ),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await expect(
      service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true),
    ).rejects.toThrow(/invalid value for access\.admin/i);

    expect(graphql).toHaveBeenCalledTimes(2);
    const secondCall = graphql.mock.calls[1]?.[1] as { variables: { definition: { access: unknown } } };
    expect(secondCall.variables.definition.access).toEqual({
      admin: 'MERCHANT_READ_WRITE',
    });
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
      type: 'theme.banner',
      name: 'Banner',
      activationType: 'AUTO',
      config: { title: 'Hello' },
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
