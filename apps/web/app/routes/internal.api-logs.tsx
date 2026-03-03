import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const logs = await prisma.apiLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300, include: { shop: true } });
  return json({ logs });
}

export default function InternalApiLogs() {
  const { logs } = useLoaderData<typeof loader>();
  return (
    <Page title="API Logs">
      <Card>
        <BlockStack gap="200">
          {logs.length === 0 ? <Text as="p">No logs.</Text> : null}
          {logs.map(l => (
            <Text as="p" key={l.id}>
              {new Date(l.createdAt).toLocaleString()} — {l.actor} {l.method} {l.path} — {l.status} — {l.durationMs}ms — {l.shop?.shopDomain ?? 'n/a'}
            </Text>
          ))}
        </BlockStack>
      </Card>
    </Page>
  );
}
