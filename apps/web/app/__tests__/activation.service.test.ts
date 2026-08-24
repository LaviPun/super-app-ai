import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminApiContext } from '~/types/shopify';

const db = new Map<string, { functionKey: string; kind: string; activationGid: string }>();
vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    functionActivation: {
      findUnique: async ({ where }: any) =>
        db.get(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`) ?? null,
      upsert: async ({ where, create }: any) => {
        db.set(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`, create);
        return create;
      },
      delete: async ({ where }: any) => {
        db.delete(`${where.shopId_functionKey.shopId}:${where.shopId_functionKey.functionKey}`);
      },
    },
  }),
}));

import {
  ActivationLookupUnverifiableError,
  ActivationService,
  FUNCTION_KEY_ACTIVATION,
  MAX_DELIVERY_LOOKUP_PAGES,
  MAX_DISCOUNT_LOOKUP_PAGES,
  MAX_PAYMENT_LOOKUP_PAGES,
} from '~/services/publish/activation.service';

/**
 * Build an admin whose `graphql` resolves by GraphQL operation name (extracted
 * from `query <Name>` / `mutation <Name>` in the document) — closer to a real
 * server than a positional call-order mock, and lets each test assert the exact
 * mutation sequence by name via `calls.map((c) => c.op)`.
 */
function mockAdmin(resolve: (op: string, variables?: Record<string, unknown>) => unknown) {
  const calls: Array<{ op: string; variables?: Record<string, unknown> }> = [];
  const graphql = vi.fn(async (query: string, options?: { variables?: Record<string, unknown> }) => {
    const match = /(?:query|mutation)\s+(\w+)/.exec(query);
    const op = match?.[1] ?? '<unknown>';
    calls.push({ op, variables: options?.variables });
    const payload = resolve(op, options?.variables);
    return { json: async () => payload };
  });
  const admin = { graphql } as unknown as AdminApiContext['admin'];
  return { admin, calls };
}

beforeEach(() => db.clear());

describe('ActivationService — discount kind', () => {
  it('creates the automatic app discount node on first ensure and stores its GID', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationLookup')
        return { data: { discountNodes: { nodes: [] } } };
      if (op === 'SuperAppDiscountActivationCreate')
        return { data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/1' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://shopify/DiscountAutomaticNode/1');
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppDiscountActivationLookup',
      'SuperAppDiscountActivationCreate',
    ]);
    // Create used functionHandle (2026-07: functionId is deprecated) + PRODUCT class.
    const v = calls[1]!.variables!.discount as Record<string, unknown>;
    expect(v.functionHandle).toBe('discount-function');
    expect(v.discountClasses).toEqual(['PRODUCT']);
    expect(v.title).toBe('SuperApp Discounts');
  });

  it('second ensure with a stored GID makes NO Shopify calls (idempotent republish)', async () => {
    db.set('shop_1:discountRules', { functionKey: 'discountRules', kind: 'discount', activationGid: 'gid://x/1' });
    const { admin, calls } = mockAdmin(() => { throw new Error('no call expected'); });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://x/1');
    expect(calls).toHaveLength(0);
  });

  it('adopts + retitles the legacy "SuperApp Bundle Pricing" node instead of creating a duplicate', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationLookup')
        return { data: { discountNodes: { nodes: [
          { id: 'gid://shopify/DiscountAutomaticNode/9', discount: { __typename: 'DiscountAutomaticApp', title: 'SuperApp Bundle Pricing' } },
        ] } } };
      if (op === 'SuperAppDiscountActivationUpdate')
        return { data: { discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/9' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://shopify/DiscountAutomaticNode/9');
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppDiscountActivationLookup',
      'SuperAppDiscountActivationUpdate', // retitle to canonical — ONE node per shop, ever (E3)
    ]);
  });

  it('finds the legacy node on page 2 (paginated adoption, no double-create)', async () => {
    const { admin, calls } = mockAdmin((op, variables) => {
      if (op === 'SuperAppDiscountActivationLookup') {
        if (!variables?.after) {
          // Page 1: full page, no match, more pages remain.
          return { data: { discountNodes: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'cursor-1' } } } };
        }
        expect(variables.after).toBe('cursor-1');
        // Page 2: the legacy node lives here.
        return {
          data: {
            discountNodes: {
              nodes: [
                { id: 'gid://shopify/DiscountAutomaticNode/9', discount: { __typename: 'DiscountAutomaticApp', title: 'SuperApp Bundle Pricing' } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        };
      }
      if (op === 'SuperAppDiscountActivationUpdate')
        return { data: { discountAutomaticAppUpdate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticNode/9' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules');
    expect(gid).toBe('gid://shopify/DiscountAutomaticNode/9');
    // Two lookup pages, then adopt (Update) — CREATE must never fire.
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppDiscountActivationLookup',
      'SuperAppDiscountActivationLookup',
      'SuperAppDiscountActivationUpdate',
    ]);
    expect(calls.some((c) => c.op === 'SuperAppDiscountActivationCreate')).toBe(false);
  });

  it('refuses to create when the lookup hits the page cap without a verdict (no blind create)', async () => {
    let pages = 0;
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationLookup') {
        pages += 1;
        // Every page is empty but claims more pages remain — the target node is
        // never found and the connection is never exhausted, forcing the cap.
        return { data: { discountNodes: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `cursor-${pages}` } } } };
      }
      throw new Error(`unexpected op ${op}`);
    });
    await expect(
      new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules'),
    ).rejects.toThrow(ActivationLookupUnverifiableError);
    expect(pages).toBe(MAX_DISCOUNT_LOOKUP_PAGES);
    expect(calls.every((c) => c.op === 'SuperAppDiscountActivationLookup')).toBe(true);
    expect(calls.some((c) => c.op === 'SuperAppDiscountActivationCreate')).toBe(false);
  });

  it('a top-level GraphQL error on the lookup throws — never misread as "no node found" (duplicate-create guard)', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationLookup') return { errors: [{ message: 'Throttled' }] };
      throw new Error(`unexpected op ${op}`);
    });
    await expect(
      new ActivationService(admin, 'shop_1').ensureForFunctionKey('discountRules'),
    ).rejects.toThrow(/throttled/i);
    expect(calls.map((c) => c.op)).toEqual(['SuperAppDiscountActivationLookup']);
  });

  it('deleteForFunctionKey deletes the node and the row; a missing remote node is success', async () => {
    db.set('shop_1:discountRules', { functionKey: 'discountRules', kind: 'discount', activationGid: 'gid://x/1' });
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppDiscountActivationDelete')
        return { data: { discountAutomaticDelete: { deletedAutomaticDiscountId: null, userErrors: [{ field: null, message: 'Discount not found' }] } } };
      throw new Error(`unexpected op ${op}`);
    });
    await new ActivationService(admin, 'shop_1').deleteForFunctionKey('discountRules');
    expect(calls.map((c) => c.op)).toEqual(['SuperAppDiscountActivationDelete']);
    expect(db.size).toBe(0);
  });

  it('unmapped functionKey → ensure returns null, delete is a no-op', async () => {
    const { admin, calls } = mockAdmin(() => { throw new Error('no call expected'); });
    const svc = new ActivationService(admin, 'shop_1');
    expect(await svc.ensureForFunctionKey('shippingDiscount')).toBeNull();
    await svc.deleteForFunctionKey('shippingDiscount');
    expect(calls).toHaveLength(0);
    expect(FUNCTION_KEY_ACTIVATION.shippingDiscount).toBeUndefined();
  });
});

describe('ActivationService — deliveryCustomization kind', () => {
  it('creates via functionHandle with enabled:true on first ensure', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'delivery_customization', title: 't', handle: 'superapp-delivery-customization' }] } } };
      if (op === 'SuperAppDeliveryCustomizationList')
        return { data: { deliveryCustomizations: { nodes: [] } } };
      if (op === 'SuperAppDeliveryCustomizationCreate')
        return { data: { deliveryCustomizationCreate: { deliveryCustomization: { id: 'gid://shopify/DeliveryCustomization/1' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('deliveryCustomization');
    expect(gid).toBe('gid://shopify/DeliveryCustomization/1');
    const create = calls.find((c) => c.op === 'SuperAppDeliveryCustomizationCreate')!;
    expect((create.variables!.deliveryCustomization as any).functionHandle).toBe('superapp-delivery-customization');
    expect((create.variables!.deliveryCustomization as any).enabled).toBe(true);
  });

  it('adopts an existing customization for our function instead of duplicating', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'delivery_customization', title: 't', handle: 'superapp-delivery-customization' }] } } };
      if (op === 'SuperAppDeliveryCustomizationList')
        return { data: { deliveryCustomizations: { nodes: [{ id: 'gid://d/9', title: 'x', enabled: true, functionId: 'fn_1' }] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('deliveryCustomization');
    expect(gid).toBe('gid://d/9');
    expect(calls.map((c) => c.op)).not.toContain('SuperAppDeliveryCustomizationCreate');
  });

  it('finds the node on page 2 (paginated adoption, no double-create)', async () => {
    const { admin, calls } = mockAdmin((op, variables) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'delivery_customization', title: 't', handle: 'superapp-delivery-customization' }] } } };
      if (op === 'SuperAppDeliveryCustomizationList') {
        if (!variables?.after) {
          return { data: { deliveryCustomizations: { nodes: [{ id: 'gid://d/other', title: 'x', enabled: true, functionId: 'fn_other' }], pageInfo: { hasNextPage: true, endCursor: 'cursor-1' } } } };
        }
        expect(variables.after).toBe('cursor-1');
        return { data: { deliveryCustomizations: { nodes: [{ id: 'gid://d/9', title: 'x', enabled: true, functionId: 'fn_1' }], pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('deliveryCustomization');
    expect(gid).toBe('gid://d/9');
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppFunctionLookup',
      'SuperAppDeliveryCustomizationList',
      'SuperAppDeliveryCustomizationList',
    ]);
    expect(calls.some((c) => c.op === 'SuperAppDeliveryCustomizationCreate')).toBe(false);
  });

  it('refuses to create when the lookup hits the page cap without a verdict (no blind create)', async () => {
    let pages = 0;
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'delivery_customization', title: 't', handle: 'superapp-delivery-customization' }] } } };
      if (op === 'SuperAppDeliveryCustomizationList') {
        pages += 1;
        return { data: { deliveryCustomizations: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `cursor-${pages}` } } } };
      }
      throw new Error(`unexpected op ${op}`);
    });
    await expect(
      new ActivationService(admin, 'shop_1').ensureForFunctionKey('deliveryCustomization'),
    ).rejects.toThrow(ActivationLookupUnverifiableError);
    expect(pages).toBe(MAX_DELIVERY_LOOKUP_PAGES);
    expect(calls.some((c) => c.op === 'SuperAppDeliveryCustomizationCreate')).toBe(false);
  });

  it('stored GID → zero Shopify calls; delete uses deliveryCustomizationDelete', async () => {
    db.set('shop_1:deliveryCustomization', { functionKey: 'deliveryCustomization', kind: 'deliveryCustomization', activationGid: 'gid://d/1' });
    const noCall = mockAdmin(() => { throw new Error('no call expected'); });
    expect(await new ActivationService(noCall.admin, 'shop_1').ensureForFunctionKey('deliveryCustomization')).toBe('gid://d/1');

    const del = mockAdmin((op) => {
      if (op === 'SuperAppDeliveryCustomizationDelete')
        return { data: { deliveryCustomizationDelete: { deletedId: 'gid://d/1', userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    await new ActivationService(del.admin, 'shop_1').deleteForFunctionKey('deliveryCustomization');
    expect(del.calls.map((c) => c.op)).toEqual(['SuperAppDeliveryCustomizationDelete']);
    expect(db.has('shop_1:deliveryCustomization')).toBe(false);
  });
});

describe('ActivationService — paymentCustomization kind', () => {
  it('creates via functionHandle with enabled:true on first ensure', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'payment_customization', title: 't', handle: 'superapp-payment-customization' }] } } };
      if (op === 'SuperAppPaymentCustomizationList')
        return { data: { paymentCustomizations: { nodes: [] } } };
      if (op === 'SuperAppPaymentCustomizationCreate')
        return { data: { paymentCustomizationCreate: { paymentCustomization: { id: 'gid://shopify/PaymentCustomization/1' }, userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('paymentCustomization');
    expect(gid).toBe('gid://shopify/PaymentCustomization/1');
    const create = calls.find((c) => c.op === 'SuperAppPaymentCustomizationCreate')!;
    expect((create.variables!.paymentCustomization as any).functionHandle).toBe('superapp-payment-customization');
    expect((create.variables!.paymentCustomization as any).enabled).toBe(true);
    expect((create.variables!.paymentCustomization as any).title).toBe('SuperApp Payment Customization');
  });

  it('adopts an existing customization for our function instead of duplicating', async () => {
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'payment_customization', title: 't', handle: 'superapp-payment-customization' }] } } };
      if (op === 'SuperAppPaymentCustomizationList')
        return { data: { paymentCustomizations: { nodes: [{ id: 'gid://p/9', title: 'x', enabled: true, functionId: 'fn_1' }] } } };
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('paymentCustomization');
    expect(gid).toBe('gid://p/9');
    expect(calls.map((c) => c.op)).not.toContain('SuperAppPaymentCustomizationCreate');
  });

  it('finds the node on page 2 (paginated adoption, no double-create)', async () => {
    const { admin, calls } = mockAdmin((op, variables) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'payment_customization', title: 't', handle: 'superapp-payment-customization' }] } } };
      if (op === 'SuperAppPaymentCustomizationList') {
        if (!variables?.after) {
          return { data: { paymentCustomizations: { nodes: [{ id: 'gid://p/other', title: 'x', enabled: true, functionId: 'fn_other' }], pageInfo: { hasNextPage: true, endCursor: 'cursor-1' } } } };
        }
        expect(variables.after).toBe('cursor-1');
        return { data: { paymentCustomizations: { nodes: [{ id: 'gid://p/9', title: 'x', enabled: true, functionId: 'fn_1' }], pageInfo: { hasNextPage: false, endCursor: null } } } };
      }
      throw new Error(`unexpected op ${op}`);
    });
    const gid = await new ActivationService(admin, 'shop_1').ensureForFunctionKey('paymentCustomization');
    expect(gid).toBe('gid://p/9');
    expect(calls.map((c) => c.op)).toEqual([
      'SuperAppFunctionLookup',
      'SuperAppPaymentCustomizationList',
      'SuperAppPaymentCustomizationList',
    ]);
    expect(calls.some((c) => c.op === 'SuperAppPaymentCustomizationCreate')).toBe(false);
  });

  it('refuses to create when the lookup hits the page cap without a verdict (no blind create)', async () => {
    let pages = 0;
    const { admin, calls } = mockAdmin((op) => {
      if (op === 'SuperAppFunctionLookup')
        return { data: { shopifyFunctions: { nodes: [{ id: 'fn_1', apiType: 'payment_customization', title: 't', handle: 'superapp-payment-customization' }] } } };
      if (op === 'SuperAppPaymentCustomizationList') {
        pages += 1;
        return { data: { paymentCustomizations: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `cursor-${pages}` } } } };
      }
      throw new Error(`unexpected op ${op}`);
    });
    await expect(
      new ActivationService(admin, 'shop_1').ensureForFunctionKey('paymentCustomization'),
    ).rejects.toThrow(ActivationLookupUnverifiableError);
    expect(pages).toBe(MAX_PAYMENT_LOOKUP_PAGES);
    expect(calls.some((c) => c.op === 'SuperAppPaymentCustomizationCreate')).toBe(false);
  });

  it('stored GID → zero Shopify calls; delete uses paymentCustomizationDelete', async () => {
    db.set('shop_1:paymentCustomization', { functionKey: 'paymentCustomization', kind: 'paymentCustomization', activationGid: 'gid://p/1' });
    const noCall = mockAdmin(() => { throw new Error('no call expected'); });
    expect(await new ActivationService(noCall.admin, 'shop_1').ensureForFunctionKey('paymentCustomization')).toBe('gid://p/1');

    const del = mockAdmin((op) => {
      if (op === 'SuperAppPaymentCustomizationDelete')
        return { data: { paymentCustomizationDelete: { deletedId: 'gid://p/1', userErrors: [] } } };
      throw new Error(`unexpected op ${op}`);
    });
    await new ActivationService(del.admin, 'shop_1').deleteForFunctionKey('paymentCustomization');
    expect(del.calls.map((c) => c.op)).toEqual(['SuperAppPaymentCustomizationDelete']);
    expect(db.has('shop_1:paymentCustomization')).toBe(false);
  });
});

describe('PublishService → activation hook', () => {
  it('throws (never silently inert) when a mapped functionKey publishes without shopId', async () => {
    const { admin } = mockAdmin(() => ({
      data: {
        metaobjectUpsert: { metaobject: { id: 'gid://m/1' } },
        metafieldDefinitionCreate: { userErrors: [] },
        metafieldsSet: { metafields: [] },
        shop: { id: 'gid://shopify/Shop/1' },
        metaobjectByHandle: null,
      },
    }));
    const { PublishService } = await import('~/services/publish/publish.service');
    const svc = new PublishService(admin); // no session.shopId
    await expect(
      (async () => {
        const { MODULE_TEMPLATES } = await import('@superapp/core');
        const spec = MODULE_TEMPLATES.find((t) => t.spec.type === 'functions.discountRules')!.spec;
        await svc.publish(spec, { kind: 'PLATFORM', moduleId: 'm1' });
      })(),
    ).rejects.toThrow(/shopId/);
  });
});
