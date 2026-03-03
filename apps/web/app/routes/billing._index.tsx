import { json, redirect } from '@remix-run/node';
import { useLoaderData, Form } from '@remix-run/react';
import { Page, Card, BlockStack, Text, Button, InlineStack, Banner, DataTable } from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { BillingService, PLAN_CONFIGS } from '~/services/billing/billing.service';
import { QuotaService } from '~/services/billing/quota.service';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const billing = new BillingService();
  const quota = new QuotaService();

  const sub = await billing.getActiveSubscription(shopRow.id);
  const usage = await quota.getUsageSummary(shopRow.id);

  return json({ shopId: shopRow.id, sub, usage, plans: Object.values(PLAN_CONFIGS) });
}

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const form = await request.formData();
  const plan = String(form.get('plan') ?? 'STARTER') as any;

  const billing = new BillingService();
  const returnUrl = `${process.env.SHOPIFY_APP_URL}/billing`;

  try {
    const { confirmationUrl } = await billing.createSubscription(admin, shopRow.id, plan, returnUrl);
    if (confirmationUrl && confirmationUrl !== returnUrl) {
      return redirect(confirmationUrl);
    }
    return redirect('/billing');
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
}

export default function BillingPage() {
  const { sub, usage, plans } = useLoaderData<typeof loader>();

  const formatQuota = (v: number) => v === -1 ? 'Unlimited' : v.toLocaleString();

  return (
    <Page title="Billing & Plan" backAction={{ content: 'Modules', url: '/' }}>
      <BlockStack gap="500">
        {sub ? (
          <Banner tone="success" title={`Current plan: ${sub.planName}`}>
            <Text as="p">Status: {sub.status}</Text>
          </Banner>
        ) : (
          <Banner tone="info" title="Free plan active">
            <Text as="p">Upgrade to unlock more AI requests, modules, and workflows.</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Usage this month</Text>
            <DataTable
              columnContentTypes={['text', 'numeric', 'numeric']}
              headings={['Resource', 'Used', 'Limit']}
              rows={[
                ['AI Requests', usage.used.aiRequests, formatQuota(usage.quotas.aiRequestsPerMonth)],
                ['Publish Operations', usage.used.publishOps, formatQuota(usage.quotas.publishOpsPerMonth)],
                ['Workflow Runs', usage.used.workflowRuns, formatQuota(usage.quotas.workflowRunsPerMonth)],
                ['Connector Calls', usage.used.connectorCalls, formatQuota(usage.quotas.connectorCallsPerMonth)],
              ]}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Available plans</Text>
            <InlineStack gap="400" wrap>
              {plans.filter(p => p.name !== 'FREE').map(p => (
                <Card key={p.name}>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">{p.displayName}</Text>
                    <Text as="p">${p.price}/month</Text>
                    <Text as="p" tone="subdued">
                      {formatQuota(p.quotas.aiRequestsPerMonth)} AI · {formatQuota(p.quotas.publishOpsPerMonth)} publishes
                    </Text>
                    <Form method="post">
                      <input type="hidden" name="plan" value={p.name} />
                      <Button submit variant={sub?.planName === p.name ? 'secondary' : 'primary'} disabled={sub?.planName === p.name}>
                        {sub?.planName === p.name ? 'Current' : `Switch to ${p.displayName}`}
                      </Button>
                    </Form>
                  </BlockStack>
                </Card>
              ))}
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
