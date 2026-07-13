import { json } from '@remix-run/node';
import { prettyName } from '~/utils/pretty-name';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
import {
  useAdminCtx,
  StoreLink,
  Icon,
  Btn,
  Badge,
  Avatar,
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


const LIFECYCLE: Record<string, string> = { ACTIVE: 'Customer', TRIAL: 'Trialing', CANCELLED: 'Churned', EXPIRED: 'Churned' };

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const [shops, planConfigs] = await Promise.all([
    prisma.shop.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { subscription: true },
    }),
    getAllPlanConfigs(),
  ]);

  const priceByPlan = new Map<string, number>(planConfigs.map((p) => [p.name, p.price]));
  const shopIds = shops.map((s) => s.id);
  const lastActivity = shopIds.length
    ? await prisma.apiLog.groupBy({ by: ['shopId'], where: { shopId: { in: shopIds } }, _max: { createdAt: true } })
    : [];
  const lastActiveByShop = new Map(lastActivity.map((a) => [a.shopId, a._max.createdAt]));

  const customers = shops.map((s) => {
    const lifecycle = LIFECYCLE[s.subscription?.status ?? 'ACTIVE'] ?? 'Customer';
    const price = priceByPlan.get(s.planTier) ?? 0;
    // MRR = what the merchant pays us: only active/paying, and only for a quantifiable price.
    const mrr = lifecycle === 'Customer' && price > 0 ? price : 0;
    const last = lastActiveByShop.get(s.id) ?? null;
    return {
      id: s.id,
      storeId: s.id,
      name: prettyName(s.shopDomain),
      store: prettyName(s.shopDomain),
      domain: s.shopDomain,
      plan: s.planTier,
      lifecycle,
      mrr,
      country: '—',
      seats: '—',
      tickets: 0,
      signed: s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '—',
      lastActive: last ? formatRelativeTime(new Date(last).toISOString()) : 'No activity',
    };
  });

  return json({ customers, planNames: planConfigs.map((p) => p.name) });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };
const LIFECYCLE_TONE: Record<string, any> = { Customer: 'success', Trialing: 'warning', Churned: 'critical' };

export default function AdminCustomers() {
  const { customers, planNames } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const ts = useTableState('mrr');
  const [life, setLife] = useState('All');
  const [plan, setPlan] = useState('All');

  let rows = customers.filter(
    (c) => (life === 'All' || c.lifecycle === life) && (plan === 'All' || c.plan === plan) && (c.name + c.store + c.domain).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = (a as any)[col], y = (b as any)[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const mrr = customers.reduce((a, c) => a + c.mrr, 0);
  const paying = customers.filter((c) => c.mrr > 0).length;
  const openTickets = customers.reduce((a, c) => a + c.tickets, 0);

  return (
    <div className="page">
      <PageHead
        title="Customers"
        sub="The merchants behind the stores — their plan, billing and lifecycle. One customer per installed store."
        actions={
          <Btn
            icon="download"
            disabled={!rows.length}
            onClick={() => {
              exportCSV('customers.csv', rows.map((c) => ({ name: c.name, domain: c.domain, store: c.store, plan: c.plan, lifecycle: c.lifecycle, mrr: c.mrr, signed: c.signed })));
              ctx.toast('Exported ' + rows.length + ' customers');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Customers" value={customers.length} icon="users" tone="info" />
        <StatTile label="Paying" value={paying} icon="plan" tone="success" />
        <StatTile label="MRR" value={'$' + fmtNum(mrr)} icon="chart" tone="success" />
        <StatTile label="Open tickets" value={openTickets} icon="chat" tone={openTickets ? 'warning' : 'success'} />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search by store or domain…"
          results={rows.length}
          filters={[
            { options: ['All', 'Customer', 'Trialing', 'Churned'].map((s) => ({ value: s, label: s === 'All' ? 'All lifecycles' : s })), value: life, onChange: setLife },
            { options: ['All'].concat(planNames), value: plan, onChange: setPlan },
          ]}
        />
        {rows.length ? (
          <DataTable
            rowKey="id"
            onRowClick={(r: any) => ctx.go('#/admin/customers/' + r.id)}
            sortCol={ts.sortCol}
            sortDir={ts.sortDir}
            onSort={ts.onSort}
            columns={[
              {
                key: 'name',
                label: 'Customer',
                sortable: true,
                render: (r: any) => (
                  <div className="row-3">
                    <Avatar name={r.name} size={30} />
                    <div className="stack" style={{ gap: 0 }}>
                      <span className="cell-strong">{r.name}</span>
                      <span className="cell-sub t-mono">{r.domain}</span>
                    </div>
                  </div>
                ),
              },
              { key: 'store', label: 'Store', render: (r: any) => <StoreLink name={r.store} id={r.storeId} /> },
              { key: 'plan', label: 'Plan', render: (r: any) => <Badge tone={PLAN_TONE[r.plan]}>{titleCase(r.plan)}</Badge> },
              { key: 'lifecycle', label: 'Lifecycle', render: (r: any) => <Badge tone={LIFECYCLE_TONE[r.lifecycle]}>{r.lifecycle}</Badge> },
              { key: 'mrr', label: 'MRR', num: true, sortable: true, render: (r: any) => (r.mrr ? '$' + fmtNum(r.mrr) : <span className="t-muted">—</span>) },
              { key: 'seats', label: 'Seats', num: true, render: (r: any) => r.seats },
              { key: 'lastActive', label: 'Last active', render: (r: any) => <span className="cell-sub">{r.lastActive}</span> },
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
                        { icon: 'eye', label: 'View customer', onClick: () => ctx.go('#/admin/customers/' + r.id) },
                        { icon: 'store', label: 'Open store', onClick: () => ctx.go('#/admin/stores/' + r.storeId) },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <EmptyState icon="users" title={customers.length ? 'No customers match' : 'No customers yet'}>
            {customers.length ? 'Try adjusting your search or filters.' : 'Customers appear here once a merchant installs the app.'}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}
