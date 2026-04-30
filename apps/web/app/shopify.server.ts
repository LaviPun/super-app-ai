import '@shopify/shopify-app-remix/server/adapters/node';
import { AppDistribution, shopifyApp } from '@shopify/shopify-app-remix/server';
import { getSessionStorage } from '~/session.server';
import { validateEnv } from '~/env.server';
import { initOtel } from '~/services/observability/otel.server';
import { ActivityLogService } from '~/services/activity/activity.service';

initOtel();
const SHOPIFY_API_VERSION = '2026-01';

if (process.env.NODE_ENV !== 'test') validateEnv();

let serverStartLogged = false;
if (process.env.NODE_ENV !== 'test' && !serverStartLogged) {
  serverStartLogged = true;
  void new ActivityLogService()
    .log({ actor: 'SYSTEM', action: 'SERVER_STARTED', details: { at: new Date().toISOString() } })
    .catch(() => {});
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: SHOPIFY_API_VERSION as any,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL || '',
  authPathPrefix: '/auth',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionStorage: getSessionStorage() as any,
  distribution: AppDistribution.AppStore,
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export { shopify };
export const apiVersion = SHOPIFY_API_VERSION;
// HTML document headers are emitted via boundary.headers in app/root.tsx.
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
