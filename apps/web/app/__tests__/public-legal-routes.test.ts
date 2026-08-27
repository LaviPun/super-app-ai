/**
 * /privacy, /contact, /terms — public, unauthenticated Shopify-listing pages
 * (see routes/privacy.tsx, routes/contact.tsx, routes/terms.tsx).
 *
 * Deliberately does NOT mock `~/shopify.server` or `~/db.server`: these
 * loaders must not import or call either — if one of them accidentally grew
 * a `shopify.authenticate.admin(request)` call or a Prisma query, importing
 * the route module (or invoking its loader) would throw here (no mocked
 * client, no DATABASE_URL-backed Prisma instance under vitest), which is
 * exactly the failure mode this suite exists to catch. The healthz.test.ts
 * suite instead mocks `~/db.server` because /healthz is *supposed* to touch
 * the database; these routes are not.
 */
import { describe, expect, it } from 'vitest';

async function loadRoute(path: 'privacy' | 'contact' | 'terms') {
  return import(`~/routes/${path}.tsx`);
}

describe.each([
  ['privacy', '/privacy'],
  ['contact', '/contact'],
  ['terms', '/terms'],
] as const)('GET %s', (routeFile, _path) => {
  it('loader returns 200 with a JSON body (no auth, no redirect)', async () => {
    const { loader } = await loadRoute(routeFile);
    const res = await loader();
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    // A redirect (e.g. into Shopify OAuth) would carry a 3xx status and a
    // Location header — assert neither shows up.
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('location')).toBeNull();
  });

  it('module exports no `action` (GET-only resource)', async () => {
    const mod = await loadRoute(routeFile);
    expect(mod.action).toBeUndefined();
  });

  it('default export renders without throwing and includes the support email', async () => {
    const mod = await loadRoute(routeFile);
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const Component = mod.default;
    const html = renderToStaticMarkup(React.createElement(Component));
    expect(html).toContain('support@lavipun.com');
  });
});
