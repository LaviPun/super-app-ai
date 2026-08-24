import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route test for `/api/modules/from-template` → `ensureStoreAesthetic` wiring
 * (WS-H Task 3, Tmpl-2 install-path gap).
 *
 * `ensureStoreAesthetic` (apps/web/app/services/theme/ensure-aesthetic.server.ts)
 * is already called from both AI-generation routes so a generated storefront
 * module matches the merchant's real theme palette — but the template-install
 * route never called it, so an installed template always resolved to whatever
 * default/legacy palette the template author hardcoded. This pins that the
 * install action now calls it for storefront-layout template types (mirroring
 * the AI path's `isStorefrontType` gate) and skips it for non-storefront types
 * (functions/admin/POS/messaging templates have no storefront palette to match).
 *
 * Mock scaffolding copied verbatim from the proven-working
 * `from-template-pack-resolution.test.ts` (same route, same auth/db/quota/
 * module/activity mocks), plus one additional mock for `ensureStoreAesthetic`.
 */

const authenticateAdminMock = vi.fn();
vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: authenticateAdminMock } },
}));

vi.mock('~/services/observability/api-log.service', () => ({
  withApiLogging: vi.fn(async (_meta: unknown, handler: () => Promise<Response>) => handler()),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({ shop: { upsert: vi.fn(async () => ({ id: 'shop_1' })) } }),
}));

vi.mock('~/services/billing/quota.service', () => ({
  QuotaService: class {
    enforce = vi.fn(async () => undefined);
  },
}));

const createDraftMock = vi.fn(async (_shop: string, _spec: unknown) => ({ id: 'mod_1' }));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    createDraft = createDraftMock;
  },
}));

vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = vi.fn(async () => undefined);
  },
}));

const settingsGetMock = vi.fn(async () => ({ templateSpecOverrides: null as string | null }));
vi.mock('~/services/settings/settings.service', () => ({
  SettingsService: class {
    get = settingsGetMock;
  },
}));

const ensureStoreAesthetic = vi.fn(async () => undefined);
vi.mock('~/services/theme/ensure-aesthetic.server', () => ({ ensureStoreAesthetic }));

const adminStub = { fake: 'admin-api-context' };

const callAction = async (templateId: string) => {
  const mod = await import('~/routes/api.modules.from-template');
  const form = new FormData();
  form.set('templateId', templateId);
  return mod.action({
    request: new Request('https://app.example/api/modules/from-template', { method: 'POST', body: form }),
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdminMock.mockResolvedValue({
    session: { shop: 'shop.example.myshopify.com' },
    admin: adminStub,
  });
  settingsGetMock.mockResolvedValue({ templateSpecOverrides: null });
});

describe('template install → ensureStoreAesthetic (WS-H)', () => {
  it('calls ensureStoreAesthetic for a theme.section template', async () => {
    // EMB-BODY-01: a real, installable theme.section template in the library.
    const res = await callAction('EMB-BODY-01');
    expect(res.status).toBe(302);
    expect(ensureStoreAesthetic).toHaveBeenCalledTimes(1);
    expect(ensureStoreAesthetic).toHaveBeenCalledWith(
      expect.objectContaining({ admin: adminStub, shopId: 'shop_1' }),
    );
  });

  it('does NOT call ensureStoreAesthetic for a non-storefront template (functions.cartTransform)', async () => {
    // FN-CART-01: a real, installable functions.cartTransform template — no
    // storefront palette to match.
    const res = await callAction('FN-CART-01');
    expect(res.status).toBe(302);
    expect(ensureStoreAesthetic).not.toHaveBeenCalled();
  });

  it('install RESILIENCE (fix round 1): still completes when ensureStoreAesthetic rejects', async () => {
    // ensureStoreAesthetic's own real implementation never rejects (internal
    // try/catch) — but the install route's comment claims "Never blocks or
    // fails the install" unconditionally, so that guarantee must hold even if
    // the callee's internal safety net is ever bypassed (a bug in that
    // function, an unexpected throw, etc.). Best-effort must mean best-effort
    // at the call site too, not only inside the callee.
    ensureStoreAesthetic.mockRejectedValueOnce(new Error('theme analyze blew up'));
    const res = await callAction('EMB-BODY-01');
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/modules/mod_1');
    expect(ensureStoreAesthetic).toHaveBeenCalledTimes(1);
    expect(createDraftMock).toHaveBeenCalledTimes(1);
  });
});
