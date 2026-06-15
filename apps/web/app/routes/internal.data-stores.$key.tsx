import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  StoreLink,
  Btn,
  Badge,
  Card,
  Tabs,
  EmptyState,
  DataTable,
  PageHead,
  StatTile,
  MonoChip,
  fmtNum,
  titleCase,
  DATA_STORES,
  dataStoreRecords,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { key?: string } }) {
  await requireInternalAdmin(request);
  const d = DATA_STORES.find((x) => x.key === params.key) ?? DATA_STORES[0];
  const schema = JSON.stringify(
    {
      key: d.key,
      kind: d.kind,
      fields: d.key === 'reviews' ? ['rating:int', 'author:string', 'body:text', 'productId:ref'] : d.key === 'orders' ? ['total:money', 'items:int', 'status:enum'] : ['title:string', 'payload:json', 'externalId:string'],
      indexes: ['externalId'],
    },
    null,
    2,
  );
  return json({ store: d, records: dataStoreRecords(d), schema });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminDataStoreDetail() {
  const { store: d, records, schema } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const [tab, setTab] = useState('records');

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/data-stores', label: 'Data Stores' }}
        title={d.name}
        badge={
          <span className="row-2">
            <Badge tone={d.kind === 'custom' ? 'magic' : undefined}>{titleCase(d.kind)}</Badge>
            {d.enabled ? (
              <Badge tone="success" dot>
                Enabled
              </Badge>
            ) : (
              <Badge>Disabled</Badge>
            )}
          </span>
        }
        sub={
          <span className="row-2">
            <MonoChip>{d.key}</MonoChip>
            <span className="t-muted">·</span>
            <StoreLink name={d.store} id={d.storeId} />
          </span>
        }
        actions={
          <Btn icon="download" onClick={() => ctx.toast('Exported records')}>
            Export records
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Records" value={fmtNum(d.records)} icon="database" tone="info" />
        <StatTile label="Kind" value={titleCase(d.kind)} icon="layers" tone="magic" />
        <StatTile label="Store" value={d.store.split(' ')[0]} sub={d.domain} icon="store" tone="success" />
        <StatTile label="Status" value={d.enabled ? 'Enabled' : 'Disabled'} icon={d.enabled ? 'check' : 'pause'} tone={d.enabled ? 'success' : 'warning'} />
      </div>
      <Card style={{ marginBottom: 16 }}>
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'records', label: 'Records', badge: records.length },
            { id: 'schema', label: 'Schema' },
          ]}
        />
      </Card>
      {tab === 'records' && (
        <Card>
          {records.length ? (
            <DataTable
              rowKey="id"
              columns={[
                { key: 'title', label: 'Record', render: (r: any) => <span className="cell-strong">{r.title}</span> },
                { key: 'externalId', label: 'External ID', render: (r: any) => <MonoChip>{r.externalId}</MonoChip> },
                { key: 'payload', label: 'Payload', render: (r: any) => <span className="cell-sub t-mono t-trunc" style={{ maxWidth: 320, display: 'inline-block' }}>{r.payload}</span> },
                { key: 'created', label: 'Created', render: (r: any) => <span className="cell-sub">{r.created}</span> },
              ]}
              rows={records}
            />
          ) : (
            <EmptyState icon="database" title="No records">
              This data store is empty. Records appear as merchants or flows write to it.
            </EmptyState>
          )}
        </Card>
      )}
      {tab === 'schema' && (
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 10 }}>
            Schema
          </div>
          <pre className="code-block">{schema}</pre>
        </Card>
      )}
    </div>
  );
}
