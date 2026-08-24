import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { BillingService } from '~/services/billing/billing.service';
import { buildManagePlanUrl } from '~/services/billing/plan-handles';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { QuotaService } from '~/services/billing/quota.service';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { LearnMore, Progress, fmtNum, fmtQuota, titleCase } from '~/components/merchant/polaris';


export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const billing = new BillingService();
  const quota = new QuotaService();

  const [sub, usage, plans] = await Promise.all([
    billing.getActiveSubscription(shopRow.id),
    quota.getUsageSummary(shopRow.id),
    getAllPlanConfigs(),
  ]);
  return json({
    shopId: shopRow.id,
    sub,
    usage,
    plans,
    managePlanUrl: buildManagePlanUrl(session.shop),
  });
}

const USAGE_ICON: Record<string, string> = { aiRequests: 'wand', publishOps: 'rocket', workflowRuns: 'automation', connectorCalls: 'connect' };

export default function BillingPage() {
  const { sub, usage, plans, managePlanUrl } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <BillingBody sub={sub} usage={usage} plans={plans} managePlanUrl={managePlanUrl} />
    </MerchantShell>
  );
}

function BillingBody({ sub, usage, plans, managePlanUrl }: any) {
  const ctx = useMerchantCtx();
  // Mirrors Task 6's enforcement rule: a non-ACTIVE subscription means FREE,
  // regardless of what planName is stored on the row.
  const current = sub?.status === 'ACTIVE' ? (sub?.planName ?? 'FREE') : 'FREE';
  const currentPlan = plans.find((p: any) => p.name === current);

  const usageRows: [string, string, number, number][] = [
    ['AI generations', 'aiRequests', usage.used.aiRequests, usage.quotas.aiRequestsPerMonth],
    ['Publish operations', 'publishOps', usage.used.publishOps, usage.quotas.publishOpsPerMonth],
    ['Workflow runs', 'workflowRuns', usage.used.workflowRuns, usage.quotas.workflowRunsPerMonth],
    ['Connector calls', 'connectorCalls', usage.used.connectorCalls, usage.quotas.connectorCallsPerMonth],
  ];

  return (
    <s-page heading="Plan & usage" inlineSize="base">
      <s-paragraph color="subdued">You’re on the {titleCase(current)} plan. Track usage and upgrade any time.{' '}<LearnMore anchor="guide-billing" topic="plans and billing" /></s-paragraph>

      <s-grid gridTemplateColumns="@container (inline-size > 760px) 2fr 1fr, 1fr" gap="base">
        <s-section heading="This month’s usage">
          <s-stack gap="base">
            <s-text tone="neutral" color="subdued">Resets monthly</s-text>
            {usageRows.map((u, i) => {
              const limit = u[3];
              const finite = limit !== -1;
              return (
                <s-stack key={i} gap="small-100">
                  <s-grid gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
                    <s-stack direction="inline" gap="small-100" alignItems="center">
                      <s-icon type={(USAGE_ICON[u[1]] ?? 'bolt') as never} size="small" tone="neutral" />
                      <s-text type="strong">{u[0]}</s-text>
                    </s-stack>
                    <s-text tone="neutral" color="subdued">{fmtNum(u[2])} / {finite ? fmtNum(limit) : 'Unlimited'}</s-text>
                  </s-grid>
                  {finite && <Progress value={limit > 0 ? u[2] : 0} max={limit > 0 ? limit : 100} tone={limit > 0 && u[2] / limit > 0.85 ? 'warning' : undefined} />}
                </s-stack>
              );
            })}
          </s-stack>
        </s-section>

        <s-section heading="Current plan">
          <s-stack gap="base">
            <s-stack gap="none">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-heading>{titleCase(current)}</s-heading>
                <s-badge tone="success">Current</s-badge>
              </s-stack>
              <s-stack direction="inline" gap="small-100" alignItems="baseline">
                <s-text type="strong">${currentPlan?.price ?? 0}</s-text>
                <s-text tone="neutral" color="subdued">/month</s-text>
              </s-stack>
            </s-stack>
            <s-divider />
            <s-stack gap="small-100">
              {managePlanUrl && (
                <s-button variant="primary" onClick={() => window.open(managePlanUrl, '_top')}>Manage plan</s-button>
              )}
              <s-button variant="secondary" icon="receipt" onClick={() => ctx.go('#/app/billing/history')}>Billing history</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-grid>

      <s-section id="billing-plans" heading="Plans">
        <s-paragraph color="subdued">Plans are billed by Shopify. Select or change your plan on the Shopify-hosted pricing page.</s-paragraph>
        <s-grid gridTemplateColumns="@container (inline-size > 480px) repeat(4, 1fr), 1fr" gap="base">
          {plans.filter((p: any) => p.name !== 'FREE').map((p: any) => (
            <s-box key={p.name} padding="base" border="base" borderRadius="base" background={p.name === current ? 'subdued' : undefined}>
              <s-stack gap="small-100">
                <s-text type="strong">{titleCase(p.name)}</s-text>
                <s-stack direction="inline" gap="small-100" alignItems="baseline">
                  {p.price === -1
                    ? <s-heading>Custom</s-heading>
                    : <><s-heading>${p.price}</s-heading><s-text tone="neutral" color="subdued">/mo</s-text></>}
                </s-stack>
                <s-stack gap="none">
                  {[[fmtQuota(p.quotas.aiRequestsPerMonth), 'AI generations'], [fmtQuota(p.quotas.publishOpsPerMonth), 'publishes'], [fmtQuota(p.quotas.workflowRunsPerMonth), 'workflow runs'], [fmtQuota(p.quotas.connectorCallsPerMonth), 'connectors']].map((f, i) => (
                    <s-stack key={i} direction="inline" gap="small-100" alignItems="center">
                      <s-icon type="check" size="small" tone="success" />
                      <s-text tone="neutral" color="subdued"><s-text type="strong">{f[0]}</s-text> {f[1]}</s-text>
                    </s-stack>
                  ))}
                </s-stack>
                {p.name === current
                  ? <s-badge tone="success">Current</s-badge>
                  : p.price === -1
                    ? <s-button onClick={() => ctx.go('#/app/help')}>Contact us</s-button>
                    : managePlanUrl && (
                        <s-button variant="secondary" onClick={() => window.open(managePlanUrl, '_top')}>Manage plan</s-button>
                      )}
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
