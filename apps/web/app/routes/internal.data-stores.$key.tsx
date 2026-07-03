import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { PREDEFINED_STORES } from '~/services/data/data-store.service';
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
  exportCSV,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });
const PREDEFINED_KEYS = new Set(PREDEFINED_STORES.map((p) => p.key));

function rel(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
}

export async function loader({ request, params }: { request: Request; params: { key?: string } }) {
  await requireInternalAdmin(request);
  const id = params.key;
  if (!id) throw NOT_FOUND;

  const prisma = getPrisma();
  const d = await prisma.dataStore.findUnique({
    where: { id },
    include: {
      shop: { select: { shopDomain: true } },
      _count: { select: { records: true } },
      records: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  });
  if (!d) throw NOT_FOUND;

  let schema: string | null = null;
  if (d.schemaJson) {
    try {
      schema = JSON.stringify(JSON.parse(d.schemaJson), null, 2);
    } catch {
      schema = d.schemaJson;
    }
  }

  return json({
    store: {
      id: d.id,
      key: d.key,
      name: d.label,
      kind: PREDEFINED_KEYS.has(d.key) ? 'predefined' : 'custom',
      enabled: d.isEnabled,
      store: d.shop.shopDomain.split('.')[0] ?? d.shop.shopDomain,
      storeId: d.shopId,
      domain: d.shop.shopDomain,
      records: d._count.records,
    },
    records: d.records.map((r) => ({
      id: r.id,
      title: r.title ?? '(untitled)',
      externalId: r.externalId ?? '—',
      payload: r.payload,
      created: rel(new Date(r.createdAt).toISOString()),
    })),
    schema,
  });
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
          <Btn
            icon="download"
            disabled={!records.length}
            onClick={() => {
              exportCSV(d.key + '-records.csv', records.map((r) => ({ id: r.id, title: r.title, externalId: r.externalId, payload: r.payload, created: r.created })));
              ctx.toast('Exported ' + records.length + ' records');
            }}
          >
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
          {schema ? (
            <pre className="code-block">{schema}</pre>
          ) : (
            <span className="t-muted t-sm">No schema is defined for this data store — records are stored as free-form JSON documents.</span>
          )}
        </Card>
      )}
    </div>
  );
}
