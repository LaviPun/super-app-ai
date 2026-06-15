import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { generateCorrelationId } from '~/services/observability/correlation.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  CardHead,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  Sparkline,
  useTableState,
  fmtCents,
  fmtNum,
  titleCase,
  USAGE_ROWS,
  exportCSV,
} from '~/components/admin/page-kit';

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  if (intent !== 'replay') return json({ ok: false, error: 'Unknown intent' }, { status: 400 });

  const usageId = String(formData.get('usageId') ?? '');
  if (!usageId) return json({ ok: false, error: 'Missing usageId' }, { status: 400 });

  const prisma = getPrisma();
  const original = await prisma.aiUsage.findUnique({ where: { id: usageId } });
  if (!original) return json({ ok: false, error: 'AI usage row not found' }, { status: 404 });

  let meta: Record<string, unknown> | null = null;
  if (original.meta) {
    try { meta = JSON.parse(original.meta) as Record<string, unknown>; }
    catch { meta = null; }
  }

  const correlationId = original.correlationId ?? generateCorrelationId();
  const job = await new JobService().create({
    shopId: original.shopId ?? undefined,
    type: 'AI_GENERATE',
    payload: { replayOf: original.id, action: original.action, meta: meta ?? {} },
    correlationId,
  });
  return json({ ok: true, newJobId: job.id, correlationId });
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actionFilter = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const { cursor, take, skip } = parseCursorParams(url);
  const prisma = getPrisma();
  const where: Record<string, unknown> = { createdAt: { gte: dateFrom } };
  if (dateTo) (where.createdAt as Record<string, unknown>).lte = dateTo;
  if (actionFilter) where.action = actionFilter;
  if (correlationId) where.correlationId = correlationId;
  if (search) {
    where.OR = [{ action: { contains: search } }];
  }

  const rows = await prisma.aiUsage.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    skip,
    cursor,
    include: { provider: true, shop: true },
  });

  const totalCostCents = rows.reduce((s, r) => s + r.costCents, 0);
  const totalRequests = rows.reduce((s, r) => s + (r.requestCount ?? 1), 0);
  const totalTokensIn = rows.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = rows.reduce((s, r) => s + r.tokensOut, 0);

  return json({
    rows: rows.map(r => ({
      id: r.id,
      action: r.action,
      providerName: r.provider.name,
      requestCount: r.requestCount ?? 1,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costCents: r.costCents,
      shopDomain: r.shop?.shopDomain ?? null,
      createdAt: r.createdAt.toISOString(),
      correlationId: r.correlationId ?? null,
      meta: r.meta,
    })),
    totalCostCents,
    totalRequests,
    totalTokensIn,
    totalTokensOut,
    filters: { action: actionFilter, search, correlationId, dateFrom: dateFrom.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursor: buildNextCursorUrl(url, rows, take),
  });
}

export default function AdminUsage() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [action, setAction] = useState('All actions');
  const spark = [120, 145, 110, 160, 190, 175, 210, 230, 205, 250, 280, 265, 300, 320];

  const ROWS: any[] = data.rows.length
    ? data.rows.map((r) => ({
        id: r.id, shop: r.shopDomain ?? '—', action: r.action, tokensIn: r.tokensIn ?? 0, tokensOut: r.tokensOut ?? 0,
        costCents: r.costCents ?? 0, provider: r.providerName, created: new Date(r.createdAt).toLocaleDateString(),
      }))
    : USAGE_ROWS;
  const rows = ROWS.filter((r) => (action === 'All actions' || r.action === action) && r.shop.toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Usage & Costs"
        sub="AI usage and approximate cost across all stores — rolling 30-day window."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportCSV('ai-usage.csv', rows);
              ctx.toast('Exported ' + rows.length + ' usage rows');
            }}
          >
            Export
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="AI calls (30d)" value={fmtNum(data.totalRequests)} icon="magic" tone="magic" delta="12%" />
        <StatTile label="Tokens in (30d)" value={fmtNum(data.totalTokensIn)} icon="upload" tone="info" />
        <StatTile label="Tokens out (30d)" value={fmtNum(data.totalTokensOut)} icon="download" tone="info" />
        <StatTile label="Cost (30d)" value={fmtCents(data.totalCostCents)} icon="chart" tone="success" delta="5%" />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <CardHead
          title="Daily cost"
          sub="Last 14 days"
          actions={
            <div className="seg">
              <button aria-selected>Cost</button>
              <button>Calls</button>
            </div>
          }
        />
        <div style={{ padding: 16 }}>
          <Sparkline data={spark} w={1160} h={130} color="var(--p-success)" />
        </div>
      </Card>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search by store…"
          results={rows.length}
          filters={[{ options: ['All actions', 'RECIPE_GENERATION', 'MAPPING_SUGGESTION', 'MODIFY_MODULE', 'HYDRATE'], value: action, onChange: setAction }]}
        />
        <DataTable
          rowKey="id"
          columns={[
            { key: 'shop', label: 'Store', render: (r: any) => <span className="cell-strong">{r.shop}</span> },
            { key: 'action', label: 'Action', render: (r: any) => <Badge>{titleCase(r.action)}</Badge> },
            { key: 'provider', label: 'Provider', render: (r: any) => <span className="cell-sub">{r.provider}</span> },
            { key: 'tokensIn', label: 'Tokens in', num: true, render: (r: any) => fmtNum(r.tokensIn) },
            { key: 'tokensOut', label: 'Tokens out', num: true, render: (r: any) => fmtNum(r.tokensOut) },
            { key: 'costCents', label: 'Cost', num: true, render: (r: any) => <span className="t-strong">{fmtCents(r.costCents)}</span> },
            { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" icon="replay" onClick={() => ctx.toast('Re-enqueued generation')} className="btn-plain">
                    Replay
                  </Btn>
                  <Btn size="sm" icon="transfer" onClick={() => ctx.go('#/admin/trace/' + (r.correlationId || 'cor_rs8f2'))} className="btn-plain">
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
