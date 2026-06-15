import { json } from '@remix-run/node';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  StoreLink,
  Icon,
  Btn,
  Badge,
  Toggle,
  Card,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  useTableState,
  fmtNum,
  titleCase,
  DATA_STORES,
  STORES,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminDataStores() {
  const ctx = useAdminCtx();
  const ts = useTableState('records');
  const [kind, setKind] = useState('All');
  const [store, setStore] = useState('All');

  let rows = DATA_STORES.filter(
    (d) => (kind === 'All' || d.kind === kind) && (store === 'All' || d.store === store) && (d.name + d.key + d.desc + d.store).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const custom = DATA_STORES.filter((d) => d.kind === 'custom').length;
  const records = DATA_STORES.reduce((a, d) => a + d.records, 0);

  return (
    <div className="page">
      <PageHead
        title="Data Stores"
        sub="Predefined and custom data stores across all merchants. Custom stores back merchant-built modules and flows."
        actions={
          <Btn
            icon="download"
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
        <StatTile label="Total stores" value={DATA_STORES.length} icon="database" tone="info" />
        <StatTile label="Custom" value={custom} icon="layers" tone="magic" />
        <StatTile label="Predefined" value={DATA_STORES.length - custom} icon="check" tone="success" />
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
            { options: ['All'].concat(STORES.map((s) => s.name)), value: store, onChange: setStore },
          ]}
        />
        <DataTable
          rowKey="id"
          onRowClick={(r: any) => ctx.go('#/admin/data-stores/' + r.key)}
          sortCol={ts.sortCol}
          sortDir={ts.sortDir}
          onSort={ts.onSort}
          columns={[
            {
              key: 'name',
              label: 'Data store',
              sortable: true,
              render: (r: any) => (
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
            { key: 'key', label: 'Key', render: (r: any) => <MonoChip>{r.key}</MonoChip> },
            { key: 'store', label: 'Store', render: (r: any) => <StoreLink name={r.store} id={r.storeId} /> },
            { key: 'kind', label: 'Kind', render: (r: any) => <Badge tone={r.kind === 'custom' ? 'magic' : undefined}>{titleCase(r.kind)}</Badge> },
            { key: 'records', label: 'Records', num: true, sortable: true, render: (r: any) => fmtNum(r.records) },
            { key: 'enabled', label: 'Enabled', render: (r: any) => <Toggle checked={r.enabled} onChange={(e: any) => ctx.toast(r.name + (e.target.checked ? ' enabled' : ' disabled'))} /> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" className="btn-plain" icon="eye" onClick={() => ctx.go('#/admin/data-stores/' + r.key)}>
                    Browse
                  </Btn>
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
    </div>
  );
}
