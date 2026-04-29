import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, Button, Badge, InlineStack,
  DataTable, Banner, EmptyState, TextField, Modal, Box,
} from '@shopify/polaris';
import { useState, useCallback } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';

export async function loader({ request, params }: { request: Request; params: { storeKey?: string } }) {
  const { session } = await shopify.authenticate.admin(request);
  const storeKey = params.storeKey;
  if (!storeKey) throw new Response('Missing storeKey', { status: 400 });

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shopRow) throw new Response('Shop not found', { status: 404 });

  const svc = new DataStoreService();
  const store = await svc.getStoreByKey(shopRow.id, storeKey);
  if (!store) throw new Response('Store not found', { status: 404 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));

  const result = await svc.listRecordsByDataStoreId(store.id, { page, pageSize: 50 });

  return json({
    storeKey,
    store: { id: store.id, key: store.key, label: store.label, description: store.description },
    records: result.records.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}

export default function DataStoreDetail() {
  const { storeKey, store, records, total, page, pageSize } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [addOpen, setAddOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPayload, setNewPayload] = useState('{}');
  const [newExternalId, setNewExternalId] = useState('');
  const [viewRecord, setViewRecord] = useState<typeof records[0] | null>(null);

  const handleAdd = useCallback(() => {
    let payload: unknown;
    try { payload = JSON.parse(newPayload); } catch { payload = { raw: newPayload }; }
    fetcher.submit(
      { intent: 'add-record', storeKey, title: newTitle || undefined, externalId: newExternalId || undefined, payload } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' },
    );
    setAddOpen(false);
    setNewTitle('');
    setNewPayload('{}');
    setNewExternalId('');
  }, [storeKey, newTitle, newPayload, newExternalId, fetcher]);

  const handleDelete = useCallback((recordId: string) => {
    fetcher.submit(
      { intent: 'delete-record', storeKey, recordId } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' },
    );
    setViewRecord(null);
  }, [storeKey, fetcher]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <Page
      title={store.label}
      subtitle={store.description ?? `Data store: ${store.key}`}
      backAction={{ content: 'Data models', url: '/data' }}
      titleMetadata={
        <InlineStack gap="200">
          <Badge tone="info">{store.key}</Badge>
          <Badge>{`${total} record${total !== 1 ? 's' : ''}`}</Badge>
        </InlineStack>
      }
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">Records</Text>
              <Button onClick={() => setAddOpen(true)}>Add record</Button>
            </InlineStack>
            {records.length === 0 ? (
              <EmptyState heading="No records yet" image="">
                <p>Records will appear here when added by flows, modules, or manually.</p>
              </EmptyState>
            ) : (
              <>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Title', 'External ID', 'Created', 'Preview', '']}
                  rows={records.map(r => {
                    let preview = '';
                    try { const p = JSON.parse(r.payload); preview = JSON.stringify(p).slice(0, 80); } catch { preview = r.payload.slice(0, 80); }
                    return [
                      r.title ?? '-',
                      r.externalId ?? '-',
                      new Date(r.createdAt).toLocaleString(),
                      <Text key={`p-${r.id}`} as="span" variant="bodySm" tone="subdued">{preview}{preview.length >= 80 ? '...' : ''}</Text>,
                      <InlineStack key={`a-${r.id}`} gap="100">
                        <Button size="slim" onClick={() => setViewRecord(r)}>View</Button>
                        <Button size="slim" tone="critical" onClick={() => handleDelete(r.id)}>Delete</Button>
                      </InlineStack>,
                    ];
                  })}
                />
                {totalPages > 1 && (
                  <InlineStack align="center" gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Page {page} of {totalPages} ({total} records)
                    </Text>
                  </InlineStack>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      {addOpen && (
        <Modal
          open
          onClose={() => setAddOpen(false)}
          title="Add record"
          primaryAction={{ content: 'Add', onAction: handleAdd }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setAddOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField label="Title (optional)" value={newTitle} onChange={setNewTitle} autoComplete="off" />
              <TextField label="External ID (optional)" value={newExternalId} onChange={setNewExternalId} autoComplete="off" placeholder="e.g. gid://shopify/Product/123" />
              <TextField label="Payload (JSON)" value={newPayload} onChange={setNewPayload} autoComplete="off" multiline={6} monospaced />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {viewRecord && (
        <Modal
          open
          onClose={() => setViewRecord(null)}
          title={viewRecord.title ?? 'Record detail'}
          secondaryActions={[{ content: 'Close', onAction: () => setViewRecord(null) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              {viewRecord.externalId && <Text as="p" variant="bodySm">External ID: {viewRecord.externalId}</Text>}
              <Text as="p" variant="bodySm" tone="subdued">Created: {new Date(viewRecord.createdAt).toLocaleString()}</Text>
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 400, overflow: 'auto' }}>
                  {(() => {
                    try { return JSON.stringify(JSON.parse(viewRecord.payload), null, 2); } catch { return viewRecord.payload; }
                  })()}
                </pre>
              </Box>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
