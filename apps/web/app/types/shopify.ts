import type { shopify } from '~/shopify.server';

/**
 * The full authenticated admin context returned by shopify.authenticate.admin().
 * '@shopify/shopify-app-remix/server' does not export AdminApiContext publicly,
 * so we derive it here from the shopifyApp instance.
 * Callers that want just the admin graphql/rest client use `AdminApiContext['admin']`.
 */
export type AdminApiContext = Awaited<ReturnType<typeof shopify.authenticate.admin>>;
