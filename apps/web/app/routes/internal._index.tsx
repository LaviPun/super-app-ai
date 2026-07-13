import { json } from '@remix-run/node';
import { useLoaderData, useRevalidator, useRouteError } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import {
  useAdminCtx,
  href,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  CardHead,
  DataTable,
  PageHead,
  StatTile,
  Sparkline,
  MiniBars,
  Donut,
  Avatar,
  Progress,
  EmptyState,
  Banner,
  fmtNum,
  titleCase,
  storeHealth,
  healthTone,
} from '~/components/admin/page-kit';

const DAY_MS = 86400000;
/** AI generations daily series length — the 14d segment slices the tail client-side. */
const SPARK_DAYS = 30;
const JOB_DAYS = 7;

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const now = new Date();
  const since24h = new Date(now.getTime() - DAY_MS);
  const prev24hStart = new Date(now.getTime() - 2 * DAY_MS);
  const since7d = new Date(now.getTime() - 7 * DAY_MS);
  const since30d = new Date(now.getTime() - 30 * DAY_MS);

  // Daily series buckets (UTC days, oldest first) — same pattern as internal.usage.
  const sparkFrom = new Date(now);
  sparkFrom.setUTCHours(0, 0, 0, 0);
  sparkFrom.setUTCDate(sparkFrom.getUTCDate() - (SPARK_DAYS - 1));
  const jobSparkFrom = new Date(now);
  jobSparkFrom.setUTCHours(0, 0, 0, 0);
  jobSparkFrom.setUTCDate(jobSparkFrom.getUTCDate() - (JOB_DAYS - 1));

  // Each query is guarded so one failing/slow table degrades to a zero/empty default
  // rather than 500ing the entire dashboard — the same resilience the shell loader uses.
  // Real failures still surface via the error log + the shell's health footer.
  const zeroUsage = { _sum: { costCents: 0, requestCount: 0 } };
  const [
    totalStores,
    activeStores,
    trialStores,
    installs7d,
    installs30d,
    usage24hAgg,
    usagePrev24hAgg,
    usage30dAgg,
    sparkRows,
    errors24h,
    errorsPrev24h,
    apiLogs24h,
    jobsByStatusRaw,
    jobRows7d,
    webhooks7d,
    webhooksFailed7d,
    planMixRaw,
    activeSubsByPlan,
    planConfigs,
    healthShops,
    recentActivity,
    latestErrors,
  ] = await Promise.all([
    prisma.shop.count().catch(() => 0),
    prisma.shop.count({ where: { OR: [{ subscription: { is: null } }, { subscription: { status: 'ACTIVE' } }] } }).catch(() => 0),
    prisma.shop.count({ where: { subscription: { status: 'TRIAL' } } }).catch(() => 0),
    prisma.shop.count({ where: { createdAt: { gte: since7d } } }).catch(() => 0),
    prisma.shop.count({ where: { createdAt: { gte: since30d } } }).catch(() => 0),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: since24h } }, _sum: { costCents: true, requestCount: true } }).catch(() => zeroUsage),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: prev24hStart, lt: since24h } }, _sum: { costCents: true, requestCount: true } }).catch(() => zeroUsage),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: since30d } }, _sum: { costCents: true, requestCount: true } }).catch(() => zeroUsage),
    prisma.aiUsage.findMany({ where: { createdAt: { gte: sparkFrom } }, select: { createdAt: true, requestCount: true } }).catch(() => []),
    prisma.errorLog.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.errorLog.count({ where: { createdAt: { gte: prev24hStart, lt: since24h } } }).catch(() => 0),
    prisma.apiLog.count({ where: { createdAt: { gte: since24h } } }).catch(() => 0),
    prisma.job.groupBy({ by: ['status'], where: { createdAt: { gte: since7d } }, _count: { id: true } }).catch(() => []),
    prisma.job.findMany({ where: { createdAt: { gte: jobSparkFrom } }, select: { createdAt: true } }).catch(() => []),
    prisma.webhookEvent.count({ where: { processedAt: { gte: since7d } } }).catch(() => 0),
    prisma.webhookEvent.count({ where: { processedAt: { gte: since7d }, success: false } }).catch(() => 0),
    prisma.shop.groupBy({ by: ['planTier'], _count: { _all: true } }).catch(() => []),
    prisma.appSubscription.groupBy({ by: ['planName'], where: { status: 'ACTIVE' }, _count: { _all: true } }).catch(() => []),
    getAllPlanConfigs().catch(() => []),
    prisma.shop
      .findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          shopDomain: true,
          planTier: true,
          modules: { select: { status: true } },
          subscription: { select: { status: true } },
        },
      })
      .catch(() => []),
    prisma.activityLog
      .findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { shop: { select: { shopDomain: true } } },
      })
      .catch(() => []),
    prisma.errorLog
      .findMany({
        take: 4,
        orderBy: { createdAt: 'desc' },
        select: { id: true, level: true, message: true, route: true, correlationId: true, createdAt: true },
      })
      .catch(() => []),
  ]);

  // Per-store 30d AI calls + ERROR counts feed the same health score the stores page uses.
  const shopIds = healthShops.map((s) => s.id);
  const [aiUsage30dByShop, errors30dByShop] = await Promise.all([
    shopIds.length
      ? prisma.aiUsage.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds }, createdAt: { gte: since30d } },
          _sum: { requestCount: true },
        })
      : Promise.resolve([]),
    shopIds.length
      ? prisma.errorLog.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds }, level: 'ERROR', createdAt: { gte: since30d } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const aiByShop = new Map(aiUsage30dByShop.map((u) => [u.shopId, u._sum.requestCount ?? 0]));
  const errByShop = new Map(errors30dByShop.map((e) => [e.shopId, e._count._all]));

  const aiDaily = new Array<number>(SPARK_DAYS).fill(0);
  for (const r of sparkRows) {
    const idx = Math.floor((r.createdAt.getTime() - sparkFrom.getTime()) / DAY_MS);
    if (idx >= 0 && idx < SPARK_DAYS) aiDaily[idx]! += r.requestCount ?? 1;
  }
  const jobsDaily = new Array<number>(JOB_DAYS).fill(0);
  for (const r of jobRows7d) {
    const idx = Math.floor((r.createdAt.getTime() - jobSparkFrom.getTime()) / DAY_MS);
    if (idx >= 0 && idx < JOB_DAYS) jobsDaily[idx]! += 1;
  }

  const byStatus = Object.fromEntries(jobsByStatusRaw.map((j) => [j.status, j._count.id]));
  const succeeded = byStatus.SUCCESS ?? 0;
  const failed = byStatus.FAILED ?? 0;
  const runningQueued = (byStatus.RUNNING ?? 0) + (byStatus.QUEUED ?? 0);
  const finished = succeeded + failed;
  const jobSuccessPct = finished > 0 ? Math.round((succeeded / finished) * 1000) / 10 : null;

  const webhookSuccessPct = webhooks7d > 0 ? Math.round(((webhooks7d - webhooksFailed7d) / webhooks7d) * 1000) / 10 : null;
  const errorRatePct = apiLogs24h > 0 ? Math.round((errors24h / apiLogs24h) * 1000) / 10 : null;

  // MRR from ACTIVE subscriptions × configured tier prices (skips $0 / custom-priced tiers).
  const priceByPlan = new Map<string, number>(planConfigs.map((p) => [p.name, p.price]));
  let mrr = 0;
  let payingStores = 0;
  for (const g of activeSubsByPlan) {
    const price = priceByPlan.get(g.planName) ?? 0;
    if (price > 0) {
      mrr += price * g._count._all;
      payingStores += g._count._all;
    }
  }
  const arpu = payingStores > 0 ? Math.round((mrr / payingStores) * 100) / 100 : null;

  const aiCost30dCents = usage30dAgg._sum.costCents ?? 0;
  const aiCalls30d = usage30dAgg._sum.requestCount ?? 0;
  const costPerCallCents = aiCalls30d > 0 ? Math.round((aiCost30dCents / aiCalls30d) * 10) / 10 : null;

  const aiCalls24h = usage24hAgg._sum.requestCount ?? 0;
  const cost24hCents = usage24hAgg._sum.costCents ?? 0;

  return json({
    totalStores,
    activeStores,
    trialStores,
    installs7d,
    installs30d,
    aiCalls24h,
    cost24hCents,
    errors24h,
    apiLogs24h,
    deltas: {
      aiCalls: pctDelta(aiCalls24h, usagePrev24hAgg._sum.requestCount ?? 0),
      cost: pctDelta(cost24hCents, usagePrev24hAgg._sum.costCents ?? 0),
      errors: pctDelta(errors24h, errorsPrev24h),
    },
    mrr,
    payingStores,
    arpu,
    aiCost30dCents,
    aiCalls30d,
    costPerCallCents,
    errorRatePct,
    jobs: { succeeded, failed, runningQueued, successPct: jobSuccessPct, daily: jobsDaily },
    webhooks: { total7d: webhooks7d, failed7d: webhooksFailed7d, successPct: webhookSuccessPct },
    aiDaily,
    sparkStart: sparkFrom.toISOString(),
    planMix: planMixRaw
      .map((g) => ({ name: g.planTier, value: g._count._all }))
      .sort((a, b) => b.value - a.value),
    healthStores: healthShops.map((s) => ({
      id: s.id,
      name: s.shopDomain.split('.')[0],
      domain: s.shopDomain,
      plan: s.planTier,
      status: s.subscription?.status ?? 'ACTIVE',
      published: s.modules.filter((m) => m.status === 'PUBLISHED').length,
      aiCalls30d: aiByShop.get(s.id) ?? 0,
      errors30d: Math.min(errByShop.get(s.id) ?? 0, 13),
    })),
    recentActivity: recentActivity.map((l) => ({
      id: l.id,
      actor: l.actor,
      action: l.action,
      resource: l.resource ?? '—',
      shop: l.shop?.shopDomain ?? '—',
      createdAt: l.createdAt.toISOString(),
    })),
    latestErrors: latestErrors.map((e) => ({
      id: e.id,
      level: e.level,
      message: e.message,
      route: e.route ?? '—',
      correlationId: e.correlationId ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}

const PLAN_COLOR: Record<string, string> = {
  FREE: 'var(--p-text-disabled)',
  STARTER: 'var(--p-info)',
  GROWTH: 'var(--p-success)',
  PRO: 'var(--p-magic)',
  ENTERPRISE: 'var(--p-warning)',
};

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// `goodDir` is the direction that's *good news* for this metric. The arrow always
// points the true way the number moved; the color is green only when the move is good.
// So a rising error count (goodDir 'down') shows a red up-arrow, not a green one.
function deltaProps(
  pct: number | null,
  goodDir: 'up' | 'down' = 'up',
): { delta?: string; deltaDir?: 'up' | 'down'; deltaTone?: 'up' | 'down' } {
  if (pct == null) return {};
  const dir = pct < 0 ? 'down' : 'up';
  return { delta: Math.abs(pct) + '%', deltaDir: dir, deltaTone: dir === goodDir ? 'up' : 'down' };
}

// Same health derivation the stores page uses: real fields + the store's real 30d ERROR count.
function healthOf(s: { domain: string; errors30d: number }): number {
  const errLogs = Array.from({ length: s.errors30d ?? 0 }, () => ({ level: 'ERROR', shop: s.domain }));
  return storeHealth(s, errLogs);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function KpiStrip({ items }: { items: any[] }) {
  return (
    <Card className="kpi-strip">
      {items.map((k, i) => (
        <a key={i} href={k.href} className="kpi-cell" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="k-label">
            <Icon name={k.icon} size={13} className="t-muted" />
            {k.label}
          </div>
          <div className="k-val">{k.value}</div>
          <div className={'k-sub ' + (k.dir ? 'metric-delta ' + k.dir : 't-muted')}>
            {k.dir ? <Icon name={k.dir === 'down' ? 'chevronDown' : 'chevronUp'} size={12} /> : null}
            {k.sub}
          </div>
        </a>
      ))}
    </Card>
  );
}

export default function AdminDashboard() {
  const d = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const revalidator = useRevalidator();
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<'14d' | '30d'>('14d');

  // Toast only after the loader round-trip actually completes.
  useEffect(() => {
    if (refreshing && revalidator.state === 'idle') {
      setRefreshing(false);
      ctx.toast('Metrics refreshed');
    }
  }, [refreshing, revalidator.state, ctx]);

  const spark = range === '14d' ? d.aiDaily.slice(-14) : d.aiDaily;
  const sparkStartLabel = fmtDay(new Date(new Date(d.sparkStart).getTime() + (d.aiDaily.length - spark.length) * DAY_MS));

  const totalJobs = d.jobs.succeeded + d.jobs.failed + d.jobs.runningQueued;
  const planMix = d.planMix
    .map((p) => ({ ...p, color: PLAN_COLOR[p.name] ?? 'var(--p-text-disabled)' }))
    .filter((p) => p.value > 0);
  const health = d.healthStores.map((s) => ({ s, h: healthOf(s) })).sort((a, b) => a.h - b.h);

  const revenueKpis = [
    {
      label: 'MRR',
      value: '$' + fmtNum(d.mrr),
      icon: 'chart',
      sub: d.payingStores + ' paying store' + (d.payingStores === 1 ? '' : 's'),
      href: href('#/admin/plan-tiers'),
    },
    ...(d.arpu != null
      ? [{ label: 'ARPU', value: '$' + fmtNum(d.arpu), icon: 'plan', sub: 'per paying store', href: href('#/admin/plan-tiers') }]
      : []),
    { label: 'New installs (7d)', value: d.installs7d, icon: 'store', sub: d.installs30d + ' in 30d', href: href('#/admin/stores') },
    { label: 'Active trials', value: d.trialStores, icon: 'rocket', sub: 'stores on trial now', href: href('#/admin/stores') },
  ];
  const reliabilityKpis = [
    {
      label: 'Job success (7d)',
      value: d.jobs.successPct != null ? d.jobs.successPct + '%' : '—',
      icon: 'check',
      sub: fmtNum(d.jobs.succeeded + d.jobs.failed) + ' finished jobs',
      href: href('#/admin/jobs'),
    },
    { label: 'DLQ depth', value: d.jobs.failed + ' jobs', icon: 'alert', sub: 'failed in last 7d', href: href('#/admin/jobs') },
    {
      label: 'Webhook success (7d)',
      value: d.webhooks.successPct != null ? d.webhooks.successPct + '%' : '—',
      icon: 'transfer',
      sub: d.webhooks.failed7d + ' failed of ' + fmtNum(d.webhooks.total7d),
      href: href('#/admin/webhooks'),
    },
    {
      label: 'Error rate (24h)',
      value: d.errorRatePct != null ? d.errorRatePct + '%' : '—',
      icon: 'bug',
      sub: fmtNum(d.errors24h) + ' errors / ' + fmtNum(d.apiLogs24h) + ' requests',
      href: href('#/admin/logs'),
    },
    {
      label: 'AI cost (30d)',
      value: '$' + (d.aiCost30dCents / 100).toFixed(2),
      icon: 'magic',
      sub: d.costPerCallCents != null ? d.costPerCallCents + '¢ / call' : fmtNum(d.aiCalls30d) + ' calls',
      href: href('#/admin/usage'),
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        sub="Platform health across all merchant stores — last 24 hours unless noted."
        actions={
          <>
            <Btn
              icon="refresh"
              loading={revalidator.state === 'loading'}
              onClick={() => {
                setRefreshing(true);
                revalidator.revalidate();
              }}
            >
              Refresh
            </Btn>
            <Btn variant="primary" icon="chat" onClick={() => ctx.go('#/admin/ai-assistant')}>
              Ask the assistant
            </Btn>
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile
          label="Active stores"
          value={d.activeStores}
          sub={d.trialStores + ' on trial · ' + d.totalStores + ' total'}
          icon="store"
          tone="info"
          href={href('#/admin/stores')}
        />
        <StatTile label="AI calls (24h)" value={fmtNum(d.aiCalls24h)} icon="magic" tone="magic" {...deltaProps(d.deltas.aiCalls)} href={href('#/admin/usage')} />
        <StatTile
          label="API cost (24h)"
          value={'$' + (d.cost24hCents / 100).toFixed(2)}
          icon="chart"
          tone="success"
          {...deltaProps(d.deltas.cost, 'down')}
          href={href('#/admin/usage')}
        />
        <StatTile label="Errors (24h)" value={d.errors24h} icon="bug" tone="critical" {...deltaProps(d.deltas.errors, 'down')} href={href('#/admin/logs')} />
      </div>
      <div className="kpi-band-label">Revenue & growth</div>
      <div style={{ marginBottom: 16 }}>
        <KpiStrip items={revenueKpis} />
      </div>
      <div className="kpi-band-label">Reliability & cost</div>
      <div style={{ marginBottom: 16 }}>
        <KpiStrip items={reliabilityKpis} />
      </div>
      <div className="col-main" style={{ marginBottom: 16 }}>
        <div className="stack-4">
          <Card>
            <CardHead
              title="AI generations"
              sub={(range === '14d' ? 'Last 14 days' : 'Last 30 days') + ' · all stores'}
              actions={
                <div className="seg">
                  <button aria-selected={range === '14d'} onClick={() => setRange('14d')}>
                    14d
                  </button>
                  <button aria-selected={range === '30d'} onClick={() => setRange('30d')}>
                    30d
                  </button>
                </div>
              }
            />
            <div style={{ padding: '8px 16px 16px' }}>
              <Sparkline data={spark} w={760} h={120} />
              <div className="row spread t-xs t-muted" style={{ marginTop: 6 }}>
                <span>{sparkStartLabel}</span>
                <span>Today</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardHead
              title="Background jobs"
              sub="Last 7 days"
              actions={
                <a href={href('#/admin/jobs')} className="btn btn-plain btn-sm">
                  View jobs
                </a>
              }
            />
            {totalJobs === 0 ? (
              <EmptyState icon="layers" title="No jobs yet">
                Background jobs from the last 7 days will appear here.
              </EmptyState>
            ) : (
              <div className="row-6" style={{ padding: 18, alignItems: 'center' }}>
                <Donut
                  segments={[
                    { value: d.jobs.succeeded, color: 'var(--p-success)' },
                    { value: d.jobs.runningQueued, color: 'var(--p-warning)' },
                    { value: d.jobs.failed, color: 'var(--p-critical)' },
                  ]}
                  center={
                    <div style={{ textAlign: 'center' }}>
                      <div className="t-h1" style={{ fontSize: 24 }}>
                        {d.jobs.successPct != null ? Math.round(d.jobs.successPct) + '%' : '—'}
                      </div>
                      <div className="t-xs t-muted">success</div>
                    </div>
                  }
                />
                <div className="grow stack-3">
                  {([
                    ['Succeeded', d.jobs.succeeded, 'var(--p-success)'],
                    ['Running / queued', d.jobs.runningQueued, 'var(--p-warning)'],
                    ['Failed (DLQ)', d.jobs.failed, 'var(--p-critical)'],
                  ] as any[]).map((j, i) => (
                    <div key={i} className="row spread">
                      <span className="row-2 t-sm">
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: j[2] }} />
                        {j[0]}
                      </span>
                      <span className="t-sm t-num t-strong">{fmtNum(j[1])}</span>
                    </div>
                  ))}
                  <div className="divider" />
                  <MiniBars data={d.jobs.daily} color="var(--p-success)" />
                </div>
              </div>
            )}
          </Card>
        </div>
        <div className="stack-4">
          <Card>
            <CardHead
              title="Plan mix"
              sub={d.totalStores + ' stores'}
              actions={
                <a href={href('#/admin/plan-tiers')} className="btn btn-plain btn-sm">
                  Plans
                </a>
              }
            />
            {planMix.length === 0 ? (
              <EmptyState icon="plan" title="No stores yet">
                Plan distribution appears once stores install the app.
              </EmptyState>
            ) : (
              <div className="row-6" style={{ padding: 16, alignItems: 'center' }}>
                <Donut
                  size={104}
                  thickness={13}
                  segments={planMix.map((p) => ({ value: p.value, color: p.color }))}
                  center={
                    <div style={{ textAlign: 'center' }}>
                      <div className="t-h1" style={{ fontSize: 20 }}>
                        {d.totalStores}
                      </div>
                      <div className="t-xs t-muted">stores</div>
                    </div>
                  }
                />
                <div className="grow stack-2">
                  {planMix.map((p) => (
                    <div key={p.name} className="row spread">
                      <span className="row-2 t-sm">
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />
                        {titleCase(p.name)}
                      </span>
                      <span className="t-sm t-num t-strong">{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          <Card>
            <CardHead
              title="Store health"
              sub="Needs attention first"
              actions={
                <a href={href('#/admin/stores')} className="btn btn-plain btn-sm">
                  All stores
                </a>
              }
            />
            {health.length === 0 ? (
              <EmptyState icon="store" title="No stores yet">
                Store health appears once stores install the app.
              </EmptyState>
            ) : (
              <div className="rlist">
                {health.slice(0, 5).map(({ s, h }) => (
                  <a
                    key={s.id}
                    className="ritem"
                    href={href('#/admin/stores/' + s.id)}
                    onClick={(e) => {
                      e.preventDefault();
                      ctx.go('#/admin/stores/' + s.id);
                    }}
                  >
                    <Avatar name={s.name} size={28} square color="#1F3A5F" />
                    <div className="grow stack" style={{ gap: 3, minWidth: 0 }}>
                      <span className="t-sm t-strong t-trunc">{s.name}</span>
                      <Progress value={h} tone={healthTone(h)} />
                    </div>
                    <span className="t-sm t-strong t-num" style={{ color: 'var(--p-' + healthTone(h) + '-text)', width: 32, textAlign: 'right' }}>
                      {h}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      <div className="col-main">
        <Card>
          <CardHead
            title="Recent activity"
            actions={
              <a href={href('#/admin/activity')} className="btn btn-plain btn-sm">
                Activity log
              </a>
            }
          />
          {d.recentActivity.length === 0 ? (
            <EmptyState icon="clock" title="No activity yet">
              Actions across the platform will appear here.
            </EmptyState>
          ) : (
            <DataTable
              rowKey="id"
              onRowClick={(r: any) => ctx.go('#/admin/activity/' + r.id)}
              columns={[
                { key: 'actor', label: 'Actor', render: (r: any) => <Badge>{titleCase(r.actor)}</Badge> },
                { key: 'action', label: 'Action', render: (r: any) => <span className="cell-strong">{titleCase(r.action)}</span> },
                { key: 'resource', label: 'Resource', render: (r: any) => <span className="cell-sub">{r.resource}</span> },
                { key: 'shop', label: 'Store' },
                { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{rel(r.createdAt)}</span> },
              ]}
              rows={d.recentActivity}
            />
          )}
        </Card>
        <Card>
          <CardHead
            title="Latest errors"
            actions={
              <a href={href('#/admin/logs')} className="btn btn-plain btn-sm">
                Error logs
              </a>
            }
          />
          {d.latestErrors.length === 0 ? (
            <EmptyState icon="check" title="No errors logged">
              Errors from the platform will appear here.
            </EmptyState>
          ) : (
            <div className="rlist">
              {d.latestErrors.map((e) => {
                const to = e.correlationId ? '#/admin/trace/' + e.correlationId : '#/admin/logs/' + e.id;
                return (
                  <a
                    key={e.id}
                    className="ritem"
                    href={href(to)}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ctx.go(to);
                    }}
                  >
                    <StatusBadge value={e.level} />
                    <div className="grow stack" style={{ gap: 1 }}>
                      <span className="t-sm t-trunc">{e.message}</span>
                      <span className="t-xs t-muted t-mono">{e.route}</span>
                    </div>
                    <span className="t-xs t-muted">{rel(e.createdAt)}</span>
                  </a>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Renders in place of the dashboard content, still inside AdminChrome, if the loader
// or render throws — a degraded, honest state instead of a raw 500 on the primary ops page.
export function ErrorBoundary() {
  const error = useRouteError();
  const detail = error instanceof Error ? error.message : 'An unexpected error occurred.';
  return (
    <div className="page">
      <PageHead title="Dashboard" sub="Platform health across all merchant stores." />
      <Banner tone="critical" title="Couldn't load the dashboard">
        {detail} The rest of the admin is unaffected — try refreshing, or open the error logs to investigate.
      </Banner>
    </div>
  );
}
