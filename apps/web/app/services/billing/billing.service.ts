import type { AdminApiContext } from '@shopify/shopify-app-remix/server';
import { getPrisma } from '~/db.server';
import { getPlanConfig as getPlanConfigFromDb } from './plan-config.service';

export type BillingPlan = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

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
  /**
   * Creates a Shopify App Subscription (recurring charge) via GraphQL.
   * Returns the confirmation URL for the merchant to approve.
   */
  async createSubscription(
    admin: AdminApiContext['admin'],
    shopId: string,
    plan: BillingPlan,
    returnUrl: string
  ): Promise<{ confirmationUrl: string; subscriptionId: string }> {
    const config = await getPlanConfigFromDb(plan);
    if (config.price <= 0) {
      // Free plan — no Shopify billing charge needed, just record in DB.
      await this.recordSubscription(shopId, plan, null);
      return { confirmationUrl: returnUrl, subscriptionId: 'free' };
    }

    const mutation = `#graphql
      mutation AppSubscriptionCreate(
        $name: String!
        $lineItems: [AppSubscriptionLineItemInput!]!
        $returnUrl: URL!
        $trialDays: Int
        $test: Boolean
      ) {
        appSubscriptionCreate(
          name: $name
          lineItems: $lineItems
          returnUrl: $returnUrl
          trialDays: $trialDays
          test: $test
        ) {
          appSubscription { id status }
          confirmationUrl
          userErrors { field message }
        }
      }
    `;

    const res = await admin.graphql(mutation, {
      variables: {
        name: `SuperApp ${config.displayName}`,
        lineItems: [{
          plan: {
            appRecurringPricingDetails: {
              price: { amount: config.price.toFixed(2), currencyCode: 'USD' },
              interval: 'EVERY_30_DAYS',
            },
          },
        }],
        returnUrl,
        trialDays: config.trialDays > 0 ? config.trialDays : null,
        test: process.env.NODE_ENV !== 'production',
      },
    });

    const data = await res.json();
    const result = data?.data?.appSubscriptionCreate;
    const errs = result?.userErrors ?? [];
    if (errs.length) throw new Error(`Billing error: ${errs[0].message}`);

    const shopifySubId: string = result?.appSubscription?.id;
    const confirmationUrl: string = result?.confirmationUrl;

    await this.recordSubscription(shopId, plan, shopifySubId);

    return { confirmationUrl, subscriptionId: shopifySubId };
  }

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
   */
  async setPlanForShop(shopId: string, plan: BillingPlan): Promise<void> {
    await this.recordSubscription(shopId, plan, null);
    const prisma = getPrisma();
    await prisma.shop.update({
      where: { id: shopId },
      data: { planTier: plan },
    });
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
