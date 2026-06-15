import { json } from '@remix-run/node';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  StoreLink,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Menu,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  fmtNum,
  titleCase,
  MODULES,
  MODULE_TYPES,
  STORES,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const SOURCE_TONE: Record<string, any> = { template: 'info', recipe: 'success', scratch: undefined, image: 'magic' };

export default function AdminModules() {
  const ctx = useAdminCtx();
  const ts = useTableState('updated');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [store, setStore] = useState('All');

  let rows = MODULES.filter(
    (m) =>
      (type === 'All' || m.type === type) &&
      (status === 'All' || m.status === status) &&
      (store === 'All' || m.store === store) &&
      (m.name + m.summary + m.category + m.store).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const pub = MODULES.filter((m) => m.status === 'PUBLISHED').length;
  const draft = MODULES.filter((m) => m.status === 'DRAFT').length;
  const calls = MODULES.reduce((a, m) => a + (m.aiCalls30d || 0), 0);

  return (
    <div className="page">
      <PageHead
        title="Modules"
        sub="Every module built across all merchant stores — storefront UI, functions, integrations, flows and data stores."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportCSV('modules.csv', rows.map((m) => ({ id: m.id, name: m.name, store: m.store, type: m.type, category: m.category, status: m.status, version: m.version, source: m.source, instances: m.instances, aiCalls30d: m.aiCalls30d })));
              ctx.toast('Exported ' + rows.length + ' modules');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total modules" value={MODULES.length} icon="layers" tone="info" />
        <StatTile label="Published" value={pub} icon="check" tone="success" />
        <StatTile label="Drafts" value={draft} icon="edit" tone="warning" />
        <StatTile label="AI calls (30d)" value={fmtNum(calls)} icon="magic" tone="magic" />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search modules, summaries, categories…"
          results={rows.length}
          filters={[
            { options: ['All'].concat(MODULE_TYPES), value: type, onChange: setType },
            { options: ['All', 'PUBLISHED', 'DRAFT', 'ARCHIVED'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
            { options: ['All'].concat(STORES.map((s) => s.name)), value: store, onChange: setStore },
          ]}
        />
        <DataTable
          rowKey="id"
          onRowClick={(r: any) => ctx.go('#/admin/modules/' + r.id)}
          sortCol={ts.sortCol}
          sortDir={ts.sortDir}
          onSort={ts.onSort}
          columns={[
            {
              key: 'name',
              label: 'Module',
              sortable: true,
              render: (r: any) => (
                <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="cell-strong">{r.name}</span>
                  <span className="cell-sub t-trunc">{r.summary}</span>
                </div>
              ),
            },
            { key: 'store', label: 'Store', render: (r: any) => <StoreLink name={r.store} id={r.storeId} /> },
            { key: 'type', label: 'Type', render: (r: any) => <Badge>{r.type}</Badge> },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'version', label: 'Ver', num: true, sortable: true, render: (r: any) => 'v' + r.version },
            { key: 'source', label: 'Source', render: (r: any) => <Badge tone={SOURCE_TONE[r.source]}>{titleCase(r.source)}</Badge> },
            { key: 'aiCalls30d', label: 'AI (30d)', num: true, sortable: true, render: (r: any) => fmtNum(r.aiCalls30d) },
            { key: 'updated', label: 'Updated', sortable: true, render: (r: any) => <span className="cell-sub">{r.updated}</span> },
            {
              key: 'act',
              label: '',
              render: (r: any) => (
                <div className="dt-actions">
                  <Menu
                    trigger={
                      <button className="btn btn-icon btn-sm btn-plain">
                        <Icon name="dotsH" size={16} />
                      </button>
                    }
                    items={[
                      { icon: 'eye', label: 'View module', onClick: () => ctx.go('#/admin/modules/' + r.id) },
                      { icon: 'code', label: 'Edit recipe', onClick: () => ctx.go('#/admin/recipe-edit/' + r.id) },
                      { icon: 'transfer', label: 'View trace', onClick: () => ctx.go('#/admin/trace/cor_rs8f2') },
                    ]}
                  />
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
