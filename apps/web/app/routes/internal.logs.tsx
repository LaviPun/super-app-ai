import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { buildNextCursorUrl } from '~/services/internal/pagination.server';
import { parseLogFilters } from '~/services/internal/log-filters.server';
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
  formatRelativeTime,
} from '~/components/admin/page-kit';
import { LogTabs } from '~/components/admin/LogTabs';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const level = url.searchParams.get('level') || undefined;
  const sourceFilter = url.searchParams.get('source') || undefined;

  const { where, cursor, take, skip, search, correlationId, dateFrom, dateTo } = parseLogFilters<Prisma.ErrorLogWhereInput>(url, {
    searchFields: ['message', 'route', 'source'],
  });
  if (level) where.level = level;
  if (sourceFilter) where.source = sourceFilter;

  const prisma = getPrisma();
  const logs = await prisma.errorLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    skip,
    cursor,
    include: { shop: true },
  });
  const nextCursorHref = buildNextCursorUrl(url, logs, take);

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
    pageSize: take,
  });
}

export default function AdminLogs() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [level, setLevel] = useState('All');

  const ROWS: any[] = data.logs.map((l) => ({ id: l.id, level: l.level, message: l.message, source: l.source, route: l.route, shop: l.shopDomain ?? '—', created: formatRelativeTime(l.createdAt), correlationId: l.correlationId ?? '' }));
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
