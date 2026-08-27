import { describe, it, expect, vi, beforeEach } from 'vitest';

// WS-F Task 7: SchemaForm's save path — POST /api/modules/:moduleId/update-config
// merges the merchant-edited `config` into the current draft spec and persists it
// as a new DRAFT version via ModuleService.createNewVersion (the existing
// "save a config edit as a new draft" primitive — same one Modify-with-AI's
// applyFetcher uses).

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 's.myshopify.com' } })),
  getModule: vi.fn(async () => ({
    id: 'mod_1',
    versions: [{ id: 'ver_1', status: 'DRAFT', specJson: JSON.stringify({ type: 'theme.section', config: { label: 'old' } }) }],
  })),
  createNewVersion: vi.fn(async () => ({ id: 'ver_2', version: 3 })),
  log: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({ shopify: { authenticate: { admin: hoisted.authenticateAdmin } } }));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    getModule = hoisted.getModule;
    createNewVersion = hoisted.createNewVersion;
  },
}));
vi.mock('~/services/activity/activity.service', () => ({
  ActivityLogService: class {
    log = hoisted.log;
  },
}));

function req(configJson: string) {
  const fd = new FormData();
  fd.set('configJson', configJson);
  return new Request('https://app.test/api/modules/mod_1/update-config', { method: 'POST', body: fd });
}

beforeEach(() => vi.clearAllMocks());

describe('api.modules.$moduleId.update-config (WS-F: SchemaForm save path)', () => {
  it('merges the new config into the spec and saves as a new draft version', async () => {
    const { action } = await import('~/routes/api.modules.$moduleId.update-config');
    const res = await action({ request: req(JSON.stringify({ label: 'new' })), params: { moduleId: 'mod_1' } } as never);
    const payload = await res.json();
    expect(payload).toMatchObject({ ok: true, version: 3 });
    const call = hoisted.createNewVersion.mock.calls[0] as unknown as [string, string, { config: unknown; type: string }];
    const spec = call[2];
    expect(spec.config).toEqual({ label: 'new' });
    expect(spec.type).toBe('theme.section'); // type/other branches untouched
  });

  it('400s on malformed configJson', async () => {
    const { action } = await import('~/routes/api.modules.$moduleId.update-config');
    const res = await action({ request: req('not json'), params: { moduleId: 'mod_1' } } as never);
    expect(res.status).toBe(400);
  });

  it('404s when the module does not exist', async () => {
    hoisted.getModule.mockResolvedValueOnce(null as never);
    const { action } = await import('~/routes/api.modules.$moduleId.update-config');
    const res = await action({ request: req('{}'), params: { moduleId: 'mod_missing' } } as never);
    expect(res.status).toBe(404);
  });

  it('400s when moduleId param is missing', async () => {
    const { action } = await import('~/routes/api.modules.$moduleId.update-config');
    const res = await action({ request: req('{}'), params: {} } as never);
    expect(res.status).toBe(400);
  });
});
