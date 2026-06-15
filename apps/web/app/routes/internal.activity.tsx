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
  Card,
  DataTable,
  PageHead,
  FilterBar,
  useTableState,
  titleCase,
  ACTIVITY,
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

export default function AdminActivity() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [actor, setActor] = useState('All');

  const ROWS: any[] = data.logs.length
    ? data.logs.map((l) => ({ id: l.id, actor: l.actor, action: l.action, resource: l.resource ?? '—', shop: l.shopDomain ?? '—', ip: l.ip ?? '—', created: rel(l.createdAt) }))
    : ACTIVITY;

  const rows = ROWS.filter(
    (a) => (actor === 'All' || a.actor === actor) && (a.action + a.resource + a.shop).toLowerCase().includes(ts.search.toLowerCase()),
  );

  return (
    <div className="page">
      <PageHead
        title="Activity Log"
        sub="Every significant action — page views, clicks, settings changes, request outcomes — across the platform."
        actions={
          <Btn icon="live" onClick={() => ctx.toast('Live tail on')}>
            Live tail
          </Btn>
        }
      />
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

