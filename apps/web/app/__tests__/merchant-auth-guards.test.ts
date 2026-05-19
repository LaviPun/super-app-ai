import { describe, expect, it, vi } from 'vitest';

const authenticateAdminMock = vi.fn();

vi.mock('~/shopify.server', () => ({
  shopify: {
    authenticate: {
      admin: authenticateAdminMock,
    },
  },
}));

describe('merchant route auth guards', () => {
  it('advanced index requires Shopify admin session', async () => {
    authenticateAdminMock.mockRejectedValueOnce(new Response(null, { status: 410 }));
    const mod = await import('~/routes/advanced._index');
    await expect(
      mod.loader({ request: new Request('http://test/advanced') } as never),
    ).rejects.toBeInstanceOf(Response);
    expect(authenticateAdminMock).toHaveBeenCalled();
  });

  it('picker index requires Shopify admin session', async () => {
    authenticateAdminMock.mockRejectedValueOnce(new Response(null, { status: 410 }));
    const mod = await import('~/routes/picker._index');
    await expect(
      mod.loader({ request: new Request('http://test/picker') } as never),
    ).rejects.toBeInstanceOf(Response);
    expect(authenticateAdminMock).toHaveBeenCalled();
  });
});
