import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';
import { useState } from 'react';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  useTableState,
  titleCase,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get('shopDomain') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;
  const page = parseCursorParams(url, 150);

  const prisma = getPrisma();
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (search) {
    where.OR = [
      { action: { contains: search } },
      { details: { contains: search } },
    ];
  }
  if (shopDomain) {
    where.shop = { is: { shopDomain: { contains: shopDomain } } };
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: page.take,
    skip: page.skip,
    cursor: page.cursor,
    include: { shop: true },
  });
  const nextCursorHref = buildNextCursorUrl(url, rows, page.take);

  const distinctActionsRows = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ['action'],
    orderBy: { action: 'asc' },
    take: 200,
  });

  return json({
    rows: rows.map(r => {
      // AuditLog has no dedicated actor column; writers embed the real actor in
      // the details JSON (see ReleaseTransitionService.logTransition). Surface it
      // when present — never fabricate one.
      let actor: string | null = null;
      let resource: string | null = null;
      if (r.details) {
        try {
          const parsed = JSON.parse(r.details) as Record<string, unknown>;
          if (typeof parsed.actor === 'string' && parsed.actor) actor = parsed.actor;
          if (typeof parsed.moduleId === 'string' && parsed.moduleId) resource = `module:${parsed.moduleId}`;
        } catch {
          // details is not JSON — shown raw as the resource below
        }
      }
      return {
        id: r.id,
        action: r.action,
        actor,
        resource,
        details: r.details,
        shopDomain: r.shop?.shopDomain ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
    distinctActions: distinctActionsRows.map(d => d.action),
    filters: { shopDomain, action, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

function relAudit(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export default function AdminAudit() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [action, setAction] = useState('All');

  const ROWS: any[] = data.rows.map((r) => ({
    id: r.id,
    actor: r.actor,
    action: r.action,
    resource: r.resource ?? r.details ?? '—',
    shop: r.shopDomain ?? '—',
    created: relAudit(r.createdAt),
    createdAt: r.createdAt,
  }));
  const rows = ROWS.filter((a) => (action === 'All' || a.action === action) && (a.action + a.resource).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Audit Log"
        sub="Sensitive admin and merchant actions — deletions, plan changes, key rotations, overrides — retained for compliance."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              if (!rows.length) {
                ctx.toast('No audit events to export', true);
                return;
              }
              exportCSV('audit-log.csv', rows, ['createdAt', 'actor', 'action', 'resource', 'shop']);
              ctx.toast('Exported ' + rows.length + ' audit events');
            }}
          >
            Export for compliance
          </Btn>
        }
      />
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search audit events…"
          results={rows.length}
          filters={[{ options: ['All', ...data.distinctActions].map((a) => ({ value: a, label: a === 'All' ? 'All actions' : titleCase(a) })), value: action, onChange: setAction }]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            columns={[
              { key: 'created', label: 'Timestamp', render: (r: any) => <span className="t-mono t-xs">{r.created}</span> },
              { key: 'actor', label: 'Actor', render: (r: any) => (r.actor ? <Badge tone={r.actor === 'INTERNAL_ADMIN' ? 'magic' : undefined}>{titleCase(r.actor)}</Badge> : <span className="t-muted">—</span>) },
              { key: 'action', label: 'Action', render: (r: any) => <span className="cell-strong">{titleCase(r.action)}</span> },
              { key: 'resource', label: 'Resource', render: (r: any) => <span className="cell-sub t-trunc" style={{ maxWidth: 360, display: 'inline-block' }}>{r.resource}</span> },
              { key: 'shop', label: 'Store' },
              { key: 'ip', label: 'IP', render: () => <span className="t-mono t-xs t-muted">—</span> },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="shield" title={data.rows.length ? 'No matching audit events' : 'No audit events yet'}>
            {data.rows.length ? 'Adjust the action filter or search to see more results.' : 'Sensitive actions recorded for compliance will appear here.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

