import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, Link, useRevalidator } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Button, Badge, InlineStack,
  InlineGrid, Banner, TextField, Modal, EmptyState, DataTable, Divider, Tabs,
} from '@shopify/polaris';
import { useState, useCallback, useEffect } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService, PREDEFINED_STORES } from '~/services/data/data-store.service';

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ stores: [], predefined: PREDEFINED_STORES });

  const svc = new DataStoreService();
  const stores = await svc.listStores(shopRow.id);

  return json({ stores, predefined: PREDEFINED_STORES });
}

const KEY_REGEX = /^[a-z0-9_]+$/;

export default function DataIndex() {
  const { stores, predefined } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();
  const [selectedTab, setSelectedTab] = useState(0);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customDesc, setCustomDesc] = useState('');

  // Poll every 30s + revalidate on window focus (for agent writes)
  useEffect(() => {
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', revalidate);
    };
  }, [revalidate]);

  // Immediately revalidate after fetcher action completes
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidate]);

  const enabledKeys = new Set(stores.filter(s => s.isEnabled).map(s => s.key));

  const handleEnable = useCallback((key: string) => {
    fetcher.submit(
      { intent: 'enable', key } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' },
    );
  }, [fetcher]);

  const handleDisable = useCallback((key: string) => {
    fetcher.submit(
      { intent: 'disable', key } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' },
    );
  }, [fetcher]);

  const handleCreateCustom = useCallback(() => {
    if (!customKey.trim() || !customLabel.trim() || !KEY_REGEX.test(customKey.trim())) return;
    fetcher.submit(
      { intent: 'create-custom', key: customKey.trim(), label: customLabel.trim(), description: customDesc.trim() || undefined } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' },
    );
    setCustomModalOpen(false);
    setCustomKey('');
    setCustomLabel('');
    setCustomDesc('');
  }, [customKey, customLabel, customDesc, fetcher]);

  const customStores = stores.filter(s => !predefined.some(p => p.key === s.key));
  const allStores = [...predefined.map(p => ({ ...p, ...stores.find(s => s.key === p.key), isPredefined: true })), ...customStores.map(s => ({ ...s, isPredefined: false }))];

  const keyError = customKey && !KEY_REGEX.test(customKey) ? 'Use only lowercase letters, numbers, and underscores (e.g. crm_contacts)' : undefined;
  const canCreate = customKey.trim() && customLabel.trim() && !keyError;

  const tabs = [
    { id: 'all', content: 'All data models' },
    { id: 'suggested', content: 'Suggested & custom' },
    { id: 'settings', content: 'Settings' },
  ];

  return (
    <Page
      title="Data models"
      subtitle="Manage app databases for your modules, flows, and custom pages"
      backAction={{ content: 'Home', url: '/' }}
    >
      <BlockStack gap="500">
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          {selectedTab === 0 && (
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">All data models</Text>
                  <Text as="p" tone="subdued">
                    Overview of all available data models — predefined and custom. Click "View" to manage records.
                  </Text>
                  {allStores.length === 0 ? (
                    <EmptyState heading="No data models yet" image="">
                      <Text as="p" tone="subdued">Enable a predefined store or create a custom one from the "Suggested & custom" tab.</Text>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'numeric', 'text']}
                      headings={['Key', 'Label', 'Status', 'Records', '']}
                      rows={allStores.map(s => {
                        const isEnabled = enabledKeys.has(s.key);
                        const store = stores.find(st => st.key === s.key);
                        return [
                          <Text key={`key-${s.key}`} as="span" variant="bodySm" tone="subdued">{s.key}</Text>,
                          s.label,
                          <Badge key={`badge-${s.key}`} tone={isEnabled ? 'success' : undefined}>{isEnabled ? 'Enabled' : 'Disabled'}</Badge>,
                          store?.recordCount ?? 0,
                          isEnabled
                            ? <Link key={`link-${s.key}`} to={`/data/${s.key}`}><Button size="slim">View</Button></Link>
                            : <Button key={`en-${s.key}`} size="slim" variant="primary" onClick={() => handleEnable(s.key)}>Enable</Button>,
                        ];
                      })}
                    />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          )}

          {selectedTab === 1 && (
            <BlockStack gap="500">
              <Banner tone="info">
                <Text as="p">
                  Data stores let you save and retrieve data from flows, modules, and custom pages.
                  Enable predefined stores or create your own.
                </Text>
              </Banner>

              <Card padding="400">
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd" fontWeight="semibold">Suggested data stores</Text>
                  <Text as="p" tone="subdued">
                    Enable predefined data stores to start collecting data. Each store can be used by flows and modules.
                  </Text>
                  <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
                    {predefined.map(p => {
                      const isEnabled = enabledKeys.has(p.key);
                      const store = stores.find(s => s.key === p.key);
                      return (
                        <Card key={p.key}>
                          <BlockStack gap="200">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h3" variant="headingSm">{p.label}</Text>
                              {isEnabled ? <Badge tone="success">Enabled</Badge> : <Badge>Disabled</Badge>}
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">{p.description}</Text>
                            {store && <Text as="p" variant="bodySm">{store.recordCount} records</Text>}
                            <InlineStack gap="200">
                              {isEnabled ? (
                                <>
                                  <Link to={`/data/${p.key}`}><Button size="slim">View data</Button></Link>
                                  <Button size="slim" onClick={() => handleDisable(p.key)}>Disable</Button>
                                </>
                              ) : (
                                <Button size="slim" variant="primary" onClick={() => handleEnable(p.key)}>Enable</Button>
                              )}
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      );
                    })}
                  </InlineGrid>
                </BlockStack>
              </Card>

              <Divider />

              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">Custom Data Stores</Text>
                    <Button onClick={() => setCustomModalOpen(true)}>Create custom store</Button>
                  </InlineStack>
                  {customStores.length === 0 ? (
                    <EmptyState heading="No custom stores" image="">
                      <Text as="p" tone="subdued">Create a custom data store for any data your app needs.</Text>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
                      headings={['Key', 'Label', 'Records', 'Status', '']}
                      rows={customStores.map(s => [
                        s.key,
                        s.label,
                        s.recordCount,
                        <Badge key={s.id} tone={s.isEnabled ? 'success' : 'attention'}>{s.isEnabled ? 'Enabled' : 'Disabled'}</Badge>,
                        <InlineStack key={`a-${s.id}`} gap="100">
                          <Link to={`/data/${s.key}`}><Button size="slim">View</Button></Link>
                          {s.isEnabled
                            ? <Button size="slim" onClick={() => handleDisable(s.key)}>Disable</Button>
                            : <Button size="slim" variant="primary" onClick={() => handleEnable(s.key)}>Enable</Button>}
                        </InlineStack>,
                      ])}
                    />
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          )}

          {selectedTab === 2 && (
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">How data gets into stores</Text>
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">1. Flows (WRITE_TO_STORE step)</Text>
                      <Text as="p" tone="subdued">
                        Create a workflow with a WRITE_TO_STORE step to push data into any store on a schedule or in
                        response to Shopify events (orders, products, customers). This is the recommended way to
                        sync Shopify data into a store automatically.
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">2. Manual records</Text>
                      <Text as="p" tone="subdued">
                        Open any enabled store from the "All data models" tab and use "Add record" to insert
                        data manually. Useful for reference data or one-off entries.
                      </Text>
                    </BlockStack>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">3. Agent API</Text>
                      <Text as="p" tone="subdued">
                        Use <Text as="span" fontWeight="semibold">POST /api/agent/data-stores</Text> with{' '}
                        <Text as="span" fontWeight="semibold">intent: "add-record"</Text> to write records
                        programmatically from your agent or external service.
                      </Text>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Scheduling and sync</Text>
                  <Text as="p" tone="subdued">
                    Data stores do not have a built-in sync schedule. Scheduled data writes are handled by
                    workflows: create a workflow with a schedule trigger (cron) and a WRITE_TO_STORE step.
                    The FlowSchedule system runs workflows on your defined schedule and writes results
                    into the target store.
                  </Text>
                  <Text as="p" tone="subdued">
                    To set up scheduled sync: go to <strong>Advanced features → Workflows</strong>, create a
                    new workflow, add a schedule trigger with your cron expression, and add a WRITE_TO_STORE
                    step targeting the desired store key.
                  </Text>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Store key format</Text>
                  <Text as="p" tone="subdued">
                    Store keys must use only lowercase letters, numbers, and underscores (e.g.{' '}
                    <Text as="span" fontWeight="semibold">crm_contacts</Text>,{' '}
                    <Text as="span" fontWeight="semibold">product_reviews</Text>). The key is used
                    in flow steps, the agent API, and module data bindings — it cannot be changed after creation.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          )}
        </Tabs>
      </BlockStack>

      {customModalOpen && (
        <Modal
          open
          onClose={() => setCustomModalOpen(false)}
          title="Create custom data store"
          primaryAction={{ content: 'Create', onAction: handleCreateCustom, disabled: !canCreate }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setCustomModalOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField
                label="Store key"
                value={customKey}
                onChange={setCustomKey}
                autoComplete="off"
                placeholder="e.g. crm_contacts"
                helpText="Lowercase letters, numbers, and underscores only. Used in flows and the agent API — cannot be changed later."
                error={keyError}
              />
              <TextField label="Display name" value={customLabel} onChange={setCustomLabel} autoComplete="off" placeholder="CRM Contacts" />
              <TextField label="Description (optional)" value={customDesc} onChange={setCustomDesc} autoComplete="off" multiline={2} />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
