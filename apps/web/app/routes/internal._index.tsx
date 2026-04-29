import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Link } from '@remix-run/react';
import { Page, BlockStack, Text, InlineStack, Button, Box, DataTable, Card } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    stores,
    activeProviders,
    usage24hCount,
    usage24hAgg,
    errors24h,
    jobs7d,
    activities24h,
    jobsByStatus,
    apiLogs24h,
    activityLogs7d,
    validatedVersions,
    providersForAccountCoverage,
  ] = await Promise.all([
    prisma.shop.count(),
    prisma.aiProvider.count({ where: { isActive: true } }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since24h } } }),
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: since24h } },
      _sum: { costCents: true },
      _count: { id: true },
    }),
    prisma.errorLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.job.count({ where: { createdAt: { gte: since7d } } }),
    prisma.activityLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.job.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since7d } },
      _count: { id: true },
    }),
    prisma.apiLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.activityLog.findMany({
      where: { createdAt: { gte: since7d } },
      select: { createdAt: true },
      take: 5000,
    }),
    prisma.moduleVersion.findMany({
      where: { validationReportJson: { not: null } },
      select: { validationReportJson: true },
      take: 1000,
    }),
    prisma.aiProvider.findMany({ select: { extraConfig: true } }),
  ]);

  const cost24hCents = usage24hAgg._sum.costCents ?? 0;
  const cost24hDollars = cost24hCents / 100;

  let validationPass = 0;
  let validationFail = 0;
  for (const v of validatedVersions) {
    try {
      const r = JSON.parse(v.validationReportJson!) as { overall?: string };
      if (r.overall === 'PASS') validationPass++;
      else validationFail++;
    } catch {
      // skip malformed
    }
  }

  const now = new Date();
  const dailyActivity: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dailyActivity.push(activityLogs7d.filter(a => { const c = new Date(a.createdAt); return c >= dayStart && c < dayEnd; }).length);
  }

  const providersWithDailyLimit = providersForAccountCoverage.filter((p) => {
    if (!p.extraConfig) return false;
    try {
      const parsed = JSON.parse(p.extraConfig) as { billing?: { dailyLimitUsd?: unknown } };
      return typeof parsed.billing?.dailyLimitUsd === 'number';
    } catch {
      return false;
    }
  }).length;

  return json({
    stores,
    activeProviders,
    usage24h: usage24hCount,
    cost24hCents,
    cost24hDollars,
    errors24h,
    jobs7d,
    activities24h,
    apiLogs24h,
    jobsByStatus: Object.fromEntries(jobsByStatus.map(j => [j.status, j._count.id])),
    dailyActivity,
    validationPass,
    validationFail,
    providersWithDailyLimit,
  });
}

export default function InternalHome() {
  const d = useLoaderData<typeof loader>();
  const successCount = d.jobsByStatus.SUCCESS ?? 0;
  const failedCount = d.jobsByStatus.FAILED ?? 0;
  const runningCount = d.jobsByStatus.RUNNING ?? 0;
  const queuedCount = d.jobsByStatus.QUEUED ?? 0;
  const progress = d.jobs7d > 0 ? Math.round((successCount / d.jobs7d) * 100) : 100;
  const maxDaily = Math.max(...d.dailyActivity, 1);
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  });

  const validationTotal = d.validationPass + d.validationFail;
  const validationRate = validationTotal > 0 ? Math.round((d.validationPass / validationTotal) * 100) : null;

  const flowNodes: { label: string; url: string }[] = [
    { label: `Stores (${d.stores})`, url: '/internal/stores' },
    { label: `AI (${d.usage24h})`, url: '/internal/usage' },
    { label: `Jobs (${d.jobs7d})`, url: '/internal/jobs' },
    { label: `Activity (${d.activities24h})`, url: '/internal/activity' },
    { label: `Errors (${d.errors24h})`, url: '/internal/logs' },
  ];

  const statusRows = [
    { label: 'Success', value: successCount, tone: '#008060' },
    { label: 'Failed', value: failedCount, tone: '#d72c0d' },
    { label: 'Running', value: runningCount, tone: '#2c6ecb' },
    { label: 'Queued', value: queuedCount, tone: '#6d7175' },
  ];
  const maxStatus = Math.max(...statusRows.map((r) => r.value), 1);

  return (
    <Page title="Dashboard" subtitle="Telemetry & system overview" fullWidth>
      <div className="InternalDashboard-pageWrap">
        <div className="InternalDashboard-root">
          <style>{`
          .internal-dashboard-page { background: var(--sa-color-bg, #f6f8fb) !important; }
          .InternalDashboard-pageWrap { width: 100%; min-height: 100%; padding: 24px; box-sizing: border-box; }
          .InternalDashboard-root {
            width: 100%;
            padding: 0 0 50px 0;
          }
          .InternalDashboard-title { font-weight: 650; font-size: 1rem; color: #202223; margin: 0 0 16px 0; }
          .InternalDashboard-sectionTitle { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #6d7175; margin: 0 0 10px 0; }
          .InternalDashboard-panel {
            background: #fff;
            border: 1px solid #e1e3e5;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .InternalDashboard-kpiGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; margin-bottom: 24px; }
          .InternalDashboard-kpi {
            background: #fff;
            border: 1px solid #e1e3e5;
            border-radius: 10px;
            padding: 12px 14px;
            text-decoration: none;
            color: inherit;
            display: block;
            transition: border-color 0.2s;
          }
          .InternalDashboard-kpi:hover {
            border-color: #a9aeb3;
          }
          .InternalDashboard-kpiLabel { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6d7175; margin: 0 0 6px 0; }
          .InternalDashboard-kpiValue { font-size: 1.25rem; font-weight: 650; color: #202223; margin: 0; }
          .InternalDashboard-flowRow { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
          .InternalDashboard-flowNode {
            padding: 8px 12px; background: #fff; border: 1px solid #e1e3e5; border-radius: 8px;
            font-size: 0.8125rem; color: #202223; text-decoration: none; display: inline-block;
            transition: border-color 0.2s;
          }
          .InternalDashboard-flowNode:hover { border-color: #a9aeb3; }
          .InternalDashboard-flowArrow { color: #718096; font-size: 1rem; }
          .InternalDashboard-barChart { display: flex; align-items: flex-end; gap: 6px; height: 56px; margin-top: 10px; }
          .InternalDashboard-bar { flex: 1; min-width: 0; background: #2c6ecb; opacity: 0.85; border-radius: 4px 4px 0 0; }
          .InternalDashboard-gauge { width: 72px; height: 72px; position: relative; margin-right: 8px; }
          .InternalDashboard-gaugeSvg { width: 100%; height: 100%; }
          .InternalDashboard-gaugeVal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 700; color: #202223; }
          .InternalDashboard-statusRow { margin-top: 10px; display: grid; gap: 8px; }
          .InternalDashboard-statusItem { display: grid; grid-template-columns: 100px 1fr 36px; gap: 8px; align-items: center; font-size: 0.75rem; color: #6d7175; }
          .InternalDashboard-statusTrack { background: #ebecef; border-radius: 999px; height: 8px; overflow: hidden; }
          .InternalDashboard-statusFill { display: block; height: 100%; border-radius: 999px; }
          .InternalDashboard-quickWrap { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
          .InternalDashboard-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          @media (max-width: 860px) { .InternalDashboard-grid2 { grid-template-columns: 1fr; } }
        `}</style>

        <h1 className="InternalDashboard-title">Internal telemetry</h1>

        {/* KPIs - clickable */}
        <p className="InternalDashboard-sectionTitle">Key parameters</p>
        <div className="InternalDashboard-kpiGrid">
          <Link to="/internal/stores" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Stores</p>
            <p className="InternalDashboard-kpiValue">{d.stores}</p>
          </Link>
          <Link to="/internal/usage" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">AI calls (24h)</p>
            <p className="InternalDashboard-kpiValue">{d.usage24h}</p>
          </Link>
          <Link to="/internal/usage" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">API cost (24h)</p>
            <p className="InternalDashboard-kpiValue">${d.cost24hDollars.toFixed(2)}</p>
          </Link>
          <Link to="/internal/api-logs" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">API requests (24h)</p>
            <p className="InternalDashboard-kpiValue">{d.apiLogs24h}</p>
          </Link>
          <Link to="/internal/ai-providers" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Active providers</p>
            <p className="InternalDashboard-kpiValue">{d.activeProviders}</p>
          </Link>
          <Link to="/internal/ai-accounts" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Daily limits set</p>
            <p className="InternalDashboard-kpiValue">{d.providersWithDailyLimit}</p>
          </Link>
          <Link to="/internal/logs" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Errors (24h)</p>
            <p className="InternalDashboard-kpiValue" style={{ color: d.errors24h > 0 ? '#b91c1c' : undefined }}>{d.errors24h}</p>
          </Link>
          <Link to="/internal/jobs" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Jobs (7d)</p>
            <p className="InternalDashboard-kpiValue">{d.jobs7d}</p>
          </Link>
          <Link to="/internal/activity" className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Activities (24h)</p>
            <p className="InternalDashboard-kpiValue">{d.activities24h}</p>
          </Link>
          <div className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Validation pass</p>
            <p className="InternalDashboard-kpiValue" style={{ color: d.validationPass > 0 ? '#00b058' : undefined }}>{d.validationPass}</p>
            {validationRate !== null && <p style={{ fontSize: '0.6875rem', color: '#5a6578', margin: '2px 0 0' }}>{validationRate}% pass rate</p>}
          </div>
          <div className="InternalDashboard-kpi">
            <p className="InternalDashboard-kpiLabel">Validation fail</p>
            <p className="InternalDashboard-kpiValue" style={{ color: d.validationFail > 0 ? '#b91c1c' : undefined }}>{d.validationFail}</p>
          </div>
        </div>

        {/* System flow - clickable */}
        <div className="InternalDashboard-panel">
          <p className="InternalDashboard-sectionTitle">System flow</p>
          <div className="InternalDashboard-flowRow">
            {flowNodes.map((node, i) => (
              <span key={node.url}>
                {i > 0 && <span className="InternalDashboard-flowArrow">→</span>}
                <Link to={node.url} className="InternalDashboard-flowNode">{node.label}</Link>
              </span>
            ))}
          </div>
        </div>

        {/* Charts row */}
        <div className="InternalDashboard-grid2">
          <div className="InternalDashboard-panel">
            <p className="InternalDashboard-sectionTitle">Jobs by status (7d)</p>
            <div className="InternalDashboard-statusRow">
              {statusRows.map((row) => (
                <div className="InternalDashboard-statusItem" key={row.label}>
                  <span>{row.label}</span>
                  <span className="InternalDashboard-statusTrack">
                    <span
                      className="InternalDashboard-statusFill"
                      style={{ width: `${Math.max(4, (row.value / maxStatus) * 100)}%`, background: row.tone }}
                    />
                  </span>
                  <span style={{ textAlign: 'right' }}>{row.value}</span>
                </div>
              ))}
            </div>
            <Box paddingBlockStart="300">
              <DataTable
                columnContentTypes={['text', 'numeric']}
                headings={['Status', 'Count']}
                rows={statusRows.map((row) => [row.label, row.value])}
                hideScrollIndicator
              />
            </Box>
          </div>
          <div className="InternalDashboard-panel">
            <p className="InternalDashboard-sectionTitle">Job success rate (7d)</p>
            <div className="InternalDashboard-gauge">
              <svg viewBox="0 0 72 72">
                <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="5" />
                <circle cx="36" cy="36" r="30" fill="none" stroke={progress >= 90 ? '#00c878' : progress >= 70 ? '#ffc453' : '#dc3c3c'} strokeWidth="5" strokeDasharray={2 * Math.PI * 30} strokeDashoffset={2 * Math.PI * 30 * (1 - progress / 100)} strokeLinecap="round" transform="rotate(-90 36 36)" />
              </svg>
              <span className="InternalDashboard-gaugeVal">{progress}%</span>
            </div>
            <Text as="p" variant="bodySm" {...{ style: { color: '#6d7175', marginTop: 8 } } as any}>{successCount} success · {failedCount} failed</Text>
          </div>
        </div>

        {/* Activity trend */}
        <div className="InternalDashboard-panel">
          <p className="InternalDashboard-sectionTitle">Activity trend (7d)</p>
          <div className="InternalDashboard-barChart">
            {d.dailyActivity.map((v, i) => (
              <div key={i} className="InternalDashboard-bar" style={{ height: `${Math.max(4, (v / maxDaily) * 100)}%` }} title={`${dayLabels[i]}: ${v}`} />
            ))}
          </div>
          <InlineStack gap="100" wrap>
            {dayLabels.map((l, i) => (
              <Box key={i} minWidth="36px"><Text as="span" variant="bodySm" {...{ style: { color: '#5a6578' } } as any}>{l}</Text></Box>
            ))}
          </InlineStack>
        </div>

        {/* Quick links */}
        <div className="InternalDashboard-panel">
          <p className="InternalDashboard-sectionTitle">Quick links</p>
          <div className="InternalDashboard-quickWrap">
            <Button url="/internal/stores" variant="secondary" size="slim">Stores</Button>
            <Button url="/internal/usage" variant="secondary" size="slim">Usage & costs</Button>
            <Button url="/internal/ai-accounts" variant="secondary" size="slim">AI accounts</Button>
            <Button url="/internal/logs" variant="secondary" size="slim">Error logs</Button>
            <Button url="/internal/jobs" variant="secondary" size="slim">Jobs</Button>
            <Button url="/internal/activity" variant="secondary" size="slim">Activity log</Button>
            <Button url="/internal/api-logs" variant="secondary" size="slim">API logs</Button>
            <Button url="/internal/ai-providers" variant="secondary" size="slim">AI providers</Button>
            <Button url="/internal/plan-tiers" variant="primary" size="slim">Plan tiers</Button>
            <Button url="/internal/settings" variant="secondary" size="slim">Settings</Button>
          </div>
        </div>
      </div>
    </div>
    </Page>
  );
}
