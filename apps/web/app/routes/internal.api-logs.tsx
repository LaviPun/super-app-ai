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
  Card,
  Banner,
  StatusDot,
  DataTable,
  PageHead,
  FilterBar,
  MonoChip,
  useTableState,
  fmtMs,
  titleCase,
  API_LOGS,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const statusFilter = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: Prisma.ApiLogWhereInput = {};
  if (actor) where.actor = actor;
  if (statusFilter === 'running') {
    where.finishedAt = null;
    where.status = 0;
  } else if (statusFilter === 'success') where.success = true;
  else if (statusFilter === 'error') where.success = false;
  if (search) {
    where.OR = [
      { path: { contains: search } },
      { method: { contains: search } },
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

  const logs = await prisma.apiLog.findMany({
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
      actor: l.actor,
      method: l.method,
      path: l.path,
      status: l.status,
      durationMs: l.durationMs,
      shopDomain: l.shop?.shopDomain ?? null,
      createdAt: l.createdAt.toISOString(),
      finishedAt: l.finishedAt?.toISOString() ?? null,
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    filters: { actor, status: statusFilter, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

const METHOD_TONE: Record<string, any> = { GET: 'success', POST: 'info', PUT: 'warning', PATCH: 'warning', DELETE: 'critical' };
function relApi(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export default function AdminApiLogs() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [actor, setActor] = useState('All');
  const [live, setLive] = useState(false);

  const ROWS: any[] = data.logs.length
    ? data.logs.map((l) => ({
        id: l.id, actor: l.actor, method: l.method, path: l.path, status: l.status, durationMs: l.durationMs,
        shop: l.shopDomain ?? '—', requestId: l.requestId ?? '—', correlationId: l.correlationId ?? '', success: l.status < 400, created: relApi(l.createdAt),
      }))
    : API_LOGS;
  const rows = ROWS.filter((l) => (actor === 'All' || l.actor === actor) && (l.path + l.shop).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="API Logs"
        sub="Every significant API call with request + correlation IDs. Toggle live tail for near-real-time monitoring."
        actions={
          <Btn icon="live" onClick={() => setLive((l) => !l)}>
            {live ? 'Stop tail' : 'Live tail'}
          </Btn>
        }
      />
      {live && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info" title="Live tail active">
            Streaming new requests via SSE. New rows appear at the top.
          </Banner>
        </div>
      )}
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search paths, stores…"
          results={rows.length}
          filters={[
            { options: ['All', 'MERCHANT', 'INTERNAL', 'WEBHOOK', 'APP_PROXY'].map((a) => ({ value: a, label: a === 'All' ? 'All actors' : titleCase(a) })), value: actor, onChange: setActor },
          ]}
        />
        <DataTable
          rowKey="id"
          columns={[
            { key: 'method', label: 'Method', width: 80, render: (r: any) => <Badge tone={METHOD_TONE[r.method]}>{r.method}</Badge> },
            { key: 'path', label: 'Path', render: (r: any) => <MonoChip>{r.path}</MonoChip> },
            {
              key: 'status',
              label: 'Status',
              width: 80,
              render: (r: any) => (
                <span className="row-2">
                  <StatusDot ok={r.success} />
                  <span className="t-strong t-num">{r.status}</span>
                </span>
              ),
            },
            { key: 'actor', label: 'Actor', render: (r: any) => <Badge>{titleCase(r.actor)}</Badge> },
            { key: 'durationMs', label: 'Duration', num: true, render: (r: any) => fmtMs(r.durationMs) },
            { key: 'shop', label: 'Store', render: (r: any) => <span className="cell-sub t-trunc" style={{ maxWidth: 180, display: 'inline-block' }}>{r.shop}</span> },
            { key: 'requestId', label: 'Request ID', render: (r: any) => <span className="t-mono t-xs t-muted">{r.requestId}</span> },
            { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" icon="transfer" className="btn-plain" onClick={() => ctx.go('#/admin/trace/' + r.correlationId)}>
                    Trace
                  </Btn>
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
