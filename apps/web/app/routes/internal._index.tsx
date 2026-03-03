import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text, InlineGrid, InlineStack, Button, Divider, ProgressBar } from '@shopify/polaris';
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
  ]);

  const cost24hCents = usage24hAgg._sum.costCents ?? 0;
  const cost24hDollars = cost24hCents / 100;

  return json({
    stores,
    activeProviders,
    usage24h: usage24hCount,
    cost24hCents,
    cost24hDollars,
    errors24h,
    jobs7d,
    activities24h,
    jobsByStatus: Object.fromEntries(jobsByStatus.map(j => [j.status, j._count.id])),
  });
}

export default function InternalHome() {
  const d = useLoaderData<typeof loader>();
  const successCount = d.jobsByStatus.SUCCESS ?? 0;
  const failedCount = d.jobsByStatus.FAILED ?? 0;
  const progress = d.jobs7d > 0 ? Math.round((successCount / d.jobs7d) * 100) : 100;

  return (
    <Page title="Dashboard" subtitle="Overview of stores, AI usage, and system health">
      <BlockStack gap="500">
        <Text as="h2" variant="headingMd">Key metrics</Text>
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Stores installed</Text>
              <Text as="p" variant="headingLg">{d.stores}</Text>
              <Button url="/internal/stores" variant="plain" size="slim">View stores</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">AI calls (24h)</Text>
              <Text as="p" variant="headingLg">{d.usage24h}</Text>
              <Button url="/internal/usage" variant="plain" size="slim">Usage & costs</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">API cost (24h)</Text>
              <Text as="p" variant="headingLg">${d.cost24hDollars.toFixed(2)}</Text>
              <Text as="p" tone="subdued" variant="bodySm">≈ {(d.cost24hCents / 100).toFixed(0)}¢</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Active AI providers</Text>
              <Text as="p" variant="headingLg">{d.activeProviders}</Text>
              <Button url="/internal/ai-providers" variant="plain" size="slim">Configure</Button>
            </BlockStack>
          </Card>
        </InlineGrid>

        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Errors (24h)</Text>
              <Text as="p" variant="headingLg" tone={d.errors24h > 0 ? 'critical' : undefined}>
                {d.errors24h}
              </Text>
              <Button url="/internal/logs" variant="plain" size="slim">Error logs</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Jobs (7d)</Text>
              <Text as="p" variant="headingLg">{d.jobs7d}</Text>
              <ProgressBar progress={progress} size="small" tone={failedCount > 0 ? 'critical' : 'primary'} />
              <Text as="p" variant="bodySm" tone="subdued">Success rate: {progress}%</Text>
              <Button url="/internal/jobs" variant="plain" size="slim">View jobs</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Activities (24h)</Text>
              <Text as="p" variant="headingLg">{d.activities24h}</Text>
              <Button url="/internal/activity" variant="plain" size="slim">Activity log</Button>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Divider />
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Quick links</Text>
          <InlineStack gap="200" wrap>
            <Button url="/internal/plan-tiers">Plan tiers</Button>
            <Button url="/internal/categories">Categories</Button>
            <Button url="/internal/recipe-edit">Recipe edit</Button>
            <Button url="/internal/settings">Settings</Button>
          </InlineStack>
        </BlockStack>
      </BlockStack>
    </Page>
  );
}
