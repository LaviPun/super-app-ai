import { json, redirect } from '@remix-run/node';
import { useLoaderData, Form, useNavigation } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, DataTable, Button, TextField,
  InlineStack, Badge, Banner, Select,
} from '@shopify/polaris';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ConnectorService } from '~/services/connectors/connector.service';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  const connectors = shopRow
    ? await prisma.connector.findMany({
        where: { shopId: shopRow.id },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  return json({
    connectors: connectors.map(c => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      authType: c.authType,
      lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
      hasSampleResponse: Boolean(c.sampleResponseJson),
    })),
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const baseUrl = String(form.get('baseUrl') ?? '').trim();
    const authType = String(form.get('authType') ?? 'API_KEY');
    const apiKey = String(form.get('apiKey') ?? '').trim();
    const headerName = String(form.get('headerName') ?? 'X-Api-Key').trim();

    if (!name || !baseUrl) return json({ error: 'Name and Base URL are required' }, { status: 400 });

    const svc = new ConnectorService();
    await svc.create({
      shopDomain: session.shop,
      name,
      baseUrl,
      allowlistDomains: [],
      auth: { type: 'API_KEY', headerName: headerName || 'X-Api-Key', apiKey },
    });

    return redirect('/connectors');
  }

  if (intent === 'delete') {
    const id = String(form.get('connectorId') ?? '');
    if (!id) return json({ error: 'Missing connectorId' }, { status: 400 });
    const prisma = getPrisma();
    const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
    if (shopRow) {
      await prisma.connector.deleteMany({ where: { id, shopId: shopRow.id } });
    }
    return redirect('/connectors');
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

export default function ConnectorsIndex() {
  const { connectors } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';

  return (
    <Page
      title="Integrations & Connectors"
      backAction={{ content: 'Modules', url: '/' }}
      primaryAction={{ content: 'Docs', url: '/docs', disabled: true }}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Add connector</Text>
            <Banner tone="info" title="SSRF protection enabled">
              Only HTTPS connections are allowed. The baseUrl domain is automatically added to the allowlist.
            </Banner>
            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <BlockStack gap="200">
                <TextField label="Connector name" name="name" autoComplete="off" placeholder="My ERP API" />
                <TextField label="Base URL (https only)" name="baseUrl" autoComplete="off" placeholder="https://api.example.com/v1" />
                <TextField label="API key header name" name="headerName" autoComplete="off" placeholder="X-Api-Key" />
                <TextField label="API key" name="apiKey" type="password" autoComplete="off" />
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Add connector</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Configured connectors ({connectors.length})</Text>
            {connectors.length === 0 ? (
              <Text as="p" tone="subdued">No connectors yet.</Text>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                headings={['Name', 'Base URL', 'Auth', 'Last tested', 'Actions']}
                rows={connectors.map(c => [
                  c.name,
                  c.baseUrl,
                  <Badge key={`auth-${c.id}`}>{c.authType}</Badge>,
                  c.lastTestedAt
                    ? <span key={`t-${c.id}`}>{new Date(c.lastTestedAt).toLocaleDateString()}{c.hasSampleResponse ? ' ✓' : ''}</span>
                    : <Text key={`t-${c.id}`} as="span" tone="subdued">Never</Text>,
                  <Form key={c.id} method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="connectorId" value={c.id} />
                    <Button submit size="slim" tone="critical">Delete</Button>
                  </Form>,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
