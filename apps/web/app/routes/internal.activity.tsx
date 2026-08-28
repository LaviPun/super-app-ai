import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
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
  formatRelativeTime,
} from '~/components/admin/page-kit';
import { LogTabs } from '~/components/admin/LogTabs';
import { useLiveTail } from '~/hooks/useLiveTail';

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
      // Formatted server-side (once, at the loader's instant) rather than at
      // component render time — hydration reuses this exact embedded string
      // instead of recomputing "X ago" against a later Date.now(), which
      // previously could tip over a minute/hour boundary between the SSR
      // paint and the client hydration pass and trigger a React hydration
      // text-mismatch warning (logged as a console error).
      created: formatRelativeTime(l.createdAt.toISOString()),
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    distinctActions,
    filters: { actor, action, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
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
  // the EventSource is closed on toggle-off/unmount. See useLiveTail for the
  // reconnect/give-up-loudly behavior.
  const since = data.logs[0]?.createdAt ?? new Date().toISOString();
  const tailStatus = useLiveTail<LiveActivity>({
    enabled: live,
    url: live ? '/internal/activity/stream?since=' + encodeURIComponent(since) : null,
    onEvent: (l) => setLiveRows((prev) => (prev.some((p) => p.id === l.id) ? prev : [l, ...prev].slice(0, 200))),
    onGiveUp: (message) => {
      setLive(false);
      ctx.toast(message, true);
    },
  });

  // Live (SSE) rows never existed in the server-rendered payload, so it's safe to
  // format their relative time at render time. Loader-sourced rows use the
  // `created` string the loader already computed — reusing it (rather than
  // recomputing against a later Date.now()) is what keeps SSR and hydration
  // output identical; see the loader's comment on `created`.
  const mapLiveRow = (l: LiveActivity) => ({
    id: l.id, actor: l.actor, action: l.action, resource: l.resource ?? '—', shop: l.shopDomain ?? '—', ip: l.ip ?? '—', created: formatRelativeTime(l.createdAt),
  });
  const mapLoadedRow = (l: (typeof data.logs)[number]) => ({
    id: l.id, actor: l.actor, action: l.action, resource: l.resource ?? '—', shop: l.shopDomain ?? '—', ip: l.ip ?? '—', created: l.created,
  });
  const liveIds = new Set(liveRows.map((l) => l.id));
  const ROWS: any[] = [
    ...liveRows.map(mapLiveRow),
    ...data.logs.filter((l) => !liveIds.has(l.id)).map(mapLoadedRow),
  ];

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
      <LogTabs active="activity" />
      {live && (
        <div style={{ marginBottom: 14 }}>
          {tailStatus === 'reconnecting' ? (
            <Banner tone="warning" title="Live tail reconnecting…">
              The stream dropped — retrying. Rows will resume once reconnected.
            </Banner>
          ) : tailStatus === 'connecting' ? (
            <Banner tone="info" title="Live tail connecting…">
              Opening the stream.
            </Banner>
          ) : (
            <Banner tone="info" title="Live tail active">
              Streaming new activity via SSE. New rows appear at the top.
            </Banner>
          )}
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

