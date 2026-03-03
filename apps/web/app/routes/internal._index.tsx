import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text, InlineGrid } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [stores, activeProviders, usage24h, errors24h, jobs7d, activities24h] = await Promise.all([
    prisma.shop.count(),
    prisma.aiProvider.count({ where: { isActive: true } }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since24h } } }),
    prisma.errorLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.job.count({ where: { createdAt: { gte: since7d } } }),
    prisma.activityLog.count({ where: { createdAt: { gte: since24h } } }),
  ]);

  return json({ stores, activeProviders, usage24h, errors24h, jobs7d, activities24h });
}

export default function InternalHome() {
  const d = useLoaderData<typeof loader>();
  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Stores installed</Text>
              <Text as="p" variant="headingLg">{d.stores}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Active AI providers</Text>
              <Text as="p" variant="headingLg">{d.activeProviders}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">AI calls (24h)</Text>
              <Text as="p" variant="headingLg">{d.usage24h}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Errors (24h)</Text>
              <Text as="p" variant="headingLg" tone={d.errors24h > 0 ? 'critical' : undefined}>
                {d.errors24h}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Jobs (7d)</Text>
              <Text as="p" variant="headingLg">{d.jobs7d}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Activities (24h)</Text>
              <Text as="p" variant="headingLg">{d.activities24h}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
