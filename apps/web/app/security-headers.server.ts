import { addDocumentResponseHeaders } from '~/shopify.server';

const INTERNAL_ROUTE_ID = 'routes/internal';
const INTERNAL_ROUTE_ID_PREFIX = `${INTERNAL_ROUTE_ID}.`;

/**
 * True when any matched route for this request is the /internal admin (or a
 * descendant of it). Route ids follow Remix's flat-routes file convention —
 * app/routes/internal.tsx -> "routes/internal",
 * app/routes/internal.login.tsx -> "routes/internal.login", etc. — and
 * `matches` comes straight from the router's own resolution
 * (remixContext.staticHandlerContext.matches in entry.server.tsx), so this
 * check uses the SAME case-insensitive matching Remix already used to serve
 * the request. That's deliberate: React Router matches paths
 * case-insensitively by default (@remix-run/router), so re-parsing the URL
 * ourselves with a case-sensitive comparison can disagree with the router
 * and misclassify a request like `/Internal/login` as non-internal.
 */
export function isInternalRouteMatch(
  matches: ReadonlyArray<{ route: { id: string } }> | undefined,
): boolean {
  if (!matches) return false;
  return matches.some(
    (match) => match.route.id === INTERNAL_ROUTE_ID || match.route.id.startsWith(INTERNAL_ROUTE_ID_PREFIX),
  );
}

/**
 * Document-level security headers, applied in entry.server.tsx for every
 * server-rendered HTML response. This only covers document responses that
 * actually reach entry.server — redirects and other no-body responses
 * bypass it entirely, so it isn't blanket coverage for every response the
 * app can emit (see apps/web/app/routes/internal.tsx's own `headers()`
 * export, which independently covers /internal's redirect responses).
 *
 * - /internal is a standalone admin: always frame-ancestors 'none' (matches
 *   apps/web/app/routes/internal.tsx headers; guarded here so a ?shop= query
 *   param can never downgrade it via the shopify helper below).
 *   `isInternalRoute` should be the router's own verdict — pass
 *   `isInternalRouteMatch(remixContext.staticHandlerContext.matches)` from
 *   entry.server.tsx — so this can never disagree with what Remix actually
 *   served. When that isn't available (e.g. a direct/unit-test call), this
 *   falls back to a case-insensitive path-prefix check for the same reason
 *   noted above: a case-sensitive fallback would silently reintroduce the
 *   same class of bug the matched-route check exists to avoid.
 * - Everything else gets shopify-app-remix's per-shop CSP + app-bridge
 *   preload Link header (App Store iframe-protection requirement).
 */
export function applySecurityHeaders(
  request: Request,
  headers: Headers,
  isInternalRoute?: boolean,
): void {
  const path = new URL(request.url).pathname.toLowerCase();
  const internal = isInternalRoute ?? (path === '/internal' || path.startsWith('/internal/'));
  if (internal) {
    headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return;
  }
  addDocumentResponseHeaders(request, headers);
}
