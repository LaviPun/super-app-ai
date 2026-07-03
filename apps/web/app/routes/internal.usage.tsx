import { json } from '@remix-run/node';
import { useFetcher, useLoaderData } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { generateCorrelationId } from '~/services/observability/correlation.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  PageHead,
  FilterBar,
  StatTile,
  Sparkline,
  useTableState,
  fmtCents,
  fmtNum,
  titleCase,
  exportCSV,
} from '~/components/admin/page-kit';

const SPARK_DAYS = 14;
const DAY_MS = 24 * 3600 * 1000;

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  if (intent !== 'replay') return json({ ok: false, message: 'Unknown intent' }, { status: 400 });

  const usageId = String(formData.get('usageId') ?? '');
  if (!usageId) return json({ ok: false, message: 'Missing usageId' }, { status: 400 });

  const prisma = getPrisma();
  const original = await prisma.aiUsage.findUnique({ where: { id: usageId } });
  if (!original) return json({ ok: false, message: 'AI usage row not found' }, { status: 404 });

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
  return json({ ok: true, message: 'Re-enqueued generation as job ' + job.id, newJobId: job.id, correlationId });
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actionFilter = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const now = new Date();
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : new Date(now.getTime() - 30 * DAY_MS);
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const { cursor, take, skip } = parseCursorParams(url);
  const prisma = getPrisma();

  const baseWhere: Prisma.AiUsageWhereInput = {};
  if (actionFilter) baseWhere.action = actionFilter;
  if (correlationId) baseWhere.correlationId = correlationId;
  if (search) baseWhere.OR = [{ action: { contains: search } }];

  const where: Prisma.AiUsageWhereInput = {
    ...baseWhere,
    createdAt: { gte: dateFrom, ...(dateTo ? { lte: dateTo } : {}) },
  };

  // Previous window of equal length, for real period-over-period deltas.
  const windowEnd = dateTo ?? now;
  const windowMs = Math.max(windowEnd.getTime() - dateFrom.getTime(), DAY_MS);
  const prevWhere: Prisma.AiUsageWhereInput = {
    ...baseWhere,
    createdAt: { gte: new Date(dateFrom.getTime() - windowMs), lt: dateFrom },
  };

  // Daily series buckets: last SPARK_DAYS UTC days, oldest first.
  const sparkFrom = new Date(now);
  sparkFrom.setUTCHours(0, 0, 0, 0);
  sparkFrom.setUTCDate(sparkFrom.getUTCDate() - (SPARK_DAYS - 1));

  const [rows, totals, prevTotals, sparkRows, actionRows] = await Promise.all([
    prisma.aiUsage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      skip,
      cursor,
      include: { provider: true, shop: true },
    }),
    prisma.aiUsage.aggregate({
      where,
      _sum: { costCents: true, tokensIn: true, tokensOut: true, requestCount: true },
    }),
    prisma.aiUsage.aggregate({
      where: prevWhere,
      _sum: { costCents: true, requestCount: true },
    }),
    prisma.aiUsage.findMany({
      where: { ...baseWhere, createdAt: { gte: sparkFrom } },
      select: { createdAt: true, costCents: true, requestCount: true },
    }),
    prisma.aiUsage.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);

  const dailyCost = new Array<number>(SPARK_DAYS).fill(0);
  const dailyCalls = new Array<number>(SPARK_DAYS).fill(0);
  for (const r of sparkRows) {
    const idx = Math.floor((r.createdAt.getTime() - sparkFrom.getTime()) / DAY_MS);
    if (idx >= 0 && idx < SPARK_DAYS) {
      dailyCost[idx] = (dailyCost[idx] ?? 0) + r.costCents;
      dailyCalls[idx] = (dailyCalls[idx] ?? 0) + (r.requestCount ?? 1);
    }
  }

  const totalCostCents = totals._sum.costCents ?? 0;
  const totalRequests = totals._sum.requestCount ?? 0;

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
    totalTokensIn: totals._sum.tokensIn ?? 0,
    totalTokensOut: totals._sum.tokensOut ?? 0,
    deltas: {
      requests: pctDelta(totalRequests, prevTotals._sum.requestCount ?? 0),
      cost: pctDelta(totalCostCents, prevTotals._sum.costCents ?? 0),
    },
    dailyCost,
    dailyCalls,
    actions: actionRows.map(a => a.action),
    filters: { action: actionFilter, search, correlationId, dateFrom: dateFrom.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursor: buildNextCursorUrl(url, rows, take),
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function deltaProps(pct: number | null): { delta?: string; deltaDir?: 'up' | 'down' } {
  if (pct == null) return {};
  return { delta: Math.abs(pct) + '%', deltaDir: pct < 0 ? 'down' : 'up' };
}

export default function AdminUsage() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState();
  const [action, setAction] = useState('All actions');
  const [metric, setMetric] = useState<'cost' | 'calls'>('cost');

  const replayFetcher = useFetcher<{ ok: boolean; message: string }>();
  const replayBusy = replayFetcher.state !== 'idle';
  const pendingUsageId = replayBusy ? String(replayFetcher.formData?.get('usageId') ?? '') : '';
  useEffect(() => {
    if (replayFetcher.state === 'idle' && replayFetcher.data) {
      ctx.toast(replayFetcher.data.message, !replayFetcher.data.ok);
    }
  }, [replayFetcher.state, replayFetcher.data, ctx]);
  const submitReplay = (usageId: string) => {
    const fd = new FormData();
    fd.set('intent', 'replay');
    fd.set('usageId', usageId);
    replayFetcher.submit(fd, { method: 'post' });
  };

  const ROWS: any[] = data.rows.map((r) => ({
    id: r.id, shop: r.shopDomain ?? '—', action: r.action, tokensIn: r.tokensIn ?? 0, tokensOut: r.tokensOut ?? 0,
    costCents: r.costCents ?? 0, provider: r.providerName, created: new Date(r.createdAt).toLocaleDateString(),
    correlationId: r.correlationId ?? '',
  }));
  const rows = ROWS.filter((r) => (action === 'All actions' || r.action === action) && r.shop.toLowerCase().includes(ts.search.toLowerCase()));
  const spark = metric === 'cost' ? data.dailyCost : data.dailyCalls;

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
        <StatTile label="AI calls (30d)" value={fmtNum(data.totalRequests)} icon="magic" tone="magic" {...deltaProps(data.deltas.requests)} />
        <StatTile label="Tokens in (30d)" value={fmtNum(data.totalTokensIn)} icon="upload" tone="info" />
        <StatTile label="Tokens out (30d)" value={fmtNum(data.totalTokensOut)} icon="download" tone="info" />
        <StatTile label="Cost (30d)" value={fmtCents(data.totalCostCents)} icon="chart" tone="success" {...deltaProps(data.deltas.cost)} />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <CardHead
          title={metric === 'cost' ? 'Daily cost' : 'Daily calls'}
          sub="Last 14 days"
          actions={
            <div className="seg">
              <button aria-selected={metric === 'cost'} onClick={() => setMetric('cost')}>Cost</button>
              <button aria-selected={metric === 'calls'} onClick={() => setMetric('calls')}>Calls</button>
            </div>
          }
        />
        <div style={{ padding: 16 }}>
          <Sparkline data={spark} w={1160} h={130} color="var(--p-success)" />
        </div>
      </Card>
      <Card>
        {data.rows.length === 0 ? (
          <EmptyState icon="magic" title="No AI usage yet">
            AI calls will appear here as merchants generate, hydrate and modify modules.
          </EmptyState>
        ) : (
          <>
            <FilterBar
              search={ts.search}
              onSearch={ts.setSearch}
              placeholder="Search by store…"
              results={rows.length}
              filters={[{ options: ['All actions'].concat(data.actions), value: action, onChange: setAction }]}
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
                      <Btn
                        size="sm"
                        icon="replay"
                        className="btn-plain"
                        loading={pendingUsageId === r.id}
                        disabled={replayBusy}
                        onClick={() => submitReplay(r.id)}
                      >
                        Replay
                      </Btn>
                      {r.correlationId ? (
                        <Btn size="sm" icon="transfer" className="btn-plain" onClick={() => ctx.go('#/admin/trace/' + r.correlationId)}>
                          Trace
                        </Btn>
                      ) : null}
                    </div>
                  ),
                },
              ]}
              rows={rows}
            />
          </>
        )}
      </Card>
    </div>
  );
}
