import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Page, Card, BlockStack, Text } from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const logs = await prisma.errorLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { shop: true } });
  return json({ logs });
}

export default function InternalLogs() {
  const { logs } = useLoaderData<typeof loader>();
  return (
    <Page title="Error Logs">
      <Card>
        <BlockStack gap="200">
          {logs.length === 0 ? <Text as="p">No logs.</Text> : null}
          {logs.map(l => (
            <Text as="p" key={l.id}>
              {new Date(l.createdAt).toLocaleString()} — {l.level} — {l.message} — {l.shop?.shopDomain ?? 'n/a'} {l.route ? `(${l.route})` : ''}
            </Text>
          ))}
        </BlockStack>
      </Card>
    </Page>
  );
}
