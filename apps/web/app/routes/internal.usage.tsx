import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const rows = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { provider: true, shop: true },
  });

  const totalCostCents = rows.reduce((s, r) => s + r.costCents, 0);
  const totalRequests = rows.reduce((s, r) => s + (r.requestCount ?? 1), 0);

  return json({ rows, totalCostCents, totalRequests });
}

export default function InternalUsage() {
  const { rows, totalCostCents, totalRequests } = useLoaderData<typeof loader>();
  return (
    <Page title="AI Usage & Costs">
      <BlockStack gap="400">
        <Card>
          <Text as="p">Last 200 calls (30 days). Requests: {totalRequests}. Total cost (approx): ${(totalCostCents / 100).toFixed(2)}</Text>
        </Card>
        <Card>
          <BlockStack gap="200">
            {rows.map(r => (
              <Text key={r.id} as="p">
                {new Date(r.createdAt).toLocaleString()} — {r.action} — {r.provider.name} — req:{r.requestCount ?? 1} in:{r.tokensIn} out:{r.tokensOut} cost:${(r.costCents/100).toFixed(3)} — {r.shop?.shopDomain ?? 'n/a'}
              </Text>
            ))}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
