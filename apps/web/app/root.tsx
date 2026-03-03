import type { LinksFunction, LoaderArgs, HeadersFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useRouteError, useLocation } from '@remix-run/react';
import polarisCss from '@shopify/polaris/build/esm/styles.css?url';
import enTranslations from '@shopify/polaris/locales/en.json';
import { AppProvider as PolarisProvider } from '@shopify/polaris';
import { AppProvider } from '@shopify/shopify-app-remix/react';
import { boundary } from '@shopify/shopify-app-remix/server';

export const links: LinksFunction = () => [{ rel: 'stylesheet', href: polarisCss }];

export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url);
  const isInternal = url.pathname.startsWith('/internal');

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
        <Meta />
        <Links />
      </head>
      <body>
        {embedded && !isInternal ? (
          <AppProvider isEmbeddedApp apiKey={apiKey}>
            <s-app-nav>
              <Link to="/" rel="home">Home</Link>
              <Link to="/connectors">Connectors</Link>
              <Link to="/flows">Flows</Link>
              <Link to="/billing">Billing</Link>
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
