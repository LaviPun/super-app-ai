import { json } from '@remix-run/node';
import { Form, useLoaderData, useSearchParams, useNavigation, Link } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Select, InlineStack, Button, TextField, Badge,
  SkeletonBodyText,
} from '@shopify/polaris';
import type { Prisma } from '@prisma/client';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const planFilter = url.searchParams.get('plan') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const { cursor, take, skip } = parseCursorParams(url);

  const prisma = getPrisma();
  const where: Prisma.ShopWhereInput = {};
  if (planFilter) where.planTier = planFilter;
  if (search) where.shopDomain = { contains: search };

  const shops = await prisma.shop.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    cursor,
    include: { modules: true, subscription: true },
  });

  const nextCursor = buildNextCursorUrl(url, shops, take);
  const distinctPlans = [...new Set(shops.map(s => s.planTier))].sort();

  return json({
    shops: shops.map(s => ({
      id: s.id,
      shopDomain: s.shopDomain,
      planTier: s.planTier,
      modulesCount: s.modules.length,
      publishedCount: s.modules.filter((m: { status: string }) => m.status === 'PUBLISHED').length,
      subscription: s.subscription ? { planName: s.subscription.planName, status: s.subscription.status } : null,
    })),
    distinctPlans,
    filters: { plan: planFilter, search },
    nextCursor,
  });
}

export default function InternalStoresIndex() {
  const { shops, distinctPlans, filters, nextCursor } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  const planFilterOptions = [
    { label: 'All plans', value: '' },
    ...distinctPlans.map(p => ({ label: p, value: p })),
  ];

  return (
    <Page title="Stores" subtitle={`${shops.length} stores · click a store to manage settings`}>
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
          shops.map(s => (
            <Card key={s.id}>
              <BlockStack gap="300">
                <InlineStack gap="300" align="start" blockAlign="center" wrap>
                  <Link to={`/internal/stores/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Text as="p" variant="headingMd">
                      {s.shopDomain}
                    </Text>
                  </Link>
                  <Badge tone="info">{s.planTier}</Badge>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {s.modulesCount} modules ({s.publishedCount} published)
                  </Text>
                  {s.subscription ? (
                    <Badge tone={s.subscription.status === 'ACTIVE' ? 'success' : 'attention'}>
                      {`${s.subscription.planName} (${s.subscription.status})`}
                    </Badge>
                  ) : null}
                  <Button url={`/internal/stores/${s.id}`} variant="primary" size="slim">
                    Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          ))
        )}
        {nextCursor && (
          <div style={{ textAlign: 'center' }}>
            <Button url={nextCursor}>Load more</Button>
          </div>
        )}
      </BlockStack>
    </Page>
  );
}
