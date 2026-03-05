import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useParams } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Select, InlineStack, Button, TextField, Badge,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';

export async function loader({ request, params }: { request: Request; params: { storeId?: string } }) {
  await requireInternalAdmin(request);
  const storeId = params.storeId;
  if (!storeId) throw new Response('Missing store', { status: 400 });

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({
    where: { id: storeId },
    include: { modules: true, aiProviderOverride: true, subscription: true },
  });
  if (!shop) throw new Response('Store not found', { status: 404 });

  const providers = await new AiProviderService().list();
  const providerOptions = [
    { label: 'Use global provider', value: '' },
    ...providers.map(p => ({ label: `${p.name} (${p.provider})${p.isActive ? ' ★' : ''}`, value: p.id })),
  ];

  const billingPlanOptions: { label: string; value: BillingPlan }[] = [
    { label: 'Free', value: 'FREE' },
    { label: 'Starter', value: 'STARTER' },
    { label: 'Growth', value: 'GROWTH' },
    { label: 'Pro', value: 'PRO' },
    { label: 'Enterprise', value: 'ENTERPRISE' },
  ];

  return json({
    shop: {
      id: shop.id,
      shopDomain: shop.shopDomain,
      planTier: shop.planTier,
      aiProviderOverrideId: shop.aiProviderOverrideId,
      retentionDaysDefault: shop.retentionDaysDefault,
      retentionDaysAi: shop.retentionDaysAi,
      retentionDaysApi: shop.retentionDaysApi,
      retentionDaysErrors: shop.retentionDaysErrors,
      modulesCount: shop.modules.length,
      publishedCount: shop.modules.filter(m => m.status === 'PUBLISHED').length,
      subscription: shop.subscription ? { planName: shop.subscription.planName, status: shop.subscription.status } : null,
    },
    providerOptions,
    billingPlanOptions,
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const shopId = String(form.get('shopId') ?? '');
  const intent = String(form.get('intent') ?? 'provider');

  if (!shopId) return json({ error: 'Missing shopId' }, { status: 400 });

  const prisma = getPrisma();
  const activity = new ActivityLogService();

  if (intent === 'provider') {
    const providerId = String(form.get('providerId') ?? '');
    await prisma.shop.update({
      where: { id: shopId },
      data: { aiProviderOverrideId: providerId || null },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'aiProviderOverride', providerId } });
  }

  if (intent === 'retention') {
    const toIntOrUndefined = (v: FormDataEntryValue | null) => {
      const n = parseInt(String(v ?? ''), 10);
      return isNaN(n) || n <= 0 ? undefined : n;
    };
    const data: Record<string, number> = {};
    const d = toIntOrUndefined(form.get('retentionDaysDefault'));
    if (d !== undefined) data.retentionDaysDefault = d;
    const ai = toIntOrUndefined(form.get('retentionDaysAi'));
    if (ai !== undefined) data.retentionDaysAi = ai;
    const api = toIntOrUndefined(form.get('retentionDaysApi'));
    if (api !== undefined) data.retentionDaysApi = api;
    const err = toIntOrUndefined(form.get('retentionDaysErrors'));
    if (err !== undefined) data.retentionDaysErrors = err;
    await prisma.shop.update({ where: { id: shopId }, data });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'retention' } });
  }

  if (intent === 'set_plan') {
    const plan = String(form.get('plan') ?? '') as BillingPlan;
    const allowed: BillingPlan[] = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
    if (!allowed.includes(plan)) return json({ error: 'Invalid plan' }, { status: 400 });
    await new BillingService().setPlanForShop(shopId, plan);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_PLAN_CHANGED', resource: `shop:${shopId}`, details: { plan } });
  }

  return redirect(`/internal/stores/${shopId}`);
}

export default function InternalStoreDetail() {
  const { shop, providerOptions, billingPlanOptions } = useLoaderData<typeof loader>();

  return (
    <Page
      title={shop.shopDomain}
      backAction={{ content: 'Stores', url: '/internal/stores' }}
      subtitle={`${shop.modulesCount} modules (${shop.publishedCount} published) · ${shop.planTier}`}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone="info">{shop.planTier}</Badge>
              {shop.subscription && (
                <Badge tone={shop.subscription.status === 'ACTIVE' ? 'success' : 'attention'}>
                  {`${shop.subscription.planName} (${shop.subscription.status})`}
                </Badge>
              )}
            </InlineStack>

            <Form method="post">
              <input type="hidden" name="intent" value="provider" />
              <input type="hidden" name="shopId" value={shop.id} />
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">AI provider override</Text>
                <InlineStack gap="200" wrap>
                  <div style={{ minWidth: 200, maxWidth: 280 }}>
                    <Select label="Provider" name="providerId" options={providerOptions} value={shop.aiProviderOverrideId ?? ''} onChange={() => {}} />
                  </div>
                  <Button submit size="slim" variant="primary">Save</Button>
                </InlineStack>
              </BlockStack>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="set_plan" />
              <input type="hidden" name="shopId" value={shop.id} />
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Plan</Text>
                <InlineStack gap="200" wrap>
                  <div style={{ minWidth: 140 }}>
                    <label className="Polaris-Label" htmlFor="plan">Change plan</label>
                    <select
                      id="plan"
                      name="plan"
                      defaultValue={shop.subscription?.planName ?? 'FREE'}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--p-color-border)', marginTop: 4 }}
                    >
                      {billingPlanOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ paddingTop: 24 }}>
                    <Button submit size="slim" variant="secondary">Set plan</Button>
                  </div>
                </InlineStack>
              </BlockStack>
            </Form>

            <Form method="post">
              <input type="hidden" name="intent" value="retention" />
              <input type="hidden" name="shopId" value={shop.id} />
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Retention overrides (days)</Text>
                <Text as="p" variant="bodySm" tone="subdued">Data retention per category. Leave blank to use defaults.</Text>
                <InlineStack gap="200" wrap>
                  <TextField label="Default" name="retentionDaysDefault" type="number" autoComplete="off" value={String(shop.retentionDaysDefault ?? '')} onChange={() => {}} placeholder="30" />
                  <TextField label="AI usage" name="retentionDaysAi" type="number" autoComplete="off" value={String(shop.retentionDaysAi ?? '')} onChange={() => {}} placeholder="inherit" />
                  <TextField label="API logs" name="retentionDaysApi" type="number" autoComplete="off" value={String(shop.retentionDaysApi ?? '')} onChange={() => {}} placeholder="inherit" />
                  <TextField label="Error logs" name="retentionDaysErrors" type="number" autoComplete="off" value={String(shop.retentionDaysErrors ?? '')} onChange={() => {}} placeholder="inherit" />
                  <div style={{ paddingTop: 24 }}>
                    <Button submit size="slim" variant="primary">Save</Button>
                  </div>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
