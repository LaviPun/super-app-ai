import type { LoaderArgs } from '@remix-run/node';
import { shopify } from '~/shopify.server';

// Handles /auth and /auth/callback via splat route.
export async function loader({ request }: LoaderArgs) {
  await shopify.authenticate.admin(request);
  return null;
}
