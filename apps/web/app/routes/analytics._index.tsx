import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Card, CardHead, PageHead, StatTile, DataTable, Sparkline, Progress, EmptyState, fmtNum, fmtCents,
  exportCSV,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

const T_ICON: Record<string, string> = { 'Storefront UI': 'desktop', 'Function': 'bolt', 'Integration': 'connect', 'Flow': 'flow', 'Data store': 'database' };
const T_COLOR: Record<string, string> = { 'Storefront UI': 'info', 'Function': 'warning', 'Integration': 'magic', 'Flow': 'success', 'Data store': 'info' };

function designType(t: string): string {
  if (/flow/i.test(t)) return 'Flow';
  if (/function|discount/i.test(t)) return 'Function';
  if (/connector|integration/i.test(t)) return 'Integration';
  if (/data|store/i.test(t)) return 'Data store';
  return 'Storefront UI';
}

/** Real percent change vs the previous window, or null when there is no baseline. */
function pctDelta(current: number, previous: number): string | null {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return `${Math.abs(pct).toFixed(1)}%`;
}
function deltaDir(current: number, previous: number): 'up' | 'down' {
  return current >= previous ? 'up' : 'down';
}

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const url = new URL(request.url);
  const rangeParam = url.searchParams.get('range');
  const range = rangeParam === '7d' || rangeParam === '90d' ? rangeParam : '30d';
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, select: { id: true } });

  const empty = {
    range,
    days,
    publishedCount: 0,
    perf: [] as any[],
    series: [] as number[],
    hasMetrics: false,
    totals: { views: 0, interactions: 0, actions: 0, conversions: 0 },
    deltas: { views: null as string | null, viewsDir: 'up' as 'up' | 'down', engagement: null as string | null, engagementDir: 'up' as 'up' | 'down', conversions: null as string | null, conversionsDir: 'up' as 'up' | 'down', ai: null as string | null, aiDir: 'up' as 'up' | 'down' },
    ai: { costCents: 0, requests: 0 },
  };
  if (!shopRow) return json(empty);

  const now = Date.now();
  const since = new Date(now - days * 86400000);
  const prevSince = new Date(now - 2 * days * 86400000);

  const [published, metricRows, prevAgg, aiAgg, aiPrevAgg] = await Promise.all([
    prisma.module.findMany({
      where: { shopId: shopRow.id, status: 'PUBLISHED' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, name: true, type: true },
    }),
    prisma.moduleMetricsDaily.findMany({
      where: { shopId: shopRow.id, date: { gte: since } },
      select: { moduleId: true, date: true, impressions: true, interactions: true, actions: true, conversions: true },
      orderBy: { date: 'asc' },
      take: 5000,
    }),
    prisma.moduleMetricsDaily.aggregate({
      where: { shopId: shopRow.id, date: { gte: prevSince, lt: since } },
      _sum: { impressions: true, interactions: true, conversions: true },
    }),
    prisma.aiUsage.aggregate({
      where: { shopId: shopRow.id, createdAt: { gte: since } },
      _sum: { costCents: true, requestCount: true },
    }),
    prisma.aiUsage.aggregate({
      where: { shopId: shopRow.id, createdAt: { gte: prevSince, lt: since } },
      _sum: { costCents: true, requestCount: true },
    }),
  ]);

  // Aggregate real daily metrics per module and per day.
  const byModule = new Map<string, { views: number; interactions: number; actions: number; conversions: number }>();
  const series: number[] = Array.from({ length: days }, () => 0);
  const totals = { views: 0, interactions: 0, actions: 0, conversions: 0 };
  for (const row of metricRows) {
    const cur = byModule.get(row.moduleId) ?? { views: 0, interactions: 0, actions: 0, conversions: 0 };
    cur.views += row.impressions;
    cur.interactions += row.interactions;
    cur.actions += row.actions;
    cur.conversions += row.conversions;
    byModule.set(row.moduleId, cur);
    totals.views += row.impressions;
    totals.interactions += row.interactions;
    totals.actions += row.actions;
    totals.conversions += row.conversions;
    const idx = days - 1 - Math.min(days - 1, Math.max(0, Math.floor((now - new Date(row.date).getTime()) / 86400000)));
    series[idx] = (series[idx] ?? 0) + row.impressions;
  }

  const perf = published
    .map((m) => {
      const s = byModule.get(m.id) ?? { views: 0, interactions: 0, actions: 0, conversions: 0 };
      return {
        id: m.id,
        name: m.name,
        type: designType(m.type),
        views: s.views,
        engagedPct: s.views > 0 ? ((s.interactions / s.views) * 100).toFixed(1) : '0.0',
        actions: s.actions,
        conversions: s.conversions,
      };
    })
    .sort((a, b) => b.views - a.views);

  const prevViews = prevAgg._sum.impressions ?? 0;
  const prevInteractions = prevAgg._sum.interactions ?? 0;
  const prevConversions = prevAgg._sum.conversions ?? 0;
  const engagement = totals.views > 0 ? totals.interactions / totals.views : 0;
  const prevEngagement = prevViews > 0 ? prevInteractions / prevViews : 0;
  const aiCost = aiAgg._sum.costCents ?? 0;
  const aiPrevCost = aiPrevAgg._sum.costCents ?? 0;

  return json({
    range,
    days,
    publishedCount: published.length,
    perf,
    series,
    hasMetrics: metricRows.length > 0,
    totals,
    deltas: {
      views: pctDelta(totals.views, prevViews),
      viewsDir: deltaDir(totals.views, prevViews),
      engagement: prevEngagement > 0 ? `${Math.abs((engagement - prevEngagement) * 100).toFixed(1)} pts` : null,
      engagementDir: deltaDir(engagement, prevEngagement),
      conversions: pctDelta(totals.conversions, prevConversions),
      conversionsDir: deltaDir(totals.conversions, prevConversions),
      ai: pctDelta(aiCost, aiPrevCost),
      aiDir: deltaDir(aiCost, aiPrevCost),
    },
    ai: { costCents: aiCost, requests: aiAgg._sum.requestCount ?? 0 },
  });
}

export default function AnalyticsIndex() {
  const data = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <AnalyticsBody {...(data as any)} />
    </MerchantShell>
  );
}

function AnalyticsBody({ range, days, publishedCount, perf, series, hasMetrics, totals, deltas, ai }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const setRange = (r: string) => {
    const p = new URLSearchParams(params);
    if (r === '30d') p.delete('range'); else p.set('range', r);
    setParams(p, { preventScrollReset: true });
  };

  const onExport = () => {
    if (!perf.length) {
      ctx.toast('No analytics data to export yet', { error: true });
      return;
    }
    exportCSV(`analytics-${range}.csv`, perf, ['name', 'type', 'views', 'engagedPct', 'actions', 'conversions']);
  };

  const engagementRate = totals.views > 0 ? ((totals.interactions / totals.views) * 100).toFixed(1) + '%' : '—';
  const funnel: [string, number, string][] = [
    ['Module views', totals.views, 'info'],
    ['Engaged', totals.interactions, 'magic'],
    ['Actions', totals.actions, 'warning'],
    ['Converted', totals.conversions, 'success'],
  ];
  const funnelPct = (n: number) => (totals.views > 0 ? Math.round((n / totals.views) * 100) : 0);

  return (
    <div className="page">
      <PageHead
        title="Analytics"
        sub="Storefront impact of your live modules and automations."
        actions={(
          <>
            <div className="seg">{['7d', '30d', '90d'].map((r) => <button key={r} aria-selected={range === r} onClick={() => setRange(r)}>{r}</button>)}</div>
            <Btn icon="download" onClick={onExport}>Export</Btn>
          </>
        )}
      />
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatTile label="Module views" value={fmtNum(totals.views)} icon="eye" tone="info" delta={deltas.views} deltaDir={deltas.viewsDir} />
        <StatTile label="Engagement rate" value={engagementRate} icon="rocket" tone="magic" delta={deltas.engagement} deltaDir={deltas.engagementDir} />
        <StatTile label="Conversions" value={fmtNum(totals.conversions)} icon="cart" tone="success" delta={deltas.conversions} deltaDir={deltas.conversionsDir} />
        <StatTile label="AI spend" value={fmtCents(ai.costCents)} icon="magic" tone="warning" delta={deltas.ai} deltaDir={deltas.aiDir} sub={`${fmtNum(ai.requests)} requests`} />
      </div>
      <div className="col-main" style={{ marginBottom: 18 }}>
        <Card>
          <CardHead title="Module views" sub={`Last ${days} days · from live modules`} />
          {hasMetrics ? (
            <div style={{ padding: '8px 16px 16px' }}>
              <Sparkline data={series} color="var(--p-success)" w={760} h={130} />
              <div className="row spread t-xs t-muted" style={{ marginTop: 6 }}><span>{days} days ago</span><span>Today</span></div>
            </div>
          ) : (
            <div style={{ padding: 24, color: 'var(--p-text-secondary)', fontSize: 14 }}>
              No storefront metrics recorded in this period yet. Views appear once a published module is seen on your storefront.
            </div>
          )}
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>Conversion funnel</div>
          {totals.views > 0 ? (
            <div className="stack-4">
              {funnel.map((f, i) => (
                <div key={i} className="stack-1">
                  <div className="row spread">
                    <span className="t-sm t-strong">{f[0]}</span>
                    <span className="t-sm t-num t-muted">{fmtNum(f[1])} · {funnelPct(f[1])}%</span>
                  </div>
                  <Progress value={funnelPct(f[1])} tone={f[2] === 'success' ? undefined : f[2]} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '8px 0', color: 'var(--p-text-secondary)', fontSize: 14 }}>
              No funnel data yet — it builds from real module views, interactions and conversions.
            </div>
          )}
        </Card>
      </div>
      <Card>
        <CardHead title="Module performance" sub={`${publishedCount} published modules`}
          actions={<a href="/modules" className="btn btn-plain btn-sm">All modules</a>} />
        {perf.length === 0 ? (
          <EmptyState icon="chart" title="No published modules yet">
            Publish a module to start seeing storefront performance.
          </EmptyState>
        ) : (
          <DataTable rowKey="id" onRowClick={(r: any) => navigate(`/modules/${r.id}`)} columns={[
            { key: 'name', label: 'Module', render: (r: any) => (
              <div className="row-3">
                <span className="tile-ico" style={{ width: 30, height: 30, background: `var(--p-${T_COLOR[r.type]}-bg)`, color: `var(--p-${T_COLOR[r.type]})` }}><Icon name={T_ICON[r.type] ?? 'layers'} size={15} /></span>
                <span className="cell-strong">{r.name}</span>
              </div>
            ) },
            { key: 'views', label: 'Views', num: true, render: (r: any) => fmtNum(r.views) },
            { key: 'engagedPct', label: 'Engage %', num: true, render: (r: any) => r.engagedPct + '%' },
            { key: 'actions', label: 'Actions', num: true, render: (r: any) => fmtNum(r.actions) },
            { key: 'conversions', label: 'Conversions', num: true, render: (r: any) => <span className="cell-strong">{fmtNum(r.conversions)}</span> },
          ]} rows={perf} />
        )}
      </Card>
    </div>
  );
}
