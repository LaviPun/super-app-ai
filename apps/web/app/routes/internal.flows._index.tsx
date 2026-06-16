import { json } from '@remix-run/node';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  useAdminOps,
  StoreLink,
  Icon,
  Btn,
  StatusBadge,
  Card,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  MonoChip,
  useTableState,
  fmtNum,
  titleCase,
  FLOWS,
  STORES,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminFlows() {
  const ctx = useAdminCtx();
  const ops = useAdminOps();
  const ts = useTableState('runs7d');
  const [status, setStatus] = useState('All');
  const [store, setStore] = useState('All');

  let rows = FLOWS.filter(
    (f) => (status === 'All' || f.status === status) && (store === 'All' || f.store === store) && (f.name + f.trigger + f.store).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const active = FLOWS.filter((f) => f.status === 'ACTIVE').length;
  const runs = FLOWS.reduce((a, f) => a + f.runs7d, 0);
  const fails = FLOWS.reduce((a, f) => a + (f.fails7d || 0), 0);

  return (
    <div className="page">
      <PageHead
        title="Flows"
        sub="Automation workflows across all stores. Each flow links a trigger to a chain of actions."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportCSV('flows.csv', rows);
              ctx.toast('Exported ' + rows.length + ' flows');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total flows" value={FLOWS.length} icon="flow" tone="info" />
        <StatTile label="Active" value={active} icon="check" tone="success" />
        <StatTile label="Runs (7d)" value={fmtNum(runs)} icon="rocket" tone="magic" />
        <StatTile label="Failures (7d)" value={fails} icon="alert" tone={fails ? 'critical' : 'success'} />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search flows, triggers…"
          results={rows.length}
          filters={[
            { options: ['All', 'ACTIVE', 'PAUSED', 'DRAFT'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
            { options: ['All'].concat(STORES.map((s) => s.name)), value: store, onChange: setStore },
          ]}
        />
        <DataTable
          rowKey="id"
          onRowClick={(r: any) => ctx.go('#/admin/flows/' + r.id)}
          sortCol={ts.sortCol}
          sortDir={ts.sortDir}
          onSort={ts.onSort}
          columns={[
            {
              key: 'name',
              label: 'Flow',
              sortable: true,
              render: (r: any) => (
                <div className="row-3">
                  <span className="tile-ico" style={{ width: 30, height: 30, background: 'var(--p-surface-secondary)' }}>
                    <Icon name="flow" size={15} />
                  </span>
                  <div className="stack" style={{ gap: 0 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub">{r.steps} steps</span>
                  </div>
                </div>
              ),
            },
            { key: 'store', label: 'Store', render: (r: any) => <StoreLink name={r.store} id={r.storeId} /> },
            { key: 'trigger', label: 'Trigger', render: (r: any) => <MonoChip>{r.trigger}</MonoChip> },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'runs7d', label: 'Runs (7d)', num: true, sortable: true, render: (r: any) => fmtNum(r.runs7d) },
            { key: 'fails7d', label: 'Fails', num: true, render: (r: any) => (r.fails7d ? <span style={{ color: 'var(--p-critical-text)' }}>{r.fails7d}</span> : <span className="t-muted">0</span>) },
            { key: 'lastRun', label: 'Last run', render: (r: any) => <span className="cell-sub">{r.lastRun}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) =>
                r.status === 'ACTIVE' ? (
                  <Btn size="sm" className="btn-plain" icon="pause" onClick={() => ops.run('flow_pause', { id: r.id, resource: r.name, message: r.name + ' paused' })}>
                    Pause
                  </Btn>
                ) : r.status === 'PAUSED' ? (
                  <Btn size="sm" className="btn-plain" icon="play" onClick={() => ops.run('flow_resume', { id: r.id, resource: r.name, message: r.name + ' resumed' })}>
                    Resume
                  </Btn>
                ) : (
                  <Btn size="sm" className="btn-plain" icon="eye" onClick={() => ctx.go('#/admin/flows/' + r.id)}>
                    Open
                  </Btn>
                ),
            },
          ]}
          rows={rows}
        />
      </Card>
    </div>
  );
}
