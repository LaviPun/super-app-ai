/**
 * applySecurityHeaders — the entry.server document-header hook.
 * /internal must ALWAYS be frame-ancestors 'none' (even with a ?shop= param —
 * otherwise a crafted link could make the internal admin frameable by a shop).
 * Everything else delegates to shopify-app-remix's addDocumentResponseHeaders.
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

import { applySecurityHeaders } from '~/security-headers.server';

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
});
