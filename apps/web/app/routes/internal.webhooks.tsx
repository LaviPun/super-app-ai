import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';
import {
  useAdminCtx,
  Card,
  StatusDot,
  EmptyState,
  DataTable,
  PageHead,
  FilterBar,
  MonoChip,
  useTableState,
  formatRelativeTime,
} from '~/components/admin/page-kit';

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

export default function AdminWebhooks() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [topic, setTopic] = useState('All topics');

  const ROWS = data.rows.map((r) => ({ id: r.id, topic: r.topic, shop: r.shopDomain ?? '—', eventId: r.eventId, success: r.success, created: formatRelativeTime(r.processedAt) }));
  const rows = ROWS.filter((w) => (topic === 'All topics' || w.topic === topic) && (w.topic + w.shop + w.eventId).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead title="Webhooks" sub="Shopify webhook deliveries — orders, products, customers, fulfillments, and GDPR topics. Failed deliveries are automatically redelivered by Shopify; payloads are not persisted." />
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search topic, store, event ID…"
          results={rows.length}
          filters={[{ options: ['All topics'].concat(data.distinctTopics), value: topic, onChange: setTopic }]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r) => ctx.go('#/admin/webhooks/' + r.id)}
            columns={[
              { key: 'topic', label: 'Topic', render: (r) => <MonoChip>{r.topic}</MonoChip> },
              { key: 'shop', label: 'Store', render: (r) => <span className="cell-sub">{r.shop}</span> },
              { key: 'eventId', label: 'Event ID', render: (r) => <span className="t-mono t-xs t-muted">{r.eventId}</span> },
              {
                key: 'success',
                label: 'Result',
                render: (r) => (
                  <span className="row-2">
                    <StatusDot ok={r.success} />
                    {r.success ? 'Processed' : 'Failed'}
                  </span>
                ),
              },
              { key: 'created', label: 'When', render: (r) => <span className="cell-sub">{r.created}</span> },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="transfer" title="No webhook events">
            {data.filters.topic || ts.search ? 'No deliveries match this filter.' : 'Shopify webhook deliveries are recorded here as they arrive.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
