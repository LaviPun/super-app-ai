import type { AuthContext } from '@superapp/core';
import { getPrisma } from '~/db.server';

/**
 * R3.5 durable scheduler — per-tenant auth resolver for resumed (parked) runs
 * (specs/031 durable-scheduler.md §5c).
 *
 * A parked remainder loses the request-scoped Shopify `admin`, so a resumed step
 * that touches Shopify must authenticate with the OFFLINE token stored on the
 * Shop row (persisted at install). This mirrors the linear runner's per-step auth
 * so a delayed step behaves identically to an inline one.
 *
 * `tenantId` is the shopId (WorkflowRun.tenantId === Shop.id). Providers other
 * than shopify carry their auth in the step inputs (slack webhook URL) or read
 * an env key (email), matching the live FlowRunnerService step handlers.
 */
export function buildShopAuthResolver(tenantId: string): (provider: string) => Promise<AuthContext> {
  return async (provider: string): Promise<AuthContext> => {
    switch (provider) {
      case 'shopify': {
        const prisma = getPrisma();
        const shop = await prisma.shop.findUnique({ where: { id: tenantId } });
        if (!shop || !shop.accessToken) {
          // Fail loud at invoke time via the connector's AUTH check rather than
          // pretending: return an empty-token shopify context so the Shopify
          // connector rejects it (never a silent success). The uninstall sweep
          // (F12) cancels WAITING runs for dead shops, so this is the rare
          // scope-revoked case.
          throw new Error(`No offline Shopify token for shop ${tenantId} (uninstalled or token revoked)`);
        }
        return { type: 'shopify', shop: shop.shopDomain, accessToken: shop.accessToken };
      }
      case 'email':
        return { type: 'api_key', apiKey: process.env.EMAIL_API_KEY ?? '' };
      case 'slack':
      case 'http':
      case 'superapp':
      default:
        return { type: 'none' };
    }
  };
}
