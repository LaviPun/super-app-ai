import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { QuotaService } from '~/services/billing/quota.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { ConfirmModal, LearnMore, Progress, fmtNum, fmtQuota, titleCase } from '~/components/merchant/polaris';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
  return json({ shopId: shopRow.id, sub, usage, plans });
}

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const form = await request.formData();
  const planRaw = String(form.get('plan') ?? 'STARTER');
  const ALLOWED_PLANS: BillingPlan[] = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
  if (!ALLOWED_PLANS.includes(planRaw as BillingPlan)) {
    return json({ error: `Unknown plan: ${planRaw}` }, { status: 400 });
  }
  const plan = planRaw as BillingPlan;

  const billing = new BillingService();
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/billing`;

  try {
    const config = await billing.getPlanConfig(plan);
    if (config.price < 0) {
      // "Contact us" plans can't be self-served — otherwise createSubscription
      // would record them without any Shopify charge.
      return json({ error: `${config.displayName} plans are set up by our team — reach out via the Help page.` }, { status: 400 });
    }
    const { confirmationUrl } = await billing.createSubscription(admin, shopRow.id, plan, returnUrl);
    await new ActivityLogService().log({ actor: 'MERCHANT', action: 'BILLING_PLAN_CHANGED', shopId: shopRow.id, details: { plan } });
    if (confirmationUrl && confirmationUrl !== returnUrl) {
      return json({ confirmationUrl });
    }
    return json({ ok: true, message: `Plan changed to ${config.displayName}.` });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
}

const USAGE_ICON: Record<string, string> = { aiRequests: 'wand', publishOps: 'rocket', workflowRuns: 'automation', connectorCalls: 'connect' };

export default function BillingPage() {
  const { sub, usage, plans } = useLoaderData<typeof loader>();
  return (
    <MerchantShell polaris>
      <BillingBody sub={sub} usage={usage} plans={plans} />
    </MerchantShell>
  );
}

function BillingBody({ sub, usage, plans }: any) {
  const ctx = useMerchantCtx();
  const changeFetcher = useFetcher<{ confirmationUrl?: string; error?: string; ok?: boolean; message?: string }>();
  const current = (sub?.planName ?? 'FREE').toUpperCase();
  const currentPlan = plans.find((p: any) => p.name === current);
  // Plan currently being submitted (so only that card's button shows a spinner).
  const pendingPlan = changeFetcher.state !== 'idle' ? changeFetcher.formData?.get('plan') : null;

  useEffect(() => {
    if (changeFetcher.data?.confirmationUrl) {
      // Navigate the top-level window to Shopify's managed-pricing confirmation.
      if (typeof window !== 'undefined') window.open(changeFetcher.data.confirmationUrl, '_top');
    } else if (changeFetcher.data?.error) {
      ctx.toast(changeFetcher.data.error, { error: true });
    } else if (changeFetcher.data?.ok) {
      ctx.toast(changeFetcher.data.message || 'Plan updated');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeFetcher.data]);

  const usageRows: [string, string, number, number][] = [
    ['AI generations', 'aiRequests', usage.used.aiRequests, usage.quotas.aiRequestsPerMonth],
    ['Publish operations', 'publishOps', usage.used.publishOps, usage.quotas.publishOpsPerMonth],
    ['Workflow runs', 'workflowRuns', usage.used.workflowRuns, usage.quotas.workflowRunsPerMonth],
    ['Connector calls', 'connectorCalls', usage.used.connectorCalls, usage.quotas.connectorCallsPerMonth],
  ];

  const changePlan = (name: string) => {
    changeFetcher.submit({ plan: name }, { method: 'post' });
  };

  // Downgrades lose quota immediately — never let that happen on a single click.
  const [downgradeTo, setDowngradeTo] = useState<any | null>(null);
  const requestPlanChange = (p: any) => {
    const isDowngrade = currentPlan && p.price !== -1 && currentPlan.price !== -1 && p.price < currentPlan.price;
    if (isDowngrade) setDowngradeTo(p);
    else changePlan(p.name);
  };

  return (
    <s-page heading="Plan & usage" inlineSize="base">
      <s-paragraph color="subdued">You’re on the {titleCase(current)} plan. Track usage and upgrade any time.{' '}<LearnMore anchor="guide-billing" topic="plans and billing" /></s-paragraph>

      <s-grid gridTemplateColumns="2fr 1fr" gap="base">
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
              <s-button variant="primary" onClick={() => document.getElementById('billing-plans')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Change plan</s-button>
              <s-button variant="secondary" icon="receipt" onClick={() => ctx.go('#/app/billing/history')}>Billing history</s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </s-grid>

      <s-section id="billing-plans" heading="Plans">
        <s-grid gridTemplateColumns="repeat(4, 1fr)" gap="base">
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
                  ? <s-button disabled>Current plan</s-button>
                  : p.price === -1
                    ? <s-button onClick={() => ctx.go('#/app/help')}>Contact us</s-button>
                    : <s-button variant={p.name === 'PRO' ? 'primary' : 'secondary'} loading={pendingPlan === p.name || undefined} onClick={() => requestPlanChange(p)}>{`Choose ${titleCase(p.name)}`}</s-button>}
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>

      <ConfirmModal
        open={!!downgradeTo}
        heading={downgradeTo ? `Switch to ${titleCase(downgradeTo.name)}?` : 'Switch plan?'}
        confirmLabel="Switch plan"
        tone="critical"
        loading={changeFetcher.state !== 'idle' || undefined}
        onConfirm={() => { if (downgradeTo) { changePlan(downgradeTo.name); setDowngradeTo(null); } }}
        onClose={() => setDowngradeTo(null)}
      >
        {downgradeTo && currentPlan && (
          <s-stack gap="small-100">
            <s-paragraph>
              {`Downgrading from ${titleCase(current)} to ${titleCase(downgradeTo.name)} lowers your monthly limits immediately:`}
            </s-paragraph>
            <s-stack gap="none">
              <s-text tone="neutral" color="subdued">{`AI generations: ${fmtQuota(currentPlan.quotas.aiRequestsPerMonth)} → ${fmtQuota(downgradeTo.quotas.aiRequestsPerMonth)}`}</s-text>
              <s-text tone="neutral" color="subdued">{`Publishes: ${fmtQuota(currentPlan.quotas.publishOpsPerMonth)} → ${fmtQuota(downgradeTo.quotas.publishOpsPerMonth)}`}</s-text>
              <s-text tone="neutral" color="subdued">{`Workflow runs: ${fmtQuota(currentPlan.quotas.workflowRunsPerMonth)} → ${fmtQuota(downgradeTo.quotas.workflowRunsPerMonth)}`}</s-text>
              <s-text tone="neutral" color="subdued">{`Connector calls: ${fmtQuota(currentPlan.quotas.connectorCallsPerMonth)} → ${fmtQuota(downgradeTo.quotas.connectorCallsPerMonth)}`}</s-text>
            </s-stack>
          </s-stack>
        )}
      </ConfirmModal>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
