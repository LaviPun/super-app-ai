import { json } from '@remix-run/node';
import { useLoaderData, useNavigate, Link } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Card, CardHead, PageHead, Sparkline, StatusBadge, fmtNum, titleCase,
  ACTIVITY,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TYPE_ICON: Record<string, string> = { 'Storefront UI': 'desktop', 'Function': 'bolt', 'Integration': 'connect', 'Flow': 'flow', 'Data store': 'database' };
const TYPE_COLOR: Record<string, string> = { 'Storefront UI': 'info', 'Function': 'warning', 'Integration': 'magic', 'Flow': 'success', 'Data store': 'info' };

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const quota = new QuotaService();

  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const [moduleCount, publishedCount, draftCount, scheduleCount, sub, recentModules, usage] = await Promise.all([
    prisma.module.count({ where: { shopId: shopRow.id } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'DRAFT' } }),
    prisma.flowSchedule.count({ where: { shopId: shopRow.id } }),
    prisma.appSubscription.findFirst({ where: { shopId: shopRow.id, status: 'ACTIVE' } }),
    prisma.module.findMany({ where: { shopId: shopRow.id }, orderBy: { updatedAt: 'desc' }, take: 4, select: { id: true, name: true, type: true, status: true } }),
    quota.getUsageSummary(shopRow.id),
  ]);

  const activeSchedules = await prisma.flowSchedule.count({ where: { shopId: shopRow.id, isActive: true } });
  const aiLimit = usage.quotas?.aiRequestsPerMonth ?? 0;
  const aiUsed = usage.used?.aiRequests ?? 0;

  return json({
    shop: session.shop,
    stats: {
      modules: moduleCount,
      published: publishedCount,
      drafts: draftCount,
      schedules: scheduleCount,
      activeSchedules,
      planName: sub?.planName ?? 'Free',
      workflowRuns: usage.used?.workflowRuns ?? 0,
    },
    usage: {
      aiRequests: aiUsed,
      aiLimit: aiLimit === -1 ? null : aiLimit,
      aiLeft: aiLimit === -1 ? null : Math.max(0, aiLimit - aiUsed),
    },
    recentModules: recentModules.map(m => ({ id: m.id, name: m.name, type: m.type, status: m.status })),
  });
}

// Map the real Prisma module type token to a design display category for icons/colors.
function designType(t: string): string {
  if (/flow/i.test(t)) return 'Flow';
  if (/function|discount/i.test(t)) return 'Function';
  if (/connector|integration/i.test(t)) return 'Integration';
  if (/data|store/i.test(t)) return 'Data store';
  return 'Storefront UI';
}

function MHomeQuickActions() {
  const ctx = useMerchantCtx();
  const actions = [
    { icon: 'magic', label: 'Generate module', desc: 'Describe it, get 3 concepts', tone: 'magic', onClick: () => ctx.go('#/app/modules') },
    { icon: 'template', label: 'Browse templates', desc: 'Start from a proven recipe', tone: 'info', onClick: () => ctx.go('#/app/templates') },
    { icon: 'flow', label: 'New automation', desc: 'Build a trigger-based flow', tone: 'success', onClick: () => ctx.go('#/app/flows/build/new') },
    { icon: 'connect', label: 'Connect a source', desc: 'Sync data & apps', tone: 'warning', onClick: () => ctx.go('#/app/connectors') },
  ];
  return (
    <Card className="qa-card">
      {actions.map((a, i) => (
        <button key={i} className="qa-tile" onClick={a.onClick}>
          <span className="qa-ico" style={{ background: `var(--p-${a.tone}-bg)`, color: `var(--p-${a.tone})` }}>
            <Icon name={a.icon} size={18} />
          </span>
          <span className="qa-text">
            <span className="qa-label">{a.label}</span>
            <span className="qa-desc">{a.desc}</span>
          </span>
          <span className="qa-arrow"><Icon name="arrowRight" size={15} /></span>
        </button>
      ))}
    </Card>
  );
}

function MStat({ label, value, sub, dir, href }: any) {
  return (
    <Link to={href || '/'} className="card m-stat">
      <div className="m-stat-label">{label}</div>
      <div className="m-stat-val">{value}</div>
      {sub && (
        <div className={'m-stat-sub ' + (dir ? 'metric-delta ' + dir : 't-muted')}>
          {dir && <Icon name={dir === 'down' ? 'chevronDown' : 'chevronUp'} size={12} />}
          {sub}
        </div>
      )}
    </Link>
  );
}

export default function Dashboard() {
  const { shop, stats, usage, recentModules } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const ownerFirst = (shop.split('.')[0] ?? 'there').replace(/[-_]/g, ' ').split(' ')[0] ?? 'there';
  const greetHour = new Date().getHours();
  const greet = greetHour < 12 ? 'Good morning' : greetHour < 18 ? 'Good afternoon' : 'Good evening';
  const spark = [18, 22, 16, 28, 24, 31, 27, 35, 30, 38, 33, 42, 39, 48];

  const aiLeftLabel = usage.aiLeft == null ? '—' : fmtNum(usage.aiLeft);
  const aiOfLabel = usage.aiLimit == null ? 'unlimited' : `of ${fmtNum(usage.aiLimit)} this month`;

  return (
    <MerchantShell>
      <div className="page dash">
        <PageHead
          title={`${greet}, ${titleCase(ownerFirst)}`}
          sub="Here’s how your store is doing with SuperApp AI."
        />

        <div style={{ marginBottom: 24 }}><MHomeQuickActions /></div>

        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <MStat label="Revenue attributed" value="$18,420" sub="12.4% vs last 30 days" dir="up" href="/analytics" />
          <MStat label="Published modules" value={stats.published} sub={`${stats.drafts} in draft`} href="/modules" />
          <MStat label="Active flows" value={stats.activeSchedules} sub={`${fmtNum(stats.workflowRuns)} runs this month`} href="/flows" />
          <MStat label="AI credits left" value={aiLeftLabel} sub={aiOfLabel} href="/billing" />
        </div>

        <div className="col-main" style={{ marginBottom: 24 }}>
          <Card>
            <CardHead title="Attributed revenue" sub="Last 14 days" actions={<Link to="/analytics" className="btn btn-plain btn-sm">Insights</Link>} />
            <div style={{ padding: '12px 20px 20px' }}>
              <Sparkline data={spark} color="var(--p-success)" w={760} h={150} />
              <div className="row spread t-xs t-muted" style={{ marginTop: 8 }}>
                <span>14 days ago</span><span>Today</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Your modules" actions={<Link to="/modules" className="btn btn-plain btn-sm">View all</Link>} />
            <div className="rlist">
              {recentModules.length === 0 && <div style={{ padding: '20px', color: 'var(--p-text-secondary)', fontSize: 13 }}>No modules yet — generate your first one.</div>}
              {recentModules.map((m) => {
                const dt = designType(m.type);
                return (
                  <Link key={m.id} to={`/modules/${m.id}`} className="ritem" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="tile-ico" style={{ width: 32, height: 32, background: `var(--p-${TYPE_COLOR[dt]}-bg)`, color: `var(--p-${TYPE_COLOR[dt]})` }}>
                      <Icon name={TYPE_ICON[dt] ?? 'layers'} size={16} />
                    </span>
                    <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                      <span className="t-sm t-strong t-trunc">{m.name}</span>
                      <span className="t-xs t-muted">{dt}</span>
                    </div>
                    <StatusBadge value={m.status} />
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>

        <Card>
          <CardHead title="Recent activity" actions={<Link to="/activity" className="btn btn-plain btn-sm">View all</Link>} />
          <div className="rlist">
            {ACTIVITY.filter((a: any) => a.actor === 'MERCHANT').slice(0, 5).map((a: any) => (
              <div key={a.id} className="ritem" onClick={() => navigate('/activity')} style={{ cursor: 'pointer' }}>
                <span className="tile-ico" style={{ width: 32, height: 32, background: 'var(--p-surface-secondary)', color: 'var(--p-text-secondary)' }}>
                  <Icon name="live" size={15} />
                </span>
                <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="t-sm t-strong t-trunc">{titleCase(a.action)}</span>
                  <span className="t-xs t-muted t-trunc">{a.resource}</span>
                </div>
                <span className="t-xs t-muted" style={{ whiteSpace: 'nowrap' }}>{a.created}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </MerchantShell>
  );
}
