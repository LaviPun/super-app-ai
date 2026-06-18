import { describe, it, expect, vi, beforeEach } from 'vitest';

// Provisioning a typed data store from a module's declared data model.
const hoisted = vi.hoisted(() => ({
  upsert: vi.fn(async (_args: Record<string, unknown>) => ({ id: 'store_1' })),
  findUnique: vi.fn(async (_args: Record<string, unknown>) => null as null | { schemaJson: string | null }),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ dataStore: { upsert: hoisted.upsert, findUnique: hoisted.findUnique } }),
}));

describe('DataStoreService.ensureTypedStore', () => {
  beforeEach(() => {
    hoisted.upsert.mockClear();
    hoisted.findUnique.mockClear();
    hoisted.findUnique.mockResolvedValue(null);
  });

  it('upserts an enabled, typed store with a normalized key', async () => {
    const { DataStoreService } = await import('~/services/data/data-store.service');
    const schemaJson = JSON.stringify({ fields: [{ name: 'rating', type: 'number' }] });

    await new DataStoreService().ensureTypedStore('shop_1', 'Module ABC!!', {
      label: 'Reviews',
      description: 'desc',
      schemaJson,
    });

    expect(hoisted.upsert).toHaveBeenCalledTimes(1);
    const arg = hoisted.upsert.mock.calls[0]![0] as {
      where: { shopId_key: { shopId: string; key: string } };
      create: { key: string; isEnabled: boolean; schemaJson: string };
      update: { isEnabled: boolean; schemaJson?: string };
    };
    // key is lowercased + non-[a-z0-9_] stripped, capped at 40 chars.
    expect(arg.where.shopId_key.key).toBe('module_abc__');
    expect(arg.create.isEnabled).toBe(true);
    expect(arg.create.schemaJson).toBe(schemaJson);
    // first publish (no existing) keeps the schema as-is.
    expect(arg.update.isEnabled).toBe(true);
    expect(arg.update.schemaJson).toBe(schemaJson);
  });

  it('EXPANDS the schema additively when re-declared (add fields, keep existing)', async () => {
    const { DataStoreService } = await import('~/services/data/data-store.service');
    // Store already has `rating`; republish adds `comment`.
    hoisted.findUnique.mockResolvedValue({
      schemaJson: JSON.stringify({ fields: [{ name: 'rating', type: 'number' }] }),
    });
    const incoming = JSON.stringify({ fields: [{ name: 'comment', type: 'text' }] });

    await new DataStoreService().ensureTypedStore('shop_1', 'module_abc', {
      label: 'Reviews',
      schemaJson: incoming,
    });

    const arg = hoisted.upsert.mock.calls[0]![0] as { update: { schemaJson?: string } };
    const merged = JSON.parse(arg.update.schemaJson!) as { fields: Array<{ name: string }> };
    const names = merged.fields.map((f) => f.name);
    expect(names).toContain('rating'); // existing field preserved
    expect(names).toContain('comment'); // new field added
  });

  it('omits schemaJson from update when not provided (no clobber)', async () => {
    const { DataStoreService } = await import('~/services/data/data-store.service');
    await new DataStoreService().ensureTypedStore('shop_1', 'plain', { label: 'Plain' });
    const arg = hoisted.upsert.mock.calls[0]![0] as { update: Record<string, unknown> };
    expect('schemaJson' in arg.update).toBe(false);
    // no schema provided ⇒ no read for merge.
    expect(hoisted.findUnique).not.toHaveBeenCalled();
  });
});
