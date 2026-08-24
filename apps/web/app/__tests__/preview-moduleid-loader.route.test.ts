import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// WS-F Commit 0 fold-in (a): route-level test for preview.$moduleId.tsx's
// loader — a garbage/expired/wrong-module token must throw (no data ever
// reaches the client), and a valid token must authorize a 200 with the
// module's rendered preview. Uses real mintPreviewToken/verifyPreviewToken
// (not mocked) so the token boundary itself is exercised, not just the
// route's plumbing around it.

beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
});

const hoisted = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(async () => ({ session: { shop: 'session-shop.myshopify.com' } })),
  getModule: vi.fn(async (shop: string) => ({
    id: 'mod_1',
    shopId: 'shop_1',
    versions: [{ id: 'ver_1', status: 'DRAFT', specJson: JSON.stringify({ type: 'theme.section', config: {} }) }],
    activeVersion: null,
    __resolvedShop: shop,
  })),
  parse: vi.fn((jsonString: string) => JSON.parse(jsonString)),
  render: vi.fn(() => ({ kind: 'HTML', html: '<div>preview</div>' })),
  loadStoreAesthetic: vi.fn(async () => null),
  schedulePreviewExport: vi.fn(async () => {}),
}));

vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: hoisted.authenticateAdmin } },
}));
vi.mock('~/services/modules/module.service', () => ({
  ModuleService: class {
    getModule = hoisted.getModule;
  },
}));
vi.mock('~/services/recipes/recipe.service', () => ({
  RecipeService: class {
    parse = hoisted.parse;
  },
}));
vi.mock('~/services/preview/preview.service', () => ({
  PreviewService: class {
    render = hoisted.render;
  },
}));
vi.mock('~/services/preview/preview-export.queue.server', () => ({
  schedulePreviewExport: hoisted.schedulePreviewExport,
}));
vi.mock('~/services/ai/design-reference.server', () => ({
  loadStoreAesthetic: hoisted.loadStoreAesthetic,
}));

function req(url: string) {
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.authenticateAdmin.mockResolvedValue({ session: { shop: 'session-shop.myshopify.com' } });
  hoisted.getModule.mockImplementation(async (shop: string) => ({
    id: 'mod_1',
    shopId: 'shop_1',
    versions: [{ id: 'ver_1', status: 'DRAFT', specJson: JSON.stringify({ type: 'theme.section', config: {} }) }],
    activeVersion: null,
    __resolvedShop: shop,
  }));
  hoisted.parse.mockImplementation((jsonString: string) => JSON.parse(jsonString));
  hoisted.render.mockReturnValue({ kind: 'HTML', html: '<div>preview</div>' });
  hoisted.loadStoreAesthetic.mockResolvedValue(null);
  hoisted.schedulePreviewExport.mockResolvedValue(undefined);
});

describe('preview.$moduleId loader — token auth (WS-F Commit 0 fold-in a)', () => {
  it('a garbage token throws — no module data is ever read', async () => {
    const { loader } = await import('~/routes/preview.$moduleId');
    await expect(
      loader({ request: req('https://app.test/preview/mod_1?token=not-a-real-token'), params: { moduleId: 'mod_1' } } as never),
    ).rejects.toThrow();
    expect(hoisted.getModule).not.toHaveBeenCalled();
  });

  it('an expired token throws', async () => {
    const { mintPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' }, -1);
    const { loader } = await import('~/routes/preview.$moduleId');
    await expect(
      loader({ request: req(`https://app.test/preview/mod_1?token=${encodeURIComponent(token)}`), params: { moduleId: 'mod_1' } } as never),
    ).rejects.toThrow(/expired/i);
    expect(hoisted.getModule).not.toHaveBeenCalled();
  });

  it('a token minted for a different module throws', async () => {
    const { mintPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_OTHER' });
    const { loader } = await import('~/routes/preview.$moduleId');
    await expect(
      loader({ request: req(`https://app.test/preview/mod_1?token=${encodeURIComponent(token)}`), params: { moduleId: 'mod_1' } } as never),
    ).rejects.toThrow();
    expect(hoisted.getModule).not.toHaveBeenCalled();
  });

  it('a valid token authorizes a 200 with the rendered module', async () => {
    const { mintPreviewToken } = await import('~/services/security/preview-token.server');
    const token = mintPreviewToken({ shop: 'acme.myshopify.com', moduleId: 'mod_1' });
    const { loader } = await import('~/routes/preview.$moduleId');
    const res = (await loader({
      request: req(`https://app.test/preview/mod_1?token=${encodeURIComponent(token)}`),
      params: { moduleId: 'mod_1' },
    } as never)) as Response;
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('preview');
    // The shop used to resolve the module came from the token, not a
    // trusted-as-is query param or the (absent) admin session.
    expect(hoisted.getModule).toHaveBeenCalledWith('acme.myshopify.com', 'mod_1');
    expect(hoisted.authenticateAdmin).not.toHaveBeenCalled();
  });
});
