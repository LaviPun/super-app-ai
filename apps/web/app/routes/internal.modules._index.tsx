import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  StoreLink,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Menu,
  EmptyState,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  fmtNum,
  titleCase,
  exportCSV,
  formatRelativeTime,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const since30d = new Date(Date.now() - 30 * 86400000);

  const [modules, aiTotal] = await Promise.all([
    prisma.module.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 300,
      include: {
        shop: { select: { shopDomain: true } },
        activeVersion: { select: { version: true } },
        versions: { orderBy: { version: 'desc' }, take: 1, select: { version: true } },
        _count: { select: { moduleInstances: true } },
      },
    }),
    prisma.aiUsage.aggregate({ where: { createdAt: { gte: since30d } }, _sum: { requestCount: true } }),
  ]);

  return json({
    modules: modules.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      status: m.status,
      version: m.activeVersion?.version ?? m.versions[0]?.version ?? 1,
      source: m.sourceType ?? '—',
      updated: formatRelativeTime(new Date(m.updatedAt).toISOString()),
      summary: m.summary ?? '',
      store: m.shop.shopDomain.split('.')[0] ?? m.shop.shopDomain,
      storeId: m.shopId,
      instances: m._count.moduleInstances,
    })),
    aiCalls30d: aiTotal._sum.requestCount ?? 0,
  });
}

const SOURCE_TONE: Record<string, string | undefined> = { template: 'info', recipe: 'success', scratch: undefined, image: 'magic' };

export default function AdminModules() {
  const { modules, aiCalls30d } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState('updated');
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [store, setStore] = useState('All');

  const types = Array.from(new Set(modules.map((m) => m.type)));
  const storeNames = Array.from(new Set(modules.map((m) => m.store)));

  let rows = modules.filter(
    (m) =>
      (type === 'All' || m.type === type) &&
      (status === 'All' || m.status === status) &&
      (store === 'All' || m.store === store) &&
      (m.name + m.summary + m.category + m.store).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = (a as any)[col], y = (b as any)[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const pub = modules.filter((m) => m.status === 'PUBLISHED').length;
  const draft = modules.filter((m) => m.status === 'DRAFT').length;

  return (
    <div className="page">
      <PageHead
        title="Modules"
        sub="Every module built across all merchant stores — storefront UI, functions, integrations, flows and data stores."
        actions={
          <Btn
            icon="download"
            disabled={!rows.length}
            onClick={() => {
              exportCSV('modules.csv', rows.map((m) => ({ id: m.id, name: m.name, store: m.store, type: m.type, category: m.category, status: m.status, version: m.version, source: m.source, instances: m.instances })));
              ctx.toast('Exported ' + rows.length + ' modules');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total modules" value={modules.length} icon="layers" tone="info" />
        <StatTile label="Published" value={pub} icon="check" tone="success" />
        <StatTile label="Drafts" value={draft} icon="edit" tone="warning" />
        <StatTile label="AI calls (30d)" value={fmtNum(aiCalls30d)} sub="all stores" icon="magic" tone="magic" />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search modules, summaries, categories…"
          results={rows.length}
          filters={[
            { options: ['All'].concat(types), value: type, onChange: setType },
            { options: ['All', 'PUBLISHED', 'DRAFT', 'ARCHIVED'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
            { options: ['All'].concat(storeNames), value: store, onChange: setStore },
          ]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r) => ctx.go('#/admin/modules/' + r.id)}
            sortCol={ts.sortCol}
            sortDir={ts.sortDir}
            onSort={ts.onSort}
            columns={[
              {
                key: 'name',
                label: 'Module',
                sortable: true,
                render: (r) => (
                  <div className="stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub t-trunc">{r.summary}</span>
                  </div>
                ),
              },
              { key: 'store', label: 'Store', render: (r) => <StoreLink name={r.store} id={r.storeId} /> },
              { key: 'type', label: 'Type', render: (r) => <Badge>{r.type}</Badge> },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
              { key: 'version', label: 'Ver', num: true, sortable: true, render: (r) => 'v' + r.version },
              { key: 'source', label: 'Source', render: (r) => <Badge tone={SOURCE_TONE[r.source]}>{titleCase(r.source)}</Badge> },
              { key: 'instances', label: 'Instances', num: true, sortable: true, render: (r) => fmtNum(r.instances) },
              { key: 'updated', label: 'Updated', sortable: true, render: (r) => <span className="cell-sub">{r.updated}</span> },
              {
                key: 'act',
                label: '',
                render: (r) => (
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
                      ]}
                    />
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="layers" title={modules.length ? 'No modules match' : 'No modules yet'}>
            {modules.length ? 'Try adjusting your search or filters.' : 'Modules appear here once a merchant builds one.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
