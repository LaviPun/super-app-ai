import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useSearchParams } from '@remix-run/react';
import { useEffect, useRef, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { parseDataModel, dataModelToForm } from '@superapp/core';
import { SchemaForm, type JsonSchemaNode, type SectionUiHints } from '~/components/SchemaForm';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { ConfirmModal, EmptyState, MonoChip, useCustomEvent } from '~/components/merchant/polaris';

/* eslint-disable @typescript-eslint/no-explicit-any */

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

  // Typed record form when the store declares a schema (Module System v2 backend data).
  const model = parseDataModel((store as { schemaJson?: string | null }).schemaJson ?? null);
  const recordForm = model ? dataModelToForm(model) : null;

  return json({
    storeKey,
    recordForm,
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
  return (
    <MerchantShell polaris>
      <DataStoreDetailBody />
    </MerchantShell>
  );
}

function DataStoreDetailBody() {
  const { storeKey, store, records, total, page, pageSize, recordForm } = useLoaderData<typeof loader>();
  const ctx = useMerchantCtx();
  const fetcher = useFetcher<{ ok?: boolean; error?: string; recordId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<typeof records[0] | null>(null);
  const [del, setDel] = useState<typeof records[0] | null>(null);
  const tableRef = useRef<HTMLElement | null>(null);
  // Toast set at submit time, shown only once the server confirms the mutation.
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      if (fetcher.data.error) ctx.toast(fetcher.data.error, { error: true });
      else if (fetcher.data.ok && pendingMsg) ctx.toast(pendingMsg);
      if (pendingMsg) setPendingMsg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const handleAdd = (fields: { title: string; externalId: string; payload: unknown }) => {
    setPendingMsg('Record added');
    fetcher.submit(
      { intent: 'add-record', storeKey, title: fields.title || undefined, externalId: fields.externalId || undefined, payload: fields.payload } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' },
    );
    setAddOpen(false);
  };
  const confirmDelete = () => {
    if (!del) return;
    setPendingMsg('Record deleted');
    fetcher.submit({ intent: 'delete-record', storeKey, recordId: del.id } as any, { method: 'POST', action: '/api/data-stores', encType: 'application/json' });
    setDel(null);
    setViewRecord(null);
  };

  const rows = records.filter((r: any) => ((r.title ?? '') + (r.externalId ?? '') + r.payload).toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goPage = (p: number) => {
    const q = new URLSearchParams(searchParams);
    if (p <= 1) q.delete('page'); else q.set('page', String(p));
    setSearchParams(q);
  };
  useCustomEvent(tableRef, 'nextpage', () => { if (page < totalPages) goPage(page + 1); });
  useCustomEvent(tableRef, 'previouspage', () => { if (page > 1) goPage(page - 1); });

  return (
    <s-page heading={store.label} inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/data">Data</s-link>
      <s-button slot="secondary-actions" icon="export" href={`/data/${storeKey}/export`} target="_blank">Export</s-button>
      <s-button slot="secondary-actions" icon="print" href={`/data/${storeKey}/print`} target="_blank">Print / PDF</s-button>
      <s-button slot="primary-action" variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
        Add record
      </s-button>
      <s-stack direction="inline" gap="small-100" alignItems="center">
        <MonoChip>{store.key}</MonoChip>
        <s-text color="subdued">{store.description ?? 'Data store records — added by flows, modules, or manually.'}</s-text>
      </s-stack>

      {total === 0 ? (
        <s-section>
          <EmptyState icon="database" heading="No records yet"
            action={<s-button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>Add your first record</s-button>}>
            Records are added by flows, modules, or manually.
          </EmptyState>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table
            ref={tableRef as never}
            paginate={totalPages > 1 || undefined}
            hasNextPage={page < totalPages || undefined}
            hasPreviousPage={page > 1 || undefined}
          >
            <s-grid slot="filters" gridTemplateColumns="1fr auto" gap="small-100" alignItems="center">
              <s-search-field
                label="Search records"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search records…"
                onInput={(e) => setSearch(e.currentTarget.value ?? '')}
              />
              <s-text color="subdued">
                {search ? `${rows.length} match${rows.length === 1 ? '' : 'es'}` : `${total} records · page ${page} of ${totalPages}`}
              </s-text>
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">Title</s-table-header>
              <s-table-header>External ID</s-table-header>
              <s-table-header listSlot="kicker">Created</s-table-header>
              <s-table-header>Payload preview</s-table-header>
              <s-table-header> </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((r: any) => (
                <s-table-row key={r.id} clickDelegate={`rec-link-${r.id}`}>
                  <s-table-cell>
                    <s-link id={`rec-link-${r.id}`} onClick={() => setViewRecord(r)}>
                      <s-text type="strong">{r.title ?? '—'}</s-text>
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>{r.externalId ? <MonoChip>{r.externalId}</MonoChip> : <s-text color="subdued">—</s-text>}</s-table-cell>
                  <s-table-cell><s-text color="subdued">{new Date(r.createdAt).toLocaleDateString('en-US')}</s-text></s-table-cell>
                  <s-table-cell>
                    <s-box maxInlineSize="280px" overflow="hidden">
                      <s-text color="subdued">{r.payload.length > 80 ? r.payload.slice(0, 80) + '…' : r.payload}</s-text>
                    </s-box>
                  </s-table-cell>
                  <s-table-cell>
                    <s-button-group>
                      <s-button variant="tertiary" icon="view" accessibilityLabel={`View ${r.title ?? 'record'}`} onClick={() => setViewRecord(r)} />
                      <s-button variant="tertiary" icon="delete" tone="critical" accessibilityLabel={`Delete ${r.title ?? 'record'}`} onClick={() => setDel(r)} />
                    </s-button-group>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {rows.length === 0 && (
            <EmptyState heading="Nothing here">No records on this page match your search.</EmptyState>
          )}
        </s-section>
      )}

      {addOpen && (
        <AddRecordModal
          recordForm={recordForm}
          onAdd={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      )}

      {viewRecord && (
        <ViewRecordModal record={viewRecord} onClose={() => setViewRecord(null)} />
      )}

      {del && (
        <ConfirmModal
          open
          heading="Delete record?"
          tone="critical"
          confirmLabel="Delete"
          loading={fetcher.state !== 'idle'}
          onConfirm={confirmDelete}
          onClose={() => setDel(null)}
        >
          <s-paragraph>
            {`This permanently removes “${del.title ?? del.id}” from ${store.label}.`}
          </s-paragraph>
        </ConfirmModal>
      )}
    </s-page>
  );
}

/**
 * Add-record form modal. Fields are controlled state; when the store declares
 * a schema the typed SchemaForm renders, otherwise a raw JSON payload area.
 * The primary action lives in the modal's `primary-action` slot.
 */
function AddRecordModal({ recordForm, onAdd, onClose }: {
  recordForm: { jsonSchema: unknown; uiSchema: unknown } | null;
  onAdd: (fields: { title: string; externalId: string; payload: unknown }) => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLElement | null>(null);
  const [title, setTitle] = useState('');
  const [externalId, setExternalId] = useState('');
  const [payloadJson, setPayloadJson] = useState('{}');
  const [recordValue, setRecordValue] = useState<Record<string, unknown>>({ record: {} });

  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  const add = () => {
    let payload: unknown;
    if (recordForm) payload = (recordValue.record as Record<string, unknown>) ?? {};
    else { try { payload = JSON.parse(payloadJson); } catch { payload = { raw: payloadJson }; } }
    onAdd({ title, externalId, payload });
  };

  return (
    <s-modal ref={modalRef as never} heading="Add record">
      <s-stack gap="base">
        <s-text-field
          label="Title (optional)"
          value={title}
          onInput={(e) => setTitle(e.currentTarget.value ?? '')}
        />
        <s-text-field
          label="External ID (optional)"
          value={externalId}
          onInput={(e) => setExternalId(e.currentTarget.value ?? '')}
        />
        {recordForm ? (
          <SchemaForm
            schema={recordForm.jsonSchema as JsonSchemaNode}
            uiSchema={recordForm.uiSchema as Record<string, SectionUiHints>}
            value={recordValue}
            onChange={setRecordValue}
            tier="advanced"
          />
        ) : (
          <s-text-area
            label="Payload (JSON)"
            rows={5}
            value={payloadJson}
            onInput={(e) => setPayloadJson(e.currentTarget.value ?? '')}
          />
        )}
      </s-stack>
      <s-button slot="primary-action" variant="primary" onClick={add}>Add record</s-button>
      <s-button slot="secondary-actions" onClick={onClose}>Cancel</s-button>
    </s-modal>
  );
}

/** Read-only record detail modal with pretty-printed payload. */
function ViewRecordModal({ record, onClose }: { record: { title?: string | null; externalId?: string | null; createdAt: string; payload: string }; onClose: () => void }) {
  const modalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    (modalRef.current as (HTMLElement & { show?: () => void }) | null)?.show?.();
  }, []);
  useCustomEvent(modalRef, 'afterhide', onClose);

  const pretty = (() => { try { return JSON.stringify(JSON.parse(record.payload), null, 2); } catch { return record.payload; } })();

  return (
    <s-modal ref={modalRef as never} heading={record.title ?? 'Record detail'}>
      <s-stack gap="small-100">
        {record.externalId && (
          <s-stack direction="inline" gap="small-100" alignItems="center">
            <s-text color="subdued">External ID:</s-text>
            <MonoChip>{record.externalId}</MonoChip>
          </s-stack>
        )}
        <s-text color="subdued">Created: {new Date(record.createdAt).toLocaleString()}</s-text>
        <s-scroll-box border="base" borderRadius="base" padding="small-100" background="subdued" maxBlockSize="400px">
          <pre style={{ margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {pretty}
          </pre>
        </s-scroll-box>
      </s-stack>
      <s-button slot="primary-action" onClick={onClose}>Close</s-button>
    </s-modal>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
