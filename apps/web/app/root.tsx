import type { LinksFunction, LoaderArgs, HeadersFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useRouteError, useLocation } from '@remix-run/react';
import polarisCss from '@shopify/polaris/build/esm/styles.css?url';
import appCss from './app.css?url';
import enTranslations from '@shopify/polaris/locales/en.json';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: polarisCss },
  { rel: 'stylesheet', href: appCss },
];

export async function loader({ request }: LoaderArgs) {
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
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

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
            <s-app-nav>
              <Link to="/" rel="home">Home</Link>
              <Link to="/modules">Modules</Link>
              <Link to="/connectors">Connectors</Link>
              <Link to="/flows">Flows</Link>
              <Link to="/data">Data</Link>
              <Link to="/billing">Billing</Link>
              <Link to="/settings">Settings</Link>
            </s-app-nav>
            <Outlet />
          </AppProvider>
        ) : (
          <PolarisProvider i18n={enTranslations}>
            <Outlet />
          </PolarisProvider>
        )}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
