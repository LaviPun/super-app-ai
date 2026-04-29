import { json, redirect } from '@remix-run/node';
import { useLoaderData, useActionData, Form, useNavigation } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  Page, Card, BlockStack, Text, Button, InlineStack, Banner,
  SkeletonBodyText, InlineGrid, Badge, ProgressBar, Divider,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import { QuotaService } from '~/services/billing/quota.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

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

function usagePct(used: number, limit: number): number {
  if (limit === -1) return 0;
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

export default function BillingPage() {
  const { sub, usage, plans } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';
  const [errorDismissed, setErrorDismissed] = useState(false);

  const confirmationUrl = actionData && 'confirmationUrl' in actionData ? actionData.confirmationUrl : undefined;
  useEffect(() => {
    if (confirmationUrl) {
      if (window.top) window.top.location.href = confirmationUrl;
    }
  }, [confirmationUrl]);

  useEffect(() => {
    setErrorDismissed(false);
  }, [actionData]);

  const formatQuota = (v: number) => v === -1 ? 'Unlimited' : v.toLocaleString();
  const currentPlan = sub?.planName ?? 'Free';

  const usageItems = [
    { label: 'AI Requests', used: usage.used.aiRequests, limit: usage.quotas.aiRequestsPerMonth },
    { label: 'Publish Ops', used: usage.used.publishOps, limit: usage.quotas.publishOpsPerMonth },
    { label: 'Workflow Runs', used: usage.used.workflowRuns, limit: usage.quotas.workflowRunsPerMonth },
    { label: 'Connector Calls', used: usage.used.connectorCalls, limit: usage.quotas.connectorCallsPerMonth },
  ];

  return (
    <Page title="Billing & Plan" backAction={{ content: 'Dashboard', url: '/' }}>
      <BlockStack gap="500">
        {!errorDismissed && actionData && 'error' in actionData && actionData.error && (
          <Banner tone="critical" title="Upgrade failed" onDismiss={() => setErrorDismissed(true)}>
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}
        {/* ─── Plan banner ─── */}
        {sub ? (
          <Banner tone="success" title={`${sub.planName} plan`}>
            <Text as="p">Status: <strong>{sub.status}</strong>. Thank you for your subscription!</Text>
          </Banner>
        ) : (
          <Banner tone="info" title="You're on the Free plan">
            <Text as="p">Upgrade to unlock more AI requests, modules, connectors, and automation workflows.</Text>
          </Banner>
        )}

        {/* ─── Usage cards ─── */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Usage this month</Text>
            {isSaving ? (
              <SkeletonBodyText lines={4} />
            ) : (
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                {usageItems.map(item => {
                  const pct = usagePct(item.used, item.limit);
                  const tone = item.limit === -1 ? 'success' as const : pct >= 90 ? 'critical' as const : pct >= 70 ? 'highlight' as const : 'success' as const;
                  return (
                    <BlockStack key={item.label} gap="200">
                      <InlineStack align="space-between">
                        <Text as="p" variant="bodySm">{item.label}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {item.used} / {formatQuota(item.limit)}
                        </Text>
                      </InlineStack>
                      <ProgressBar progress={item.limit === -1 ? 0 : pct} tone={tone} size="small" />
                    </BlockStack>
                  );
                })}
              </InlineGrid>
            )}
          </BlockStack>
        </Card>

        <Divider />

        {/* ─── Plans ─── */}
        <Text as="h2" variant="headingLg">Choose your plan</Text>
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          {plans.filter(p => p.name !== 'FREE').map(p => {
            const isCurrent = currentPlan === p.name;
            return (
              <Card key={p.name}>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingMd">{p.displayName}</Text>
                    {isCurrent && <Badge tone="success">Current</Badge>}
                  </InlineStack>
                  <Text as="p" variant="headingXl">${p.price}<Text as="span" tone="subdued" variant="bodySm">/month</Text></Text>
                  <Divider />
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm">&#10003; {formatQuota(p.quotas.aiRequestsPerMonth)} AI requests/mo</Text>
                    <Text as="p" variant="bodySm">&#10003; {formatQuota(p.quotas.publishOpsPerMonth)} publish ops/mo</Text>
                    <Text as="p" variant="bodySm">&#10003; {formatQuota(p.quotas.workflowRunsPerMonth)} workflow runs/mo</Text>
                    <Text as="p" variant="bodySm">&#10003; {formatQuota(p.quotas.connectorCallsPerMonth)} connector calls/mo</Text>
                  </BlockStack>
                  <Form method="post">
                    <input type="hidden" name="plan" value={p.name} />
                    <Button
                      submit
                      variant={isCurrent ? 'secondary' : 'primary'}
                      disabled={isCurrent}
                      loading={isSaving}
                      fullWidth
                    >
                      {isCurrent ? 'Current plan' : `Upgrade to ${p.displayName}`}
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            );
          })}
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
