import { json } from '@remix-run/node';
import { useLoaderData, useFetcher } from '@remix-run/react';
import { useEffect, useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { DataStoreService, PREDEFINED_STORES } from '~/services/data/data-store.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  StoreLink,
  Icon,
  Btn,
  Badge,
  Toggle,
  Card,
  EmptyState,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  useTableState,
  fmtNum,
  titleCase,
  exportCSV,
} from '~/components/admin/page-kit';

const PREDEFINED_KEYS = new Set(PREDEFINED_STORES.map((p) => p.key));

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const stores = await prisma.dataStore.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: {
      shop: { select: { shopDomain: true } },
      _count: { select: { records: true } },
    },
  });

  return json({
    stores: stores.map((d) => ({
      id: d.id,
      key: d.key,
      name: d.label,
      desc: d.description ?? '',
      store: d.shop.shopDomain.split('.')[0] ?? d.shop.shopDomain,
      storeId: d.shopId,
      kind: PREDEFINED_KEYS.has(d.key) ? 'predefined' : 'custom',
      records: d._count.records,
      enabled: d.isEnabled,
    })),
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'toggle_store') {
    const shopId = String(form.get('shopId') ?? '');
    const key = String(form.get('key') ?? '');
    const enabled = String(form.get('enabled') ?? '') === 'true';
    if (!shopId || !key) return json({ ok: false, message: 'Missing store reference' }, { status: 400 });

    const svc = new DataStoreService();
    if (enabled) await svc.enableStore(shopId, key);
    else await svc.disableStore(shopId, key);

    await new ActivityLogService()
      .log({
        actor: 'INTERNAL_ADMIN',
        action: enabled ? 'DATA_STORE_ENABLED' : 'DATA_STORE_DISABLED',
        shopId,
        resource: `dataStore:${key}`,
        details: { key, enabled },
      })
      .catch(() => {});

    return json({ ok: true, message: `${key} ${enabled ? 'enabled' : 'disabled'}` });
  }

  return json({ ok: false, message: 'Unknown action' }, { status: 400 });
}

export default function AdminDataStores() {
  const { stores } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const toggleFetcher = useFetcher<typeof action>();
  const ts = useTableState('records');
  const [kind, setKind] = useState('All');
  const [store, setStore] = useState('All');

  useEffect(() => {
    if (toggleFetcher.state === 'idle' && toggleFetcher.data) {
      ctx.toast(toggleFetcher.data.message, !toggleFetcher.data.ok);
    }
  }, [toggleFetcher.state, toggleFetcher.data, ctx]);

  const toggleStore = (r: any, enabled: boolean) => {
    toggleFetcher.submit(
      { intent: 'toggle_store', shopId: r.storeId, key: r.key, enabled: String(enabled) },
      { method: 'post' },
    );
  };

  const storeNames = Array.from(new Set(stores.map((d) => d.store)));

  let rows = stores.filter(
    (d) => (kind === 'All' || d.kind === kind) && (store === 'All' || d.store === store) && (d.name + d.key + d.desc + d.store).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = (a as any)[col], y = (b as any)[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const custom = stores.filter((d) => d.kind === 'custom').length;
  const records = stores.reduce((a, d) => a + d.records, 0);

  return (
    <div className="page">
      <PageHead
        title="Data Stores"
        sub="Predefined and custom data stores across all merchants. Custom stores back merchant-built modules and flows."
        actions={
          <Btn
            icon="download"
            disabled={!rows.length}
            onClick={() => {
              exportCSV('data-stores.csv', rows);
              ctx.toast('Exported ' + rows.length + ' data stores');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total stores" value={stores.length} icon="database" tone="info" />
        <StatTile label="Custom" value={custom} icon="layers" tone="magic" />
        <StatTile label="Predefined" value={stores.length - custom} icon="check" tone="success" />
        <StatTile label="Total records" value={fmtNum(records)} icon="chart" tone="info" />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search data stores…"
          results={rows.length}
          filters={[
            { options: [{ value: 'All', label: 'All kinds' }, { value: 'predefined', label: 'Predefined' }, { value: 'custom', label: 'Custom' }], value: kind, onChange: setKind },
            { options: ['All'].concat(storeNames), value: store, onChange: setStore },
          ]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r) => ctx.go('#/admin/data-stores/' + r.id)}
            sortCol={ts.sortCol}
            sortDir={ts.sortDir}
            onSort={ts.onSort}
            columns={[
              {
                key: 'name',
                label: 'Data store',
                sortable: true,
                render: (r) => (
                  <div className="row-3">
                    <span className="tile-ico" style={{ width: 30, height: 30, background: 'var(--p-surface-secondary)' }}>
                      <Icon name="database" size={15} />
                    </span>
                    <div className="stack" style={{ gap: 0 }}>
                      <span className="cell-strong">{r.name}</span>
                      <span className="cell-sub">{r.desc}</span>
                    </div>
                  </div>
                ),
              },
              { key: 'key', label: 'Key', render: (r) => <MonoChip>{r.key}</MonoChip> },
              { key: 'store', label: 'Store', render: (r) => <StoreLink name={r.store} id={r.storeId} /> },
              { key: 'kind', label: 'Kind', render: (r) => <Badge tone={r.kind === 'custom' ? 'magic' : undefined}>{titleCase(r.kind)}</Badge> },
              { key: 'records', label: 'Records', num: true, sortable: true, render: (r) => fmtNum(r.records) },
              { key: 'enabled', label: 'Enabled', render: (r) => <Toggle checked={r.enabled} onChange={(e) => toggleStore(r, e.target.checked)} /> },
              {
                key: 'act',
                label: '',
                render: (r) => (
                  <div className="dt-actions">
                    <Btn size="sm" className="btn-plain" icon="eye" onClick={() => ctx.go('#/admin/data-stores/' + r.id)}>
                      Browse
                    </Btn>
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="database" title={stores.length ? 'No data stores match' : 'No data stores yet'}>
            {stores.length ? 'Try adjusting your search or filters.' : 'Data stores appear here once a merchant enables one or a module provisions one.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
