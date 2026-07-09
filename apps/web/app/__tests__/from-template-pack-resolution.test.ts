import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_TEMPLATES, getTemplateInstallability, type RecipeSpec } from '@superapp/core';

/**
 * Route test for `/api/modules/from-template` pack resolution (`withResolvedPack`,
 * module-design-system.md §3.3.1): a storefront spec must reach `createDraft`
 * with a CONCRETE `style.pack` so the storefront can stamp `data-sa-pack` —
 * authored packs pass through untouched; a missing/'auto' pack resolves to the
 * low-confidence default ('luxe').
 *
 * Mirrors the auth/service mock pattern in `connector-test-routes.test.ts`.
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

const createDraftMock = vi.fn(async (_shop: string, _spec: RecipeSpec) => ({ id: 'mod_1' }));
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

// A real, installable storefront template picked at load time so the test
// tracks the actual library rather than a hard-coded fixture.
const storefrontTemplate = MODULE_TEMPLATES.find(
  (t) => t.spec.type === 'theme.section' && getTemplateInstallability(t).ok,
);

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
  authenticateAdminMock.mockResolvedValue({ session: { shop: 'shop.example.myshopify.com' } });
  settingsGetMock.mockResolvedValue({ templateSpecOverrides: null });
});

describe('POST /api/modules/from-template — storefront pack resolution', () => {
  it('persists a concrete style.pack: luxe fallback when unauthored, authored pack passed through', async () => {
    expect(storefrontTemplate, 'expected an installable theme.section template in the library').toBeTruthy();
    const id = storefrontTemplate!.id;
    const baseSpec = storefrontTemplate!.spec as RecipeSpec & { style?: Record<string, unknown> };

    // Case A — override strips the authored pack: install must fill in 'luxe'
    // (resolveStorefrontPack's low-confidence, can't-look-wrong default).
    const { pack: _dropped, ...styleRest } = (baseSpec.style ?? {}) as { pack?: string };
    const noPackSpec = { ...baseSpec, style: styleRest };
    settingsGetMock.mockResolvedValue({
      templateSpecOverrides: JSON.stringify({ [id]: noPackSpec }),
    });
    const resA = await callAction(id);
    expect(resA.status).toBe(302);
    expect(resA.headers.get('Location')).toBe('/modules/mod_1');
    expect(createDraftMock).toHaveBeenCalledTimes(1);
    const installedA = createDraftMock.mock.calls[0]![1] as { style?: { pack?: string } };
    expect(installedA.style?.pack).toBe('luxe');

    // Case B — an authored pack ('bold') must pass through unresolved.
    settingsGetMock.mockResolvedValue({
      templateSpecOverrides: JSON.stringify({ [id]: { ...baseSpec, style: { ...styleRest, pack: 'bold' } } }),
    });
    const resB = await callAction(id);
    expect(resB.status).toBe(302);
    const installedB = createDraftMock.mock.calls[1]![1] as { style?: { pack?: string } };
    expect(installedB.style?.pack).toBe('bold');

    // Neither install may mutate the shared in-memory template object.
    expect((storefrontTemplate!.spec as { style?: { pack?: string } }).style?.pack).toBe(
      (baseSpec.style as { pack?: string } | undefined)?.pack,
    );
  });
});
