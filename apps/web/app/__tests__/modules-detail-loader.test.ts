import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

const specJson = JSON.stringify({ type: 'theme.section', name: 'Test module', config: {} });

function baseModule(overrides: Partial<{ versions: unknown[] }> = {}) {
  const draft = {
    id: 'ver_1',
    status: 'DRAFT',
    specJson,
    hydratedAt: null as Date | null,
    adminConfigSchemaJson: null as string | null,
    adminDefaultsJson: null as string | null,
    validationReportJson: null as string | null,
    previewHtmlJson: null as string | null,
    version: 1,
    publishedAt: null,
    targetThemeId: null,
  };
  return {
    id: 'mod_1',
    name: 'Test module',
    shopId: 'shop_1',
    recipeId: null,
    activeVersion: null,
    activeVersionId: null,
    versions: overrides.versions ?? [draft],
  };
}

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 's.myshopify.com' }, admin: {} })),
  getModule: vi.fn(),
  getPlanTier: vi.fn(async () => 'FREE'),
  refreshPlanTier: vi.fn(async () => 'FREE'),
  explainCapabilityGate: vi.fn(() => null),
  render: vi.fn(() => ({ kind: 'HTML' as const, html: '<div></div>' })),
  loadStoreAesthetic: vi.fn(async () => null),
  listThemes: vi.fn(async () => []),
  dataCaptureCount: vi.fn(async () => 0),
}));

vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class { getModule = hoisted.getModule; },
}));
vi.mock('~/db.server', () => ({
  getPrisma: () => ({ dataCapture: { count: hoisted.dataCaptureCount } }),
}));
vi.mock('~/services/shopify/capability.service', () => ({
  CapabilityService: class {
    getPlanTier = hoisted.getPlanTier;
    refreshPlanTier = hoisted.refreshPlanTier;
    explainCapabilityGate = hoisted.explainCapabilityGate;
  },
}));
vi.mock('~/services/preview/preview.service', () => ({
  PreviewService: class { render = hoisted.render; },
}));
vi.mock('~/services/ai/design-reference.server', () => ({
  loadStoreAesthetic: hoisted.loadStoreAesthetic,
}));
vi.mock('~/services/shopify/theme.service', () => ({
  ThemeService: class { listThemes = hoisted.listThemes; },
}));

function req() {
  return new Request('https://app.test/modules/mod_1');
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 's.myshopify.com' }, admin: {} });
  hoisted.getPlanTier.mockResolvedValue('FREE');
  hoisted.explainCapabilityGate.mockReturnValue(null);
  hoisted.render.mockReturnValue({ kind: 'HTML', html: '<div></div>' });
  hoisted.loadStoreAesthetic.mockResolvedValue(null);
  hoisted.listThemes.mockResolvedValue([]);
  hoisted.dataCaptureCount.mockResolvedValue(0);
});

describe('modules.$moduleId loader — WS-F: hydration.adminConfig forwarding', () => {
  it('is null when the draft has no persisted adminConfigSchemaJson', async () => {
    hoisted.getModule.mockResolvedValue(baseModule());
    const { loader } = await import('~/routes/modules.$moduleId');
    const res = await loader({ request: req(), params: { moduleId: 'mod_1' } } as never);
    const payload = await res.json();
    expect(payload.hydration.status).toBe('none');
    expect(payload.hydration.adminConfig).toBeNull();
  });

  it('is populated with the parsed (jsonSchema, uiSchema, defaults) triple when hydration data is present', async () => {
    const jsonSchema = { type: 'object', properties: { label: { type: 'string' } } };
    const uiSchema = { label: { widget: 'text' } };
    const defaults = { label: 'Hello' };
    const draft = {
      id: 'ver_1',
      status: 'DRAFT',
      specJson,
      hydratedAt: new Date('2026-08-01T00:00:00Z'),
      adminConfigSchemaJson: JSON.stringify({ jsonSchema, uiSchema, defaults }),
      adminDefaultsJson: JSON.stringify(defaults),
      validationReportJson: JSON.stringify({ overall: 'PASS', checks: [] }),
      previewHtmlJson: null,
      version: 1,
      publishedAt: null,
      targetThemeId: null,
    };
    hoisted.getModule.mockResolvedValue(baseModule({ versions: [draft] }));
    const { loader } = await import('~/routes/modules.$moduleId');
    const res = await loader({ request: req(), params: { moduleId: 'mod_1' } } as never);
    const payload = await res.json();
    expect(payload.hydration.status).toBe('done');
    expect(payload.hydration.adminConfig).toEqual({ jsonSchema, uiSchema, defaults });
  });
});

describe('modules.$moduleId loader — WS-F Task 11: data-capture count (D7, restores link dropped in d182fdc)', () => {
  it('computes captureCount via a shop+module-scoped prisma.dataCapture.count and returns it', async () => {
    hoisted.getModule.mockResolvedValue(baseModule());
    hoisted.dataCaptureCount.mockResolvedValue(7);
    const { loader } = await import('~/routes/modules.$moduleId');
    const res = await loader({ request: req(), params: { moduleId: 'mod_1' } } as never);
    const payload = await res.json();
    expect(payload.captureCount).toBe(7);
    expect(hoisted.dataCaptureCount).toHaveBeenCalledWith({ where: { moduleId: 'mod_1', shopId: 'shop_1' } });
  });

  it('is 0 when the module has no captures', async () => {
    hoisted.getModule.mockResolvedValue(baseModule());
    hoisted.dataCaptureCount.mockResolvedValue(0);
    const { loader } = await import('~/routes/modules.$moduleId');
    const res = await loader({ request: req(), params: { moduleId: 'mod_1' } } as never);
    const payload = await res.json();
    expect(payload.captureCount).toBe(0);
  });
});
