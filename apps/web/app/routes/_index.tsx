import { json } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Badge,
  InlineStack, InlineGrid, Divider, Button,
  DataTable, Banner,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

function MiniBarChart({ data, maxHeight = 48 }: { data: number[]; maxHeight?: number }) {
  const maxVal = Math.max(...data, 1);
  const barW = Math.max(8, Math.floor(220 / data.length) - 2);
  return (
    <svg width={data.length * (barW + 2)} height={maxHeight} style={{ display: 'block' }}>
      {data.map((v, i) => {
        const h = Math.max(2, (v / maxVal) * maxHeight);
        return (
          <rect
            key={i}
            x={i * (barW + 2)}
            y={maxHeight - h}
            width={barW}
            height={h}
            rx={2}
            fill={i === data.length - 1 ? '#2C6ECB' : '#B4E0FA'}
          />
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

  const [
    moduleCount,
    publishedCount,
    draftCount,
    connectorCount,
    scheduleCount,
    sub,
    recentJobs,
    last30Jobs,
    allModules,
  ] = await Promise.all([
    prisma.module.count({ where: { shopId: shopRow.id } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'PUBLISHED' } }),
    prisma.module.count({ where: { shopId: shopRow.id, status: 'DRAFT' } }),
    prisma.connector.count({ where: { shopId: shopRow.id } }),
    prisma.flowSchedule.count({ where: { shopId: shopRow.id } }),
    prisma.appSubscription.findFirst({ where: { shopId: shopRow.id, status: 'ACTIVE' } }),
    prisma.job.findMany({ where: { shopId: shopRow.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.job.findMany({ where: { shopId: shopRow.id, createdAt: { gte: since30d } }, select: { status: true } }),
    prisma.module.findMany({ where: { shopId: shopRow.id }, select: { createdAt: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const successJobs = last30Jobs.filter(j => j.status === 'SUCCESS').length;
  const failedJobs = last30Jobs.filter(j => j.status === 'FAILED').length;
  const successRate = last30Jobs.length > 0 ? Math.round((successJobs / last30Jobs.length) * 100) : 100;

  const now = new Date();
  const dailyCounts: number[] = [];
  for (let d = 6; d >= 0; d--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    dailyCounts.push(allModules.filter(m => { const c = new Date(m.createdAt); return c >= dayStart && c < dayEnd; }).length);
  }

  return json({
    shop: session.shop,
    stats: {
      modules: moduleCount,
      published: publishedCount,
      drafts: draftCount,
      connectors: connectorCount,
      schedules: scheduleCount,
      planName: sub?.planName ?? 'Free',
      successRate,
      totalJobs30d: last30Jobs.length,
      failedJobs30d: failedJobs,
    },
    dailyCounts,
    recentJobs: recentJobs.map(j => ({
      id: j.id,
      type: j.type,
      status: j.status,
      createdAt: j.createdAt.toISOString(),
    })),
  });
}

export default function Dashboard() {
  const { shop, stats, dailyCounts, recentJobs } = useLoaderData<typeof loader>();

  const storeName = shop.split('.')[0];
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString('en', { weekday: 'short' });
  });

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* ─── Welcome ─── */}
        <Banner tone="info" title={`Welcome back, ${storeName}`}>
          <Text as="p">
            You're on the <strong>{stats.planName}</strong> plan.{' '}
            {stats.modules === 0
              ? 'Head to Modules to create your first one!'
              : `You have ${stats.modules} module${stats.modules !== 1 ? 's' : ''} - ${stats.published} live.`}
          </Text>
        </Banner>

        {/* ─── Key metrics ─── */}
        <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Modules</Text>
              <Text as="p" variant="headingLg">{stats.modules}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Published</Text>
              <Text as="p" variant="headingLg" tone="success">{stats.published}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Drafts</Text>
              <Text as="p" variant="headingLg">{stats.drafts}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Connectors</Text>
              <Text as="p" variant="headingLg">{stats.connectors}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Schedules</Text>
              <Text as="p" variant="headingLg">{stats.schedules}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Plan</Text>
              <Badge tone={stats.planName === 'Free' ? 'attention' : 'success'}>{stats.planName}</Badge>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* ─── Charts ─── */}
        <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Modules created (7 days)</Text>
              <MiniBarChart data={dailyCounts} maxHeight={56} />
              <InlineStack gap="200">
                {dayLabels.map((l, i) => (
                  <Text key={i} as="span" variant="bodySm" tone="subdued">{l}</Text>
                ))}
              </InlineStack>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Job success (30d)</Text>
                <Badge tone={stats.successRate >= 90 ? 'success' : stats.successRate >= 70 ? 'attention' : 'critical'}>
                  {stats.successRate}%
                </Badge>
              </InlineStack>
              <div className="Dashboard-jobSuccessBar" role="progressbar" aria-valuenow={stats.successRate} aria-valuemin={0} aria-valuemax={100}>
                <div
                  className="Dashboard-jobSuccessBar-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, stats.successRate))}%`,
                    backgroundColor: stats.successRate >= 90 ? 'var(--p-color-bg-fill-success, #008060)' : stats.successRate >= 70 ? 'var(--p-color-bg-fill-caution, #ffc453)' : 'var(--p-color-bg-fill-critical, #d72c0d)',
                  }}
                />
              </div>
              <InlineStack gap="300">
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.totalJobs30d} total | {stats.failedJobs30d} failed
                </Text>
                <Button url="/logs" variant="plain" size="slim">View details</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* ─── Recent jobs ─── */}
        {recentJobs.length > 0 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Recent activity</Text>
                <Button url="/logs" variant="plain" size="slim">View all</Button>
              </InlineStack>
              <DataTable
                columnContentTypes={['text', 'text', 'text']}
                headings={['Time', 'Type', 'Status']}
                rows={recentJobs.map(j => [
                  new Date(j.createdAt).toLocaleString(),
                  j.type.replace(/_/g, ' '),
                  <Badge key={j.id} tone={j.status === 'SUCCESS' ? 'success' : j.status === 'FAILED' ? 'critical' : 'attention'}>{j.status}</Badge>,
                ])}
              />
            </BlockStack>
          </Card>
        )}

        <Divider />

        {/* ─── Quick navigation ─── */}
        <InlineGrid columns={{ xs: 2, sm: 4 }} gap="300">
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Modules</Text>
              <Text as="p" variant="bodySm" tone="subdued">Create and manage AI modules.</Text>
              <Button url="/modules" variant="plain">Go to modules</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Connectors</Text>
              <Text as="p" variant="bodySm" tone="subdued">External API integrations.</Text>
              <Button url="/connectors" variant="plain">Manage</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Flows</Text>
              <Text as="p" variant="bodySm" tone="subdued">Automation schedules.</Text>
              <Button url="/flows" variant="plain">Manage</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">Logs & Usage</Text>
              <Text as="p" variant="bodySm" tone="subdued">Activity, limits, success rates.</Text>
              <Button url="/logs" variant="plain">View logs</Button>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
