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
  Badge,
  StatusBadge,
  Card,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  MonoChip,
  useTableState,
  titleCase,
} from '~/components/admin/page-kit';
import { LogTabs } from '~/components/admin/LogTabs';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const level = url.searchParams.get('level') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: Prisma.ErrorLogWhereInput = {};
  if (level) where.level = level;
  const sourceFilter = url.searchParams.get('source') || undefined;
  if (sourceFilter) where.source = sourceFilter;
  if (search) {
    where.OR = [
      { message: { contains: search } },
      { route: { contains: search } },
      { source: { contains: search } },
    ];
  }
  if (correlationId) where.correlationId = correlationId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }
  const page = parseCursorParams(url, 150);

  const logs = await prisma.errorLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: page.take,
    skip: page.skip,
    cursor: page.cursor,
    include: { shop: true },
  });
  const nextCursorHref = buildNextCursorUrl(url, logs, page.take);

  return json({
    logs: logs.map(l => ({
      id: l.id,
      level: l.level,
      message: l.message,
      route: l.route,
      source: l.source,
      shopDomain: l.shop?.shopDomain ?? null,
      createdAt: l.createdAt.toISOString(),
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    filters: { level, source: sourceFilter, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

function relLog(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export default function AdminLogs() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [level, setLevel] = useState('All');

  const ROWS: any[] = data.logs.map((l) => ({ id: l.id, level: l.level, message: l.message, source: l.source, route: l.route, shop: l.shopDomain ?? '—', created: relLog(l.createdAt), correlationId: l.correlationId ?? '' }));
  const rows = ROWS.filter((e) => (level === 'All' || e.level === level) && (e.message + e.route).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead title="Error Logs" sub="Auto-redacted error stream — no secrets or PII. Trace any error end-to-end via its correlation ID." />
      <LogTabs active="logs" />
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search messages, routes…"
          results={rows.length}
          filters={[{ options: ['All', 'ERROR', 'WARN', 'INFO'].map((l) => ({ value: l, label: l === 'All' ? 'All levels' : titleCase(l) })), value: level, onChange: setLevel }]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => ctx.go('#/admin/logs/' + r.id)}
            columns={[
              { key: 'level', label: 'Level', width: 90, render: (r: any) => <StatusBadge value={r.level} /> },
              { key: 'message', label: 'Message', render: (r: any) => <span className="cell-strong t-trunc" style={{ maxWidth: 420, display: 'inline-block' }}>{r.message}</span> },
              { key: 'source', label: 'Source', render: (r: any) => <Badge>{r.source}</Badge> },
              { key: 'route', label: 'Route', render: (r: any) => <MonoChip>{r.route}</MonoChip> },
              { key: 'shop', label: 'Store', render: (r: any) => <span className="cell-sub t-trunc" style={{ maxWidth: 180, display: 'inline-block' }}>{r.shop}</span> },
              { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
              {
                key: 'act',
                label: '',
                render: (r: any) => (
                  <div className="dt-actions">
                    <Btn
                      size="sm"
                      icon="eye"
                      className="btn-plain"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        ctx.go('#/admin/logs/' + r.id);
                      }}
                    >
                      View
                    </Btn>
                    {r.correlationId ? (
                      <Btn
                        size="sm"
                        icon="transfer"
                        className="btn-plain"
                        onClick={(e: any) => {
                          e.stopPropagation();
                          ctx.go('#/admin/trace/' + r.correlationId);
                        }}
                      >
                        Trace
                      </Btn>
                    ) : null}
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="bug" title={data.logs.length ? 'No matching errors' : 'No error logs yet'}>
            {data.logs.length ? 'Adjust the level filter or search to see more results.' : 'Errors captured by the API, server and client will appear here.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
