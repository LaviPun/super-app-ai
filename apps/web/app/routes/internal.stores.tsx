import { json, redirect } from '@remix-run/node';
import { Form, useLoaderData, useSearchParams, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Select, InlineStack, Button, TextField, Badge,
  SkeletonBodyText,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { AiProviderService } from '~/services/internal/ai-provider.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const planFilter = url.searchParams.get('plan') || undefined;
  const search = url.searchParams.get('q') || undefined;

  const prisma = getPrisma();
  const where: any = {};
  if (planFilter) where.planTier = planFilter;
  if (search) {
    where.shopDomain = { contains: search };
  }

  const shops = await prisma.shop.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { modules: true, aiProviderOverride: true, subscription: true },
  });
  const providers = await new AiProviderService().list();

  const distinctPlans = [...new Set(shops.map(s => s.planTier))].sort();

  return json({
    shops,
    providers,
    distinctPlans,
    filters: { plan: planFilter, search },
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
    await prisma.shop.update({
      where: { id: shopId },
      data,
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'retention' } });
  }

  if (intent === 'set_plan') {
    const plan = String(form.get('plan') ?? '') as BillingPlan;
    const allowed: BillingPlan[] = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
    if (!allowed.includes(plan)) return json({ error: 'Invalid plan' }, { status: 400 });
    await new BillingService().setPlanForShop(shopId, plan);
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_PLAN_CHANGED', resource: `shop:${shopId}`, details: { plan } });
  }

  return redirect('/internal/stores');
}

export default function InternalStores() {
  const { shops, providers, distinctPlans, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  const providerOptions = [
    { label: 'Use global provider', value: '' },
    ...providers.map(p => ({ label: `${p.name} (${p.provider})${p.isActive ? ' ★' : ''}`, value: p.id })),
  ];

  const planFilterOptions = [
    { label: 'All plans', value: '' },
    ...distinctPlans.map(p => ({ label: p, value: p })),
  ];

  const billingPlanOptions: { label: string; value: BillingPlan }[] = [
    { label: 'Free', value: 'FREE' },
    { label: 'Starter', value: 'STARTER' },
    { label: 'Growth', value: 'GROWTH' },
    { label: 'Pro', value: 'PRO' },
    { label: 'Enterprise', value: 'ENTERPRISE' },
  ];

  return (
    <Page title="Stores" subtitle={`${shops.length} stores`}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Text as="p" variant="bodySm" tone="subdued">Filter by plan or search store domain.</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 160 }}>
                  <Select label="Plan" name="plan" options={planFilterOptions} value={filters.plan ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('plan', v); else p.delete('plan'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search domain" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="mystore.myshopify.com" />
                </div>
                <Button submit variant="primary" loading={isLoading}>Apply</Button>
                <Button url="/internal/stores" variant="secondary">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        {isLoading ? (
          <Card><SkeletonBodyText lines={6} /></Card>
        ) : shops.length === 0 ? (
          <Card>
            <BlockStack gap="200">
              <Text as="p" tone="subdued">No stores match your filters.</Text>
              <Text as="p" variant="bodySm" tone="subdued">Clear filters or adjust your search to see stores.</Text>
            </BlockStack>
          </Card>
        ) : (
          shops.map(s => {
            const publishedCount = s.modules.filter((m: { status: string }) => m.status === 'PUBLISHED').length;
            return (
              <Card key={s.id}>
                <BlockStack gap="400">
                  <InlineStack gap="200" align="start" blockAlign="center">
                    <Text as="p" variant="headingSm">
                      <span className="internal-truncate-wide" title={s.shopDomain}>{s.shopDomain}</span>
                    </Text>
                    <Badge tone="info">{s.planTier}</Badge>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {s.modules.length} modules ({publishedCount} published)
                    </Text>
                    {s.subscription ? (
                      <Badge tone={s.subscription.status === 'ACTIVE' ? 'success' : 'attention'}>
                        {`${s.subscription.planName} (${s.subscription.status})`}
                      </Badge>
                    ) : null}
                  </InlineStack>

                  <Form method="post">
                    <input type="hidden" name="intent" value="provider" />
                    <input type="hidden" name="shopId" value={s.id} />
                    <InlineStack gap="200" align="start" wrap>
                      <div style={{ minWidth: 200, maxWidth: 280 }}>
                        <Select label="AI provider override" name="providerId" options={providerOptions} value={(s.aiProviderOverrideId as string | null) ?? ''} onChange={() => {}} />
                      </div>
                      <div style={{ paddingTop: 24 }}>
                        <Button submit size="slim" variant="primary">Save</Button>
                      </div>
                    </InlineStack>
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="intent" value="set_plan" />
                    <input type="hidden" name="shopId" value={s.id} />
                    <InlineStack gap="200" align="start" wrap>
                      <div style={{ minWidth: 120, maxWidth: 160 }}>
                        <label className="Polaris-Label" htmlFor={`plan-${s.id}`}>
                          Change plan
                        </label>
                        <select
                          id={`plan-${s.id}`}
                          name="plan"
                          defaultValue={s.subscription?.planName ?? 'FREE'}
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
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="intent" value="retention" />
                    <input type="hidden" name="shopId" value={s.id} />
                    <Text as="p" variant="bodySm" tone="subdued">Retention overrides (days)</Text>
                    <InlineStack gap="200" align="start" wrap>
                      <TextField label="Default" name="retentionDaysDefault" type="number" autoComplete="off" value={String(s.retentionDaysDefault ?? '')} onChange={() => {}} placeholder="30" />
                      <TextField label="AI usage" name="retentionDaysAi" type="number" autoComplete="off" value={String(s.retentionDaysAi ?? '')} onChange={() => {}} placeholder="inherit" />
                      <TextField label="API logs" name="retentionDaysApi" type="number" autoComplete="off" value={String(s.retentionDaysApi ?? '')} onChange={() => {}} placeholder="inherit" />
                      <TextField label="Error logs" name="retentionDaysErrors" type="number" autoComplete="off" value={String(s.retentionDaysErrors ?? '')} onChange={() => {}} placeholder="inherit" />
                      <div style={{ paddingTop: 24 }}>
                        <Button submit size="slim" variant="primary">Save</Button>
                      </div>
                    </InlineStack>
                  </Form>
                </BlockStack>
              </Card>
            );
          })
        )}
      </BlockStack>
    </Page>
  );
}
