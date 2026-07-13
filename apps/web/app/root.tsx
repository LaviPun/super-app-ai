import type { LinksFunction, LoaderFunctionArgs, HeadersFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { useEffect } from 'react';
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useRouteError, useLocation } from '@remix-run/react';
import polarisCss from '@shopify/polaris/build/esm/styles.css?url';
import appCss from './app.css?url';
// SuperApp AI design-system (vendored from the Claude Design handoff bundle).
// Self-contained --p-*/--sa-* tokens + unprefixed .card/.btn/.page classes;
// does not collide with @shopify/polaris (.Polaris-* / --p-color-*).
import saPolarisCss from './styles/superapp/polaris.css?url';
import saShellCss from './styles/superapp/shell.css?url';
import saPagesCss from './styles/superapp/pages.css?url';
import saGenerateCss from './styles/superapp/generate.css?url';
import enTranslations from '@shopify/polaris/locales/en.json';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';
import { ActivityLogger } from '~/components/ActivityLogger';

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
  { rel: 'stylesheet', href: saPolarisCss },
  { rel: 'stylesheet', href: saShellCss },
  { rel: 'stylesheet', href: saPagesCss },
  { rel: 'stylesheet', href: saGenerateCss },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const isInternal = url.pathname.startsWith('/internal');

  // When running on port 4000 (internal admin server), send auth and root to internal login
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (port === '4000' && (url.pathname === '/' || url.pathname.startsWith('/auth'))) {
    return redirect('/internal/login');
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY || '',
    embedded: !isInternal,
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

function reportClientError(payload: { message: string; stack?: string; route?: string; source?: string; meta?: unknown }) {
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
  const { apiKey, embedded } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isInternal = location.pathname.startsWith('/internal');

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
        {/* Force rounded cards/banners so Polaris’s 0-radius on small viewports never wins */}
        <style dangerouslySetInnerHTML={{ __html: `
          .Polaris-ShadowBevel, .Polaris-LegacyCard, .Polaris-Banner { border-radius: 12px !important; overflow: hidden; }
          .Polaris-LegacyCard::before { border-radius: 12px !important; }
          .Polaris-LegacyCard .Polaris-LegacyCard__Section:first-child { border-top-left-radius: 12px !important; border-top-right-radius: 12px !important; }
          .Polaris-LegacyCard .Polaris-LegacyCard__Section:last-child { border-bottom-left-radius: 12px !important; border-bottom-right-radius: 12px !important; }
        ` }} />
      </head>
      <body>
        {embedded && !isInternal ? (
          <AppProvider isEmbeddedApp apiKey={apiKey}>
            <ClientErrorReporting />
            <ActivityLogger />
            {/* Shopify App Bridge top-level nav — rendered OUTSIDE the app (Shopify admin
                left rail). Matches the design's MERCHANT_NAV. In-app sub-tabs for Build
                (Modules/Flows/Connectors/Data/Templates) and Insights (Analytics/Activity)
                are rendered inside each page via <MerchantSubnav />. */}
            <s-app-nav>
              <Link to="/" rel="home">Dashboard</Link>
              <Link to="/modules">Build</Link>
              <Link to="/analytics">Insights</Link>
              <Link to="/settings">Settings</Link>
              <Link to="/billing">Billing</Link>
            </s-app-nav>
            <div className="app-content">
              <Outlet />
              <footer className="app-footer">Made with ❤️ by Lavi</footer>
            </div>
          </AppProvider>
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
