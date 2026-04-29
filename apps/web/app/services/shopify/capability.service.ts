import type { PlanTier, Capability } from '@superapp/core';
import { MIN_PLAN_FOR_CAPABILITY } from '@superapp/core';
import type { AdminApiContext } from '~/types/shopify';
import { getPrisma } from '~/db.server';

export class CapabilityService {
  async refreshPlanTier(shopDomain: string, admin: AdminApiContext['admin']): Promise<PlanTier> {
    const tier = await this.fetchPlanTier(admin);
    const prisma = getPrisma();
    await prisma.shop.update({
      where: { shopDomain },
      data: { planTier: tier },
    });
    return tier;
  }

  async getPlanTier(shopDomain: string): Promise<PlanTier> {
    const prisma = getPrisma();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    return (shop?.planTier as PlanTier) ?? 'UNKNOWN';
  }

  isCapabilityGated(cap: Capability): boolean {
    return Boolean(MIN_PLAN_FOR_CAPABILITY[cap]);
  }

  explainCapabilityGate(cap: Capability): string | null {
    const min = MIN_PLAN_FOR_CAPABILITY[cap];
    if (!min) return null;
    if (cap === 'CHECKOUT_UI_INFO_SHIP_PAY') {
      return 'Checkout UI extensions on Information/Shipping/Payment steps require Shopify Plus.';
    }
    if (cap === 'CART_TRANSFORM_FUNCTION_UPDATE') {
      return 'Cart Transform update operations require Shopify Plus.';
    }
    return `Requires ${min}.`;
  }

  private async fetchPlanTier(admin: AdminApiContext['admin']): Promise<PlanTier> {
    // Keep this query minimal to reduce latency.
    const query = `#graphql
      query ShopPlan {
        shop {
          plan {
            publicDisplayName
          }
        }
      }
    `;
    const res = await admin.graphql(query);
    const json = await res.json();

    const displayName: string | undefined = json?.data?.shop?.plan?.publicDisplayName;
    if (!displayName) return 'UNKNOWN';
    const normalized = displayName.toLowerCase();
    if (normalized.includes('plus')) return 'PLUS';
    if (normalized.includes('advanced')) return 'ADVANCED';
    if (normalized.includes('grow')) return 'GROW';
    if (normalized.includes('basic')) return 'BASIC';
    if (normalized.includes('starter')) return 'STARTER';
    return 'UNKNOWN';
  }
}
