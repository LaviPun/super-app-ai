import { z } from 'zod';

export const ShopRecordSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  planTier: z.enum(['free', 'starter', 'growth', 'enterprise']).default('free'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ShopRecord = z.infer<typeof ShopRecordSchema>;

export const ModuleRecordSchema = z.object({
  id: z.string().min(1),
  shopId: z.string().min(1),
  intentKey: z.string().min(1),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  revisionId: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export type ModuleRecord = z.infer<typeof ModuleRecordSchema>;

export interface DataRepository {
  upsertShop(record: ShopRecord): Promise<void>;
  getShop(id: string): Promise<ShopRecord | undefined>;
  upsertModule(record: ModuleRecord): Promise<void>;
  listModules(shopId: string): Promise<ModuleRecord[]>;
}

export class InMemoryDataRepository implements DataRepository {
  private readonly shops = new Map<string, ShopRecord>();
  private readonly modules = new Map<string, ModuleRecord>();

  async upsertShop(record: ShopRecord): Promise<void> {
    this.shops.set(record.id, ShopRecordSchema.parse(record));
  }

  async getShop(id: string): Promise<ShopRecord | undefined> {
    return this.shops.get(id);
  }

  async upsertModule(record: ModuleRecord): Promise<void> {
    this.modules.set(record.id, ModuleRecordSchema.parse(record));
  }

  async listModules(shopId: string): Promise<ModuleRecord[]> {
    return [...this.modules.values()].filter((record) => record.shopId === shopId);
  }
}
