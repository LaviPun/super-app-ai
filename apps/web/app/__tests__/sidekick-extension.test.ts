import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// extensions/ lives at the repo root; vitest runs from apps/web.
const EXTENSIONS_DIR = path.resolve(process.cwd(), '..', '..', 'extensions');
const APP_TOML = path.resolve(process.cwd(), '..', '..', 'shopify.app.toml');

// ── Prisma mock ──────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
  moduleFindMany: vi.fn(),
  moduleFindFirst: vi.fn(),
  metricsFindMany: vi.fn(),
}));

vi.mock('~/db.server', () => ({
  getPrisma: () => ({
    module: { findMany: hoisted.moduleFindMany, findFirst: hoisted.moduleFindFirst },
    moduleMetricsDaily: { findMany: hoisted.metricsFindMany },
  }),
}));

beforeEach(() => {
  hoisted.moduleFindMany.mockReset();
  hoisted.moduleFindFirst.mockReset();
  hoisted.metricsFindMany.mockReset();
});

// ── Contract parsing ─────────────────────────────────────────────────────────
describe('Sidekick tool contracts', () => {
  it('search_modules defaults status to ANY and trims query', async () => {
    const { SidekickDataToolInput } = await import('~/services/sidekick/sidekick-tools.contract');
    expect(SidekickDataToolInput.search_modules.parse({})).toEqual({ status: 'ANY' });
    expect(SidekickDataToolInput.search_modules.parse({ query: '  hi  ', status: 'DRAFT' }))
      .toEqual({ query: 'hi', status: 'DRAFT' });
  });

  it('search_modules rejects an unknown status', async () => {
    const { SidekickDataToolInput } = await import('~/services/sidekick/sidekick-tools.contract');
    expect(SidekickDataToolInput.search_modules.safeParse({ status: 'LIVE' }).success).toBe(false);
  });

  it('get_module_performance requires moduleId, defaults days, clamps range', async () => {
    const { SidekickDataToolInput } = await import('~/services/sidekick/sidekick-tools.contract');
    expect(SidekickDataToolInput.get_module_performance.safeParse({}).success).toBe(false);
    expect(SidekickDataToolInput.get_module_performance.parse({ moduleId: 'm1' }))
      .toEqual({ moduleId: 'm1', days: 30 });
    expect(SidekickDataToolInput.get_module_performance.safeParse({ moduleId: 'm1', days: 0 }).success).toBe(false);
    expect(SidekickDataToolInput.get_module_performance.safeParse({ moduleId: 'm1', days: 91 }).success).toBe(false);
  });

  it('SidekickToolCallSchema validates the extension→backend envelope', async () => {
    const { SidekickToolCallSchema } = await import('~/services/sidekick/sidekick-tools.contract');
    expect(SidekickToolCallSchema.safeParse({ tool: 'search_modules', input: {} }).success).toBe(true);
    expect(SidekickToolCallSchema.safeParse({ tool: 'nope', input: {} }).success).toBe(false);
    // input defaults to {}
    expect(SidekickToolCallSchema.parse({ tool: 'search_modules' }).input).toEqual({});
  });
});

// ── Data handlers ────────────────────────────────────────────────────────────
describe('Sidekick data handlers', () => {
  it('search_modules returns resource links with matching mimeType', async () => {
    hoisted.moduleFindMany.mockResolvedValue([
      { id: 'm1', name: 'Spin popup', type: 'theme.section', category: 'engagement', status: 'PUBLISHED', updatedAt: new Date('2026-01-01T00:00:00Z'), versions: [{ version: 3 }] },
    ]);
    const { sidekickSearchModules, MODULE_MIME_TYPE } = await import('~/services/sidekick/sidekick-data.server');
    const out = await sidekickSearchModules('shop_1', { status: 'PUBLISHED' });
    expect(out.results).toHaveLength(1);
    const link = out.results[0]!;
    expect(link.type).toBe('resource_link');
    expect(link.uri).toBe('gid://application/superapp-module/m1');
    expect(link.mimeType).toBe(MODULE_MIME_TYPE);
    expect(link._meta).toMatchObject({ status: 'PUBLISHED', latestVersion: 3 });
    // status filter propagated to the query
    expect(hoisted.moduleFindMany.mock.calls[0]![0].where).toMatchObject({ shopId: 'shop_1', status: 'PUBLISHED' });
  });

  it('search_modules with ANY omits the status filter', async () => {
    hoisted.moduleFindMany.mockResolvedValue([]);
    const { sidekickSearchModules } = await import('~/services/sidekick/sidekick-data.server');
    await sidekickSearchModules('shop_1', { status: 'ANY' });
    expect(hoisted.moduleFindMany.mock.calls[0]![0].where).not.toHaveProperty('status');
  });

  it('get_module_performance folds daily rows into totals + conversionRate', async () => {
    hoisted.moduleFindFirst.mockResolvedValue({ id: 'm1', name: 'Banner', type: 'theme.section', status: 'PUBLISHED' });
    hoisted.metricsFindMany.mockResolvedValue([
      { date: new Date('2026-01-02T00:00:00Z'), impressions: 100, interactions: 10, actions: 5, conversions: 2 },
      { date: new Date('2026-01-01T00:00:00Z'), impressions: 100, interactions: 20, actions: 5, conversions: 3 },
    ]);
    const { sidekickModulePerformance } = await import('~/services/sidekick/sidekick-data.server');
    const out = await sidekickModulePerformance('shop_1', { moduleId: 'm1', days: 30 });
    expect(out.results).toHaveLength(1);
    const meta = out.results[0]!._meta as Record<string, unknown>;
    expect(meta.available).toBe(true);
    expect(meta.impressions).toBe(200);
    expect(meta.conversions).toBe(5);
    expect(meta.conversionRate).toBe(0.025); // 5/200
    expect((meta.byDay as unknown[]).length).toBe(2);
  });

  it('get_module_performance reports available:false honestly with no metrics', async () => {
    hoisted.moduleFindFirst.mockResolvedValue({ id: 'm1', name: 'Banner', type: 'theme.section', status: 'DRAFT' });
    hoisted.metricsFindMany.mockResolvedValue([]);
    const { sidekickModulePerformance } = await import('~/services/sidekick/sidekick-data.server');
    const out = await sidekickModulePerformance('shop_1', { moduleId: 'm1', days: 30 });
    const meta = out.results[0]!._meta as Record<string, unknown>;
    expect(meta.available).toBe(false);
    expect(meta.reason).toMatch(/no metrics/i);
  });

  it('get_module_performance on an unknown module returns no results', async () => {
    hoisted.moduleFindFirst.mockResolvedValue(null);
    const { sidekickModulePerformance } = await import('~/services/sidekick/sidekick-data.server');
    const out = await sidekickModulePerformance('shop_1', { moduleId: 'nope', days: 30 });
    expect(out.results).toHaveLength(0);
  });

  it('handleSidekickDataTool routes to the right handler', async () => {
    hoisted.moduleFindMany.mockResolvedValue([]);
    const { handleSidekickDataTool } = await import('~/services/sidekick/sidekick-data.server');
    const out = await handleSidekickDataTool('shop_1', 'search_modules', { status: 'ANY' });
    expect(out).toHaveProperty('results');
    expect(hoisted.moduleFindMany).toHaveBeenCalledTimes(1);
  });
});

// ── Performance aggregation edge cases ───────────────────────────────────────
describe('getModulePerformanceSummary', () => {
  it('conversionRate is 0 when impressions are 0', async () => {
    hoisted.metricsFindMany.mockResolvedValue([
      { date: new Date('2026-01-01T00:00:00Z'), impressions: 0, interactions: 0, actions: 0, conversions: 0 },
    ]);
    const { getModulePerformanceSummary } = await import('~/services/analytics/module-performance.server');
    const s = await getModulePerformanceSummary('shop_1', 'm1', 30);
    expect(s.available).toBe(true);
    if (s.available) expect(s.conversionRate).toBe(0);
  });
});

// ── Declaration / enforcement parity (the classic Sidekick footgun) ─────────
describe('Sidekick extension declarations', () => {
  const readJson = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

  it('data tools.json names match the server-side contract enum', async () => {
    const { SidekickDataToolName } = await import('~/services/sidekick/sidekick-tools.contract');
    const declared = readJson(path.join(EXTENSIONS_DIR, 'superapp-sidekick-data', 'tools.json')) as { name: string }[];
    const names = declared.map((t) => t.name).sort();
    const contractNames = SidekickDataToolName.options.slice().sort();
    expect(names).toEqual(contractNames);
    // every tool has an mcp-style inputSchema + description
    for (const t of declared as { name: string; description: string; inputSchema: { type: string } }[]) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.description.length).toBeLessThanOrEqual(512); // Shopify limit
      expect(t.name.length).toBeLessThanOrEqual(64); // Shopify limit
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('data extension toml uses the headless data target + tools file', () => {
    const toml = fs.readFileSync(path.join(EXTENSIONS_DIR, 'superapp-sidekick-data', 'shopify.extension.toml'), 'utf8');
    expect(toml).toMatch(/type\s*=\s*"ui_extension"/);
    expect(toml).toMatch(/target\s*=\s*"admin\.app\.tools\.data"/);
    expect(toml).toMatch(/tools\s*=\s*"\.\/tools\.json"/);
    expect(toml).toMatch(/module\s*=\s*"\.\/src\/index\.js"/);
    expect(toml).toMatch(/api_version\s*=\s*"2026-04"/);
  });

  it('each action-link extension declares an admin.app.intent.link intent with a schema that exists', () => {
    for (const dir of ['superapp-sidekick-create', 'superapp-sidekick-configure', 'superapp-sidekick-publish']) {
      const base = path.join(EXTENSIONS_DIR, dir);
      const toml = fs.readFileSync(path.join(base, 'shopify.extension.toml'), 'utf8');
      expect(toml).toMatch(/type\s*=\s*"admin_link"/);
      expect(toml).toMatch(/target\s*=\s*"admin\.app\.intent\.link"/);
      const schemaRef = toml.match(/schema\s*=\s*"\.\/([^"]+)"/)?.[1];
      expect(schemaRef, `${dir} declares a schema`).toBeTruthy();
      expect(fs.existsSync(path.join(base, schemaRef!)), `${dir}/${schemaRef} exists`).toBe(true);
      const type = toml.match(/\[\[extensions\.targeting\.intents\]\][\s\S]*?type\s*=\s*"([^"]+)"/)?.[1];
      expect(type).toMatch(/^application\/superapp-module-(create|configure|publish)$/);
    }
  });

  it('action-link URLs point at real app routes; {id} placeholders have a param mapping', () => {
    const cases: Record<string, string> = {
      'superapp-sidekick-create': '/generate',
      'superapp-sidekick-configure': '/modules/{id}',
      'superapp-sidekick-publish': '/modules/{id}?publish=1',
    };
    for (const [dir, expectedUrl] of Object.entries(cases)) {
      const base = path.join(EXTENSIONS_DIR, dir);
      const toml = fs.readFileSync(path.join(base, 'shopify.extension.toml'), 'utf8');
      const url = toml.match(/url\s*=\s*"([^"]+)"/)?.[1] ?? '';
      expect(url).toBe(expectedUrl);
      if (url.includes('{id}')) {
        const schemaRef = toml.match(/schema\s*=\s*"\.\/([^"]+)"/)![1]!;
        const schema = readJson(path.join(base, schemaRef));
        // the value maps to the {id} path param via fieldName "id"
        expect(schema.value?.mapTo).toBe('param');
        expect(schema.value?.fieldName).toBe('id');
      }
    }
  });

  it('intent schemas declare no required fields (Sidekick treats all inputs as optional)', () => {
    for (const dir of ['superapp-sidekick-create', 'superapp-sidekick-configure', 'superapp-sidekick-publish']) {
      const base = path.join(EXTENSIONS_DIR, dir);
      const schemaRef = fs.readFileSync(path.join(base, 'shopify.extension.toml'), 'utf8').match(/schema\s*=\s*"\.\/([^"]+)"/)![1]!;
      const raw = fs.readFileSync(path.join(base, schemaRef), 'utf8');
      expect(raw).not.toMatch(/"required"\s*:/);
    }
  });

  it('shopify.app.toml declares the [sidekick] extensions_summary', () => {
    const toml = fs.readFileSync(APP_TOML, 'utf8');
    expect(toml).toMatch(/\[sidekick\]/);
    const summary = toml.match(/extensions_summary\s*=\s*"([^"]+)"/)?.[1] ?? '';
    expect(summary.length).toBeGreaterThan(0);
    // Names the operations Sidekick should route to us (Search/Create/Configure/Publish).
    expect(summary).toMatch(/Create/);
    expect(summary).toMatch(/Publish/);
  });
});
