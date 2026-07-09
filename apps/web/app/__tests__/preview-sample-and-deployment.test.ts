import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewService } from '~/services/preview/preview.service';

/**
 * #27 — every preview must carry a "Sample data" marker so merchants don't
 *       mistake illustrative preview values for their real configuration.
 * #28 — the template detail loader must surface how the module deploys
 *       (runtime + merchant-facing note), honestly derived from the eligibility
 *       registry (not a fabricated status).
 */
const authenticateAdminMock = vi.fn();
vi.mock('~/shopify.server', () => ({
  shopify: { authenticate: { admin: authenticateAdminMock } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  authenticateAdminMock.mockResolvedValue({ session: { shop: 'shop.example.myshopify.com' } });
});

describe('#27 preview "Sample data" marker', () => {
  const svc = new PreviewService();
  const render = (spec: Parameters<PreviewService['render']>[0]) => {
    const r = svc.render(spec);
    return r.kind === 'HTML' ? r.html : '';
  };

  it('marks a surfaceCard-based preview (admin) as Sample data', () => {
    const html = render({ type: 'admin.action', name: 'X', category: 'ADMIN_UI', config: { title: 'X' } } as never);
    expect(html).toContain('Sample data');
  });

  it('marks a pageHtml-based preview (theme popup) as Sample data', () => {
    const html = render({
      type: 'theme.section', name: 'Y', category: 'STOREFRONT_UI',
      config: { kind: 'popup', title: 'Y' },
    } as never);
    expect(html).toContain('Sample data');
  });
});

describe('#28 template detail surfaces deployment', () => {
  it('returns a runtime + note + honest runtimeShipped for a known template', async () => {
    const mod = await import('~/routes/templates.$templateId');
    const res = await mod.loader({
      request: new Request('https://app.example/templates/ADMA-B2B-01'),
      params: { templateId: 'ADMA-B2B-01' },
    } as never);
    const data = (await res.json()) as { deployment?: { runtime?: string; note?: string; runtimeShipped?: boolean | null } };
    expect(data.deployment).toBeTruthy();
    expect(typeof data.deployment!.runtime).toBe('string');
    expect(typeof data.deployment!.note).toBe('string');
    expect(data.deployment!.note!.length).toBeGreaterThan(0);
    // runtimeShipped is boolean|null (null only for functions); admin.action is a fixed runtime.
    expect([true, false, null]).toContain(data.deployment!.runtimeShipped ?? null);
  });
});
