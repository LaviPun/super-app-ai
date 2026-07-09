import type { LoaderFunctionArgs, HeadersFunction } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { boundary } from '@shopify/shopify-app-remix/server';
import { authenticate, login } from '~/shopify.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');

  if (port === '4000') {
    return redirect('/internal/login');
  }

  // On localhost with no shop param: treat as admin opening in browser → internal admin login.
  const shop = url.searchParams.get('shop');
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocalhost && !shop) {
    return redirect('/internal/login');
  }

  // The configured login path (authPathPrefix '/auth' -> '/auth/login') must call
  // shopify.login(), not authenticate.admin(), per @shopify/shopify-app-remix.
  if (params['*'] === 'login') {
    await login(request);
    return null;
  }

  await authenticate.admin(request);
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
