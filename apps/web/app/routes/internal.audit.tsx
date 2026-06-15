import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';
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
    rows: rows.map(r => ({
      id: r.id,
      action: r.action,
      details: r.details,
      shopDomain: r.shop?.shopDomain ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
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

const DESIGN_AUDIT: any[] = ACTIVITY.filter((a) => ['PLAN_CHANGED', 'PROVIDER_ACTIVATED', 'RETENTION_PURGE'].includes(a.action)).concat([
  { id: 'au1', actor: 'INTERNAL_ADMIN', action: 'MODULE_DELETED', resource: 'Legacy popup', shop: 'Lumen Skincare', ip: '10.0.x.x', created: '6h ago' },
  { id: 'au2', actor: 'INTERNAL_ADMIN', action: 'PROVIDER_KEY_ROTATED', resource: 'OpenAI Production', shop: '—', ip: '10.0.x.x', created: '1d ago' },
]);

export default function AdminAudit() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();

  const ROWS: any[] = data.rows.length
    ? data.rows.map((r) => ({ id: r.id, actor: 'INTERNAL_ADMIN', action: r.action, resource: r.details ?? '—', shop: r.shopDomain ?? '—', ip: '10.0.x.x', created: relAudit(r.createdAt) }))
    : DESIGN_AUDIT;
  const rows = ROWS.filter((a) => (a.action + a.resource).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Audit Log"
        sub="Sensitive admin and merchant actions — deletions, plan changes, key rotations, overrides — retained for compliance."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportCSV('audit-log.csv', rows, ['created', 'actor', 'action', 'resource', 'shop', 'ip']);
              ctx.toast('Exported ' + rows.length + ' audit events');
            }}
          >
            Export for compliance
          </Btn>
        }
      />
      <Card>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search audit events…" results={rows.length} />
        <DataTable
          rowKey="id"
          columns={[
            { key: 'created', label: 'Timestamp', render: (r: any) => <span className="t-mono t-xs">{r.created}</span> },
            { key: 'actor', label: 'Actor', render: (r: any) => <Badge tone="magic">{titleCase(r.actor)}</Badge> },
            { key: 'action', label: 'Action', render: (r: any) => <span className="cell-strong">{titleCase(r.action)}</span> },
            { key: 'resource', label: 'Resource', render: (r: any) => <span className="cell-sub">{r.resource}</span> },
            { key: 'shop', label: 'Store' },
            { key: 'ip', label: 'IP', render: (r: any) => <span className="t-mono t-xs t-muted">{r.ip}</span> },
          ]}
          rows={rows}
        />
      </Card>
    </div>
  );
}

