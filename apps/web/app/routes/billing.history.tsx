import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { StatusBadge, KV, EmptyState, fmtCents, titleCase } from '~/components/merchant/polaris';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, include: { subscription: true } });

  const [planChangeLogs, plans] = await Promise.all([
    shopRow
      ? prisma.activityLog.findMany({
          where: { shopId: shopRow.id, action: 'BILLING_PLAN_CHANGED' },
          orderBy: { createdAt: 'desc' },
          take: 24,
        })
      : Promise.resolve([]),
    getAllPlanConfigs(),
  ]);

  const priceByPlan = new Map<string, number>(plans.map((p) => [String(p.name), p.price]));
  const planChanges = planChangeLogs.map((l) => {
    let plan: string | null = null;
    try { plan = l.details ? ((JSON.parse(l.details) as { plan?: string }).plan ?? null) : null; } catch { /* unparseable details */ }
    return {
      id: l.id,
      date: l.createdAt.toISOString(),
      plan,
      price: plan ? priceByPlan.get(plan.toUpperCase()) ?? null : null,
      actor: l.actor,
    };
  });

  const sub = shopRow?.subscription ?? null;
  return json({
    domain: session.shop,
    subscription: sub
      ? {
          planName: sub.planName,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          createdAt: sub.createdAt.toISOString(),
        }
      : null,
    planChanges,
  });
}

export default function BillingHistory() {
  const { domain, subscription, planChanges } = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <BillingHistoryBody domain={domain} subscription={subscription} planChanges={planChanges} />
    </MerchantShell>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

function BillingHistoryBody({ domain, subscription, planChanges }: any) {
  // Shopify owns the actual invoice ledger (managed pricing) — invoices live in
  // the merchant's Shopify admin. We show our real records: the subscription row
  // and every recorded plan change.
  const ctx = useMerchantCtx();
  const storeHandle = encodeURIComponent(domain.replace('.myshopify.com', ''));
  const shopifyBillingUrl = `https://admin.shopify.com/store/${storeHandle}/settings/billing`;
  return (
    <s-page heading="Billing history" inlineSize="base">
      <s-stack gap="small-100">
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => ctx.go('#/app/billing')}>Billing</s-button>
        </s-stack>
        <s-paragraph color="subdued">Plan changes and subscription details for {domain}. Invoices are issued by Shopify.</s-paragraph>
      </s-stack>

      <s-grid gridTemplateColumns="2fr 1fr" gap="base">
        <s-section heading="Plan changes">
          {planChanges.length === 0 ? (
            <EmptyState icon="plan" heading="No plan changes yet">
              When you switch plans, each change is recorded here. Invoices are issued by Shopify and available in your Shopify admin.
            </EmptyState>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Date</s-table-header>
                <s-table-header>Plan</s-table-header>
                <s-table-header>Price</s-table-header>
                <s-table-header>Changed by</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {planChanges.map((r: any) => (
                  <s-table-row key={r.id}>
                    <s-table-cell>{fmtDate(r.date)}</s-table-cell>
                    <s-table-cell>{r.plan ? <s-badge>{titleCase(r.plan)}</s-badge> : <s-text tone="neutral" color="subdued">—</s-text>}</s-table-cell>
                    <s-table-cell>{r.price == null ? '—' : r.price === -1 ? 'Custom' : `${fmtCents(r.price * 100)}/mo`}</s-table-cell>
                    <s-table-cell><s-text tone="neutral" color="subdued">{titleCase(r.actor.replace(/_/g, ' '))}</s-text></s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>

        <s-stack gap="base">
          <s-section heading="Payment method">
            <s-stack gap="base">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-icon type="credit-card" tone="neutral" />
                <s-stack gap="none">
                  <s-text type="strong">Managed by Shopify</s-text>
                  <s-text tone="neutral" color="subdued">Billed through your Shopify account</s-text>
                </s-stack>
              </s-stack>
              <s-stack direction="inline">
                <s-button href={shopifyBillingUrl} target="_blank" icon="external">Manage in Shopify</s-button>
              </s-stack>
            </s-stack>
          </s-section>

          <s-section heading="Subscription">
            {subscription ? (
              <s-stack gap="base">
                <s-text tone="neutral" color="subdued">Your current app subscription record.</s-text>
                <KV rows={([
                  ['Plan', <s-badge key="plan">{titleCase(subscription.planName)}</s-badge>],
                  ['Status', <StatusBadge key="status" status={subscription.status} />],
                  ['Started', fmtDate(subscription.createdAt)],
                  subscription.trialEndsAt && ['Trial ends', fmtDate(subscription.trialEndsAt)],
                  subscription.currentPeriodEnd && ['Period ends', fmtDate(subscription.currentPeriodEnd)],
                ].filter(Boolean)) as Array<[string, any]>} />
              </s-stack>
            ) : (
              <s-text tone="neutral" color="subdued">No subscription record yet — you’re on the Free plan.</s-text>
            )}
          </s-section>
        </s-stack>
      </s-grid>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
