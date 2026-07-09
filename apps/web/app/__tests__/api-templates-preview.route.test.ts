import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_TEMPLATES } from '@superapp/core';

/**
 * Route test for the merchant-safe template preview endpoint
 * (`/api/templates/:id/preview`) added to fix identical gallery thumbnails.
 *
 * Mirrors the auth-mock pattern in `connector-test-routes.test.ts`: the real
 * Shopify admin authentication is stubbed so we exercise the loader's own
 * behaviour (lookup, render, error codes), not the Shopify session pipeline.
 */
const authenticateAdminMock = vi.fn();
vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      admin: authenticateAdminMock,
    },
  },
}));

// Two real template ids from different categories, chosen at load time so the
// test tracks the actual library rather than hard-coded fixtures.
const htmlTemplates = MODULE_TEMPLATES.filter((t) => t.category === 'STOREFRONT_UI');
const idA = htmlTemplates[0]?.id;
const idB = htmlTemplates[1]?.id;

const importRoute = () => import('~/routes/api.templates.$templateId.preview');
const call = async (templateId: string | undefined, url = 'https://app.example/api/templates/x/preview') => {
  const mod = await importRoute();
  return mod.loader({ request: new Request(url), params: { templateId } } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdminMock.mockResolvedValue({ session: { shop: 'shop.example.myshopify.com' } });
});

describe('GET /api/templates/:id/preview', () => {
  it('requires admin authentication before doing any work', async () => {
    authenticateAdminMock.mockRejectedValueOnce(new Response(null, { status: 302 }));
    await expect(call(idA)).rejects.toBeInstanceOf(Response);
    expect(authenticateAdminMock).toHaveBeenCalledOnce();
  });

  it('returns 400 when the template id is missing', async () => {
    const res = await call(undefined);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it('returns 404 for an unknown template id', async () => {
    const res = await call('__does_not_exist__');
    expect(res.status).toBe(404);
  });

  it('returns rendered HTML for a known template', async () => {
    expect(idA, 'expected at least one STOREFRONT_UI template in the library').toBeTruthy();
    const res = await call(idA);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { html?: string };
    expect(typeof body.html).toBe('string');
    expect(body.html!.length).toBeGreaterThan(0);
  });

  it('returns different HTML for two different templates (the gallery bug)', async () => {
    expect(idB, 'expected at least two STOREFRONT_UI templates in the library').toBeTruthy();
    const a = (await (await call(idA)).json()) as { html?: string };
    const b = (await (await call(idB)).json()) as { html?: string };
    expect(a.html).toBeTruthy();
    expect(b.html).toBeTruthy();
    expect(a.html).not.toBe(b.html);
  });
});
