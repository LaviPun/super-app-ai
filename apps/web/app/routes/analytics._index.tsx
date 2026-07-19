import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useSearchParams } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { getCategoryDisplayLabel, getCategoryIcon } from '~/utils/type-label';
import {
  CHART, EmptyState, LearnMore, Progress, Sparkline, StatStrip, Tabs, exportCSV, fmtCents, fmtNum,
} from '~/components/merchant/polaris';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Same category → icon mapping the modules page uses (shared taxonomy, no heuristics).
const CAT_ICON: Record<string, string> = { desktop: 'desktop', settings: 'settings', users: 'team', bolt: 'bolt', connect: 'connect', flow: 'automation' };
function catIcon(category: string): string {
  return CAT_ICON[getCategoryIcon(category)] ?? 'layer';
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
      select: { id: true, name: true, category: true },
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
        category: m.category,
        type: getCategoryDisplayLabel(m.category),
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
    <MerchantShell polaris>
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
    exportCSV(`analytics-${range}.csv`, [
      ['name', 'type', 'views', 'engagedPct', 'actions', 'conversions'],
      ...perf.map((r: any) => [r.name, r.type, r.views, r.engagedPct, r.actions, r.conversions]),
    ]);
  };

  const engagementRate = totals.views > 0 ? ((totals.interactions / totals.views) * 100).toFixed(1) + '%' : '—';
  const funnel: Array<[string, number]> = [
    ['Module views', totals.views],
    ['Engaged', totals.interactions],
    ['Actions', totals.actions],
    ['Converted', totals.conversions],
  ];
  const funnelPct = (n: number) => (totals.views > 0 ? Math.round((n / totals.views) * 100) : 0);
  const dailyAvg = hasMetrics ? Math.round(totals.views / days) : 0;
  const peak = hasMetrics ? Math.max(...series, 0) : 0;

  return (
    <s-page heading="Analytics" inlineSize="base">
      <s-button slot="secondary-actions" icon="export" onClick={onExport}>Export</s-button>
      <s-stack gap="base">
      <s-paragraph color="subdued">Storefront impact of your live modules and automations.{' '}<LearnMore anchor="guide-publishing" topic="module performance" /></s-paragraph>

      <Tabs
        tabs={[{ id: '7d', label: 'Last 7 days' }, { id: '30d', label: 'Last 30 days' }, { id: '90d', label: 'Last 90 days' }]}
        value={range}
        onChange={setRange}
      />

      <StatStrip
        items={[
          {
            label: 'Module views',
            value: fmtNum(totals.views),
            delta: deltas.views,
            deltaDir: deltas.viewsDir,
            trend: hasMetrics ? series : undefined,
            trendColor: CHART.accent,
          },
          {
            label: 'Engagement rate',
            value: engagementRate,
            delta: deltas.engagement,
            deltaDir: deltas.engagementDir,
            sub: `${fmtNum(totals.interactions)} interactions`,
          },
          {
            label: 'Conversions',
            value: fmtNum(totals.conversions),
            delta: deltas.conversions,
            deltaDir: deltas.conversionsDir,
            sub: `${fmtNum(totals.actions)} actions`,
          },
          {
            label: 'AI spend',
            value: fmtCents(ai.costCents),
            delta: deltas.ai,
            deltaDir: deltas.aiDir,
            deltaTone: deltas.aiDir === 'up' ? 'bad' : 'good',
            sub: `${fmtNum(ai.requests)} requests`,
          },
        ]}
      />

      <s-grid gridTemplateColumns="2fr 1fr" gap="base">
        <s-section heading="Module views">
          {hasMetrics ? (
            <s-stack gap="small-100">
              <Sparkline data={series} color={CHART.success} w={760} h={130} />
              <s-stack direction="inline" justifyContent="space-between">
                <s-text color="subdued">{days} days ago</s-text>
                <s-text color="subdued">Today</s-text>
              </s-stack>
              <s-text color="subdued">
                {fmtNum(totals.views)} views over the last {days} days · {fmtNum(dailyAvg)}/day average · peak day {fmtNum(peak)}
              </s-text>
            </s-stack>
          ) : (
            <s-text color="subdued">
              No storefront metrics recorded in this period yet. Views appear once a published module is seen on your storefront.
            </s-text>
          )}
        </s-section>

        <s-section heading="Conversion funnel">
          {totals.views > 0 ? (
            <s-stack gap="small-100">
              {funnel.map(([label, n]) => (
                <s-stack key={label} gap="none">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="baseline">
                    <s-text type="strong">{label}</s-text>
                    <s-text color="subdued">{fmtNum(n)} · {funnelPct(n)}%</s-text>
                  </s-stack>
                  <Progress value={funnelPct(n)} />
                </s-stack>
              ))}
            </s-stack>
          ) : (
            <s-text color="subdued">
              No funnel data yet — it builds from real module views, interactions and conversions.
            </s-text>
          )}
        </s-section>
      </s-grid>

      <s-section padding="none" heading="Module performance">
        <s-button slot="primary-action" variant="tertiary" href="/modules">All modules</s-button>
        {perf.length === 0 ? (
          <EmptyState icon="chart-vertical" heading="No published modules yet">
            Publish a module to start seeing storefront performance.
          </EmptyState>
        ) : (
          <s-table>
            <s-grid slot="filters" gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
              <s-text color="subdued">{publishedCount} published modules · last {days} days</s-text>
              <s-text color="subdued">sorted by views</s-text>
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">Module</s-table-header>
              <s-table-header format="numeric">Views</s-table-header>
              <s-table-header format="numeric">Engage %</s-table-header>
              <s-table-header format="numeric">Actions</s-table-header>
              <s-table-header format="numeric" listSlot="inline">Conversions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {perf.map((r: any) => (
                <s-table-row key={r.id} clickDelegate={`perf-link-${r.id}`}>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-100" alignItems="center">
                      <s-icon type={catIcon(r.category) as never} tone="neutral" size="small" />
                      <s-link id={`perf-link-${r.id}`} onClick={() => navigate(`/modules/${r.id}`)}>
                        <s-text type="strong">{r.name}</s-text>
                      </s-link>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{fmtNum(r.views)}</s-table-cell>
                  <s-table-cell>{r.engagedPct}%</s-table-cell>
                  <s-table-cell>{fmtNum(r.actions)}</s-table-cell>
                  <s-table-cell><s-text type="strong">{fmtNum(r.conversions)}</s-text></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      </s-stack>
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
