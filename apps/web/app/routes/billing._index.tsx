import { json, redirect } from '@remix-run/node';
import { useLoaderData, useActionData, useFetcher } from '@remix-run/react';
import { useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { QuotaService } from '~/services/billing/quota.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Card, PageHead, Progress, fmtNum, fmtQuota, titleCase } from '~/components/superapp';

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

  const sub = await billing.getActiveSubscription(shopRow.id);
  const usage = await quota.getUsageSummary(shopRow.id);

  const plans = await getAllPlanConfigs();
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
    const { confirmationUrl } = await billing.createSubscription(admin, shopRow.id, plan, returnUrl);
    await new ActivityLogService().log({ actor: 'MERCHANT', action: 'BILLING_PLAN_CHANGED', shopId: shopRow.id, details: { plan } });
    if (confirmationUrl && confirmationUrl !== returnUrl) {
      return json({ confirmationUrl });
    }
    return redirect('/billing');
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
}

const USAGE_ICON: Record<string, string> = { aiRequests: 'magic', publishOps: 'rocket', workflowRuns: 'flow', connectorCalls: 'connect' };

export default function BillingPage() {
  const { sub, usage, plans } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <BillingBody sub={sub} usage={usage} plans={plans} />
    </MerchantShell>
  );
}

function BillingBody({ sub, usage, plans }: any) {
  const ctx = useMerchantCtx();
  const actionData = useActionData<typeof action>();
  const changeFetcher = useFetcher<{ confirmationUrl?: string; error?: string }>();
  const current = (sub?.planName ?? 'FREE').toUpperCase();
  const currentPlan = plans.find((p: any) => p.name === current);

  useEffect(() => {
    if (changeFetcher.data?.confirmationUrl) {
      // Navigate the top-level window to Shopify's managed-pricing confirmation.
      if (typeof window !== 'undefined') window.open(changeFetcher.data.confirmationUrl, '_top');
    } else if (changeFetcher.data?.error) {
      ctx.toast(changeFetcher.data.error, { error: true });
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
    ctx.toast(`Switching to ${titleCase(name)}`);
  };

  return (
    <div className="page">
      <PageHead title="Plan & usage" sub={`You’re on the ${titleCase(current)} plan. Track usage and upgrade any time.`} />
      {actionData && 'error' in actionData && actionData.error && <div style={{ marginBottom: 16 }}><Card pad>{actionData.error}</Card></div>}

      <div className="col-main" style={{ marginBottom: 24 }}>
        <Card pad>
          <div className="row spread" style={{ marginBottom: 18 }}>
            <div className="t-h3">This month’s usage</div>
            <span className="t-xs t-muted">Resets monthly</span>
          </div>
          <div className="stack-5">
            {usageRows.map((u, i) => {
              const limit = u[3];
              const finite = limit !== -1;
              return (
                <div key={i} className="stack-1">
                  <div className="row spread">
                    <span className="row-2 t-sm t-strong"><Icon name={USAGE_ICON[u[1]] ?? 'bolt'} size={15} className="t-muted" />{u[0]}</span>
                    <span className="t-sm t-num t-muted">{fmtNum(u[2])} / {finite ? fmtNum(limit) : 'Unlimited'}</span>
                  </div>
                  {finite && <Progress value={limit > 0 ? (u[2] / limit) * 100 : 0} tone={limit > 0 && u[2] / limit > 0.85 ? 'warning' : undefined} />}
                </div>
              );
            })}
          </div>
        </Card>
        <Card pad className="plan-current">
          <div className="badge badge-success" style={{ marginBottom: 10 }}>Current plan</div>
          <div className="t-h1" style={{ fontSize: 28 }}>{titleCase(current)}</div>
          <div className="row-1" style={{ alignItems: 'baseline', marginTop: 4 }}>
            <span className="t-h2">${currentPlan?.price ?? 0}</span><span className="t-muted">/month</span>
          </div>
          <div className="divider" style={{ margin: '16px 0' }} />
          <Btn variant="primary" className="btn-block" onClick={() => ctx.toast('Choose a plan below')}>Change plan</Btn>
          <Btn className="btn-block btn-plain-subdued" style={{ marginTop: 8 }} onClick={() => ctx.go('#/app/billing/history')}>Billing history</Btn>
        </Card>
      </div>

      <h2 className="t-h2" style={{ marginBottom: 14 }}>Plans</h2>
      <div className="grid grid-4">
        {plans.filter((p: any) => p.name !== 'FREE').map((p: any) => (
          <div key={p.name} className={'card card-pad plan-card' + (p.name === current ? ' active' : '')}>
            <div className="t-h3">{titleCase(p.name)}</div>
            <div className="row-1" style={{ alignItems: 'baseline', margin: '6px 0 14px' }}>
              {p.price === -1
                ? <span className="t-h2">Custom</span>
                : <><span className="t-h1" style={{ fontSize: 26 }}>${p.price}</span><span className="t-muted t-sm">/mo</span></>}
            </div>
            <div className="stack-2" style={{ marginBottom: 16 }}>
              {[[fmtQuota(p.quotas.aiRequestsPerMonth), 'AI generations'], [fmtQuota(p.quotas.publishOpsPerMonth), 'publishes'], [fmtQuota(p.quotas.workflowRunsPerMonth), 'workflow runs'], [fmtQuota(p.quotas.connectorCallsPerMonth), 'connectors']].map((f, i) => (
                <div key={i} className="row-2 t-sm"><Icon name="check" size={15} style={{ color: 'var(--p-success)' }} /><span><b className="t-num">{f[0]}</b> {f[1]}</span></div>
              ))}
            </div>
            {p.name === current
              ? <Btn className="btn-block" disabled>Current plan</Btn>
              : <Btn variant={p.name === 'PRO' ? 'primary' : undefined} className="btn-block" loading={changeFetcher.state !== 'idle'} onClick={() => changePlan(p.name)}>{p.price === -1 ? 'Contact us' : `Choose ${titleCase(p.name)}`}</Btn>}
          </div>
        ))}
      </div>
    </div>
  );
}
