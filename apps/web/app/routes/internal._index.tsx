import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
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
  fmtNum,
  titleCase,
  STORES,
  PLAN_TIERS,
  PLATFORM,
  ACTIVITY,
  ERROR_LOGS,
  WEBHOOKS,
  storeHealth,
  healthTone,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [stores, activeProviders, usage24hCount, usage24hAgg, errors24h, jobs7d, activities24h, jobsByStatus, apiLogs24h] =
    await Promise.all([
      prisma.shop.count(),
      prisma.aiProvider.count({ where: { isActive: true } }),
      prisma.aiUsage.count({ where: { createdAt: { gte: since24h } } }),
      prisma.aiUsage.aggregate({ where: { createdAt: { gte: since24h } }, _sum: { costCents: true }, _count: { id: true } }),
      prisma.errorLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.job.count({ where: { createdAt: { gte: since7d } } }),
      prisma.activityLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.job.groupBy({ by: ['status'], where: { createdAt: { gte: since7d } }, _count: { id: true } }),
      prisma.apiLog.count({ where: { createdAt: { gte: since24h } } }),
    ]);

  const cost24hCents = usage24hAgg._sum.costCents ?? 0;

  return json({
    stores,
    activeProviders,
    usage24h: usage24hCount,
    cost24hCents,
    errors24h,
    jobs7d,
    activities24h,
    apiLogs24h,
    jobsByStatus: Object.fromEntries(jobsByStatus.map((j) => [j.status, j._count.id])),
  });
}

const PLAN_COLOR: Record<string, string> = {
  FREE: 'var(--p-text-disabled)',
  STARTER: 'var(--p-info)',
  GROWTH: 'var(--p-success)',
  PRO: 'var(--p-magic)',
  ENTERPRISE: 'var(--p-warning)',
};

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
  const P = PLATFORM;
  const spark = [12, 18, 9, 22, 30, 24, 38, 33, 41, 36, 48, 44, 52, 60];
  const jobBars = [82, 90, 76, 95, 88, 91, 98];

  const failed = (d.jobsByStatus as Record<string, number>).FAILED ?? 0;
  const succeeded = (d.jobsByStatus as Record<string, number>).SUCCESS ?? 0;
  const runningQueued =
    ((d.jobsByStatus as Record<string, number>).RUNNING ?? 0) + ((d.jobsByStatus as Record<string, number>).QUEUED ?? 0);
  const totalStores = d.stores || STORES.length;
  const active = STORES.filter((s) => s.status === 'ACTIVE').length;
  const trial = STORES.filter((s) => s.status === 'TRIAL').length;

  const planMix = PLAN_TIERS.map((p) => ({ name: p.name, value: STORES.filter((s) => s.plan === p.name).length, color: PLAN_COLOR[p.name] })).filter(
    (p) => p.value > 0,
  );
  const health = STORES.map((s) => ({ s, h: storeHealth(s) })).sort((a, b) => a.h - b.h);

  const revenueKpis = [
    { label: 'MRR', value: '$' + fmtNum(P.mrr), icon: 'chart', sub: '+' + P.mrrDelta + '%', dir: 'up', href: href('#/admin/plan-tiers') },
    { label: 'ARPU', value: '$' + P.arpu, icon: 'plan', sub: 'per active store', href: href('#/admin/plan-tiers') },
    { label: 'New installs (7d)', value: P.installs7d, icon: 'store', sub: P.installs30d + ' in 30d', dir: 'up', href: href('#/admin/stores') },
    { label: 'Trial → paid', value: P.trialConv + '%', icon: 'rocket', sub: trial + ' on trial now', href: href('#/admin/stores') },
    { label: 'Churn (30d)', value: P.churn30d + '%', icon: 'transfer', sub: P.churnStores + ' store lost', dir: 'down', href: href('#/admin/stores') },
    { label: 'LTV', value: '$' + fmtNum(P.ltv), icon: 'star', sub: 'blended estimate', href: href('#/admin/plan-tiers') },
  ];
  const reliabilityKpis = [
    { label: 'Job success (7d)', value: '95.6%', icon: 'check', sub: '+1.1%', dir: 'up', href: href('#/admin/jobs') },
    { label: 'DLQ depth', value: failed + ' jobs', icon: 'alert', sub: 'replay ready', dir: 'down', href: href('#/admin/jobs') },
    { label: 'Webhook success', value: '98.2%', icon: 'transfer', sub: WEBHOOKS.filter((w) => !w.success).length + ' failed', href: href('#/admin/webhooks') },
    { label: 'Error rate', value: '0.3%', icon: 'bug', sub: 'under 1.0% gate', dir: 'down', href: href('#/admin/logs') },
    { label: 'AI cost (30d)', value: '$' + fmtNum(P.aiCostMonth), icon: 'magic', sub: P.costPerCall + '¢ / call', href: href('#/admin/usage') },
    { label: 'Gross margin', value: P.grossMargin + '%', icon: 'chart', sub: 'after AI cost', dir: 'up', href: href('#/admin/usage') },
  ];

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        sub="Platform health across all merchant stores — last 24 hours unless noted."
        actions={
          <>
            <Btn icon="refresh" onClick={() => ctx.toast('Metrics refreshed')}>
              Refresh
            </Btn>
            <Btn variant="primary" icon="chat" onClick={() => ctx.go('#/admin/ai-assistant')}>
              Ask the assistant
            </Btn>
          </>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Active stores" value={active} sub={trial + ' on trial · ' + totalStores + ' total'} icon="store" tone="info" delta="2" href={href('#/admin/stores')} />
        <StatTile label="AI calls (24h)" value={fmtNum(d.usage24h)} icon="magic" tone="magic" delta="8.1%" href={href('#/admin/usage')} />
        <StatTile label="API cost (24h)" value={'$' + (d.cost24hCents / 100).toFixed(2)} icon="chart" tone="success" delta="3.4%" deltaDir="down" href={href('#/admin/usage')} />
        <StatTile label="Errors (24h)" value={d.errors24h} icon="bug" tone="critical" delta="1" deltaDir="down" href={href('#/admin/logs')} />
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
              sub="Last 14 days · all stores"
              actions={
                <div className="seg">
                  <button aria-selected>14d</button>
                  <button>30d</button>
                </div>
              }
            />
            <div style={{ padding: '8px 16px 16px' }}>
              <Sparkline data={spark} w={760} h={120} />
              <div className="row spread t-xs t-muted" style={{ marginTop: 6 }}>
                <span>Jun 1</span>
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
            <div className="row-6" style={{ padding: 18, alignItems: 'center' }}>
              <Donut
                segments={[
                  { value: 91, color: 'var(--p-success)' },
                  { value: 5, color: 'var(--p-warning)' },
                  { value: 4, color: 'var(--p-critical)' },
                ]}
                center={
                  <div style={{ textAlign: 'center' }}>
                    <div className="t-h1" style={{ fontSize: 24 }}>
                      91%
                    </div>
                    <div className="t-xs t-muted">success</div>
                  </div>
                }
              />
              <div className="grow stack-3">
                {([
                  ['Succeeded', succeeded || 1842, 'var(--p-success)'],
                  ['Running / queued', runningQueued || 38, 'var(--p-warning)'],
                  ['Failed (DLQ)', failed || 81, 'var(--p-critical)'],
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
                <MiniBars data={jobBars} color="var(--p-success)" />
              </div>
            </div>
          </Card>
        </div>
        <div className="stack-4">
          <Card>
            <CardHead
              title="Plan mix"
              sub={STORES.length + ' stores'}
              actions={
                <a href={href('#/admin/plan-tiers')} className="btn btn-plain btn-sm">
                  Plans
                </a>
              }
            />
            <div className="row-6" style={{ padding: 16, alignItems: 'center' }}>
              <Donut
                size={104}
                thickness={13}
                segments={planMix.map((p) => ({ value: p.value, color: p.color }))}
                center={
                  <div style={{ textAlign: 'center' }}>
                    <div className="t-h1" style={{ fontSize: 20 }}>
                      {STORES.length}
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
            <div className="rlist">
              {health.slice(0, 5).map(({ s, h }) => (
                <div key={s.id} className="ritem" onClick={() => ctx.go('#/admin/stores/' + s.id)}>
                  <Avatar name={s.name} size={28} square color="#1F3A5F" />
                  <div className="grow stack" style={{ gap: 3, minWidth: 0 }}>
                    <span className="t-sm t-strong t-trunc">{s.name}</span>
                    <Progress value={h} tone={healthTone(h)} />
                  </div>
                  <span className="t-sm t-strong t-num" style={{ color: 'var(--p-' + healthTone(h) + '-text)', width: 32, textAlign: 'right' }}>
                    {h}
                  </span>
                </div>
              ))}
            </div>
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
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => ctx.go('#/admin/activity/' + r.id)}
            columns={[
              { key: 'actor', label: 'Actor', render: (r: any) => <Badge>{titleCase(r.actor)}</Badge> },
              { key: 'action', label: 'Action', render: (r: any) => <span className="cell-strong">{titleCase(r.action)}</span> },
              { key: 'resource', label: 'Resource', render: (r: any) => <span className="cell-sub">{r.resource}</span> },
              { key: 'shop', label: 'Store' },
              { key: 'created', label: 'When', render: (r: any) => <span className="cell-sub">{r.created}</span> },
            ]}
            rows={ACTIVITY.slice(0, 6)}
          />
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
          <div className="rlist">
            {ERROR_LOGS.slice(0, 4).map((e) => (
              <div key={e.id} className="ritem" onClick={() => ctx.go('#/admin/trace/' + e.correlationId)}>
                <StatusBadge value={e.level} />
                <div className="grow stack" style={{ gap: 1 }}>
                  <span className="t-sm t-trunc">{e.message}</span>
                  <span className="t-xs t-muted t-mono">{e.route}</span>
                </div>
                <span className="t-xs t-muted">{e.created}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
