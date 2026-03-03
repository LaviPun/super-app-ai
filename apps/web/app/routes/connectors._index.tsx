import { json, redirect } from '@remix-run/node';
import { useLoaderData, Form, useNavigation, useActionData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, DataTable, Button, TextField,
  InlineStack, Badge, Banner, EmptyState, Modal, SkeletonBodyText, Toast, Frame,
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
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const activity = new ActivityLogService();

  if (intent === 'create') {
    const name = String(form.get('name') ?? '').trim();
    const baseUrl = String(form.get('baseUrl') ?? '').trim();
    const apiKey = String(form.get('apiKey') ?? '').trim();
    const headerName = String(form.get('headerName') ?? 'X-Api-Key').trim();

    if (!name || !baseUrl) return json({ error: 'Name and Base URL are required', toast: { message: 'Name and Base URL are required', error: true } }, { status: 400 });

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
  const { connectors } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isSaving = nav.state !== 'idle';
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [toastActive, setToastActive] = useState(false);

  const handleDeleteClose = useCallback(() => setDeleteTarget(null), []);

  return (
    <Page
      title="Integrations & connectors"
      backAction={{ content: 'Home', url: '/' }}
    >
      <BlockStack gap="500">
        {actionData?.error ? (
          <Banner tone="critical" title="Error">
            <Text as="p">{actionData.error}</Text>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Add connector</Text>
            <Banner tone="info" title="SSRF protection enabled">
              Only HTTPS connections are allowed. The baseUrl domain is automatically added to the allowlist.
            </Banner>
            <Form method="post">
              <input type="hidden" name="intent" value="create" />
              <BlockStack gap="200">
                <TextField label="Connector name" name="name" autoComplete="off" placeholder="My ERP API" helpText="A friendly name to identify this connector." />
                <TextField label="Base URL (https only)" name="baseUrl" autoComplete="off" placeholder="https://api.example.com/v1" helpText="The root URL for API calls. Must use HTTPS." />
                <TextField label="API key header name" name="headerName" autoComplete="off" placeholder="X-Api-Key" helpText="The HTTP header used to pass the API key." />
                <TextField label="API key" name="apiKey" type="password" autoComplete="off" helpText="Your API key is encrypted at rest." />
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
            {isSaving ? (
              <SkeletonBodyText lines={3} />
            ) : connectors.length === 0 ? (
              <EmptyState heading="No connectors yet" image="" action={{ content: 'Add your first connector', url: '#' }}>
                <p>Connect external APIs to use in your automation flows.</p>
              </EmptyState>
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
                  <Button key={c.id} size="slim" tone="critical" onClick={() => setDeleteTarget({ id: c.id, name: c.name })}>Delete</Button>,
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
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This will remove all stored credentials and cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
