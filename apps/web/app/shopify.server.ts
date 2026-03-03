import '@shopify/shopify-app-remix/server/adapters/node';
import { AppDistribution, shopifyApp } from '@shopify/shopify-app-remix/server';
import { LATEST_API_VERSION } from '@shopify/shopify-api';
import { getSessionStorage } from '~/session.server';
import { validateEnv } from '~/env.server';
import { initOtel } from '~/services/observability/otel.server';

initOtel();

if (process.env.NODE_ENV !== 'test') validateEnv();

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(','),
  appUrl: process.env.SHOPIFY_APP_URL || '',
  authPathPrefix: '/auth',
  sessionStorage: getSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export { shopify };
export const apiVersion = LATEST_API_VERSION;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
