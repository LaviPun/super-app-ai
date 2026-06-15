import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';
import {
  useAdminCtx,
  Btn,
  Card,
  StatusDot,
  DataTable,
  PageHead,
  FilterBar,
  MonoChip,
  useTableState,
  WEBHOOKS,
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

function relWh(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export default function AdminWebhooks() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [topic, setTopic] = useState('All topics');

  const ROWS: any[] = data.rows.length
    ? data.rows.map((r) => ({ id: r.id, topic: r.topic, shop: r.shopDomain ?? '—', eventId: r.eventId, success: r.success, created: relWh(r.processedAt) }))
    : WEBHOOKS;
  const rows = ROWS.filter((w) => (topic === 'All topics' || w.topic === topic) && (w.topic + w.shop).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead title="Webhooks" sub="Shopify webhook deliveries — orders, products, customers, fulfillments, and GDPR topics." />
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search topic, store…"
          results={rows.length}
          filters={[{ options: ['All topics', 'orders/create', 'products/update', 'customers/data_request', 'app/uninstalled'], value: topic, onChange: setTopic }]}
        />
        <DataTable
          rowKey="id"
          onRowClick={(r: any) => ctx.go('#/admin/webhooks/' + r.id)}
          columns={[
            { key: 'topic', label: 'Topic', render: (r: any) => <MonoChip>{r.topic}</MonoChip> },
            { key: 'shop', label: 'Store', render: (r: any) => <span className="cell-sub">{r.shop}</span> },
            { key: 'eventId', label: 'Event ID', render: (r: any) => <span className="t-mono t-xs t-muted">{r.eventId}</span> },
            {
              key: 'success',
              label: 'Result',
              render: (r: any) => (
                <span className="row-2">
                  <StatusDot ok={r.success} />
                  {r.success ? 'Processed' : 'Failed'}
                </span>
              ),
            },
            { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" icon="transfer" className="btn-plain" onClick={() => ctx.go('#/admin/trace/cor_' + String(r.eventId).replace('evt_', '') + 'f2')}>
                    Trace
                  </Btn>
                  {!r.success && (
                    <Btn size="sm" icon="replay" className="btn-plain" onClick={() => ctx.toast('Webhook ' + r.eventId + ' redelivered')}>
                      Redeliver
                    </Btn>
                  )}
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
    </div>
  );
}

