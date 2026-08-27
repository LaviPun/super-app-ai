import type { LinksFunction, LoaderFunctionArgs, HeadersFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useEffect } from 'react';
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useRouteError, useLocation } from '@remix-run/react';
import polarisCss from '@shopify/polaris/build/esm/styles.css?url';
import appCss from './app.css?url';
// Merchant surface (Polaris web-components migration) — light-DOM helpers only.
import merchantCss from './styles/merchant.css?url';
// NOTE: the vendored superapp design system (polaris.css/shell.css/pages.css)
// used to be linked globally here for generate._index.tsx, the last merchant
// route still on the legacy system. Now that it's migrated (WS-F Task 14),
// those three files are internal-admin-only and load via internal.tsx's own
// links() instead — see that file. generate.css was exclusively generate._
// index.tsx's CSS and is deleted outright (WS-F Task 15).
import enTranslations from '@shopify/polaris/locales/en.json';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { boundary } from '@shopify/shopify-app-remix/server';
import { ActivityLogger } from '~/components/ActivityLogger';
import { EmbeddedHeadScripts } from '~/components/EmbeddedHeadScripts';
import { isPublicStandalonePath } from '~/security-headers.server';

export const links: LinksFunction = () => [
  // Warm the font-host connections, then load both font stylesheets in parallel —
  // instead of a render-blocking @import that browsers only discover after polaris.css parses.
  { rel: 'preconnect', href: 'https://api.fontshare.com', crossOrigin: 'anonymous' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: 'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap' },
  { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap' },
  { rel: 'stylesheet', href: polarisCss },
  { rel: 'stylesheet', href: appCss },
  { rel: 'stylesheet', href: merchantCss },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  // Case-insensitive to match the router's own matching (see
  // security-headers.server.ts's isInternalRouteMatch for the same rule) —
  // a case-sensitive check here would misclassify e.g. `/Internal/login`.
  const isInternal = url.pathname.toLowerCase().startsWith('/internal');
  // Public, unauthenticated legal/info pages (/privacy, /contact, /terms —
  // see security-headers.server.ts). These carry no Shopify session and must
  // never render the embedded merchant shell (App Bridge script, s-app-nav,
  // etc.) or the Polaris merchant chrome — they're plain standalone pages.
  const isPublic = isPublicStandalonePath(url.pathname);

  // When running on port 4000 (internal admin server), send auth and root to internal login
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (port === '4000' && (url.pathname === '/' || url.pathname.startsWith('/auth'))) {
    return redirect('/internal/login');
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || '',
    embedded: !isInternal && !isPublic,
    isPublic,
  });
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        stack,
        route: location.pathname,
        source: 'ERROR_BOUNDARY',
        meta: { pathname: location.pathname },
      }),
    }).catch(() => {});
  }, [error, location.pathname]);

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// Vite/Remix's dev-mode HMR client (@remix-run/dev/dist/vite/static/refresh-utils.cjs)
// `throw`s a real Error — `[remix:hmr] No module update found for route ...` —
// when a hot-reload can't be resolved (e.g. edited a route with unsaved deps).
// That throw is dev-tooling-only: it's never present in a production
// `remix vite:build` bundle. But when it fires it's a genuine uncaught
// exception, so it bubbles to our global window 'error'/'unhandledrejection'
// listeners below like any other client bug and gets POSTed to
// /api/report-error — and if a developer's local `pnpm dev` happens to point
// at a shared (e.g. staging/production) database, that noise lands straight
// in the shared Error Log, drowning out real reports. HMR should never be
// mistaken for a production symptom, so filter it at the source (before the
// network call) rather than trying to distinguish it after ingestion.
const DEV_TOOLING_NOISE = /^\[(remix:hmr|vite)\]/i;

function isDevToolingNoise(message: string): boolean {
  return DEV_TOOLING_NOISE.test(message);
}

function reportClientError(payload: { message: string; stack?: string; route?: string; source?: string; meta?: unknown }) {
  if (isDevToolingNoise(payload.message)) return;
  fetch('/api/report-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, source: payload.source ?? 'CLIENT' }),
  }).catch(() => {});
}

function ClientErrorReporting() {
  const location = useLocation();
  useEffect(() => {
    const route = location.pathname;
    const onError = (event: ErrorEvent) => {
      reportClientError({
        message: event.message ?? String(event.error),
        stack: event.error instanceof Error ? event.error.stack : undefined,
        route,
        meta: { filename: event.filename, lineno: event.lineno, colno: event.colno },
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      const stack = event.reason instanceof Error ? event.reason.stack : undefined;
      reportClientError({ message, stack, route: location.pathname, meta: { type: 'unhandledrejection' } });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [location.pathname]);
  return null;
}

export default function App() {
  const { apiKey, embedded, isPublic } = useLoaderData<typeof loader>();
  const location = useLocation();
  // Same case-insensitive rule as the loader above / security-headers.server.ts.
  const isInternal = location.pathname.toLowerCase().startsWith('/internal');

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* App Store requirement (2025-10-15): app-bridge.js must be a plain
            <script> tag in <head>, before other scripts — see
            EmbeddedHeadScripts for the full ordering rationale (api-key meta,
            then app-bridge.js un-deferred, then polaris.js deferred). polaris.js
            defines the s-* web components (s-page, s-section, s-app-nav, …);
            app-bridge.js integrates s-page metadata with the admin title bar.
            Verified via in-iframe telemetry: without polaris.js the s-*
            elements never upgrade. Never injected on /privacy, /contact,
            /terms — those are plain standalone pages, not the embedded app. */}
        {embedded && !isInternal && !isPublic && <EmbeddedHeadScripts apiKey={apiKey} />}
        {/* Force rounded cards/banners so Polaris’s 0-radius on small viewports never wins */}
        <style dangerouslySetInnerHTML={{ __html: `
          .Polaris-ShadowBevel, .Polaris-LegacyCard, .Polaris-Banner { border-radius: 12px !important; overflow: hidden; }
          .Polaris-LegacyCard::before { border-radius: 12px !important; }
          .Polaris-LegacyCard .Polaris-LegacyCard__Section:first-child { border-top-left-radius: 12px !important; border-top-right-radius: 12px !important; }
          .Polaris-LegacyCard .Polaris-LegacyCard__Section:last-child { border-bottom-left-radius: 12px !important; border-bottom-right-radius: 12px !important; }
        ` }} />
      </head>
      <body>
        {isPublic ? (
          // Plain standalone page: no App Bridge, no Polaris provider, no
          // merchant/internal chrome — the route owns its own layout/styles.
          <Outlet />
        ) : embedded && !isInternal ? (
          <>
            <ClientErrorReporting />
            <ActivityLogger />
            {/* Shopify App Bridge top-level nav — rendered OUTSIDE the app (Shopify admin
                left rail). Matches the design's MERCHANT_NAV. In-app sub-tabs for Build
                (Modules/Flows/Connectors/Data/Templates) and Insights (Analytics/Activity)
                are rendered inside each page via <SubnavTabs /> (MerchantShell). */}
            <s-app-nav>
              <Link to="/" rel="home">Dashboard</Link>
              <Link to="/modules">Build</Link>
              <Link to="/analytics">Insights</Link>
              <Link to="/support">Support</Link>
              <Link to="/settings">Settings</Link>
              <Link to="/billing">Billing</Link>
            </s-app-nav>
            {/* No app footer inside Shopify admin — the embedded surface should
                read as native admin chrome end-to-end. */}
            <div className="app-content">
              <Outlet />
            </div>
          </>
        ) : (
          <PolarisProvider i18n={enTranslations}>
            <ClientErrorReporting />
            {isInternal ? (
              <div className="internal-admin-viewport">
                <Outlet />
              </div>
            ) : (
              <div className="app-content">
                <Outlet />
                <footer className="app-footer">Made with ❤️ by Lavi</footer>
              </div>
            )}
          </PolarisProvider>
        )}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
