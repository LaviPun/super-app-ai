import { getPrisma } from '~/db.server';
import { getPartnerApiConfig } from '~/env.server';
import { unauthenticated } from '~/shopify.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { logger } from '~/services/observability/logger.server';
import { safeErrorMeta } from '~/services/observability/redact.server';
import { planFromHandle } from './plan-handles';
import type { BillingPlan } from './billing.service';

const PARTNER_API_VERSION = '2026-07';

// Validated against the Partner API 2026-07 schema via the Shopify dev MCP (2026-08-24).
const ACTIVE_SUBSCRIPTION_QUERY = /* GraphQL */ `
  query ActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod
      cancelAtEndOfCycle
      trialEndsAt
      currentBillingCycle { startTime endTime }
      items { handle description price { __typename active currency ... on FlatRatePrice { amount } } }
      pendingUpdate { billingPeriod items { handle } }
      legacySubscriptionId
    }
  }
`;

type ActiveSubscription = {
  trialEndsAt: string | null;
  currentBillingCycle?: { startTime: string; endTime: string } | null;
  items: Array<{ handle: string }>;
  legacySubscriptionId: string | null;
} | null;

export class PlanSyncService {
  /**
   * Reconcile one shop's AppSubscription row from the Partner API.
   * Idempotent; safe to call from the welcome-link redirect AND the cron sweep.
   * Without Partner env config it is a no-op that reports the current DB plan.
   */
  async syncShop(shopDomain: string): Promise<{ plan: BillingPlan; changed: boolean }> {
    const prisma = getPrisma();
    const cfg = getPartnerApiConfig();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) throw new Error(`PlanSyncService: unknown shop ${shopDomain}`);

    const existing = await prisma.appSubscription.findUnique({ where: { shopId: shop.id } });
    if (!cfg) {
      logger.warn('[plan-sync] Partner API env not configured — skipping sync', { shopDomain });
      return { plan: (existing?.planName as BillingPlan) ?? 'FREE', changed: false };
    }

    // ENTERPRISE is an internal-admin override with no Partner API counterpart
    // (the Partner API returns null — no active subscription — for these
    // shops), so an unconditional overwrite here would clobber the override
    // back to FREE on the merchant's very next visit to /billing/callback.
    // The cron sweep already guards this (see the `sweep` query below); mirror
    // it here so both reconcile paths agree. Non-ENTERPRISE overrides
    // (STARTER/GROWTH/PRO) are intentionally NOT guarded — those are
    // policy-transient and the next sync legitimately replaces them with the
    // real Partner API plan.
    if (existing?.planName === 'ENTERPRISE') {
      logger.info('[plan-sync] ENTERPRISE override in place — skipping Partner API sync', { shopDomain });
      return { plan: 'ENTERPRISE', changed: false };
    }

    const shopGid = shop.shopGid ?? (await this.ensureShopGid(shopDomain));
    const sub = await this.fetchActiveSubscription(cfg, shopGid);
    if (sub?.legacySubscriptionId) {
      // Should never happen for this app (no public installs pre-App-Pricing); loud if it does.
      logger.warn('[plan-sync] contract carries a legacySubscriptionId', { shopDomain });
    }

    const handle = sub?.items[0]?.handle ?? null;
    const plan: BillingPlan = sub ? (planFromHandle(handle) ?? 'FREE') : 'FREE';
    // First-ever sync (no prior row) is not a "change" unless it lands on
    // something other than FREE — `existing?.status !== 'ACTIVE'` would
    // otherwise be trivially true for every brand-new shop (undefined !==
    // 'ACTIVE') and log a spurious FREE→FREE BILLING_PLAN_CHANGED event.
    const changed = existing
      ? existing.planName !== plan || existing.status !== 'ACTIVE'
      : plan !== 'FREE';

    const data = {
      planName: plan,
      planHandle: sub ? handle : null,
      shopifySubId: null,
      status: 'ACTIVE',
      trialEndsAt: sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null,
      currentPeriodEnd: sub?.currentBillingCycle?.endTime
        ? new Date(sub.currentBillingCycle.endTime)
        : null,
      lastSyncedAt: new Date(),
    };
    await prisma.appSubscription.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, ...data },
      update: data,
    });

    if (changed) {
      await new ActivityLogService().log({
        actor: 'SYSTEM',
        action: 'BILLING_PLAN_CHANGED',
        shopId: shop.id,
        details: { plan, planHandle: handle, source: 'app-pricing-sync' },
      }).catch(() => {});
    }
    return { plan, changed };
  }

  /**
   * Cron reconcile (App Pricing has NO webhooks — cancellations/freezes are
   * only visible by querying). Oldest-synced first; caps requests per tick to
   * respect the Partner API's 4 req/s limit.
   */
  async sweep(limit = 20): Promise<{ synced: number; failed: number }> {
    const prisma = getPrisma();
    const stale = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.appSubscription.findMany({
      where: {
        OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: stale } }],
        NOT: { planName: 'ENTERPRISE' }, // internal override — never reconciled away
      },
      orderBy: { lastSyncedAt: 'asc' },
      take: limit,
      include: { shop: { select: { shopDomain: true } } },
    });
    let synced = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.syncShop(row.shop.shopDomain);
        synced += 1;
      } catch (err) {
        failed += 1;
        logger.warn('[plan-sync] sweep item failed', {
          shopDomain: row.shop.shopDomain,
          ...safeErrorMeta(err),
        });
      }
    }
    return { synced, failed };
  }

  private async fetchActiveSubscription(
    cfg: { token: string; orgId: string; appGid: string },
    shopGid: string,
  ): Promise<ActiveSubscription> {
    const res = await fetch(
      `https://partners.shopify.com/${cfg.orgId}/api/${PARTNER_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': cfg.token,
        },
        body: JSON.stringify({
          query: ACTIVE_SUBSCRIPTION_QUERY,
          variables: { appId: cfg.appGid, shopId: shopGid },
        }),
      },
    );
    if (!res.ok) throw new Error(`Partner API HTTP ${res.status}`);
    const payload = (await res.json()) as {
      data?: { activeSubscription?: ActiveSubscription };
      errors?: Array<{ message?: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).filter(Boolean).join('; ') || 'Partner API error');
    }
    return payload.data?.activeSubscription ?? null;
  }

  private async ensureShopGid(shopDomain: string): Promise<string> {
    const { admin } = await unauthenticated.admin(shopDomain);
    const res = await admin.graphql(`#graphql
      query ShopGid { shop { id } }
    `);
    const json = (await res.json()) as { data?: { shop?: { id?: string } } };
    const gid = json.data?.shop?.id;
    if (!gid) throw new Error(`PlanSyncService: could not resolve shop GID for ${shopDomain}`);
    const prisma = getPrisma();
    await prisma.shop.update({ where: { shopDomain }, data: { shopGid: gid } });
    return gid;
  }
}
