/**
 * Shared Shopify Admin API configuration.
 * Use latest stable version; override via SHOPIFY_API_VERSION when needed.
 */
export const SHOPIFY_ADMIN_API_VERSION =
  process.env.SHOPIFY_API_VERSION ?? '2026-01';

export function adminGraphqlUrl(shop: string): string {
  return `https://${shop}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
}
