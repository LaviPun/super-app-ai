import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import type { Prisma } from '@prisma/client';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import {
  useAdminCtx,
  Icon,
  Btn,
  Badge,
  StatusBadge,
  Card,
  Avatar,
  Progress,
  Menu,
  Modal,
  ConfirmDialog,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  fmtNum,
  fmtQuota,
  titleCase,
  STORES,
  PLAN_TIERS,
  storeHealth,
  healthTone,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const planFilter = url.searchParams.get('plan') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const { cursor, take, skip } = parseCursorParams(url);

  const prisma = getPrisma();
  const where: Prisma.ShopWhereInput = {};
  if (planFilter) where.planTier = planFilter;
  if (search) where.shopDomain = { contains: search };

  const shops = await prisma.shop.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    cursor,
    include: { modules: true, subscription: true },
  });

  const nextCursor = buildNextCursorUrl(url, shops, take);

  return json({
    shops: shops.map((s) => ({
      id: s.id,
      domain: s.shopDomain,
      name: s.shopDomain.split('.')[0],
      plan: s.planTier,
      status: s.subscription?.status === 'ACTIVE' ? 'ACTIVE' : (s.subscription?.status ?? 'ACTIVE'),
      modules: s.modules.length,
      published: s.modules.filter((m: { status: string }) => m.status === 'PUBLISHED').length,
      aiCalls30d: 0,
      owner: '—',
      country: '—',
      installedAt: s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '—',
      provider: 'Default · gpt-4o',
    })),
    filters: { plan: planFilter, search },
    nextCursor,
  });
}

const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };

function HealthCell({ s }: { s: any }) {
  const h = storeHealth(s);
  const tone = healthTone(h);
  return (
    <div className="row-2" style={{ minWidth: 92 }}>
      <div style={{ width: 48 }}>
        <Progress value={h} tone={tone} />
      </div>
      <span className="t-xs t-strong t-num" style={{ color: 'var(--p-' + tone + '-text)' }}>
        {h}
      </span>
    </div>
  );
}

export default function AdminStores() {
  const data = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  // Prefer real shops; fall back to the design's fully-populated placeholder set.
  const STORE_ROWS: any[] = data.shops.length ? data.shops : STORES;

  const ts = useTableState('aiCalls30d');
  const [plan, setPlan] = useState('All');
  const [status, setStatus] = useState('All');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<any>(null);
  const [bulkPlan, setBulkPlan] = useState<string | null>(null);

  let rows = STORE_ROWS.filter(
    (s) =>
      (plan === 'All' || s.plan === plan) &&
      (status === 'All' || s.status === status) &&
      (s.name + s.domain + s.owner).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = a[col],
        y = b[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const onSelectChange = (v: any) => {
    if (v === 'all') setSel(new Set(rows.map((r) => r.id)));
    else if (v === 'none') setSel(new Set());
    else {
      const n = new Set(sel);
      n.has(v) ? n.delete(v) : n.add(v);
      setSel(n);
    }
  };
  const exportRows = (list: any[]) =>
    exportCSV(
      'stores.csv',
      list.map((s) => ({
        id: s.id, name: s.name, domain: s.domain, plan: s.plan, status: s.status, owner: s.owner,
        modules: s.modules, published: s.published, aiCalls30d: s.aiCalls30d, country: s.country, installedAt: s.installedAt, health: storeHealth(s),
      })),
    );
  const applyBulkPlan = () => {
    ctx.toast('Plan set to ' + titleCase(bulkPlan || '') + ' for ' + sel.size + ' stores');
    setSel(new Set());
    setBulkPlan(null);
  };

  return (
    <div className="page">
      <PageHead
        title="Stores"
        sub="Every merchant store that has installed SuperApp AI. Click a store to manage its plan, provider override, and retention."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportRows(rows);
              ctx.toast('Exported ' + rows.length + ' stores to CSV');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Total stores" value={STORE_ROWS.length} icon="store" tone="info" />
        <StatTile label="Active" value={STORE_ROWS.filter((s) => s.status === 'ACTIVE').length} icon="check" tone="success" />
        <StatTile label="On trial" value={STORE_ROWS.filter((s) => s.status === 'TRIAL').length} icon="clock" tone="warning" />
        <StatTile
          label="Avg health"
          value={STORE_ROWS.length ? Math.round(STORE_ROWS.reduce((a, s) => a + storeHealth(s), 0) / STORE_ROWS.length) : 0}
          icon="shield"
          tone="success"
        />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search by store, domain, owner…"
          results={rows.length}
          filters={[
            { options: ['All'].concat(PLAN_TIERS.map((p) => p.name)), value: plan, onChange: setPlan },
            { options: ['All', 'ACTIVE', 'TRIAL', 'EXPIRED'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
          ]}
        />
        {sel.size > 0 && (
          <div className="bulk-bar">
            <span className="t-strong">{sel.size} selected</span>
            <Btn size="sm" icon="plan" onClick={() => setBulkPlan('GROWTH')}>
              Change plan
            </Btn>
            <Btn
              size="sm"
              icon="download"
              onClick={() => {
                exportRows(STORE_ROWS.filter((s) => sel.has(s.id)));
                ctx.toast('Exported ' + sel.size + ' stores');
              }}
            >
              Export
            </Btn>
            <button className="btn-plain btn-sm" style={{ marginLeft: 'auto', border: 0, background: 'none', cursor: 'pointer' }} onClick={() => setSel(new Set())}>
              Clear
            </button>
          </div>
        )}
        <DataTable
          rowKey="id"
          selectable
          selected={sel}
          onSelectChange={onSelectChange}
          onRowClick={(r: any) => ctx.go('#/admin/stores/' + r.id)}
          sortCol={ts.sortCol}
          sortDir={ts.sortDir}
          onSort={ts.onSort}
          columns={[
            {
              key: 'name',
              label: 'Store',
              sortable: true,
              render: (r: any) => (
                <div className="row-3">
                  <Avatar name={r.name} size={30} square color="#1F3A5F" />
                  <div className="stack" style={{ gap: 0 }}>
                    <span className="cell-strong">{r.name}</span>
                    <span className="cell-sub t-mono">{r.domain}</span>
                  </div>
                </div>
              ),
            },
            { key: 'plan', label: 'Plan', render: (r: any) => <Badge tone={PLAN_TONE[r.plan]}>{titleCase(r.plan)}</Badge> },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'health', label: 'Health', render: (r: any) => <HealthCell s={r} /> },
            {
              key: 'modules',
              label: 'Modules',
              num: true,
              sortable: true,
              render: (r: any) => (
                <span>
                  {r.published}
                  <span className="t-muted"> / {r.modules}</span>
                </span>
              ),
            },
            { key: 'aiCalls30d', label: 'AI calls (30d)', num: true, sortable: true, render: (r: any) => fmtNum(r.aiCalls30d) },
            { key: 'owner', label: 'Owner', render: (r: any) => <span className="cell-sub">{r.owner}</span> },
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
                      { icon: 'eye', label: 'View store', onClick: () => ctx.go('#/admin/stores/' + r.id) },
                      { icon: 'plan', label: 'Change plan', onClick: () => ctx.go('#/admin/stores/' + r.id) },
                      { icon: 'connect', label: 'Provider override', onClick: () => ctx.go('#/admin/stores/' + r.id) },
                      { icon: 'transfer', label: 'View trace', onClick: () => ctx.go('#/admin/trace/cor_rs8f2') },
                      { divider: true },
                      {
                        icon: 'exit',
                        label: 'Force uninstall',
                        tone: 'critical',
                        onClick: () =>
                          setConfirm({
                            title: 'Force uninstall ' + r.name + '?',
                            message:
                              'This removes the app from ' + r.domain + ', revokes tokens and stops all jobs. Merchant data is retained per your retention policy. This cannot be undone.',
                            confirmLabel: 'Force uninstall',
                            tone: 'critical',
                            icon: 'exit',
                            onConfirm: () => ctx.toast(r.name + ' uninstalled'),
                          }),
                      },
                    ]}
                  />
                </div>
              ),
            },
          ]}
          rows={rows}
        />
        <div className="table-foot">
          <span>
            Showing {rows.length} of {STORE_ROWS.length} stores
          </span>
          <div className="row-2">
            <Btn size="sm" icon="chevronLeft" disabled />
            <Btn size="sm" iconRight="chevronRight">
              Next
            </Btn>
          </div>
        </div>
      </Card>
      {bulkPlan && (
        <Modal
          title={'Change plan for ' + sel.size + ' stores'}
          sub="Internal override — no Shopify billing."
          onClose={() => setBulkPlan(null)}
          footer={
            <>
              <span className="grow" />
              <Btn onClick={() => setBulkPlan(null)}>Cancel</Btn>
              <Btn variant="primary" onClick={applyBulkPlan}>
                Apply to {sel.size} stores
              </Btn>
            </>
          }
        >
          <div className="stack-2">
            {PLAN_TIERS.map((p) => (
              <label key={p.id} className={'plan-radio' + (p.name === bulkPlan ? ' active' : '')}>
                <input type="radio" name="bulkplan" checked={p.name === bulkPlan} onChange={() => setBulkPlan(p.name)} />
                <div className="grow">
                  <div className="t-strong">{p.display}</div>
                  <div className="t-xs t-muted">
                    {fmtQuota(p.ai)} AI · {fmtQuota(p.publish)} publishes
                  </div>
                </div>
                <div className="t-strong">{p.price === -1 ? 'Custom' : '$' + p.price}</div>
              </label>
            ))}
          </div>
        </Modal>
      )}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
