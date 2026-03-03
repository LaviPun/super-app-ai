import { json } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { Page, Card, BlockStack, Text } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const stores = await prisma.shop.count();
  const activeProviders = await prisma.aiProvider.count({ where: { isActive: true } });
  const usage24h = await prisma.aiUsage.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } });
  const errors24h = await prisma.errorLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } });

  return json({ stores, activeProviders, usage24h, errors24h });
}

export default function InternalHome() {
  const d = useLoaderData<typeof loader>();
  return (
    <Page title="Developer Dashboard">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <Text as="p">Stores installed: {d.stores}</Text>
            <Text as="p">Active AI providers: {d.activeProviders}</Text>
            <Text as="p">AI calls (24h): {d.usage24h}</Text>
            <Text as="p">Errors (24h): {d.errors24h}</Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="p"><Link to="/internal/ai-providers">AI Providers</Link></Text>
            <Text as="p"><Link to="/internal/usage">AI Usage & Costs</Link></Text>
            <Text as="p"><Link to="/internal/logs">Error Logs</Link></Text>
              <Text as="p"><Link to="/internal/api-logs">API Logs</Link></Text>
            <Text as="p"><Link to="/internal/stores">Stores</Link></Text>
              <Text as="p"><Link to="/internal/jobs">Jobs</Link></Text>
              <Text as="p"><Link to="/internal/logout">Logout</Link></Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
