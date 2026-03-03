import '@shopify/shopify-app-remix/server/adapters/node';
import { shopifyApp, AppDistribution } from '@shopify/shopify-app-remix/server';
import { LATEST_API_VERSION } from '@shopify/shopify-api';
import { getSessionStorage } from '~/session.server';
import { validateEnv } from '~/env.server';
import { initOtel } from '~/services/observability/otel.server';

initOtel();

if (process.env.NODE_ENV !== 'test') validateEnv();

export const shopify = shopifyApp({
  sessionStorage: getSessionStorage(),
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: LATEST_API_VERSION,
  scopes: process.env.SCOPES?.split(',') ?? [],
  appUrl: process.env.SHOPIFY_APP_URL!,
  isEmbeddedApp: true,
  distribution: AppDistribution.AppStore,
  authPathPrefix: '/auth',
  future: {
    unstable_newEmbeddedAuthStrategy: true,
  },
});
