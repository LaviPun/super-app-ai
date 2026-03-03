import type { LoaderArgs, HeadersFunction } from '@remix-run/node';
import { boundary } from '@shopify/shopify-app-remix/server';
import { authenticate } from '~/shopify.server';

export async function loader({ request }: LoaderArgs) {
  await authenticate.admin(request);
  return null;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
