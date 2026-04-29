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

  it('falls back to public_read_write access when merchant access is rejected', async () => {
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
      )
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { metafieldDefinitionCreate: { userErrors: [] } },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(graphql).toHaveBeenCalledTimes(3);
    const firstCall = graphql.mock.calls[0]?.[1] as { variables: { definition: { access: unknown } } };
    const secondCall = graphql.mock.calls[1]?.[1] as { variables: { definition: { access: unknown } } };
    const thirdCall = graphql.mock.calls[2]?.[1] as { variables: { definition: { access: unknown } } };
    expect(firstCall.variables.definition.access).toEqual({
      admin: 'MERCHANT_READ_WRITE',
      storefront: 'PUBLIC_READ',
    });
    expect(secondCall.variables.definition.access).toEqual({
      admin: 'MERCHANT_READ_WRITE',
    });
    expect(thirdCall.variables.definition.access).toEqual({
      admin: 'PUBLIC_READ_WRITE',
      storefront: 'PUBLIC_READ',
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
      )
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { metafieldDefinitionCreate: { userErrors: [] } },
        }),
      );
    const onMetafieldAccessFallback = vi.fn();
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin, { onMetafieldAccessFallback });

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(onMetafieldAccessFallback).toHaveBeenCalledTimes(2);
    expect(onMetafieldAccessFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'superapp.theme',
        key: 'module_refs',
        metaobjectType: '$app:superapp_module',
        isList: true,
      }),
    );
  });

  it('retries when Shopify rejects admin enum at GraphQL validation level', async () => {
    const graphql = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Variable $definition of type MetafieldDefinitionInput! was provided invalid value for access.admin (Expected "MERCHANT_READ_WRITE" to be one of: PUBLIC_READ_WRITE)',
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          'Variable $definition of type MetafieldDefinitionInput! was provided invalid value for access.admin (Expected "MERCHANT_READ_WRITE" to be one of: PUBLIC_READ_WRITE)',
        ),
      )
      .mockResolvedValueOnce(
        graphqlJsonResponse({
          data: { metafieldDefinitionCreate: { userErrors: [] } },
        }),
      );
    const admin = { graphql } as unknown as AdminApiContext['admin'];
    const service = new MetaobjectService(admin);

    await service.ensureMetafieldDefinition('superapp.theme', 'module_refs', '$app:superapp_module', true);

    expect(graphql).toHaveBeenCalledTimes(3);
    const thirdCall = graphql.mock.calls[2]?.[1] as { variables: { definition: { access: unknown } } };
    expect(thirdCall.variables.definition.access).toEqual({
      admin: 'PUBLIC_READ_WRITE',
      storefront: 'PUBLIC_READ',
    });
  });
});
