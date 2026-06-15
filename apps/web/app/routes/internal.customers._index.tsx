import { json } from '@remix-run/node';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  StoreLink,
  Icon,
  Btn,
  Badge,
  Avatar,
  Card,
  Menu,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  fmtNum,
  titleCase,
  CUSTOMERS,
  PLAN_TIERS,
  exportCSV,
} from '~/components/admin/page-kit';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  return json({});
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };
const LIFECYCLE_TONE: Record<string, any> = { Customer: 'success', Trialing: 'warning', Churned: 'critical' };

export default function AdminCustomers() {
  const ctx = useAdminCtx();
  const ts = useTableState('mrr');
  const [life, setLife] = useState('All');
  const [plan, setPlan] = useState('All');

  let rows = CUSTOMERS.filter(
    (c) => (life === 'All' || c.lifecycle === life) && (plan === 'All' || c.plan === plan) && (c.name + c.store + c.email + c.domain).toLowerCase().includes(ts.search.toLowerCase()),
  );
  if (ts.sortCol) {
    const col = ts.sortCol;
    rows = [...rows].sort((a, b) => {
      const x = a[col], y = b[col];
      const r = typeof x === 'number' ? x - y : String(x).localeCompare(String(y));
      return ts.sortDir === 'asc' ? r : -r;
    });
  }
  const mrr = CUSTOMERS.reduce((a, c) => a + c.mrr, 0);
  const paying = CUSTOMERS.filter((c) => c.mrr > 0).length;
  const openTickets = CUSTOMERS.reduce((a, c) => a + c.tickets, 0);

  return (
    <div className="page">
      <PageHead
        title="Customers"
        sub="The people behind the stores — owners, their plan, billing and support context. One customer per store."
        actions={
          <Btn
            icon="download"
            onClick={() => {
              exportCSV('customers.csv', rows.map((c) => ({ name: c.name, email: c.email, store: c.store, plan: c.plan, lifecycle: c.lifecycle, mrr: c.mrr, country: c.country, seats: c.seats, signed: c.signed })));
              ctx.toast('Exported ' + rows.length + ' customers');
            }}
          >
            Export CSV
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Customers" value={CUSTOMERS.length} icon="users" tone="info" />
        <StatTile label="Paying" value={paying} icon="plan" tone="success" />
        <StatTile label="MRR" value={'$' + fmtNum(mrr)} icon="chart" tone="success" />
        <StatTile label="Open tickets" value={openTickets} icon="chat" tone={openTickets ? 'warning' : 'success'} />
      </div>
      <Card>
        <FilterBar
          search={ts.search}
          onSearch={ts.setSearch}
          placeholder="Search by name, email, store…"
          results={rows.length}
          filters={[
            { options: ['All', 'Customer', 'Trialing', 'Churned'].map((s) => ({ value: s, label: s === 'All' ? 'All lifecycles' : s })), value: life, onChange: setLife },
            { options: ['All'].concat(PLAN_TIERS.map((p) => p.name)), value: plan, onChange: setPlan },
          ]}
        />
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
                    <span className="cell-sub">{r.email}</span>
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
                      { icon: 'mail', label: 'Email customer', onClick: () => ctx.toast('Drafting email to ' + r.email) },
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
