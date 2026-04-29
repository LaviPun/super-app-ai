import { json } from '@remix-run/node';
import { useLoaderData, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Badge, DataTable,
  InlineStack, InlineGrid, ProgressBar, Divider,
  SkeletonBodyText, Banner, Tabs,
} from '@shopify/polaris';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';

function MiniBarChart({ data, maxHeight = 40 }: { data: number[]; maxHeight?: number }) {
  const maxVal = Math.max(...data, 1);
  const barW = Math.max(6, Math.floor(280 / data.length) - 2);
  return (
    <svg width={data.length * (barW + 2)} height={maxHeight} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const h = Math.max(1, (v / maxVal) * maxHeight);
        return (
          <rect key={i} x={i * (barW + 2)} y={maxHeight - h} width={barW} height={h} rx={2}
            fill={i === data.length - 1 ? '#2C6ECB' : '#B4E0FA'} />
        );
      })}
    </svg>
  );
}

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
    aiUsageRows,
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
    prisma.aiUsage.findMany({
      where: { shopId: shopRow.id, createdAt: { gte: since30d } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { provider: true },
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

  const totalAiCostCents = aiUsageRows.reduce((s, r) => s + r.costCents, 0);
  const totalTokensIn = aiUsageRows.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = aiUsageRows.reduce((s, r) => s + r.tokensOut, 0);

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
      totalRequests: aiUsageRows.length,
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
  const { usage, stats, jobsByType, dailySuccess, dailyFailed, aiStats, recentJobs, recentActivity } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [tab, setTab] = useState(0);

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

  const tabs = [
    { id: 'overview', content: 'Overview' },
    { id: 'jobs', content: 'Jobs' },
    { id: 'activity', content: 'Activity' },
  ];

  return (
    <Page title="Logs & Usage" subtitle="Activity, success rates, usage, and plan limits" backAction={{ content: 'Dashboard', url: '/' }}>
      <BlockStack gap="500">
        <Tabs tabs={tabs} selected={tab} onSelect={setTab} />

        {/* ═══ TAB: Overview ═══ */}
        {tab === 0 && (
          <BlockStack gap="500">
            {/* Success rate banner */}
            <Banner
              tone={stats.successRate >= 90 ? 'success' : stats.successRate >= 70 ? 'warning' : 'critical'}
              title={`${stats.successRate}% success rate over the last 30 days`}
            >
              <Text as="p">
                {stats.totalJobs} jobs total — {stats.successCount} succeeded, {stats.failedCount} failed
                {stats.runningCount > 0 ? `, ${stats.runningCount} in progress` : ''}.
              </Text>
            </Banner>

            {/* Key metrics */}
            <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Success rate</Text>
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="p" variant="headingLg">{stats.successRate}%</Text>
                  </InlineStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Total jobs (30d)</Text>
                  <Text as="p" variant="headingLg">{stats.totalJobs}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">AI requests</Text>
                  <Text as="p" variant="headingLg">{aiStats.totalRequests}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">AI cost (30d)</Text>
                  <Text as="p" variant="headingLg">${(aiStats.totalCostCents / 100).toFixed(2)}</Text>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Charts */}
            <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Successful jobs (7 days)</Text>
                  <MiniBarChart data={dailySuccess} />
                  <InlineStack gap="200">
                    {dayLabels.map((l, i) => <Text key={i} as="span" variant="bodySm" tone="subdued">{l}</Text>)}
                  </InlineStack>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Failed jobs (7 days)</Text>
                  <svg width={dailyFailed.length * 10} height={40} style={{ display: 'block' }}>
                    {dailyFailed.map((v, i) => {
                      const maxVal = Math.max(...dailyFailed, 1);
                      const h = Math.max(1, (v / maxVal) * 40);
                      return <rect key={i} x={i * 10} y={40 - h} width={8} height={h} rx={2} fill={v > 0 ? '#E51C00' : '#FED3D1'} />;
                    })}
                  </svg>
                  <InlineStack gap="200">
                    {dayLabels.map((l, i) => <Text key={i} as="span" variant="bodySm" tone="subdued">{l}</Text>)}
                  </InlineStack>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Success rate by type */}
            {jobsByType.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Success rate by job type</Text>
                  <DataTable
                    columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'text']}
                    headings={['Type', 'Total', 'Succeeded', 'Failed', 'Rate']}
                    rows={jobsByType.map(j => [
                      j.type.replace(/_/g, ' '),
                      j.total,
                      j.success,
                      j.failed,
                      <InlineStack key={j.type} gap="200" blockAlign="center">
                        <ProgressBar progress={j.rate} tone={j.rate >= 90 ? 'success' : j.rate >= 70 ? 'highlight' : 'critical'} size="small" />
                        <Text as="span" variant="bodySm">{j.rate}%</Text>
                      </InlineStack>,
                    ])}
                  />
                </BlockStack>
              </Card>
            )}

            <Divider />

            {/* ─── Usage & Limits ─── */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Plan usage & limits</Text>
                  <Badge tone={usage.plan === 'FREE' ? 'attention' : 'success'}>{`${usage.plan} plan`}</Badge>
                </InlineStack>
                <Text as="p" tone="subdued">Current billing period usage against your plan limits.</Text>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                  {usageItems.map(item => {
                    const pct = usagePct(item.used, item.limit);
                    const tone = item.limit === -1 ? 'success' as const : pct >= 90 ? 'critical' as const : pct >= 70 ? 'highlight' as const : 'success' as const;
                    return (
                      <BlockStack key={item.label} gap="200">
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm">{item.label}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{item.used} / {formatQuota(item.limit)}</Text>
                        </InlineStack>
                        <ProgressBar progress={item.limit === -1 ? 0 : pct} tone={tone} size="small" />
                        {pct >= 90 && item.limit !== -1 && (
                          <Text as="p" variant="bodySm" tone="critical">
                            ⚠ Approaching limit — consider upgrading your plan.
                          </Text>
                        )}
                      </BlockStack>
                    );
                  })}
                </InlineGrid>
              </BlockStack>
            </Card>

            {/* AI token stats */}
            <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Tokens in (30d)</Text>
                  <Text as="p" variant="headingSm">{aiStats.totalTokensIn.toLocaleString()}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Tokens out (30d)</Text>
                  <Text as="p" variant="headingSm">{aiStats.totalTokensOut.toLocaleString()}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">AI requests (30d)</Text>
                  <Text as="p" variant="headingSm">{aiStats.totalRequests}</Text>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="100">
                  <Text as="p" variant="bodySm" tone="subdued">Total cost (30d)</Text>
                  <Text as="p" variant="headingSm">${(aiStats.totalCostCents / 100).toFixed(2)}</Text>
                </BlockStack>
              </Card>
            </InlineGrid>
          </BlockStack>
        )}

        {/* ═══ TAB: Jobs ═══ */}
        {tab === 1 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Recent jobs (last 30 days)</Text>
              {isLoading ? (
                <SkeletonBodyText lines={8} />
              ) : recentJobs.length === 0 ? (
                <Text as="p" tone="subdued">No jobs recorded yet. Jobs appear when you generate modules, publish, or run automation flows.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Time', 'Type', 'Status', 'Duration', 'Error']}
                  rows={recentJobs.map(j => {
                    const dur = j.finishedAt
                      ? `${((new Date(j.finishedAt).getTime() - new Date(j.createdAt).getTime()) / 1000).toFixed(1)}s`
                      : '—';
                    return [
                      new Date(j.createdAt).toLocaleString(),
                      j.type.replace(/_/g, ' '),
                      <Badge key={j.id} tone={j.status === 'SUCCESS' ? 'success' : j.status === 'FAILED' ? 'critical' : 'attention'}>{j.status}</Badge>,
                      dur,
                      j.error
                        ? <Text key={`e-${j.id}`} as="span" variant="bodySm" tone="critical">{j.error.slice(0, 60)}</Text>
                        : '—',
                    ];
                  })}
                />
              )}
            </BlockStack>
          </Card>
        )}

        {/* ═══ TAB: Activity ═══ */}
        {tab === 2 && (
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Recent activity</Text>
              <Text as="p" tone="subdued">Actions performed on your store — module creation, publishing, connector changes, and more.</Text>
              {isLoading ? (
                <SkeletonBodyText lines={8} />
              ) : recentActivity.length === 0 ? (
                <Text as="p" tone="subdued">No activity recorded yet. Actions will appear here as you use the app.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['Time', 'Who', 'Action', 'Resource']}
                  rows={recentActivity.map(a => [
                    new Date(a.createdAt).toLocaleString(),
                    <Badge key={`w-${a.id}`} tone={a.actor === 'MERCHANT' ? 'success' : a.actor === 'SYSTEM' ? 'info' : 'attention'}>{a.actor}</Badge>,
                    a.action.replace(/_/g, ' '),
                    a.resource ?? '—',
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
