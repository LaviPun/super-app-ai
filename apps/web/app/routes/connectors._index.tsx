import { json, redirect } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useActionData, Link } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, DataTable, Button, TextField,
  InlineStack, Badge, Banner, EmptyState, Modal, SkeletonBodyText, InlineGrid,
} from '@shopify/polaris';
import { useState, useCallback } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ConnectorService } from '~/services/connectors/connector.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  const connectors = shopRow
    ? await prisma.connector.findMany({
        where: { shopId: shopRow.id },
        orderBy: { createdAt: 'desc' },
        include: { endpoints: { select: { id: true } } },
      })
    : [];

  const tested = connectors.filter(c => c.lastTestedAt).length;

  return json({
    connectors: connectors.map(c => ({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      authType: c.authType,
      lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
      hasSampleResponse: Boolean(c.sampleResponseJson),
      endpointCount: c.endpoints.length,
    })),
    stats: { total: connectors.length, tested },
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? 'create');
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const activity = new ActivityLogService();

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const baseUrl = String(form.get('baseUrl') ?? '').trim();
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
    await activity.log({ actor: 'MERCHANT', action: 'CONNECTOR_CREATED', shopId: shopRow?.id, details: { name, baseUrl } });
    return redirect('/connectors');
  }

  if (intent === 'delete') {
    const id = String(form.get('connectorId') ?? '');
    if (!id) return json({ error: 'Missing connectorId' }, { status: 400 });
    if (shopRow) {
      await prisma.connector.deleteMany({ where: { id, shopId: shopRow.id } });
    }
    await activity.log({ actor: 'MERCHANT', action: 'CONNECTOR_DELETED', shopId: shopRow?.id, resource: `connector:${id}` });
    return redirect('/connectors');
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

export default function ConnectorsIndex() {
  const { connectors, stats } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const handleDeleteClose = useCallback(() => setDeleteTarget(null), []);

  return (
    <Page
      title="Connectors"
      subtitle="Connect external APIs for automation flows"
      backAction={{ content: 'Dashboard', url: '/' }}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical" title="Error">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        )}

        {/* ─── Stats ─── */}
        <InlineGrid columns={{ xs: 2, sm: 3 }} gap="300">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Total</Text>
              <Text as="p" variant="headingLg">{stats.total}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Tested</Text>
              <Text as="p" variant="headingLg" tone="success">{stats.tested}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">Untested</Text>
              <Text as="p" variant="headingLg" tone={stats.total - stats.tested > 0 ? 'caution' : undefined}>
                {stats.total - stats.tested}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* ─── Add connector ─── */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Add connector</Text>
              <Badge tone="info">SSRF protected</Badge>
            </InlineStack>
            <Text as="p" tone="subdued">
              Only HTTPS connections are allowed. Base URL domain is automatically allowlisted. API keys are encrypted at rest.
            </Text>
            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <BlockStack gap="200">
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                  <TextField label="Connector name" name="name" autoComplete="off" placeholder="My ERP API" helpText="Friendly name for this integration." />
                  <TextField label="Base URL (https only)" name="baseUrl" autoComplete="off" placeholder="https://api.example.com/v1" />
                </InlineGrid>
                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="200">
                  <TextField label="API key header" name="headerName" autoComplete="off" placeholder="X-Api-Key" />
                  <TextField label="API key" name="apiKey" type="password" autoComplete="off" />
                </InlineGrid>
                <InlineStack align="start">
                  <Button submit variant="primary" loading={isSaving}>Add connector</Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        {/* ─── List ─── */}
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Configured connectors</Text>
            {isSaving ? (
              <SkeletonBodyText lines={3} />
            ) : connectors.length === 0 ? (
              <EmptyState heading="No connectors yet" image="">
                <p>Connect external APIs to power your automation flows. Add your first connector above.</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text']}
                headings={['Name', 'Base URL', 'Auth', 'Status', 'Endpoints', '']}
                rows={connectors.map(c => [
                  c.name,
                  c.baseUrl,
                  <Badge key={`a-${c.id}`}>{c.authType}</Badge>,
                  c.lastTestedAt
                    ? <Badge key={`s-${c.id}`} tone="success">{`Tested ${new Date(c.lastTestedAt).toLocaleDateString()}`}</Badge>
                    : <Badge key={`s-${c.id}`} tone="attention">Untested</Badge>,
                  c.endpointCount,
                  <InlineStack key={`act-${c.id}`} gap="100">
                    <Link to={`/connectors/${c.id}`}><Button size="slim">Test API</Button></Link>
                    <Button size="slim" tone="critical" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}>Delete</Button>
                  </InlineStack>,
                ])}
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {deleteTarget && (
        <Modal
          open
          onClose={handleDeleteClose}
          title="Delete connector"
          primaryAction={{
            content: 'Delete',
            destructive: true,
            onAction: () => {
              const form = document.createElement('form');
              form.method = 'post';
              form.innerHTML = `<input name="intent" value="delete" /><input name="connectorId" value="${deleteTarget.id}" />`;
              document.body.appendChild(form);
              form.submit();
            },
          }}
          secondaryActions={[{ content: 'Cancel', onAction: handleDeleteClose }]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This removes all stored credentials and cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
