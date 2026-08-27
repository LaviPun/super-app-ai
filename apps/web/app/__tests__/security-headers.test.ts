/**
 * applySecurityHeaders — the entry.server document-header hook.
 * /internal must ALWAYS be frame-ancestors 'none' (even with a ?shop= param —
 * otherwise a crafted link could make the internal admin frameable by a shop).
 * Everything else delegates to shopify-app-remix's addDocumentResponseHeaders.
 *
 * React Router matches paths case-insensitively by default (@remix-run/router),
 * so a case-sensitive `/internal` prefix check can be bypassed by a request
 * like `/Internal/login` — the router still routes it to the internal admin,
 * but a naive re-parse of the URL would classify it as a merchant route and
 * fall through to the permissive per-shop CSP. Covered below both for the
 * pathname-fallback path (no route-match info) and for the preferred
 * matched-route path (isInternalRouteMatch / the third applySecurityHeaders
 * argument, exactly as entry.server.tsx calls it).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  addDocumentResponseHeaders: vi.fn((request: Request, headers: Headers) => {
    // Mirror the real helper's observable behavior (embedded app):
    const shop = new URL(request.url).searchParams.get('shop');
    if (shop) {
      headers.set(
        'Content-Security-Policy',
        `frame-ancestors https://${shop} https://admin.shopify.com;`,
      );
    }
  }),
}));

vi.mock('~/shopify.server', () => ({
  addDocumentResponseHeaders: hoisted.addDocumentResponseHeaders,
}));

import { applySecurityHeaders, isInternalRouteMatch, isPublicStandalonePath } from '~/security-headers.server';

beforeEach(() => vi.clearAllMocks());

describe('applySecurityHeaders', () => {
  it('delegates embedded document requests to addDocumentResponseHeaders (per-shop CSP)', () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/modules?shop=test-shop.myshopify.com&embedded=1'),
      headers,
    );
    expect(hoisted.addDocumentResponseHeaders).toHaveBeenCalledTimes(1);
    expect(headers.get('Content-Security-Policy')).toBe(
      'frame-ancestors https://test-shop.myshopify.com https://admin.shopify.com;',
    );
  });

  it("forces frame-ancestors 'none' on /internal and never calls the shopify helper", () => {
    const headers = new Headers();
    applySecurityHeaders(new Request('https://app.example.com/internal/login'), headers);
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });

  it("keeps 'none' on /internal even when a shop param is appended", () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/internal/stores?shop=evil.myshopify.com'),
      headers,
    );
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });

  it("keeps 'none' on a mixed-case /Internal path with a forged shop param (router matches case-insensitively)", () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/Internal/login?shop=evil.myshopify.com'),
      headers,
    );
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });

  it("keeps 'none' on an all-caps /INTERNAL path with a forged shop param", () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/INTERNAL?shop=evil.myshopify.com'),
      headers,
    );
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });

  it('still applies the per-shop CSP on a lowercase merchant route with a shop param', () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/orders?shop=test-shop.myshopify.com'),
      headers,
    );
    expect(hoisted.addDocumentResponseHeaders).toHaveBeenCalledTimes(1);
    expect(headers.get('Content-Security-Policy')).toBe(
      'frame-ancestors https://test-shop.myshopify.com https://admin.shopify.com;',
    );
  });

  it('treats an explicit isInternalRoute=true (as entry.server.tsx passes it) as authoritative, overriding the pathname', () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/orders?shop=evil.myshopify.com'),
      headers,
      true,
    );
    expect(headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
    expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
  });

  it('treats an explicit isInternalRoute=false as authoritative, delegating even on an /internal-looking path', () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/internal-lookalike?shop=test-shop.myshopify.com'),
      headers,
      false,
    );
    expect(hoisted.addDocumentResponseHeaders).toHaveBeenCalledTimes(1);
  });

  describe.each(['/privacy', '/contact', '/terms'])('public standalone page %s', (path) => {
    it('gets plain, non-embedded headers and never calls the shopify helper', () => {
      const headers = new Headers();
      applySecurityHeaders(new Request(`https://app.example.com${path}`), headers);
      expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'none'");
      expect(headers.get('X-Frame-Options')).toBe('DENY');
      expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
    });

    it('stays on the plain-header branch even with a forged ?shop= param (no embedded-CSP downgrade)', () => {
      const headers = new Headers();
      applySecurityHeaders(
        new Request(`https://app.example.com${path}?shop=evil.myshopify.com`),
        headers,
      );
      expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'none'");
      expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
    });

    it('is matched case-insensitively, same as the internal-route check', () => {
      const headers = new Headers();
      applySecurityHeaders(new Request(`https://app.example.com${path.toUpperCase()}`), headers);
      expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'; frame-ancestors 'none'");
      expect(hoisted.addDocumentResponseHeaders).not.toHaveBeenCalled();
    });
  });

  it('does not treat a public-path lookalike as public (exact match only)', () => {
    const headers = new Headers();
    applySecurityHeaders(
      new Request('https://app.example.com/privacy-policy-lookalike?shop=test-shop.myshopify.com'),
      headers,
    );
    expect(hoisted.addDocumentResponseHeaders).toHaveBeenCalledTimes(1);
  });
});

describe('isPublicStandalonePath', () => {
  it.each(['/privacy', '/contact', '/terms'])('returns true for %s', (path) => {
    expect(isPublicStandalonePath(path)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isPublicStandalonePath('/Privacy')).toBe(true);
    expect(isPublicStandalonePath('/CONTACT')).toBe(true);
  });

  it('returns false for unrelated or nested paths', () => {
    expect(isPublicStandalonePath('/privacy/sub')).toBe(false);
    expect(isPublicStandalonePath('/internal')).toBe(false);
    expect(isPublicStandalonePath('/support')).toBe(false);
    expect(isPublicStandalonePath('/')).toBe(false);
  });
});

describe('isInternalRouteMatch', () => {
  it('returns false when matches is undefined', () => {
    expect(isInternalRouteMatch(undefined)).toBe(false);
  });

  it('returns false when no matched route is under routes/internal', () => {
    expect(
      isInternalRouteMatch([{ route: { id: 'routes/orders' } }, { route: { id: 'routes/modules' } }]),
    ).toBe(false);
  });

  it('returns true for the exact routes/internal root match', () => {
    expect(isInternalRouteMatch([{ route: { id: 'routes/internal' } }])).toBe(true);
  });

  it('returns true for a nested routes/internal.* match regardless of URL casing that produced it', () => {
    // This is what the router hands entry.server.tsx after resolving a
    // request like /Internal/login — the route id itself is unaffected by
    // the casing of the incoming URL.
    expect(
      isInternalRouteMatch([{ route: { id: 'routes/internal.login' } }]),
    ).toBe(true);
  });

  it('does not false-positive on an unrelated route id that merely starts with the same characters', () => {
    expect(isInternalRouteMatch([{ route: { id: 'routes/internal-lookalike' } }])).toBe(false);
  });
});
