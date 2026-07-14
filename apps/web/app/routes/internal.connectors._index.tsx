import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  useAdminOps,
  StoreLink,
  Btn,
  Badge,
  StatusBadge,
  Card,
  ConfirmDialog,
  EmptyState,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  titleCase,
  exportCSV,
  formatRelativeTime,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const connectors = await prisma.connector.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      shop: { select: { shopDomain: true } },
      endpoints: { select: { lastStatus: true, lastTestedAt: true } },
    },
  });

  const rows = connectors.map((c) => {
    const epStatuses = c.endpoints.map((e) => e.lastStatus).filter((s): s is number => s != null);
    const anyError = epStatuses.some((s) => s >= 400);
    const tested = Boolean(c.lastTestedAt) || c.endpoints.some((e) => e.lastTestedAt);
    const status = anyError ? 'ERROR' : tested ? 'CONNECTED' : 'NEW';
    const lastStatus = epStatuses.length ? epStatuses.sort((a, b) => b - a)[0] : null;
    return {
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      store: c.shop.shopDomain.split('.')[0] ?? c.shop.shopDomain,
      storeId: c.shopId,
      auth: c.authType,
      endpoints: c.endpoints.length,
      status,
      lastStatus: lastStatus ?? '—',
      lastTested: c.lastTestedAt ? formatRelativeTime(new Date(c.lastTestedAt).toISOString()) : 'Never',
    };
  });

  return json({ connectors: rows });
}

export default function AdminConnectors() {
  const { connectors } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ops = useAdminOps();
  const ts = useTableState();
  const [status, setStatus] = useState('All');
  const [store, setStore] = useState('All');
  const [confirm, setConfirm] = useState<any>(null);

  const storeNames = Array.from(new Set(connectors.map((c) => c.store)));

  let rows = connectors.filter(
    (c) => (status === 'All' || c.status === status) && (store === 'All' || c.store === store) && (c.name + c.baseUrl + (c.store || '')).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = (a as any)[col], y = (b as any)[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const connected = connectors.filter((c) => c.status === 'CONNECTED').length;
  const errored = connectors.filter((c) => c.status === 'ERROR').length;
  const eps = connectors.reduce((a, c) => a + c.endpoints, 0);

  return (
    <div className="page">
      <PageHead
        title="Connectors"
        sub="Outbound integrations across all stores. Each connector exposes allow-listed endpoints flows can call."
        actions={
          <Btn
            icon="download"
            disabled={!rows.length}
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
        <StatTile label="Total" value={connectors.length} icon="connect" tone="info" />
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
            { options: ['All'].concat(storeNames), value: store, onChange: setStore },
          ]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r) => ctx.go('#/admin/connectors/' + r.id)}
            sortCol={ts.sortCol}
            sortDir={ts.sortDir}
            onSort={ts.onSort}
            columns={[
              {
                key: 'name',
                label: 'Connector',
                sortable: true,
                render: (r) => (
                  <div className="stack" style={{ gap: 0 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub t-mono">{r.baseUrl}</span>
                  </div>
                ),
              },
              { key: 'store', label: 'Store', render: (r) => (r.storeId ? <StoreLink name={r.store} id={r.storeId} /> : <span className="t-muted">—</span>) },
              { key: 'auth', label: 'Auth', render: (r) => <Badge>{r.auth.replace('_', ' ')}</Badge> },
              { key: 'endpoints', label: 'Endpoints', num: true, sortable: true, render: (r) => r.endpoints },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              {
                key: 'lastStatus',
                label: 'Last test',
                render: (r) => (
                  <span className="row-2">
                    <span className={'http-code http-' + String(r.lastStatus)[0]}>{r.lastStatus}</span>
                    <span className="cell-sub">{r.lastTested}</span>
                  </span>
                ),
              },
              {
                key: 'act',
                label: '',
                render: (r) => (
                  <div className="dt-actions">
                    <Btn size="sm" className="btn-plain" icon="refresh" onClick={() => ops.run('connector_test', { id: r.id, resource: r.name, message: 'Testing ' + r.name })}>
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
                          onConfirm: () => ops.run('connector_delete', { id: r.id, resource: r.name, message: 'Deleting ' + r.name }),
                        })
                      }
                    />
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="connect" title={connectors.length ? 'No connectors match' : 'No connectors yet'}>
            {connectors.length ? 'Try adjusting your search or filters.' : 'Connectors appear here once a merchant configures an outbound integration.'}
          </EmptyState>
        )}
      </Card>
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
