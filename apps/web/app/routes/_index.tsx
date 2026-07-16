import { json } from '@remix-run/node';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { CHART, Sparkline, StatTile, StatusBadge, fmtNum, humanizeResource, titleCase } from '~/components/merchant/polaris';
import { getCategoryDisplayLabel, getCategoryIcon } from '~/utils/type-label';

/* eslint-disable @typescript-eslint/no-explicit-any */

function relativeTime(iso: string): string {
  const secs = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return secs + 's ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.round(hrs / 24);
  return days === 1 ? 'Yesterday' : days + 'd ago';
}

// Operational/telemetry events that read as noise (or nonsense) to a merchant.
const NON_MERCHANT_ACTIONS = [
  'PAGE_OPENED', 'PAGE_REFRESHED', 'REQUEST_ERROR', 'SERVER_STARTED',
  'ROUTER_RELEASE_GATE_TRIPPED', 'AI_ASSISTANT_QUERY', 'AI_ASSISTANT_TOOL_CALLED',
];

export async function loader({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const quota = new QuotaService();

  let shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) {
    shopRow = await prisma.shop.create({
      data: { shopDomain: session.shop, accessToken: session.accessToken ?? '', planTier: 'FREE' },
    });
  }

  const since30d = new Date(Date.now() - 30 * 86400000);
  const since14d = new Date(Date.now() - 14 * 86400000);

  const [moduleCount, publishedCount, draftCount, scheduleCount, sub, recentModules, usage, views30d, viewRows14d, recentActivity] = await Promise.all([
    prisma.module.count({ where: { shopId: shopRow.id } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'DRAFT' } }),
    prisma.flowSchedule.count({ where: { shopId: shopRow.id } }),
    prisma.appSubscription.findFirst({ where: { shopId: shopRow.id, status: 'ACTIVE' } }),
    prisma.module.findMany({ where: { shopId: shopRow.id }, orderBy: { updatedAt: 'desc' }, take: 4, select: { id: true, name: true, category: true, status: true } }),
    quota.getUsageSummary(shopRow.id),
    prisma.moduleMetricsDaily.aggregate({ where: { shopId: shopRow.id, date: { gte: since30d } }, _sum: { impressions: true } }),
    prisma.moduleMetricsDaily.findMany({
      where: { shopId: shopRow.id, date: { gte: since14d } },
      select: { date: true, impressions: true },
      orderBy: { date: 'asc' },
      take: 2000,
    }),
    prisma.activityLog.findMany({
      where: { shopId: shopRow.id, action: { notIn: NON_MERCHANT_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, action: true, resource: true, createdAt: true },
    }),
  ]);

  // Greet with the human who's logged in, not the myshopify domain.
  let ownerName: string | null = null;
  try {
    const res = await admin.graphql(`#graphql
      query DashboardShopInfo { shop { name shopOwnerName } }`);
    const data = (await res.json()) as { data?: { shop?: { name?: string; shopOwnerName?: string } } };
    ownerName = data?.data?.shop?.shopOwnerName ?? data?.data?.shop?.name ?? null;
  } catch {
    ownerName = null;
  }

  // Bucket real daily impressions into a 14-slot series for the sparkline.
  const spark: number[] = Array.from({ length: 14 }, () => 0);
  for (const row of viewRows14d) {
    const idx = 13 - Math.min(13, Math.max(0, Math.floor((Date.now() - new Date(row.date).getTime()) / 86400000)));
    spark[idx] = (spark[idx] ?? 0) + row.impressions;
  }
  const hasViewData = viewRows14d.length > 0;

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
      views30d: views30d._sum.impressions ?? 0,
    },
    usage: {
      aiRequests: aiUsed,
      aiLimit: aiLimit === -1 ? null : aiLimit,
      aiLeft: aiLimit === -1 ? null : Math.max(0, aiLimit - aiUsed),
    },
    ownerName,
    recentModules: recentModules.map(m => ({ id: m.id, name: m.name, category: m.category, status: m.status })),
    spark,
    hasViewData,
    // Collapse consecutive repeats of the same event so the feed reads as a
    // story, not a log tail.
    activity: recentActivity
      .filter((a, i) => i === 0 || a.action !== recentActivity[i - 1]!.action || a.resource !== recentActivity[i - 1]!.resource)
      .slice(0, 5)
      .map(a => ({
        id: a.id,
        action: a.action,
        resource: humanizeResource(a.resource),
        created: relativeTime(a.createdAt.toISOString()),
      })),
  });
}

// Same category → icon mapping the modules page uses (shared taxonomy, no heuristics).
const CAT_ICON: Record<string, string> = { desktop: 'desktop', settings: 'settings', users: 'team', bolt: 'bolt', connect: 'connect', flow: 'automation' };
function catIcon(category: string): string {
  return CAT_ICON[getCategoryIcon(category)] ?? 'layer';
}

function QuickActions() {
  const ctx = useMerchantCtx();
  const actions = [
    { icon: 'wand', label: 'Generate module', desc: 'Describe it, get 3 concepts', go: '#/app/modules' },
    { icon: 'theme-template', label: 'Browse templates', desc: 'Start from a proven recipe', go: '#/app/templates' },
    { icon: 'automation', label: 'New automation', desc: 'Build a trigger-based flow', go: '#/app/flows/build/new' },
    { icon: 'connect', label: 'Connect a source', desc: 'Sync data & apps', go: '#/app/connectors' },
  ];
  return (
    <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
      {actions.map((a) => (
        <s-clickable key={a.label} onClick={() => ctx.go(a.go)} padding="small-100" border="base" borderRadius="base">
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-icon type={a.icon as never} tone="info" />
            <s-stack gap="none">
              <s-text type="strong">{a.label}</s-text>
              <s-text color="subdued">{a.desc}</s-text>
            </s-stack>
          </s-stack>
        </s-clickable>
      ))}
    </s-grid>
  );
}

export default function Dashboard() {
  const { shop, stats, usage, recentModules, spark, hasViewData, activity, ownerName } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const greetName = (ownerName ?? shop.split('.')[0] ?? 'there').split(' ')[0] ?? 'there';
  const greetHour = new Date().getHours();
  const greet = greetHour < 12 ? 'Good morning' : greetHour < 18 ? 'Good afternoon' : 'Good evening';

  const aiLeftLabel = usage.aiLeft == null ? '—' : fmtNum(usage.aiLeft);
  const aiOfLabel = usage.aiLimit == null ? 'unlimited' : `of ${fmtNum(usage.aiLimit)} this month`;

  return (
    <MerchantShell polaris>
      <s-page heading={`${greet}, ${titleCase(greetName)}`} inlineSize="base">
        <s-stack gap="base">
        <s-paragraph color="subdued">Here’s how your store is doing with SuperApp AI.</s-paragraph>

        <QuickActions />

        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
          <StatTile label="Module views" value={fmtNum(stats.views30d)} sub="last 30 days" trend={hasViewData ? spark : undefined} trendColor={CHART.success} href="/analytics" />
          <StatTile label="Published modules" value={stats.published} sub={`${stats.drafts} in draft`} href="/modules" />
          <StatTile label="Active flows" value={stats.activeSchedules} sub={`${fmtNum(stats.workflowRuns)} runs this month`} href="/flows" />
          <StatTile label="AI credits left" value={aiLeftLabel} sub={aiOfLabel} href="/billing" />
        </s-grid>

        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
          <s-section heading="Module views — last 14 days">
            {hasViewData ? (
              <s-stack gap="small-100">
                <s-text accessibilityVisibility="exclusive">
                  {`Module views over the last 14 days: ${fmtNum(stats.views30d)} total in the last 30 days.`}
                </s-text>
                <Sparkline data={spark} color={CHART.success} w={760} h={150} />
                <s-stack direction="inline" justifyContent="space-between">
                  <s-text color="subdued">14 days ago</s-text>
                  <s-link href="/analytics">Insights</s-link>
                  <s-text color="subdued">Today</s-text>
                </s-stack>
              </s-stack>
            ) : (
              <s-stack direction="inline" gap="small-100" alignItems="center">
                <s-icon type="chart-line" tone="neutral" />
                <s-text color="subdued">No storefront views recorded yet — publish a module to start tracking.</s-text>
                <s-link href="/modules">Publish a module</s-link>
              </s-stack>
            )}
          </s-section>

          <s-section heading="Your modules">
            <s-stack gap="none">
              {recentModules.length === 0 && (
                <s-text color="subdued">No modules yet — generate your first one.</s-text>
              )}
              {recentModules.map((m) => (
                <s-clickable key={m.id} onClick={() => navigate(`/modules/${m.id}`)} padding="small-200" borderRadius="small">
                  <s-grid gridTemplateColumns="auto 1fr auto" gap="small-100" alignItems="center">
                    <s-icon type={catIcon(m.category) as never} tone="neutral" size="small" />
                    <s-stack gap="none">
                      <s-text type="strong">{m.name}</s-text>
                      <s-text color="subdued">{getCategoryDisplayLabel(m.category)}</s-text>
                    </s-stack>
                    <StatusBadge status={m.status} />
                  </s-grid>
                </s-clickable>
              ))}
              <s-link href="/modules">View all</s-link>
            </s-stack>
          </s-section>
        </s-grid>

        <s-section heading="Recent activity">
          <s-stack gap="none">
            {activity.length === 0 && (
              <s-text color="subdued">No activity yet — actions on your store will show up here.</s-text>
            )}
            {activity.map((a) => (
              <s-clickable key={a.id} onClick={() => navigate('/activity')} padding="small-200" borderRadius="small">
                <s-stack direction="inline" gap="small-100" alignItems="center">
                  <s-icon type="live" tone="neutral" size="small" />
                  <s-stack gap="none">
                    <s-text type="strong">{titleCase(a.action)}</s-text>
                    {a.resource && <s-text color="subdued">{a.resource}</s-text>}
                  </s-stack>
                  <s-text color="subdued">{a.created}</s-text>
                </s-stack>
              </s-clickable>
            ))}
            <s-link href="/activity">View all</s-link>
          </s-stack>
        </s-section>
        </s-stack>
      </s-page>
    </MerchantShell>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
