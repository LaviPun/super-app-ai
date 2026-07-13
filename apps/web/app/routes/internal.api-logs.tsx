import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
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
  EmptyState,
  PageHead,
  FilterBar,
  MonoChip,
  useTableState,
  fmtMs,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';
import { LogTabs } from '~/components/admin/LogTabs';

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
type LiveLog = {
  id: string;
  actor: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  shopDomain: string | null;
  createdAt: string;
  correlationId: string | null;
  requestId: string | null;
};

export default function AdminApiLogs() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [actor, setActor] = useState('All');
  const [live, setLive] = useState(false);
  const [liveRows, setLiveRows] = useState<LiveLog[]>([]);

  // Live tail: consume the real SSE endpoint. New `log` events are prepended;
  // the EventSource is closed on toggle-off/unmount.
  useEffect(() => {
    if (!live) return;
    const since = data.logs[0]?.createdAt ?? new Date().toISOString();
    const es = new EventSource('/internal/api-logs/stream?since=' + encodeURIComponent(since));
    es.addEventListener('log', (evt) => {
      try {
        const l = JSON.parse((evt as MessageEvent).data) as LiveLog;
        setLiveRows((prev) => (prev.some((p) => p.id === l.id) ? prev : [l, ...prev].slice(0, 200)));
      } catch {
        // ignore malformed frames
      }
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setLive(false);
        ctx.toast('Live tail disconnected', true);
      }
    };
    return () => es.close();
  }, [live, data.logs, ctx]);

  const mapRow = (l: { id: string; actor: string; method: string; path: string; status: number; durationMs: number; shopDomain: string | null; createdAt: string; correlationId: string | null; requestId: string | null }) => ({
    id: l.id, actor: l.actor, method: l.method, path: l.path, status: l.status, durationMs: l.durationMs,
    shop: l.shopDomain ?? '—', requestId: l.requestId ?? '—', correlationId: l.correlationId ?? '', success: l.status < 400, created: formatRelativeTime(l.createdAt),
  });
  const liveIds = new Set(liveRows.map((l) => l.id));
  const ROWS: any[] = [...liveRows, ...data.logs.filter((l) => !liveIds.has(l.id))].map(mapRow);
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
      <LogTabs active="api-logs" />
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
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => ctx.go('#/admin/api-logs/' + r.id)}
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
          <EmptyState icon="table" title={ROWS.length ? 'No matching requests' : 'No API logs yet'}>
            {ROWS.length ? 'Adjust the actor filter or search to see more results.' : 'API calls recorded by the app will appear here.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
