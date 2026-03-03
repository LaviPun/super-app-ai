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
    const toIntOrNull = (v: FormDataEntryValue | null) => {
      const n = parseInt(String(v ?? ''), 10);
      return isNaN(n) || n <= 0 ? null : n;
    };
    await prisma.shop.update({
      where: { id: shopId },
      data: {
        retentionDaysDefault: toIntOrNull(form.get('retentionDaysDefault')),
        retentionDaysAi: toIntOrNull(form.get('retentionDaysAi')),
        retentionDaysApi: toIntOrNull(form.get('retentionDaysApi')),
        retentionDaysErrors: toIntOrNull(form.get('retentionDaysErrors')),
      },
    });
    await activity.log({ actor: 'INTERNAL_ADMIN', action: 'STORE_SETTINGS_UPDATED', resource: `shop:${shopId}`, details: { field: 'retention' } });
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

  const planOptions = [
    { label: 'All plans', value: '' },
    ...distinctPlans.map(p => ({ label: p, value: p })),
  ];

  return (
    <Page title="Stores" subtitle={`${shops.length} stores`}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 160 }}>
                  <Select label="Plan" name="plan" options={planOptions} value={filters.plan ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('plan', v); else p.delete('plan'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search domain" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="mystore.myshopify.com" />
                </div>
                <Button submit loading={isLoading}>Apply</Button>
                <Button url="/internal/stores" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        {isLoading ? (
          <Card><SkeletonBodyText lines={6} /></Card>
        ) : shops.length === 0 ? (
          <Card>
            <Text as="p" tone="subdued">No stores match your filters.</Text>
          </Card>
        ) : (
          shops.map(s => {
            const publishedCount = s.modules.filter((m: any) => m.status === 'PUBLISHED').length;
            return (
              <Card key={s.id}>
                <BlockStack gap="300">
                  <InlineStack gap="200" align="start" blockAlign="center">
                    <Text as="p" variant="headingSm">{s.shopDomain}</Text>
                    <Badge tone="info">{s.planTier}</Badge>
                    <Text as="span" tone="subdued" variant="bodySm">
                      {s.modules.length} modules ({publishedCount} published)
                    </Text>
                    {s.subscription ? (
                      <Badge tone={s.subscription.status === 'ACTIVE' ? 'success' : 'attention'}>
                        {s.subscription.planName} ({s.subscription.status})
                      </Badge>
                    ) : null}
                  </InlineStack>

                  <Form method="post">
                    <input type="hidden" name="intent" value="provider" />
                    <input type="hidden" name="shopId" value={s.id} />
                    <InlineStack gap="200" align="start">
                      <div style={{ minWidth: 340 }}>
                        <Select label="AI provider override" name="providerId" options={providerOptions} value={(s.aiProviderOverrideId as string | null) ?? ''} onChange={() => {}} />
                      </div>
                      <Button submit>Save</Button>
                    </InlineStack>
                  </Form>

                  <Form method="post">
                    <input type="hidden" name="intent" value="retention" />
                    <input type="hidden" name="shopId" value={s.id} />
                    <Text as="p" variant="bodySm" tone="subdued">Retention overrides (days)</Text>
                    <InlineStack gap="200" align="start" wrap={false}>
                      <TextField label="Default" name="retentionDaysDefault" type="number" autoComplete="off" value={String(s.retentionDaysDefault ?? '')} onChange={() => {}} placeholder="30" />
                      <TextField label="AI usage" name="retentionDaysAi" type="number" autoComplete="off" value={String(s.retentionDaysAi ?? '')} onChange={() => {}} placeholder="inherit" />
                      <TextField label="API logs" name="retentionDaysApi" type="number" autoComplete="off" value={String(s.retentionDaysApi ?? '')} onChange={() => {}} placeholder="inherit" />
                      <TextField label="Error logs" name="retentionDaysErrors" type="number" autoComplete="off" value={String(s.retentionDaysErrors ?? '')} onChange={() => {}} placeholder="inherit" />
                      <Button submit>Save</Button>
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
