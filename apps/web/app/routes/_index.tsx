import { json } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Badge,
  InlineStack, InlineGrid, Divider, Button,
  DataTable, Banner, Box,
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
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  });

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        {/* ─── Welcome ─── */}
        <Banner tone="info" title={`Welcome back, ${storeName}`} action={{ content: 'Create a module', url: '/modules' }}>
          <BlockStack gap="200">
            <Text as="p">
              You're on the <strong>{stats.planName}</strong> plan.{' '}
              {stats.modules === 0
                ? 'Create your first module with AI or from a template.'
                : `You have ${stats.modules} module${stats.modules !== 1 ? 's' : ''} — ${stats.published} live on your store.`}
            </Text>
          </BlockStack>
        </Banner>

        {/* ─── Key metrics ─── */}
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd" fontWeight="semibold">Overview</Text>
          <InlineGrid columns={{ xs: 2, sm: 3, md: 6 }} gap="400">
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Modules</Text>
                <Text as="p" variant="headingXl">{stats.modules}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Published</Text>
                <Text as="p" variant="headingXl" tone="success">{stats.published}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Drafts</Text>
                <Text as="p" variant="headingXl">{stats.drafts}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Connectors</Text>
                <Text as="p" variant="headingXl">{stats.connectors}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Schedules</Text>
                <Text as="p" variant="headingXl">{stats.schedules}</Text>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Plan</Text>
                <Badge tone={stats.planName === 'Free' ? 'attention' : 'success'}>{stats.planName}</Badge>
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>

        {/* ─── Charts ─── */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd" fontWeight="semibold">Activity</Text>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
            <Card padding="400">
              <BlockStack gap="400">
                <Text as="h3" variant="headingSm">Modules created (7 days)</Text>
                <Box paddingBlockEnd="200">
                  <MiniBarChart data={dailyCounts} maxHeight={56} />
                </Box>
                <InlineStack gap="100" wrap>
                  {dayLabels.map((l, i) => (
                    <Box key={i} minWidth="28px">
                      <Text as="span" variant="bodySm" tone="subdued">{l}</Text>
                    </Box>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">Job success (30d)</Text>
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
                <InlineStack gap="300" blockAlign="center">
                  <Text as="p" variant="bodySm" tone="subdued">
                    {stats.totalJobs30d} total · {stats.failedJobs30d} failed
                  </Text>
                  <Button url="/logs" variant="plain" size="slim">View logs</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>

        {/* ─── Recent jobs ─── */}
        <Card padding="0">
          <BlockStack gap="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd" fontWeight="semibold">Recent activity</Text>
                <Button url="/logs" variant="plain" size="slim">View all logs</Button>
              </InlineStack>
            </Box>
            {recentJobs.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text']}
                headings={['Time', 'Type', 'Status']}
                rows={recentJobs.map(j => [
                  new Date(j.createdAt).toLocaleString('en-US'),
                  j.type.replace(/_/g, ' '),
                  <Badge key={j.id} tone={j.status === 'SUCCESS' ? 'success' : j.status === 'FAILED' ? 'critical' : 'attention'}>{j.status}</Badge>,
                ])}
              />
            ) : (
              <Box padding="400" paddingBlockStart="0">
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">No recent activity. Jobs will appear here after you run flows or publish modules.</Text>
                  <Button url="/flows" variant="plain" size="slim">Set up flows</Button>
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </Card>

        <Divider />

        {/* ─── What you can build ─── */}
        <Card padding="400">
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd" fontWeight="semibold">What you can build</Text>
              <Badge tone="magic">AI-powered</Badge>
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">
              Describe what you want in plain English — the AI generates ready-to-publish Shopify modules.
            </Text>
            <InlineGrid columns={{ xs: 2, sm: 3, md: 4 }} gap="300">
              {[
                { label: 'Popup', desc: 'Discount / exit-intent / newsletter', icon: '🪟' },
                { label: 'Banner', desc: 'Hero banners with CTA', icon: '🖼️' },
                { label: 'Announcement bar', desc: 'Sticky top-of-page notices', icon: '📢' },
                { label: 'Floating widget', desc: 'WhatsApp, chat, scroll-to-top', icon: '💬' },
                { label: 'Seasonal effect', desc: 'Snowfall, confetti overlay', icon: '❄️' },
                { label: 'Checkout upsell', desc: 'Add-on blocks at checkout', icon: '🛒' },
                { label: 'Discount function', desc: 'VIP, tiered, BOGO rules', icon: '🏷️' },
                { label: 'Automation flow', desc: 'Tag orders, send emails', icon: '⚡' },
              ].map(({ label, desc, icon }) => (
                <Box
                  key={label}
                  padding="300"
                  background="bg-surface-secondary"
                  borderRadius="200"
                >
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="span" variant="bodyLg">{icon}</Text>
                    <BlockStack gap="050">
                      <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{desc}</Text>
                    </BlockStack>
                  </InlineStack>
                </Box>
              ))}
            </InlineGrid>
            <InlineStack gap="300">
              <Button url="/modules" variant="primary">Create a module</Button>
              <Button url="https://shopify.dev/docs/apps/build" variant="plain" external>Shopify docs</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Divider />

        {/* ─── Quick navigation ─── */}
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd" fontWeight="semibold">Quick links</Text>
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Modules</Text>
                <Text as="p" variant="bodySm" tone="subdued">Create and manage AI modules.</Text>
                <Button url="/modules" variant="primary" size="slim">Go to modules</Button>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Connectors</Text>
                <Text as="p" variant="bodySm" tone="subdued">External API integrations.</Text>
                <Button url="/connectors" variant="secondary" size="slim">Manage connectors</Button>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Flows</Text>
                <Text as="p" variant="bodySm" tone="subdued">Automation schedules.</Text>
                <Button url="/flows" variant="secondary" size="slim">Manage flows</Button>
              </BlockStack>
            </Card>
            <Card padding="400">
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Logs &amp; usage</Text>
                <Text as="p" variant="bodySm" tone="subdued">Activity, limits, success rates.</Text>
                <Button url="/logs" variant="secondary" size="slim">View logs</Button>
              </BlockStack>
            </Card>
          </InlineGrid>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
