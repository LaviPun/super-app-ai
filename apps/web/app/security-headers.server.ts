import { addDocumentResponseHeaders } from '~/shopify.server';

/**
 * Document-level security headers, applied in entry.server.tsx for every
 * server-rendered HTML response.
 *
 * - /internal is a standalone admin: always frame-ancestors 'none'
 *   (matches apps/web/app/routes/internal.tsx headers; guarded here so a
 *   ?shop= query param can never downgrade it via the shopify helper).
 * - Everything else gets shopify-app-remix's per-shop CSP + app-bridge
 *   preload Link header (App Store iframe-protection requirement).
 */
export function applySecurityHeaders(request: Request, headers: Headers): void {
  const { pathname } = new URL(request.url);
  if (pathname === '/internal' || pathname.startsWith('/internal/')) {
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return;
  }
  addDocumentResponseHeaders(request, headers);
}
