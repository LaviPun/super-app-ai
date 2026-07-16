import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, useNavigation } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import {
  CHART, EmptyState, MiniBars, Progress, StatTile, StatusBadge, Tabs, fmtNum, titleCase,
} from '~/components/merchant/polaris';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();

  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const since30d = new Date(Date.now() - 30 * 86400000);
  const since7d = new Date(Date.now() - 7 * 86400000);

  const quota = new QuotaService();
  const usage = await quota.getUsageSummary(shopRow.id);

  const [
    jobs,
    recentActivity,
    aiAgg,
  ] = await Promise.all([
    prisma.job.findMany({
      where: { shopId: shopRow.id, createdAt: { gte: since30d } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.activityLog.findMany({
      where: { shopId: shopRow.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    // Exact 30d totals aggregated in the DB (the previous capped findMany undercounted).
    prisma.aiUsage.aggregate({
      where: { shopId: shopRow.id, createdAt: { gte: since30d } },
      _sum: { requestCount: true, tokensIn: true, tokensOut: true, costCents: true },
    }),
  ]);

  // Job breakdown by type
  const jobsByType: Record<string, { total: number; success: number; failed: number }> = {};
  for (const j of jobs) {
    if (!jobsByType[j.type]) jobsByType[j.type] = { total: 0, success: 0, failed: 0 };
    jobsByType[j.type]!.total++;
    if (j.status === 'SUCCESS') jobsByType[j.type]!.success++;
    if (j.status === 'FAILED') jobsByType[j.type]!.failed++;
  }

  // Job success over last 7 days for chart
  const now = new Date();
  const dailySuccess: number[] = [];
  const dailyFailed: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayJobs = jobs.filter(j => { const c = new Date(j.createdAt); return c >= dayStart && c < dayEnd; });
    dailySuccess.push(dayJobs.filter(j => j.status === 'SUCCESS').length);
    dailyFailed.push(dayJobs.filter(j => j.status === 'FAILED').length);
  }

  const successCount = jobs.filter(j => j.status === 'SUCCESS').length;
  const failedCount = jobs.filter(j => j.status === 'FAILED').length;
  const runningCount = jobs.filter(j => j.status === 'RUNNING' || j.status === 'QUEUED').length;
  const successRate = jobs.length > 0 ? Math.round((successCount / jobs.length) * 100) : 100;

  const totalAiCostCents = aiAgg._sum.costCents ?? 0;
  const totalTokensIn = aiAgg._sum.tokensIn ?? 0;
  const totalTokensOut = aiAgg._sum.tokensOut ?? 0;

  return json({
    usage,
    stats: {
      totalJobs: jobs.length,
      successCount,
      failedCount,
      runningCount,
      successRate,
    },
    jobsByType: Object.entries(jobsByType).map(([type, v]) => ({
      type,
      total: v.total,
      success: v.success,
      failed: v.failed,
      rate: v.total > 0 ? Math.round((v.success / v.total) * 100) : 0,
    })),
    dailySuccess,
    dailyFailed,
    aiStats: {
      totalRequests: aiAgg._sum.requestCount ?? 0,
      totalCostCents: totalAiCostCents,
      totalTokensIn,
      totalTokensOut,
    },
    recentJobs: jobs.slice(0, 20).map(j => ({
      id: j.id,
      type: j.type,
      status: j.status,
      error: j.error,
      createdAt: j.createdAt.toISOString(),
      finishedAt: j.finishedAt?.toISOString() ?? null,
    })),
    recentActivity: recentActivity.map(a => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      resource: a.resource,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

function usagePct(used: number, limit: number): number {
  if (limit === -1) return 0;
  if (limit === 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

export default function MerchantLogs() {
  return (
    <MerchantShell polaris>
      <LogsBody />
    </MerchantShell>
  );
}

function LogsBody() {
  const { usage, stats, jobsByType, dailySuccess, dailyFailed, aiStats, recentJobs, recentActivity } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [tab, setTab] = useState('overview');

  const formatQuota = (v: number) => v === -1 ? 'Unlimited' : v.toLocaleString();

  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en', { weekday: 'short' });
  });

  const usageItems = [
    { label: 'AI Requests', used: usage.used.aiRequests, limit: usage.quotas.aiRequestsPerMonth },
    { label: 'Publish Operations', used: usage.used.publishOps, limit: usage.quotas.publishOpsPerMonth },
    { label: 'Workflow Runs', used: usage.used.workflowRuns, limit: usage.quotas.workflowRunsPerMonth },
    { label: 'Connector Calls', used: usage.used.connectorCalls, limit: usage.quotas.connectorCallsPerMonth },
  ];

  return (
    <s-page heading="Logs & Usage" inlineSize="base">
      <s-stack gap="small-100">
        <s-stack direction="inline">
          <s-button variant="tertiary" icon="arrow-left" onClick={() => navigate('/')}>Dashboard</s-button>
        </s-stack>
        <s-paragraph color="subdued">Activity, success rates, usage, and plan limits.</s-paragraph>
      </s-stack>
      <Tabs
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'jobs', label: 'Jobs' },
          { id: 'activity', label: 'Activity' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* ═══ TAB: Overview ═══ */}
      {tab === 'overview' && (
        <>
          <s-banner
            tone={stats.successRate >= 90 ? 'success' : stats.successRate >= 70 ? 'warning' : 'critical'}
            heading={`${stats.successRate}% success rate over the last 30 days`}
          >
            <s-text>
              {stats.totalJobs} jobs total — {stats.successCount} succeeded, {stats.failedCount} failed
              {stats.runningCount > 0 ? `, ${stats.runningCount} in progress` : ''}.
            </s-text>
          </s-banner>

          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
            <StatTile label="Success rate" value={`${stats.successRate}%`} />
            <StatTile label="Total jobs (30d)" value={fmtNum(stats.totalJobs)} />
            <StatTile label="AI requests" value={fmtNum(aiStats.totalRequests)} />
            <StatTile label="AI cost (30d)" value={`$${(aiStats.totalCostCents / 100).toFixed(2)}`} />
          </s-grid>

          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-section heading="Successful jobs (7 days)">
              <s-stack gap="small-200">
                <MiniBars data={dailySuccess} color={CHART.success} height={48} />
                <s-stack direction="inline" justifyContent="space-between">
                  {dayLabels.map((l, i) => <s-text key={i} color="subdued">{l}</s-text>)}
                </s-stack>
              </s-stack>
            </s-section>
            <s-section heading="Failed jobs (7 days)">
              <s-stack gap="small-200">
                <MiniBars data={dailyFailed} color={CHART.critical} height={48} />
                <s-stack direction="inline" justifyContent="space-between">
                  {dayLabels.map((l, i) => <s-text key={i} color="subdued">{l}</s-text>)}
                </s-stack>
              </s-stack>
            </s-section>
          </s-grid>

          {jobsByType.length > 0 && (
            <s-section heading="Success rate by job type" padding="none">
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Type</s-table-header>
                  <s-table-header>Total</s-table-header>
                  <s-table-header>Succeeded</s-table-header>
                  <s-table-header>Failed</s-table-header>
                  <s-table-header listSlot="inline">Rate</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {jobsByType.map(j => (
                    <s-table-row key={j.type}>
                      <s-table-cell><s-text type="strong">{titleCase(j.type)}</s-text></s-table-cell>
                      <s-table-cell>{fmtNum(j.total)}</s-table-cell>
                      <s-table-cell>{fmtNum(j.success)}</s-table-cell>
                      <s-table-cell>{fmtNum(j.failed)}</s-table-cell>
                      <s-table-cell>
                        <s-grid gridTemplateColumns="80px auto" gap="small-100" alignItems="center">
                          <Progress value={j.rate} tone={j.rate >= 90 ? undefined : j.rate >= 70 ? 'warning' : 'critical'} />
                          <s-text>{j.rate}%</s-text>
                        </s-grid>
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          )}

          <s-section heading="Plan usage & limits">
            <s-stack gap="base">
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-badge tone={usage.plan === 'FREE' ? 'warning' : 'success'}>{`${usage.plan} plan`}</s-badge>
                <s-text color="subdued">Current billing period usage against your plan limits.</s-text>
              </s-stack>
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap="base">
                {usageItems.map(item => {
                  const pct = usagePct(item.used, item.limit);
                  return (
                    <s-stack key={item.label} gap="small-200">
                      <s-stack direction="inline" justifyContent="space-between">
                        <s-text>{item.label}</s-text>
                        <s-text color="subdued">{item.used} / {formatQuota(item.limit)}</s-text>
                      </s-stack>
                      <Progress
                        value={item.limit === -1 ? 0 : pct}
                        tone={item.limit === -1 ? undefined : pct >= 90 ? 'critical' : pct >= 70 ? 'warning' : undefined}
                      />
                      {pct >= 90 && item.limit !== -1 && (
                        <s-text tone="critical">Approaching limit — consider upgrading your plan.</s-text>
                      )}
                    </s-stack>
                  );
                })}
              </s-grid>
            </s-stack>
          </s-section>

          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
            <StatTile label="Tokens in (30d)" value={fmtNum(aiStats.totalTokensIn)} />
            <StatTile label="Tokens out (30d)" value={fmtNum(aiStats.totalTokensOut)} />
            <StatTile label="AI requests (30d)" value={fmtNum(aiStats.totalRequests)} />
            <StatTile label="Total cost (30d)" value={`$${(aiStats.totalCostCents / 100).toFixed(2)}`} />
          </s-grid>
        </>
      )}

      {/* ═══ TAB: Jobs ═══ */}
      {tab === 'jobs' && (
        <s-section heading="Recent jobs (last 30 days)" padding="none">
          {isLoading ? (
            <s-box padding="large-100">
              <s-spinner accessibilityLabel="Loading jobs" size="base" />
            </s-box>
          ) : recentJobs.length === 0 ? (
            <EmptyState icon="work" heading="No jobs recorded yet">
              Jobs appear when you generate modules, publish, or run automation flows.
            </EmptyState>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="kicker">Time</s-table-header>
                <s-table-header listSlot="primary">Type</s-table-header>
                <s-table-header listSlot="inline">Status</s-table-header>
                <s-table-header>Duration</s-table-header>
                <s-table-header>Error</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {recentJobs.map(j => {
                  const dur = j.finishedAt
                    ? `${((new Date(j.finishedAt).getTime() - new Date(j.createdAt).getTime()) / 1000).toFixed(1)}s`
                    : '—';
                  return (
                    <s-table-row key={j.id}>
                      <s-table-cell><s-text color="subdued">{new Date(j.createdAt).toLocaleString()}</s-text></s-table-cell>
                      <s-table-cell><s-text type="strong">{titleCase(j.type)}</s-text></s-table-cell>
                      <s-table-cell><StatusBadge status={j.status} /></s-table-cell>
                      <s-table-cell>{dur}</s-table-cell>
                      <s-table-cell>
                        {j.error
                          ? <s-text tone="critical">{j.error.slice(0, 60)}</s-text>
                          : <s-text color="subdued">—</s-text>}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      )}

      {/* ═══ TAB: Activity ═══ */}
      {tab === 'activity' && (
        <s-section heading="Recent activity" padding="none">
          {isLoading ? (
            <s-box padding="large-100">
              <s-spinner accessibilityLabel="Loading activity" size="base" />
            </s-box>
          ) : recentActivity.length === 0 ? (
            <EmptyState icon="live" heading="No activity recorded yet">
              Actions performed on your store — module creation, publishing, connector changes — will appear here.
            </EmptyState>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="kicker">Time</s-table-header>
                <s-table-header listSlot="inline">Who</s-table-header>
                <s-table-header listSlot="primary">Action</s-table-header>
                <s-table-header>Resource</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {recentActivity.map(a => (
                  <s-table-row key={a.id}>
                    <s-table-cell><s-text color="subdued">{new Date(a.createdAt).toLocaleString()}</s-text></s-table-cell>
                    <s-table-cell>
                      <s-badge tone={a.actor === 'MERCHANT' ? 'success' : a.actor === 'SYSTEM' ? 'info' : 'warning'}>{a.actor}</s-badge>
                    </s-table-cell>
                    <s-table-cell><s-text type="strong">{titleCase(a.action)}</s-text></s-table-cell>
                    <s-table-cell>{a.resource ?? <s-text color="subdued">—</s-text>}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
