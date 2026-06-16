import { json } from '@remix-run/node';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  useAdminOps,
  StoreLink,
  Btn,
  Badge,
  StatusBadge,
  Card,
  ConfirmDialog,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  titleCase,
  CONNECTORS,
  STORES,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminConnectors() {
  const ctx = useAdminCtx();
  const ops = useAdminOps();
  const ts = useTableState();
  const [status, setStatus] = useState('All');
  const [store, setStore] = useState('All');
  const [confirm, setConfirm] = useState<any>(null);

  let rows = CONNECTORS.filter(
    (c) => (status === 'All' || c.status === status) && (store === 'All' || c.store === store) && (c.name + c.baseUrl + (c.store || '')).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const connected = CONNECTORS.filter((c) => c.status === 'CONNECTED').length;
  const errored = CONNECTORS.filter((c) => c.status === 'ERROR').length;
  const eps = CONNECTORS.reduce((a, c) => a + c.endpoints, 0);

  return (
    <div className="page">
      <PageHead
        title="Connectors"
        sub="Outbound integrations across all stores. Each connector exposes allow-listed endpoints flows can call."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportCSV('connectors.csv', rows);
              ctx.toast('Exported ' + rows.length + ' connectors');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total" value={CONNECTORS.length} icon="connect" tone="info" />
        <StatTile label="Connected" value={connected} icon="check" tone="success" />
        <StatTile label="Errors" value={errored} icon="alert" tone={errored ? 'critical' : 'success'} />
        <StatTile label="Endpoints" value={eps} icon="code" tone="info" />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search connectors, URLs…"
          results={rows.length}
          filters={[
            { options: ['All', 'CONNECTED', 'ERROR'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
            { options: ['All'].concat(STORES.map((s) => s.name)), value: store, onChange: setStore },
          ]}
        />
        <DataTable
          rowKey="id"
          onRowClick={(r: any) => ctx.go('#/admin/connectors/' + r.id)}
          sortCol={ts.sortCol}
          sortDir={ts.sortDir}
          onSort={ts.onSort}
          columns={[
            {
              key: 'name',
              label: 'Connector',
              sortable: true,
              render: (r: any) => (
                <div className="stack" style={{ gap: 0 }}>
                  <span className="cell-strong">{r.name}</span>
                  <span className="cell-sub t-mono">{r.baseUrl}</span>
                </div>
              ),
            },
            { key: 'store', label: 'Store', render: (r: any) => (r.storeId ? <StoreLink name={r.store} id={r.storeId} /> : <span className="t-muted">—</span>) },
            { key: 'auth', label: 'Auth', render: (r: any) => <Badge>{r.auth.replace('_', ' ')}</Badge> },
            { key: 'endpoints', label: 'Endpoints', num: true, sortable: true, render: (r: any) => r.endpoints },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            {
              key: 'lastStatus',
              label: 'Last test',
              render: (r: any) => (
                <span className="row-2">
                  <span className={'http-code http-' + String(r.lastStatus)[0]}>{r.lastStatus}</span>
                  <span className="cell-sub">{r.lastTested}</span>
                </span>
              ),
            },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Btn size="sm" className="btn-plain" icon="refresh" onClick={() => ops.run('connector_test', { id: r.id, resource: r.name, message: r.name + ' — 200 OK' })}>
                    Test
                  </Btn>
                  <Btn
                    size="sm"
                    className="btn-plain-critical"
                    icon="trash"
                    onClick={() =>
                      setConfirm({
                        title: 'Delete connector',
                        message: 'Delete ' + r.name + '? Flows that call its endpoints will fail until reconfigured.',
                        confirmLabel: 'Delete',
                        tone: 'critical',
                        icon: 'trash',
                        onConfirm: () => ops.run('connector_delete', { id: r.id, resource: r.name, message: r.name + ' deleted' }),
                      })
                    }
                  />
                </div>
              ),
            },
          ]}
          rows={rows}
        />
      </Card>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
