import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { Icon, Card, CardHead, PageHead, DataTable, StatusBadge, Badge, KV, EmptyState, fmtCents, titleCase } from '~/components/superapp';

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
    <MerchantShell>
      <BillingHistoryBody domain={domain} subscription={subscription} planChanges={planChanges} />
    </MerchantShell>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

function BillingHistoryBody({ domain, subscription, planChanges }: any) {
  // Shopify owns the actual invoice ledger (managed pricing) — invoices live in
  // the merchant's Shopify admin. We show our real records: the subscription row
  // and every recorded plan change.
  const storeHandle = encodeURIComponent(domain.replace('.myshopify.com', ''));
  const shopifyBillingUrl = `https://admin.shopify.com/store/${storeHandle}/settings/billing`;
  return (
    <div className="page">
      <PageHead
        back={{ href: '/billing', label: 'Billing' }}
        title="Billing history"
        sub={`Plan changes and subscription details for ${domain}. Invoices are issued by Shopify.`}
      />
      <div className="col-main" style={{ marginBottom: 18 }}>
        <Card>
          <CardHead title="Plan changes" />
          {planChanges.length === 0 ? (
            <EmptyState icon="plan" title="No plan changes yet">
              When you switch plans, each change is recorded here. Invoices are issued by Shopify and available in your Shopify admin.
            </EmptyState>
          ) : (
            <DataTable rowKey="id" columns={[
              { key: 'date', label: 'Date', render: (r: any) => fmtDate(r.date) },
              { key: 'plan', label: 'Plan', render: (r: any) => r.plan ? <Badge>{titleCase(r.plan)}</Badge> : <span className="t-muted">—</span> },
              { key: 'price', label: 'Price', num: true, render: (r: any) => r.price == null ? <span className="t-muted">—</span> : r.price === -1 ? 'Custom' : `${fmtCents(r.price * 100)}/mo` },
              { key: 'actor', label: 'Changed by', render: (r: any) => <span className="cell-sub">{titleCase(r.actor.replace(/_/g, ' '))}</span> },
            ]} rows={planChanges} />
          )}
        </Card>
        <div className="stack-4">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>Payment method</div>
            <div className="row-3" style={{ marginBottom: 14 }}>
              <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)', color: 'var(--p-text)' }}><Icon name="plan" size={18} /></span>
              <div className="stack" style={{ gap: 1 }}>
                <span className="t-strong">Managed by Shopify</span>
                <span className="t-xs t-muted">Billed through your Shopify account</span>
              </div>
            </div>
            <a className="btn btn-block" href={shopifyBillingUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /><span>Manage in Shopify</span>
            </a>
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 6 }}>Subscription</div>
            {subscription ? (
              <>
                <div className="t-sm t-muted" style={{ marginBottom: 12 }}>Your current app subscription record.</div>
                <KV rows={[
                  ['Plan', <Badge key="plan">{titleCase(subscription.planName)}</Badge>],
                  ['Status', <StatusBadge key="status" value={subscription.status} />],
                  ['Started', fmtDate(subscription.createdAt)],
                  subscription.trialEndsAt && ['Trial ends', fmtDate(subscription.trialEndsAt)],
                  subscription.currentPeriodEnd && ['Period ends', fmtDate(subscription.currentPeriodEnd)],
                ]} />
              </>
            ) : (
              <div className="t-sm t-muted">No subscription record yet — you’re on the Free plan.</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
