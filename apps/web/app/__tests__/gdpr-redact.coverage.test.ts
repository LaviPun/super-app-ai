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
    // Task 21 (shop-redact completeness, Infra-11) extended the route to purge every
    // shopId-bearing model. This test only exercises the pre-existing six tables above in
    // detail; the rest are stubbed to a no-op deleteMany (count 0) so the route's full run
    // doesn't throw — coverage that every one of these calls actually exists in the route is
    // enforced separately by shop-redact-completeness.test.ts's schema-introspection check.
    connectorToken: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    connector: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    moduleInstance: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    moduleAsset: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    functionRuleSet: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    flowAsset: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    imageIngestionJob: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    module: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    recipe: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    flowDeadLetter: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    flowSchedule: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    flowStepLog: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    themeProfile: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    shopApiRateLimit: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    appSubscription: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    supportTicket: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    job: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    apiLog: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    errorLog: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    aiUsage: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    retentionPolicy: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    // Fix round: WorkflowDef/WorkflowRun/WorkflowRunStep are tenantId-scoped (not shopId),
    // caught by the field-name-vocabulary introspection in shop-redact-completeness.test.ts.
    workflowRunStep: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    workflowRun: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    workflowDef: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };

  return prisma;
}

describe('GDPR redact coverage', () => {
  beforeEach(() => {
    authWebhookMock.mockReset();
    // Real shopify.authenticate.webhook verifies HMAC and returns the parsed
    // body as `payload` (the handler must NOT re-read the request body).
    authWebhookMock.mockImplementation(async (req: Request) => ({ payload: await req.json() }));
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

  it('shop/redact scopes every Task-21 (Infra-11) model deletion to the target shop, not global', async () => {
    const { action } = await import('../routes/webhooks.shop.redact');
    const request = new Request('https://example.test/webhooks/shop/redact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shop_domain: 'gdpr.myshopify.com' }),
    });

    const response = await action({ request });
    expect(response.status).toBe(200);

    const shopScoped = { where: { shopId: 'shop-1' } };
    expect(prismaMock.connectorToken.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'shop-1' } });
    expect(prismaMock.connector.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.moduleInstance.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.moduleAsset.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.functionRuleSet.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.flowAsset.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.imageIngestionJob.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.module.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.recipe.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.flowDeadLetter.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.flowSchedule.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.flowStepLog.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.themeProfile.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.shopApiRateLimit.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.appSubscription.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.supportTicket.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.job.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.apiLog.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.errorLog.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.aiUsage.deleteMany).toHaveBeenCalledWith(shopScoped);
    expect(prismaMock.retentionPolicy.deleteMany).toHaveBeenCalledWith(shopScoped);
    // Fix round: workflow engine tables, tenantId-scoped (not shopId).
    expect(prismaMock.workflowRunStep.deleteMany).toHaveBeenCalledWith({ where: { run: { tenantId: 'shop-1' } } });
    expect(prismaMock.workflowRun.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'shop-1' } });
    expect(prismaMock.workflowDef.deleteMany).toHaveBeenCalledWith({ where: { tenantId: 'shop-1' } });
  });
});
