import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { ActivityLogService } from '~/services/activity/activity.service';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  Banner,
  Card,
  DataTable,
  PageHead,
  FilterBar,
  useTableState,
  titleCase,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;
  const page = parseCursorParams(url, 150);

  const service = new ActivityLogService();
  const [logs, distinctActions] = await Promise.all([
    service.list({ actor, action, search, dateFrom, dateTo, take: page.take, cursorId: page.cursor?.id, correlationId }),
    service.getDistinctActions(),
  ]);
  const nextCursorHref = buildNextCursorUrl(url, logs, page.take);

  return json({
    logs: logs.map(l => ({
      id: l.id,
      actor: l.actor,
      action: l.action,
      resource: l.resource,
      shopDomain: l.shop?.shopDomain ?? null,
      details: l.details,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    distinctActions,
    filters: { actor, action, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

type LiveActivity = {
  id: string;
  actor: string;
  action: string;
  resource: string | null;
  shopDomain: string | null;
  ip: string | null;
  createdAt: string;
  correlationId: string | null;
  requestId: string | null;
};

export default function AdminActivity() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [actor, setActor] = useState('All');
  const [live, setLive] = useState(false);
  const [liveRows, setLiveRows] = useState<LiveActivity[]>([]);

  // Live tail: consume the real SSE endpoint. New `log` events are prepended;
  // the EventSource is closed on toggle-off/unmount.
  useEffect(() => {
    if (!live) return;
    const since = data.logs[0]?.createdAt ?? new Date().toISOString();
    const es = new EventSource('/internal/activity/stream?since=' + encodeURIComponent(since));
    es.addEventListener('log', (evt) => {
      try {
        const l = JSON.parse((evt as MessageEvent).data) as LiveActivity;
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

  const mapRow = (l: LiveActivity) => ({
    id: l.id, actor: l.actor, action: l.action, resource: l.resource ?? '—', shop: l.shopDomain ?? '—', ip: l.ip ?? '—', created: rel(l.createdAt),
  });
  const liveIds = new Set(liveRows.map((l) => l.id));
  const ROWS: any[] = [...liveRows, ...data.logs.filter((l) => !liveIds.has(l.id))].map(mapRow);

  const rows = ROWS.filter(
    (a) => (actor === 'All' || a.actor === actor) && (a.action + a.resource + a.shop).toLowerCase().includes(ts.search.toLowerCase()),
  );

  return (
    <div className="page">
      <PageHead
        title="Activity Log"
        sub="Every significant action — page views, clicks, settings changes, request outcomes — across the platform."
        actions={
          <Btn icon="live" onClick={() => setLive((l) => !l)}>
            {live ? 'Stop tail' : 'Live tail'}
          </Btn>
        }
      />
      {live && (
        <div style={{ marginBottom: 14 }}>
          <Banner tone="info" title="Live tail active">
            Streaming new activity via SSE. New rows appear at the top.
          </Banner>
        </div>
      )}
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search actions, resources…"
          results={rows.length}
          filters={[
            {
              options: ['All', 'MERCHANT', 'INTERNAL_ADMIN', 'WEBHOOK', 'SYSTEM', 'CRON'].map((a) => ({ value: a, label: a === 'All' ? 'All actors' : titleCase(a) })),
              value: actor,
              onChange: setActor,
            },
          ]}
        />
        <DataTable
          rowKey="id"
          columns={[
            { key: 'actor', label: 'Actor', render: (r: any) => <Badge tone={r.actor === 'INTERNAL_ADMIN' ? 'magic' : r.actor === 'WEBHOOK' ? 'info' : undefined}>{titleCase(r.actor)}</Badge> },
            { key: 'action', label: 'Action', render: (r: any) => <span className="cell-strong">{titleCase(r.action)}</span> },
            { key: 'resource', label: 'Resource', render: (r: any) => <span className="cell-sub">{r.resource}</span> },
            { key: 'shop', label: 'Store' },
            { key: 'ip', label: 'IP', render: (r: any) => <span className="t-mono t-xs t-muted">{r.ip}</span> },
            { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" className="btn-plain" onClick={() => ctx.go('#/admin/activity/' + r.id)}>
                    View
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

