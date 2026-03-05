import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, Link, useRevalidator } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Button, Badge, InlineStack,
  InlineGrid, Banner, TextField, Modal, EmptyState, DataTable, Divider,
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

export default function DataIndex() {
  const { stores, predefined } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const { revalidate } = useRevalidator();
  const [customModalOpen, setCustomModalOpen] = useState(false);

  useEffect(() => {
    // Reflect agent writes: poll every 30s + revalidate on window focus
    const interval = setInterval(revalidate, 30_000);
    window.addEventListener('focus', revalidate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', revalidate);
    };
  }, [revalidate]);
  const [customKey, setCustomKey] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [customDesc, setCustomDesc] = useState('');

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
    if (!customKey.trim() || !customLabel.trim()) return;
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

  return (
    <Page
      title="Data Stores"
      subtitle="Manage app databases for your modules, flows, and custom pages"
      backAction={{ content: 'Dashboard', url: '/' }}
    >
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

        {/* ─── Custom stores ─── */}
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

      {customModalOpen && (
        <Modal
          open
          onClose={() => setCustomModalOpen(false)}
          title="Create custom data store"
          primaryAction={{ content: 'Create', onAction: handleCreateCustom, disabled: !customKey.trim() || !customLabel.trim() }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setCustomModalOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField label="Store key" value={customKey} onChange={setCustomKey} autoComplete="off" placeholder="e.g. crm_contacts" helpText="Lowercase, underscores only. Used in flow steps." />
              <TextField label="Display name" value={customLabel} onChange={setCustomLabel} autoComplete="off" placeholder="CRM Contacts" />
              <TextField label="Description (optional)" value={customDesc} onChange={setCustomDesc} autoComplete="off" multiline={2} />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
