import { getPrisma } from '~/db.server';
import { getPlanConfig as getPlanConfigFromDb } from './plan-config.service';

export type BillingPlan = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

/**
 * The billing plan of record lives on AppSubscription, not Shop.planTier
 * (which is the Shopify SHOP plan and is no longer written by billing code
 * post-App-Pricing-migration). A subscription row with a non-ACTIVE status
 * (e.g. CANCELLED/EXPIRED left over from a prior cycle) must NOT be read as
 * the merchant's plan — treat it as FREE. Use this everywhere a billing plan
 * is displayed/filtered from a `subscription` relation so the rule stays
 * consistent across merchant + internal-admin surfaces.
 */
export function deriveEffectivePlan(
  sub: { planName: string; status: string } | null | undefined,
): BillingPlan {
  return sub?.status === 'ACTIVE' ? ((sub.planName as BillingPlan) ?? 'FREE') : 'FREE';
}

export type PlanConfig = {
  name: BillingPlan;
  displayName: string;
  /** USD/month; -1 = "Contact us" (no price shown) */
  price: number;
  trialDays: number;
  quotas: {
    aiRequestsPerMonth: number;
    publishOpsPerMonth: number;
    workflowRunsPerMonth: number;
    connectorCallsPerMonth: number;
    /** Total active (PUBLISHED) modules per shop. -1 = unlimited. */
    modulesTotal: number;
  };
};

export const PLAN_CONFIGS: Record<BillingPlan, PlanConfig> = {
  FREE: {
    name: 'FREE',
    displayName: 'Free',
    price: 0,
    trialDays: 0,
    quotas: {
      aiRequestsPerMonth: 10,
      publishOpsPerMonth: 5,
      workflowRunsPerMonth: 50,
      connectorCallsPerMonth: 100,
      modulesTotal: 3,
    },
  },
  STARTER: {
    name: 'STARTER',
    displayName: 'Starter',
    price: 19,
    trialDays: 14,
    quotas: {
      aiRequestsPerMonth: 200,
      publishOpsPerMonth: 50,
      workflowRunsPerMonth: 1000,
      connectorCallsPerMonth: 5000,
      modulesTotal: 20,
    },
  },
  GROWTH: {
    name: 'GROWTH',
    displayName: 'Growth',
    price: 79,
    trialDays: 14,
    quotas: {
      aiRequestsPerMonth: 1000,
      publishOpsPerMonth: 500,
      workflowRunsPerMonth: 10000,
      connectorCallsPerMonth: 50000,
      modulesTotal: 100,
    },
  },
  PRO: {
    name: 'PRO',
    displayName: 'Pro',
    price: 299,
    trialDays: 7,
    quotas: {
      aiRequestsPerMonth: 10000,   // 10x Growth
      publishOpsPerMonth: 5000,
      workflowRunsPerMonth: 100000,
      connectorCallsPerMonth: 500000,
      modulesTotal: 1000,
    },
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    displayName: 'Enterprise',
    price: -1, // Contact us
    trialDays: 0,
    quotas: {
      aiRequestsPerMonth: -1,
      publishOpsPerMonth: -1,
      workflowRunsPerMonth: -1,
      connectorCallsPerMonth: -1,
      modulesTotal: -1,
    },
  },
};

export class BillingService {
  async getActiveSubscription(shopId: string) {
    const prisma = getPrisma();
    return prisma.appSubscription.findUnique({ where: { shopId } });
  }

  async cancelSubscription(shopId: string) {
    const prisma = getPrisma();
    await prisma.appSubscription.updateMany({
      where: { shopId },
      data: { status: 'CANCELLED' },
    });
  }

  async getPlanConfig(planName: string): Promise<PlanConfig> {
    return getPlanConfigFromDb(planName);
  }

  /**
   * Internal admin only: set a store's plan without going through Shopify billing.
   * Use for support overrides or testing.
   *
   * Durability depends on the plan: ENTERPRISE overrides are permanent — the
   * PlanSyncService (both `syncShop`, run from `/billing/callback`, and the
   * cron `sweep`) explicitly skips ENTERPRISE rows so the next Partner API
   * reconcile never clobbers them back to FREE. Any OTHER override
   * (STARTER/GROWTH/PRO/FREE) is policy-transient: the merchant's next
   * billing sync legitimately overwrites it with whatever plan the Partner
   * API reports. Don't rely on a non-ENTERPRISE override surviving past the
   * merchant's next `/billing/callback` visit or the next cron sweep tick.
   */
  async setPlanForShop(shopId: string, plan: BillingPlan): Promise<void> {
    await this.recordSubscription(shopId, plan, null);
  }

  private async recordSubscription(shopId: string, plan: BillingPlan, shopifySubId: string | null) {
    const prisma = getPrisma();
    await prisma.appSubscription.upsert({
      where: { shopId },
      create: {
        shopId,
        planName: plan,
        shopifySubId,
        status: 'ACTIVE',
      },
      update: {
        planName: plan,
        shopifySubId,
        status: 'ACTIVE',
      },
    });
  }
}
