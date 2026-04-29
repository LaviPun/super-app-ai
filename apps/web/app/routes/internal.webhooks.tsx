import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useRevalidator } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Box, Badge,
  TextField, Select, Button, SkeletonBodyText,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { InternalTruncateCell } from '~/components/InternalTruncateCell';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
];

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const topic = url.searchParams.get('topic') || undefined;
  const shopDomain = url.searchParams.get('shopDomain') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;
  const page = parseCursorParams(url, 150);

  const prisma = getPrisma();
  const where: Prisma.WebhookEventWhereInput = {};
  if (topic) where.topic = topic;
  if (shopDomain) where.shopDomain = { contains: shopDomain };
  if (status === 'success') where.success = true;
  if (status === 'failed') where.success = false;
  if (search) {
    where.OR = [
      { topic: { contains: search } },
      { shopDomain: { contains: search } },
      { eventId: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    where.processedAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const rows = await prisma.webhookEvent.findMany({
    where,
    orderBy: [{ processedAt: 'desc' }, { id: 'desc' }],
    take: page.take,
    skip: page.skip,
    cursor: page.cursor,
  });
  const nextCursorHref = buildNextCursorUrl(url, rows, page.take);

  const distinctTopicsRows = await prisma.webhookEvent.findMany({
    select: { topic: true },
    distinct: ['topic'],
    orderBy: { topic: 'asc' },
    take: 200,
  });

  const successCount = rows.filter(r => r.success).length;
  const failedCount = rows.length - successCount;

  return json({
    rows: rows.map(r => ({
      id: r.id,
      shopDomain: r.shopDomain,
      topic: r.topic,
      eventId: r.eventId,
      success: r.success,
      processedAt: r.processedAt.toISOString(),
    })),
    distinctTopics: distinctTopicsRows.map(d => d.topic),
    successCount,
    failedCount,
    filters: { topic, shopDomain, status, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

export default function InternalWebhooks() {
  const { rows, distinctTopics, successCount, failedCount, filters, nextCursorHref, pageSize } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const revalidator = useRevalidator();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  const topicOptions = [
    { label: 'All topics', value: '' },
    ...distinctTopics.map(t => ({ label: t, value: t })),
  ];

  return (
    <Page
      title="Webhook events"
      subtitle={`${rows.length} events on this page · ${successCount} success · ${failedCount} failed`}
      primaryAction={{ content: 'Refresh', onAction: () => revalidator.revalidate(), loading: revalidator.state === 'loading' }}
      fullWidth
    >
      <div style={{ width: '100%', maxWidth: '100%' }}>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Filters</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Webhook events recorded for idempotency. Failed entries indicate the handler returned non-2xx.
              </Text>
              <Form method="get">
                <InlineStack gap="300" wrap blockAlign="end">
                  <div style={{ minWidth: 220 }}>
                    <Select label="Topic" name="topic" options={topicOptions} value={filters.topic ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('topic', v); else p.delete('topic'); setParams(p); }} />
                  </div>
                  <div style={{ minWidth: 200 }}>
                    <TextField label="Shop domain" name="shopDomain" value={filters.shopDomain ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('shopDomain', v); else p.delete('shopDomain'); setParams(p); }} autoComplete="off" placeholder="shop.myshopify.com" />
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <Select label="Status" name="status" options={STATUS_OPTIONS} value={filters.status ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('status', v); else p.delete('status'); setParams(p); }} />
                  </div>
                  <div style={{ minWidth: 200 }}>
                    <TextField label="Search" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="topic / shop / eventId" />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                  </div>
                  <div style={{ minWidth: 160 }}>
                    <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                  </div>
                  <Button submit variant="primary" loading={isLoading}>Apply</Button>
                  <Button url="/internal/webhooks" variant="secondary">Clear</Button>
                </InlineStack>
              </Form>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Webhook entries</Text>
              {isLoading ? (
                <SkeletonBodyText lines={6} />
              ) : rows.length === 0 ? (
                <BlockStack gap="200">
                  <Text as="p" tone="subdued">No webhook events match your filters.</Text>
                  <Text as="p" variant="bodySm" tone="subdued">Webhook deliveries from Shopify (orders, products, customers, fulfillments…) appear here.</Text>
                </BlockStack>
              ) : (
                <Box paddingBlockEnd="200">
                  <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Time</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Topic</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Shop</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Status</th>
                          <th style={{ padding: '6px 12px', fontWeight: 600 }}>Event ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '6px 12px' }}>{new Date(r.processedAt).toLocaleString()}</td>
                            <td style={{ padding: '6px 12px' }}>
                              <InternalTruncateCell value={r.topic} maxLength={40} maxWidthPx={220} />
                            </td>
                            <td style={{ padding: '6px 12px' }}>
                              <InternalTruncateCell value={r.shopDomain} maxLength={40} maxWidthPx={200} />
                            </td>
                            <td style={{ padding: '6px 12px' }}>
                              {r.success ? <Badge tone="success">Success</Badge> : <Badge tone="critical">Failed</Badge>}
                            </td>
                            <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                              <InternalTruncateCell value={r.eventId} maxLength={32} maxWidthPx={240} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Box>
              )}
              <InlineStack gap="200" align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" tone="subdued">
                  Showing {rows.length} of up to {pageSize} per page.
                </Text>
                {nextCursorHref ? (
                  <Button url={nextCursorHref} variant="secondary">Load more</Button>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </div>
    </Page>
  );
}
