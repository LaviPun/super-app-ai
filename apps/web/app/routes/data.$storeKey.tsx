import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useSearchParams } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { DataStoreService } from '~/services/data/data-store.service';
import { parseDataModel, dataModelToForm } from '@superapp/core';
import { SchemaForm, type JsonSchemaNode, type SectionUiHints } from '~/components/SchemaForm';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Btn, Badge, Card, PageHead, FilterBar, DataTable, Modal, Field, Input, Textarea, MonoChip,
  useTableState,
} from '~/components/superapp';

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
    <MerchantShell>
      <DataStoreDetailBody />
    </MerchantShell>
  );
}

function DataStoreDetailBody() {
  const { storeKey, store, records, total, page, pageSize, recordForm } = useLoaderData<typeof loader>();
  const ctx = useMerchantCtx();
  const fetcher = useFetcher<{ ok?: boolean; error?: string; recordId?: string }>();
  const ts = useTableState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [viewRecord, setViewRecord] = useState<typeof records[0] | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newPayload, setNewPayload] = useState('{}');
  const [newExternalId, setNewExternalId] = useState('');
  const [recordValue, setRecordValue] = useState<Record<string, unknown>>({ record: {} });
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

  const handleAdd = () => {
    let payload: unknown;
    if (recordForm) payload = (recordValue.record as Record<string, unknown>) ?? {};
    else { try { payload = JSON.parse(newPayload); } catch { payload = { raw: newPayload }; } }
    setPendingMsg('Record added');
    fetcher.submit({ intent: 'add-record', storeKey, title: newTitle || undefined, externalId: newExternalId || undefined, payload } as any,
      { method: 'POST', action: '/api/data-stores', encType: 'application/json' });
    setAddOpen(false); setNewTitle(''); setNewPayload('{}'); setNewExternalId(''); setRecordValue({ record: {} });
  };
  const handleDelete = (recordId: string) => {
    setPendingMsg('Record deleted');
    fetcher.submit({ intent: 'delete-record', storeKey, recordId } as any, { method: 'POST', action: '/api/data-stores', encType: 'application/json' });
    setViewRecord(null);
  };

  const rows = records.filter((r: any) => ((r.title ?? '') + (r.externalId ?? '') + r.payload).toLowerCase().includes(ts.search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goPage = (p: number) => {
    const q = new URLSearchParams(searchParams);
    if (p <= 1) q.delete('page'); else q.set('page', String(p));
    setSearchParams(q);
  };

  return (
    <div className="page">
      <PageHead
        back={{ href: '/data', label: 'Data' }}
        title={store.label}
        badge={<Badge>{store.key}</Badge>}
        sub={store.description ?? `Data store · ${store.key}`}
        actions={(
          <>
            <a href={`/data/${storeKey}/export`} target="_blank" rel="noreferrer" className="btn btn-sm"><span>Export</span></a>
            <a href={`/data/${storeKey}/print`} target="_blank" rel="noreferrer" className="btn btn-sm"><span>Print / PDF</span></a>
            <Btn variant="primary" icon="plus" onClick={() => setAddOpen(true)}>Add record</Btn>
          </>
        )}
      />
      <Card>
        <FilterBar search={ts.search} onSearch={ts.setSearch} placeholder="Search records…" results={ts.search ? rows.length : total} />
        {rows.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--p-text-secondary)', fontSize: 14 }}>
            {ts.search ? 'No records on this page match your search.' : 'No records yet — added by flows, modules, or manually.'}
          </div>
        ) : (
          <DataTable rowKey="id" columns={[
            { key: 'title', label: 'Title', render: (r: any) => <span className="cell-strong">{r.title ?? '—'}</span> },
            { key: 'externalId', label: 'External ID', render: (r: any) => r.externalId ? <MonoChip>{r.externalId}</MonoChip> : <span className="t-muted">—</span> },
            { key: 'createdAt', label: 'Created', render: (r: any) => <span className="cell-sub">{new Date(r.createdAt).toLocaleDateString('en-US')}</span> },
            { key: 'payload', label: 'Payload preview', render: (r: any) => <span className="t-mono t-trunc" style={{ maxWidth: 280, display: 'inline-block', color: 'var(--p-text-secondary)' }}>{r.payload}</span> },
            { key: 'act', label: '', render: (r: any) => (
              <div className="dt-actions">
                <Btn size="sm" icon="eye" onClick={() => setViewRecord(r)} />
                <Btn size="sm" className="btn-plain-critical" icon="trash" onClick={() => handleDelete(r.id)} />
              </div>
            ) },
          ]} rows={rows} />
        )}
        {totalPages > 1 && (
          <div className="row spread" style={{ padding: '10px 16px', borderTop: '1px solid var(--p-border)' }}>
            <span className="t-sm t-muted t-num">Page {page} of {totalPages} · {total} records</span>
            <div className="row-2">
              <Btn size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => goPage(page - 1)}>Previous</Btn>
              <Btn size="sm" iconRight="chevronRight" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Next</Btn>
            </div>
          </div>
        )}
      </Card>

      {addOpen && (
        <Modal title="Add record" onClose={() => setAddOpen(false)}
          footer={(
            <>
              <span className="grow" />
              <Btn onClick={() => setAddOpen(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleAdd}>Add record</Btn>
            </>
          )}>
          <div className="stack-4">
            <Field label="Title" optional><Input value={newTitle} onChange={(e: any) => setNewTitle(e.target.value)} autoFocus /></Field>
            <Field label="External ID" optional><Input mono value={newExternalId} onChange={(e: any) => setNewExternalId(e.target.value)} /></Field>
            {recordForm ? (
              <SchemaForm
                schema={recordForm.jsonSchema as JsonSchemaNode}
                uiSchema={recordForm.uiSchema as Record<string, SectionUiHints>}
                value={recordValue}
                onChange={setRecordValue}
                tier="advanced"
              />
            ) : (
              <Field label="Payload (JSON)"><Textarea mono rows={5} value={newPayload} onChange={(e: any) => setNewPayload(e.target.value)} /></Field>
            )}
          </div>
        </Modal>
      )}

      {viewRecord && (
        <Modal title={viewRecord.title ?? 'Record detail'} onClose={() => setViewRecord(null)}
          footer={<><span className="grow" /><Btn onClick={() => setViewRecord(null)}>Close</Btn></>}>
          <div className="stack-3">
            {viewRecord.externalId && <div className="t-sm">External ID: <MonoChip>{viewRecord.externalId}</MonoChip></div>}
            <div className="t-xs t-muted">Created: {new Date(viewRecord.createdAt).toLocaleString()}</div>
            <pre className="code-block" style={{ maxHeight: 400, overflow: 'auto' }}>
              {(() => { try { return JSON.stringify(JSON.parse(viewRecord.payload), null, 2); } catch { return viewRecord.payload; } })()}
            </pre>
          </div>
        </Modal>
      )}
    </div>
  );
}
