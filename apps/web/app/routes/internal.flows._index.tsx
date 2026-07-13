import { json } from '@remix-run/node';
import { payloadFlowId } from '~/utils/flow-payload';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  useAdminCtx,
  useAdminOps,
  StoreLink,
  Icon,
  Btn,
  StatusBadge,
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
  formatRelativeTime,
} from '~/components/admin/page-kit';

function parseFlowSpec(specJson: string | null | undefined): { trigger: string; steps: number } {
  if (!specJson) return { trigger: '—', steps: 0 };
  try {
    const spec = JSON.parse(specJson);
    const trigger = typeof spec?.config?.trigger === 'string' ? spec.config.trigger : '—';
    const steps = Array.isArray(spec?.config?.steps) ? spec.config.steps.length : 0;
    return { trigger, steps };
  } catch {
    return { trigger: '—', steps: 0 };
  }
}


export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();
  const since7d = new Date(Date.now() - 7 * 86400000);

  const [modules, flowJobs] = await Promise.all([
    prisma.module.findMany({
      where: { type: 'flow.automation' },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        shop: { select: { shopDomain: true } },
        activeVersion: { select: { specJson: true } },
        versions: { orderBy: { version: 'desc' }, take: 1, select: { specJson: true, version: true } },
      },
    }),
    // Recent FLOW_RUN jobs across all shops → per-flow run/failure counts + last run.
    prisma.job.findMany({
      where: { type: 'FLOW_RUN' },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { payload: true, status: true, createdAt: true },
    }),
  ]);

  // Aggregate jobs by flowId (parsed from payload). First occurrence = last run (desc order).
  const agg = new Map<string, { runs7d: number; fails7d: number; lastRun: Date | null }>();
  for (const j of flowJobs) {
    const fid = payloadFlowId(j.payload);
    if (!fid) continue;
    let a = agg.get(fid);
    if (!a) {
      a = { runs7d: 0, fails7d: 0, lastRun: null };
      agg.set(fid, a);
    }
    if (!a.lastRun) a.lastRun = j.createdAt;
    if (j.createdAt >= since7d) {
      a.runs7d += 1;
      if (j.status === 'FAILED') a.fails7d += 1;
    }
  }

  const rows = modules.map((m) => {
    const spec = parseFlowSpec(m.activeVersion?.specJson ?? m.versions[0]?.specJson);
    const status =
      m.status === 'PUBLISHED' ? 'ACTIVE' : m.status === 'ARCHIVED' ? 'DRAFT' : m.activeVersionId ? 'PAUSED' : 'DRAFT';
    const a = agg.get(m.id);
    return {
      id: m.id,
      name: m.name,
      trigger: spec.trigger,
      steps: spec.steps + 1, // + trigger node
      status,
      store: m.shop.shopDomain.split('.')[0] ?? m.shop.shopDomain,
      storeId: m.shopId,
      runs7d: a?.runs7d ?? 0,
      fails7d: a?.fails7d ?? 0,
      lastRun: a?.lastRun ? formatRelativeTime(new Date(a.lastRun).toISOString()) : '—',
    };
  });

  return json({ flows: rows });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function AdminFlows() {
  const { flows } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ops = useAdminOps();
  const ts = useTableState('runs7d');
  const [status, setStatus] = useState('All');
  const [store, setStore] = useState('All');

  const storeNames = Array.from(new Set(flows.map((f) => f.store)));

  let rows = flows.filter(
    (f) => (status === 'All' || f.status === status) && (store === 'All' || f.store === store) && (f.name + f.trigger + f.store).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = (a as any)[col], y = (b as any)[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const active = flows.filter((f) => f.status === 'ACTIVE').length;
  const runs = flows.reduce((a, f) => a + f.runs7d, 0);
  const fails = flows.reduce((a, f) => a + (f.fails7d || 0), 0);

  return (
    <div className="page">
      <PageHead
        title="Flows"
        sub="Automation workflows across all stores. Each flow links a trigger to a chain of actions."
        actions={
          <Btn
            icon="download"
            disabled={!rows.length}
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
        <StatTile label="Total flows" value={flows.length} icon="flow" tone="info" />
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
            { options: ['All'].concat(storeNames), value: store, onChange: setStore },
          ]}
        />
        {rows.length ? (
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
                    <Btn size="sm" className="btn-plain" icon="pause" onClick={() => ops.run('flow_pause', { id: r.id, resource: r.name, message: 'Pausing ' + r.name })}>
                      Pause
                    </Btn>
                  ) : r.status === 'PAUSED' ? (
                    <Btn size="sm" className="btn-plain" icon="play" onClick={() => ops.run('flow_resume', { id: r.id, resource: r.name, message: 'Resuming ' + r.name })}>
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
        ) : (
          <EmptyState icon="flow" title={flows.length ? 'No flows match' : 'No flows yet'}>
            {flows.length ? 'Try adjusting your search or filters.' : 'Flow automations appear here once a merchant builds one.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
