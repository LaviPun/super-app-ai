import { describe, expect, it } from 'vitest';
import { InMemoryDataRepository } from '../repository.js';

describe('InMemoryDataRepository', () => {
  it('stores shops and modules', async () => {
    const repo = new InMemoryDataRepository();
    const now = new Date().toISOString();
    await repo.upsertShop({
      id: 'shop_1',
      domain: 'demo.myshopify.com',
      planTier: 'starter',
      createdAt: now,
      updatedAt: now,
    });
    await repo.upsertModule({
      id: 'mod_1',
      shopId: 'shop_1',
      intentKey: 'promo.banner',
      status: 'draft',
      revisionId: 'rev_1',
      updatedAt: now,
    });

    expect(await repo.getShop('shop_1')).toMatchObject({ domain: 'demo.myshopify.com' });
    expect((await repo.listModules('shop_1')).length).toBe(1);
  });
});
