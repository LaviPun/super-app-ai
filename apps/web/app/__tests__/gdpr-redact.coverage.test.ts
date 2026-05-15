import { beforeEach, describe, expect, it, vi } from 'vitest';

type RowWithId = { id: string };
type ShopRow = RowWithId & { shopDomain: string };
type DataCaptureRow = RowWithId & { shopId: string; customerId: string | null };
type DataStoreRow = RowWithId & { shopId: string };
type DataStoreRecordRow = RowWithId & { dataStoreId: string; customerId: string | null };
type ModuleEventRow = RowWithId & { shopId: string; customerId: string | null };
type ModuleMetricsDailyRow = RowWithId & { shopId: string };
type AttributionLinkRow = RowWithId & { shopId: string; customerId: string | null };

const { authWebhookMock } = vi.hoisted(() => ({
  authWebhookMock: vi.fn(),
}));

let prismaMock: ReturnType<typeof makePrismaMock>;

vi.mock('~/db.server', () => ({
  getPrisma: () => prismaMock,
}));

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      webhook: (...args: unknown[]) => authWebhookMock(...args),
    },
  },
}));

function normalizeCustomerId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return null;
}

function makePrismaMock() {
  const state: {
    shops: ShopRow[];
    dataCaptures: DataCaptureRow[];
    dataStores: DataStoreRow[];
    dataStoreRecords: DataStoreRecordRow[];
    moduleEvents: ModuleEventRow[];
    moduleMetricsDaily: ModuleMetricsDailyRow[];
    attributionLinks: AttributionLinkRow[];
  } = {
    shops: [{ id: 'shop-1', shopDomain: 'gdpr.myshopify.com' }],
    dataCaptures: [],
    dataStores: [],
    dataStoreRecords: [],
    moduleEvents: [],
    moduleMetricsDaily: [],
    attributionLinks: [],
  };

  const prisma = {
    __state: state,
    $transaction: <T>(queries: Promise<T>[]) => Promise.all(queries),
    shop: {
      findUnique: vi.fn(async ({ where }: { where: { shopDomain: string } }) => {
        return state.shops.find((shop) => shop.shopDomain === where.shopDomain) ?? null;
      }),
    },
    dataCapture: {
      deleteMany: vi.fn(async ({ where }: { where: { shopId?: string; customerId?: string } }) => {
        const before = state.dataCaptures.length;
        state.dataCaptures = state.dataCaptures.filter((row) => {
          if (where.shopId && row.shopId !== where.shopId) return true;
          if (where.customerId && row.customerId !== where.customerId) return true;
          return false;
        });
        return { count: before - state.dataCaptures.length };
      }),
    },
    dataStoreRecord: {
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: {
            customerId?: string;
            dataStore?: { shopId?: string };
          };
        }) => {
          const before = state.dataStoreRecords.length;
          const allowedStoreIds = where.dataStore?.shopId
            ? new Set(state.dataStores.filter((store) => store.shopId === where.dataStore?.shopId).map((store) => store.id))
            : null;

          state.dataStoreRecords = state.dataStoreRecords.filter((row) => {
            if (where.customerId && row.customerId !== where.customerId) return true;
            if (allowedStoreIds && !allowedStoreIds.has(row.dataStoreId)) return true;
            return false;
          });

          return { count: before - state.dataStoreRecords.length };
        },
      ),
    },
    moduleEvent: {
      deleteMany: vi.fn(async ({ where }: { where: { shopId?: string; customerId?: string } }) => {
        const before = state.moduleEvents.length;
        state.moduleEvents = state.moduleEvents.filter((row) => {
          if (where.shopId && row.shopId !== where.shopId) return true;
          if (where.customerId && row.customerId !== where.customerId) return true;
          return false;
        });
        return { count: before - state.moduleEvents.length };
      }),
    },
    moduleMetricsDaily: {
      deleteMany: vi.fn(async ({ where }: { where: { shopId?: string } }) => {
        const before = state.moduleMetricsDaily.length;
        state.moduleMetricsDaily = state.moduleMetricsDaily.filter((row) => {
          if (where.shopId && row.shopId !== where.shopId) return true;
          return false;
        });
        return { count: before - state.moduleMetricsDaily.length };
      }),
    },
    attributionLink: {
      deleteMany: vi.fn(async ({ where }: { where: { shopId?: string; customerId?: string } }) => {
        const before = state.attributionLinks.length;
        state.attributionLinks = state.attributionLinks.filter((row) => {
          if (where.shopId && row.shopId !== where.shopId) return true;
          if (where.customerId && row.customerId !== where.customerId) return true;
          return false;
        });
        return { count: before - state.attributionLinks.length };
      }),
    },
    dataStore: {
      deleteMany: vi.fn(async ({ where }: { where: { shopId?: string } }) => {
        const before = state.dataStores.length;
        state.dataStores = state.dataStores.filter((row) => {
          if (where.shopId && row.shopId !== where.shopId) return true;
          return false;
        });
        return { count: before - state.dataStores.length };
      }),
    },
    activityLog: {
      create: vi.fn(async () => ({ id: 'activity-1' })),
    },
  };

  return prisma;
}

describe('GDPR redact coverage', () => {
  beforeEach(() => {
    authWebhookMock.mockReset();
    authWebhookMock.mockResolvedValue(undefined);
    prismaMock = makePrismaMock();
  });

  it('customers/redact removes customer rows across indexed tables', async () => {
    const targetCustomer = '12345';
    prismaMock.__state.dataStores.push({ id: 'store-1', shopId: 'shop-1' });
    prismaMock.__state.dataStores.push({ id: 'store-2', shopId: 'shop-other' });
    const targetShopStoreIds = new Set(
      prismaMock.__state.dataStores.filter((store) => store.shopId === 'shop-1').map((store) => store.id),
    );

    prismaMock.__state.dataCaptures.push(
      { id: 'cap-1', shopId: 'shop-1', customerId: targetCustomer },
      { id: 'cap-2', shopId: 'shop-1', customerId: 'other' },
    );
    prismaMock.__state.dataStoreRecords.push(
      { id: 'rec-1', dataStoreId: 'store-1', customerId: targetCustomer },
      { id: 'rec-2', dataStoreId: 'store-1', customerId: 'other' },
      { id: 'rec-3', dataStoreId: 'store-2', customerId: targetCustomer },
    );
    prismaMock.__state.moduleEvents.push(
      { id: 'evt-1', shopId: 'shop-1', customerId: targetCustomer },
      { id: 'evt-2', shopId: 'shop-1', customerId: 'other' },
    );
    prismaMock.__state.attributionLinks.push(
      { id: 'attr-1', shopId: 'shop-1', customerId: targetCustomer },
      { id: 'attr-2', shopId: 'shop-1', customerId: 'other' },
    );

    const { action } = await import('../routes/webhooks.customers.redact');
    const request = new Request('https://example.test/webhooks/customers/redact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        shop_domain: 'gdpr.myshopify.com',
        customer: { id: Number(targetCustomer) },
      }),
    });

    const response = await action({ request });
    expect(response.status).toBe(200);

    expect(prismaMock.__state.dataCaptures.filter((row) => row.shopId === 'shop-1' && row.customerId === targetCustomer)).toHaveLength(0);
    expect(
      prismaMock.__state.dataStoreRecords.filter((row) => {
        const store = prismaMock.__state.dataStores.find((item) => item.id === row.dataStoreId);
        return store?.shopId === 'shop-1' && row.customerId === targetCustomer;
      }),
    ).toHaveLength(0);
    expect(prismaMock.__state.moduleEvents.filter((row) => row.shopId === 'shop-1' && row.customerId === targetCustomer)).toHaveLength(0);
    expect(prismaMock.__state.attributionLinks.filter((row) => row.shopId === 'shop-1' && row.customerId === targetCustomer)).toHaveLength(0);

    // Non-target shop rows remain untouched.
    expect(prismaMock.__state.dataStoreRecords.some((row) => row.id === 'rec-3')).toBe(true);
  });

  it('shop/redact fully purges datastore rows and related GDPR tables', async () => {
    prismaMock.__state.dataStores.push({ id: 'store-1', shopId: 'shop-1' });
    prismaMock.__state.dataStores.push({ id: 'store-2', shopId: 'shop-other' });
    const targetShopStoreIds = new Set(
      prismaMock.__state.dataStores.filter((store) => store.shopId === 'shop-1').map((store) => store.id),
    );

    prismaMock.__state.dataStoreRecords.push(
      { id: 'rec-1', dataStoreId: 'store-1', customerId: normalizeCustomerId(123) },
      { id: 'rec-2', dataStoreId: 'store-2', customerId: normalizeCustomerId(456) },
    );
    prismaMock.__state.dataCaptures.push(
      { id: 'cap-1', shopId: 'shop-1', customerId: normalizeCustomerId(123) },
      { id: 'cap-2', shopId: 'shop-other', customerId: normalizeCustomerId(456) },
    );
    prismaMock.__state.moduleEvents.push(
      { id: 'evt-1', shopId: 'shop-1', customerId: normalizeCustomerId(123) },
      { id: 'evt-2', shopId: 'shop-other', customerId: normalizeCustomerId(456) },
    );
    prismaMock.__state.moduleMetricsDaily.push(
      { id: 'met-1', shopId: 'shop-1' },
      { id: 'met-2', shopId: 'shop-other' },
    );
    prismaMock.__state.attributionLinks.push(
      { id: 'attr-1', shopId: 'shop-1', customerId: normalizeCustomerId(123) },
      { id: 'attr-2', shopId: 'shop-other', customerId: normalizeCustomerId(456) },
    );

    const { action } = await import('../routes/webhooks.shop.redact');
    const request = new Request('https://example.test/webhooks/shop/redact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shop_domain: 'gdpr.myshopify.com' }),
    });

    const response = await action({ request });
    expect(response.status).toBe(200);

    expect(prismaMock.__state.dataStores.filter((row) => row.shopId === 'shop-1')).toHaveLength(0);
    expect(
      prismaMock.__state.dataStoreRecords.filter((row) => targetShopStoreIds.has(row.dataStoreId)),
    ).toHaveLength(0);
    expect(prismaMock.__state.dataCaptures.filter((row) => row.shopId === 'shop-1')).toHaveLength(0);
    expect(prismaMock.__state.moduleEvents.filter((row) => row.shopId === 'shop-1')).toHaveLength(0);
    expect(prismaMock.__state.moduleMetricsDaily.filter((row) => row.shopId === 'shop-1')).toHaveLength(0);
    expect(prismaMock.__state.attributionLinks.filter((row) => row.shopId === 'shop-1')).toHaveLength(0);
  });
});
