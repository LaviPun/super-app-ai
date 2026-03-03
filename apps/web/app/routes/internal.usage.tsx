import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, DataTable, InlineGrid, InlineStack,
  TextField, Select, Button, SkeletonBodyText,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actionFilter = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: any = { createdAt: { gte: dateFrom } };
  if (dateTo) where.createdAt.lte = dateTo;
  if (actionFilter) where.action = actionFilter;
  if (search) {
    where.OR = [{ action: { contains: search } }];
  }

  const rows = await prisma.aiUsage.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { provider: true, shop: true },
  });

  const totalCostCents = rows.reduce((s, r) => s + r.costCents, 0);
  const totalRequests = rows.reduce((s, r) => s + (r.requestCount ?? 1), 0);
  const totalTokensIn = rows.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = rows.reduce((s, r) => s + r.tokensOut, 0);

  return json({
    rows: rows.map(r => ({
      id: r.id,
      action: r.action,
      providerName: r.provider.name,
      requestCount: r.requestCount ?? 1,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costCents: r.costCents,
      shopDomain: r.shop?.shopDomain ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    totalCostCents,
    totalRequests,
    totalTokensIn,
    totalTokensOut,
    filters: { action: actionFilter, search, dateFrom: dateFrom.toISOString(), dateTo: dateTo?.toISOString() },
  });
}

export default function InternalUsage() {
  const { rows, totalCostCents, totalRequests, totalTokensIn, totalTokensOut, filters } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  return (
    <Page title="AI Usage & Costs" subtitle="Filterable by date range and action">
      <BlockStack gap="400">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Total requests</Text>
              <Text as="p" variant="headingLg">{totalRequests.toLocaleString()}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Total cost</Text>
              <Text as="p" variant="headingLg">${(totalCostCents / 100).toFixed(2)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Tokens in</Text>
              <Text as="p" variant="headingLg">{totalTokensIn.toLocaleString()}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Tokens out</Text>
              <Text as="p" variant="headingLg">{totalTokensOut.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search action" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="RECIPE_GENERATION..." />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                </div>
                <Button submit loading={isLoading}>Apply</Button>
                <Button url="/internal/usage" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Usage log ({rows.length})</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : rows.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No AI usage in the selected range.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Usage is recorded when AI generation, mapping suggestions, or other AI actions run. Default range is last 30 days. Widen the date range or clear filters. Ensure at least one AI provider is active and that merchants (or you) have triggered AI calls.</Text>
              </BlockStack>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'numeric', 'numeric', 'numeric', 'text']}
                headings={['Time', 'Action', 'Provider', 'Requests', 'Tokens in', 'Tokens out', 'Cost']}
                rows={rows.map(r => [
                  new Date(r.createdAt).toLocaleString(),
                  r.action,
                  r.providerName,
                  r.requestCount,
                  r.tokensIn,
                  r.tokensOut,
                  `$${(r.costCents / 100).toFixed(3)}`,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
