import { json } from '@remix-run/node';
import { useLoaderData, Form, Link } from '@remix-run/react';
import {
  Page, Card, TextField, Button, BlockStack, Text, Badge,
  DataTable, InlineStack, EmptyState,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();

  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const modules = shopRow
    ? await prisma.module.findMany({
        where: { shopId: shopRow.id },
        orderBy: { updatedAt: 'desc' },
        include: {
          versions: { orderBy: { version: 'desc' }, take: 1 },
          activeVersion: true,
        },
        take: 100,
      })
    : [];

  return json({
    shop: session.shop,
    modules: modules.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      status: m.status,
      versionCount: m.versions.length,
      latestVersion: m.versions[0]?.version ?? 1,
      updatedAt: m.updatedAt,
    })),
  });
}

export default function Index() {
  const { shop, modules } = useLoaderData<typeof loader>();

  return (
    <Page title="SuperApp Modules" primaryAction={{ content: 'Docs', url: '/docs', disabled: true }}>
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Generate a new module</Text>
            <Text as="p" tone="subdued">
              Describe what you want — AI will generate a safe RecipeSpec JSON that you can preview and publish.
            </Text>
            <Form method="post" action="/api/ai/create-module">
              <BlockStack gap="300">
                <TextField
                  label="Describe your module"
                  name="prompt"
                  autoComplete="off"
                  placeholder='e.g. "Show a discount popup after 5 seconds offering 10% off"'
                  multiline={3}
                />
                <InlineStack align="start">
                  <Button submit variant="primary">Generate draft</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Your modules ({modules.length})</Text>
            {modules.length === 0 ? (
              <EmptyState
                heading="No modules yet"
                image=""
              >
                <p>Generate your first module above.</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                headings={['Name', 'Type', 'Status', 'Versions', 'Actions']}
                rows={modules.map(m => [
                  m.name,
                  m.type,
                  <Badge key={m.id} tone={m.status === 'PUBLISHED' ? 'success' : 'attention'}>
                    {m.status}
                  </Badge>,
                  m.latestVersion,
                  <Link key={m.id} to={`/modules/${m.id}`}>View / Edit</Link>,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
