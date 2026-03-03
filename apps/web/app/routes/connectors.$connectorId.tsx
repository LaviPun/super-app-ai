import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, TextField, Button, Badge, Banner,
  InlineStack, InlineGrid, Select, DataTable, Modal, Divider, Box,
  Tabs, SkeletonBodyText,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';

export async function loader({ request, params }: { request: Request; params: { connectorId?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const connectorId = params.connectorId;
  if (!connectorId) throw new Response('Missing connectorId', { status: 400 });

  const prisma = getPrisma();
  const connector = await prisma.connector.findFirst({
    where: { id: connectorId, shop: { shopDomain: session.shop } },
    include: { endpoints: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!connector) throw new Response('Not found', { status: 404 });

  return json({
    connector: {
      id: connector.id,
      name: connector.name,
      baseUrl: connector.baseUrl,
      authType: connector.authType,
      lastTestedAt: connector.lastTestedAt?.toISOString() ?? null,
    },
    endpoints: connector.endpoints.map(e => ({
      id: e.id,
      name: e.name,
      path: e.path,
      method: e.method,
      defaultHeaders: e.defaultHeaders,
      defaultBody: e.defaultBody,
      lastTestedAt: e.lastTestedAt?.toISOString() ?? null,
      lastStatus: e.lastStatus,
    })),
  });
}

type TestResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyPreview: string;
} | null;

export default function ConnectorDetail() {
  const { connector, endpoints } = useLoaderData<typeof loader>();
  const testFetcher = useFetcher();
  const endpointFetcher = useFetcher();

  const [selectedTab, setSelectedTab] = useState(0);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('/');
  const [headersText, setHeadersText] = useState('{}');
  const [bodyText, setBodyText] = useState('');
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [testError, setTestError] = useState('');
  const [testLoading, setTestLoading] = useState(false);

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [endpointName, setEndpointName] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const tabs = [
    { id: 'tester', content: 'API Tester' },
    { id: 'endpoints', content: `Saved Endpoints (${endpoints.length})` },
  ];

  const handleSendRequest = useCallback(async () => {
    setTestLoading(true);
    setTestResult(null);
    setTestError('');
    try {
      let parsedHeaders: Record<string, string> = {};
      try { parsedHeaders = JSON.parse(headersText || '{}'); } catch { /* keep empty */ }

      let parsedBody: unknown = undefined;
      if (bodyText.trim() && method !== 'GET') {
        try { parsedBody = JSON.parse(bodyText); } catch { parsedBody = bodyText; }
      }

      const res = await fetch('/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectorId: connector.id,
          path,
          method,
          headers: parsedHeaders,
          body: parsedBody,
        }),
      });
      const data = await res.json();
      if (data.ok && data.result) {
        setTestResult(data.result);
      } else {
        setTestError(data.error || 'Request failed');
      }
    } catch (err) {
      setTestError(String(err));
    } finally {
      setTestLoading(false);
    }
  }, [connector.id, path, method, headersText, bodyText]);

  const handleSaveEndpoint = useCallback(() => {
    if (!endpointName.trim()) return;
    let parsedHeaders: Record<string, string> | null = null;
    try { parsedHeaders = JSON.parse(headersText || '{}'); } catch { /* skip */ }

    endpointFetcher.submit(
      {
        intent: 'create',
        name: endpointName.trim(),
        path,
        method,
        defaultHeaders: parsedHeaders,
        defaultBody: bodyText || null,
      } as any,
      { method: 'POST', action: `/api/connectors/${connector.id}/endpoints`, encType: 'application/json' },
    );
    setSaveModalOpen(false);
    setEndpointName('');
  }, [endpointName, path, method, headersText, bodyText, connector.id, endpointFetcher]);

  const handleDeleteEndpoint = useCallback((id: string) => {
    endpointFetcher.submit(
      { intent: 'delete', endpointId: id } as any,
      { method: 'POST', action: `/api/connectors/${connector.id}/endpoints`, encType: 'application/json' },
    );
    setDeleteTarget(null);
  }, [connector.id, endpointFetcher]);

  const handleLoadEndpoint = useCallback((ep: typeof endpoints[0]) => {
    setMethod(ep.method);
    setPath(ep.path);
    if (ep.defaultHeaders) {
      try { setHeadersText(JSON.stringify(JSON.parse(ep.defaultHeaders), null, 2)); } catch { setHeadersText(ep.defaultHeaders); }
    }
    if (ep.defaultBody) {
      try { setBodyText(JSON.stringify(JSON.parse(ep.defaultBody), null, 2)); } catch { setBodyText(ep.defaultBody); }
    }
    setSelectedTab(0);
  }, []);

  const methodOptions = [
    { label: 'GET', value: 'GET' },
    { label: 'POST', value: 'POST' },
    { label: 'PUT', value: 'PUT' },
    { label: 'PATCH', value: 'PATCH' },
    { label: 'DELETE', value: 'DELETE' },
  ];

  const statusTone = (s: number) => s >= 200 && s < 300 ? 'success' : s >= 400 ? 'critical' : 'attention';

  return (
    <Page
      title={connector.name}
      subtitle={connector.baseUrl}
      backAction={{ content: 'Connectors', url: '/connectors' }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge>{connector.authType}</Badge>
          {connector.lastTestedAt && <Badge tone="success">Tested</Badge>}
        </InlineStack>
      }
    >
      <BlockStack gap="500">
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab} />

        {selectedTab === 0 && (
          <BlockStack gap="400">
            {/* Request builder */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Request</Text>
                  <Badge tone="info">SSRF protected</Badge>
                </InlineStack>
                <InlineGrid columns={{ xs: '1fr', sm: '120px 1fr' }} gap="200">
                  <Select label="Method" labelHidden options={methodOptions} value={method} onChange={setMethod} />
                  <TextField
                    label="Path"
                    labelHidden
                    value={path}
                    onChange={setPath}
                    autoComplete="off"
                    placeholder="/api/v1/products"
                    prefix={connector.baseUrl}
                    connectedRight={
                      <Button variant="primary" onClick={handleSendRequest} loading={testLoading}>
                        Send
                      </Button>
                    }
                  />
                </InlineGrid>
                <TextField
                  label="Headers (JSON)"
                  value={headersText}
                  onChange={setHeadersText}
                  autoComplete="off"
                  multiline={2}
                  monospaced
                  helpText='e.g. {"Accept": "application/json"}'
                />
                {method !== 'GET' && (
                  <TextField
                    label="Body (JSON)"
                    value={bodyText}
                    onChange={setBodyText}
                    autoComplete="off"
                    multiline={4}
                    monospaced
                    placeholder='{"key": "value"}'
                  />
                )}
                <InlineStack gap="200">
                  <Button onClick={() => setSaveModalOpen(true)} disabled={!path.trim()}>
                    Save as endpoint
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Response */}
            {testError && (
              <Banner tone="critical" title="Error">
                <Text as="p">{testError}</Text>
              </Banner>
            )}

            {testResult && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Response</Text>
                    <InlineStack gap="200">
                      <Badge tone={statusTone(testResult.status)}>{String(testResult.status)}</Badge>
                      <Badge>{testResult.ok ? 'OK' : 'Error'}</Badge>
                    </InlineStack>
                  </InlineStack>
                  <Divider />
                  <Text as="h3" variant="headingSm">Headers</Text>
                  <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(testResult.headers, null, 2)}
                    </pre>
                  </Box>
                  <Text as="h3" variant="headingSm">Body</Text>
                  <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                    <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 400, overflow: 'auto' }}>
                      {(() => {
                        try { return JSON.stringify(JSON.parse(testResult.bodyPreview), null, 2); } catch { return testResult.bodyPreview; }
                      })()}
                    </pre>
                  </Box>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        )}

        {selectedTab === 1 && (
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">Saved Endpoints</Text>
                <Badge>{`${endpoints.length} endpoint${endpoints.length !== 1 ? 's' : ''}`}</Badge>
              </InlineStack>
              {endpoints.length === 0 ? (
                <Banner tone="info">
                  <Text as="p">No saved endpoints yet. Use the API Tester to build a request and click "Save as endpoint".</Text>
                </Banner>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Name', 'Method', 'Path', 'Status', '']}
                  rows={endpoints.map(ep => [
                    ep.name,
                    <Badge key={`m-${ep.id}`} tone={ep.method === 'GET' ? 'info' : ep.method === 'DELETE' ? 'critical' : 'attention'}>{ep.method}</Badge>,
                    ep.path,
                    ep.lastStatus ? <Badge key={`s-${ep.id}`} tone={statusTone(ep.lastStatus)}>{String(ep.lastStatus)}</Badge> : <Badge key={`s-${ep.id}`}>Untested</Badge>,
                    <InlineStack key={`a-${ep.id}`} gap="100">
                      <Button size="slim" onClick={() => handleLoadEndpoint(ep)}>Test</Button>
                      <Button size="slim" tone="critical" onClick={() => setDeleteTarget({ id: ep.id, name: ep.name })}>Delete</Button>
                    </InlineStack>,
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        )}
      </BlockStack>

      {saveModalOpen && (
        <Modal
          open
          onClose={() => setSaveModalOpen(false)}
          title="Save endpoint"
          primaryAction={{ content: 'Save', onAction: handleSaveEndpoint, disabled: !endpointName.trim() }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setSaveModalOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField label="Endpoint name" value={endpointName} onChange={setEndpointName} autoComplete="off" placeholder="Get all products" />
              <Text as="p" tone="subdued">
                Saves {method} {path} with current headers and body as a reusable endpoint.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          open
          onClose={() => setDeleteTarget(null)}
          title="Delete endpoint"
          primaryAction={{ content: 'Delete', destructive: true, onAction: () => handleDeleteEndpoint(deleteTarget.id) }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteTarget(null) }]}
        >
          <Modal.Section>
            <Text as="p">Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</Text>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
