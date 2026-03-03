import { getPrisma } from '~/db.server';

export type PredefinedStore = {
  key: string;
  label: string;
  description: string;
  icon: string;
};

export const PREDEFINED_STORES: PredefinedStore[] = [
  { key: 'product', label: 'Products', description: 'Store product data, custom attributes, and enrichments.', icon: 'ProductIcon' },
  { key: 'inventory', label: 'Inventory', description: 'Track inventory levels, stock movements, and warehouse data.', icon: 'InventoryIcon' },
  { key: 'order', label: 'Orders', description: 'Store order data, fulfillment status, and processing notes.', icon: 'OrderIcon' },
  { key: 'analytics', label: 'Analytics', description: 'Track custom events, metrics, and aggregated data.', icon: 'AnalyticsIcon' },
  { key: 'marketing', label: 'Marketing', description: 'Campaign data, audience segments, and performance metrics.', icon: 'MarketingIcon' },
  { key: 'customer', label: 'Customers', description: 'Customer profiles, preferences, and interaction history.', icon: 'CustomerIcon' },
];

export class DataStoreService {
  async listStores(shopId: string) {
    const prisma = getPrisma();
    const stores = await prisma.dataStore.findMany({
      where: { shopId },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { records: true } } },
    });
    return stores.map(s => ({
      id: s.id,
      key: s.key,
      label: s.label,
      description: s.description,
      icon: s.icon,
      isEnabled: s.isEnabled,
      recordCount: s._count.records,
      createdAt: s.createdAt,
    }));
  }

  async enableStore(shopId: string, key: string) {
    const prisma = getPrisma();
    const predefined = PREDEFINED_STORES.find(p => p.key === key);
    return prisma.dataStore.upsert({
      where: { shopId_key: { shopId, key } },
      create: {
        shopId,
        key,
        label: predefined?.label ?? key,
        description: predefined?.description ?? null,
        icon: predefined?.icon ?? null,
        isEnabled: true,
      },
      update: { isEnabled: true },
    });
  }

  async disableStore(shopId: string, key: string) {
    const prisma = getPrisma();
    return prisma.dataStore.updateMany({
      where: { shopId, key },
      data: { isEnabled: false },
    });
  }

  async createCustomStore(shopId: string, key: string, label: string, description?: string) {
    const prisma = getPrisma();
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
    return prisma.dataStore.create({
      data: { shopId, key: safeKey, label, description: description ?? null, isEnabled: true },
    });
  }

  async getStoreByKey(shopId: string, key: string) {
    const prisma = getPrisma();
    return prisma.dataStore.findUnique({ where: { shopId_key: { shopId, key } } });
  }

  async listRecords(dataStoreId: string, { page = 1, pageSize = 50 }: { page?: number; pageSize?: number } = {}) {
    const prisma = getPrisma();
    const skip = (page - 1) * pageSize;
    const [records, total] = await Promise.all([
      prisma.dataStoreRecord.findMany({
        where: { dataStoreId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.dataStoreRecord.count({ where: { dataStoreId } }),
    ]);
    return {
      records: records.map(r => ({
        id: r.id,
        externalId: r.externalId,
        title: r.title,
        payload: r.payload,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async createRecord(dataStoreId: string, data: { externalId?: string; title?: string; payload: unknown }) {
    const prisma = getPrisma();
    return prisma.dataStoreRecord.create({
      data: {
        dataStoreId,
        externalId: data.externalId ?? null,
        title: data.title ?? null,
        payload: JSON.stringify(data.payload),
      },
    });
  }

  async deleteRecord(recordId: string, dataStoreId: string) {
    const prisma = getPrisma();
    return prisma.dataStoreRecord.deleteMany({
      where: { id: recordId, dataStoreId },
    });
  }
}
