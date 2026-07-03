import { describe, it, expect, vi } from 'vitest';
import { parseDataModel, type ModuleDataStore } from '@superapp/core';
import { provisionModuleDataStore } from '~/services/publish/provision-data-store.server';
import type { DataStoreService } from '~/services/data/data-store.service';

/**
 * Unit-tests the canonical typed-store provisioning seam (R3.3). The seam owns
 * key derivation, `schemaJson` serialization, and the predefined-key guard; the
 * additive merge itself is owned + tested by `ensureTypedStore`
 * (`data-store-provisioning.test.ts`, unchanged).
 */

function fakeService(): { svc: DataStoreService; ensureTypedStore: ReturnType<typeof vi.fn> } {
  const ensureTypedStore = vi.fn(async (_shopId: string, key: string) => ({ key }));
  // Only `ensureTypedStore` is exercised by the seam.
  const svc = { ensureTypedStore } as unknown as DataStoreService;
  return { svc, ensureTypedStore };
}

const model: ModuleDataStore = {
  label: 'Product Reviews',
  description: 'Customer-submitted product reviews.',
  schema: {
    fields: [
      { name: 'rating', type: 'number', required: true, piiFlag: false },
      { name: 'author', type: 'text', required: true, piiFlag: true },
    ],
  },
};

describe('provisionModuleDataStore', () => {
  it('returns null and does not call ensureTypedStore when no data model declared', async () => {
    const { svc, ensureTypedStore } = fakeService();
    const result = await provisionModuleDataStore('shop_1', 'mod_1', undefined, { service: svc });
    expect(result).toBeNull();
    expect(ensureTypedStore).not.toHaveBeenCalled();
  });

  it('returns null when the declared schema has zero fields', async () => {
    const { svc, ensureTypedStore } = fakeService();
    const empty: ModuleDataStore = { label: 'Empty', schema: { fields: [] } };
    const result = await provisionModuleDataStore('shop_1', 'mod_1', empty, { service: svc });
    expect(result).toBeNull();
    expect(ensureTypedStore).not.toHaveBeenCalled();
  });

  it('derives key module_<moduleId> and serializes schema as parseDataModel-compatible JSON', async () => {
    const { svc, ensureTypedStore } = fakeService();
    const result = await provisionModuleDataStore('shop_1', 'mod_ABC', model, { service: svc });

    expect(ensureTypedStore).toHaveBeenCalledTimes(1);
    const [shopId, key, opts] = ensureTypedStore.mock.calls[0]!;
    expect(shopId).toBe('shop_1');
    expect(key).toBe('module_mod_ABC');
    expect(opts.label).toBe('Product Reviews');
    expect(opts.description).toBe('Customer-submitted product reviews.');

    // schemaJson round-trips through parseDataModel back to the declared field set.
    const roundTripped = parseDataModel(opts.schemaJson);
    expect(roundTripped?.fields.map((f) => f.name)).toEqual(['rating', 'author']);

    // ensureTypedStore normalizes the key; the seam returns whatever it produced.
    expect(result).toEqual({ storeKey: 'module_mod_ABC' });
  });

  it('uses an explicit key override verbatim (pre-normalization)', async () => {
    const { svc, ensureTypedStore } = fakeService();
    await provisionModuleDataStore('shop_1', 'mod_1', { ...model, key: 'MyReviews' }, { service: svc });
    const [, key] = ensureTypedStore.mock.calls[0]!;
    expect(key).toBe('MyReviews');
  });

  it('forces the module_ prefix when an explicit key collides with a predefined store (R-b)', async () => {
    const { svc, ensureTypedStore } = fakeService();
    await provisionModuleDataStore('shop_1', 'mod_1', { ...model, key: 'order' }, { service: svc });
    const [, key] = ensureTypedStore.mock.calls[0]!;
    expect(key).toBe('module_mod_1');
  });

  it('propagates a writer error (the seam does not swallow; the route owns the try/catch)', async () => {
    const ensureTypedStore = vi.fn(async () => {
      throw new Error('db down');
    });
    const svc = { ensureTypedStore } as unknown as DataStoreService;
    await expect(provisionModuleDataStore('shop_1', 'mod_1', model, { service: svc })).rejects.toThrow('db down');
  });
});
