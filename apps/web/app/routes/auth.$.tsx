import type { LoaderArgs, HeadersFunction } from '@remix-run/node';
import { redirect } from '@remix-run/node';
import { boundary } from '@shopify/shopify-app-remix/server';
import { authenticate } from '~/shopify.server';

export async function loader({ request }: LoaderArgs) {
  const url = new URL(request.url);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (port === '4000') {
    return redirect('/internal/login');
  }
  await authenticate.admin(request);
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
