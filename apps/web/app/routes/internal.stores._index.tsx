import { json } from '@remix-run/node';
import { useLoaderData, useFetcher, useSearchParams } from '@remix-run/react';
import { useEffect, useState } from 'react';
import type { Prisma } from '@prisma/client';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { BillingService, type BillingPlan } from '~/services/billing/billing.service';
import { getAllPlanConfigs } from '~/services/billing/plan-config.service';
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
  EmptyState,
  DataTable,
  PageHead,
  FilterBar,
  StatTile,
  useTableState,
  fmtNum,
  fmtQuota,
  titleCase,
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

  const [shops, filteredCount, totalCount, activeCount, trialCount, activeProvider, planConfigs] = await Promise.all([
    prisma.shop.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      cursor,
      include: { modules: { select: { status: true } }, subscription: true, aiProviderOverride: true },
    }),
    prisma.shop.count({ where }),
    prisma.shop.count(),
    prisma.shop.count({ where: { OR: [{ subscription: { is: null } }, { subscription: { status: 'ACTIVE' } }] } }),
    prisma.shop.count({ where: { subscription: { status: 'TRIAL' } } }),
    prisma.aiProvider.findFirst({ where: { isActive: true } }),
    getAllPlanConfigs(),
  ]);

  const shopIds = shops.map((s) => s.id);
  const since30d = new Date(Date.now() - 30 * 86400000);
  const [aiUsage30d, errors30d] = await Promise.all([
    shopIds.length
      ? prisma.aiUsage.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds }, createdAt: { gte: since30d } },
          _sum: { requestCount: true },
        })
      : Promise.resolve([]),
    shopIds.length
      ? prisma.errorLog.groupBy({
          by: ['shopId'],
          where: { shopId: { in: shopIds }, level: 'ERROR', createdAt: { gte: since30d } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const aiByShop = new Map(aiUsage30d.map((u) => [u.shopId, u._sum.requestCount ?? 0]));
  const errByShop = new Map(errors30d.map((e) => [e.shopId, e._count._all]));

  const defaultProviderLabel = activeProvider
    ? 'Default · ' + (activeProvider.model ?? activeProvider.provider)
    : 'No provider configured';

  const nextCursor = buildNextCursorUrl(url, shops, take);

  return json({
    shops: shops.map((s) => ({
      id: s.id,
      domain: s.shopDomain,
      name: s.shopDomain.split('.')[0],
      plan: s.planTier,
      status: s.subscription?.status ?? 'ACTIVE',
      modules: s.modules.length,
      published: s.modules.filter((m: { status: string }) => m.status === 'PUBLISHED').length,
      aiCalls30d: aiByShop.get(s.id) ?? 0,
      errors30d: Math.min(errByShop.get(s.id) ?? 0, 13),
      installedAt: s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : '—',
      provider: s.aiProviderOverride
        ? s.aiProviderOverride.name + ' · ' + (s.aiProviderOverride.model ?? s.aiProviderOverride.provider)
        : defaultProviderLabel,
    })),
    filters: { plan: planFilter ?? 'All', search: search ?? '' },
    nextCursor,
    filteredCount,
    totalCount,
    activeCount,
    trialCount,
    planTiers: planConfigs.map((p) => ({
      id: p.name,
      name: p.name,
      display: p.displayName,
      price: p.price,
      ai: p.quotas.aiRequestsPerMonth,
      publish: p.quotas.publishOpsPerMonth,
    })),
  });
}

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  if (intent === 'bulk_set_plan') {
    const plan = String(form.get('plan') ?? '') as BillingPlan;
    const allowed: BillingPlan[] = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'];
    if (!allowed.includes(plan)) return json({ ok: false, message: 'Invalid plan' }, { status: 400 });
    const ids = String(form.get('ids') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return json({ ok: false, message: 'No stores selected' }, { status: 400 });

    const prisma = getPrisma();
    const found = await prisma.shop.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (!found.length) return json({ ok: false, message: 'No matching stores found' }, { status: 400 });

    const billing = new BillingService();
    const activity = new ActivityLogService();
    for (const { id } of found) {
      await billing.setPlanForShop(id, plan);
      await activity.log({
        actor: 'INTERNAL_ADMIN',
        action: 'STORE_PLAN_CHANGED',
        resource: `shop:${id}`,
        shopId: id,
        details: { plan, bulk: true },
      });
    }
    return json({
      ok: true,
      message: 'Plan set to ' + titleCase(plan) + ' for ' + found.length + (found.length === 1 ? ' store' : ' stores'),
    });
  }

  return json({ ok: false, message: 'Unknown intent' }, { status: 400 });
}

const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };

// Health derived from real fields + the store's real 30d ERROR count (loader-provided).
function healthOf(s: any): number {
  const errLogs = Array.from({ length: s.errors30d ?? 0 }, () => ({ level: 'ERROR', shop: s.domain }));
  return storeHealth(s, errLogs);
}

function HealthCell({ s }: { s: any }) {
  const h = healthOf(s);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const bulkFetcher = useFetcher<typeof action>();
  const STORE_ROWS: any[] = data.shops;

  const ts = useTableState('aiCalls30d');
  const [search, setSearch] = useState(data.filters.search);
  const [status, setStatus] = useState('All');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkPlan, setBulkPlan] = useState<string | null>(null);

  // Server-side search: debounce the FilterBar input into the ?q= param the loader reads.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search === (searchParams.get('q') ?? '')) return;
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (search) p.set('q', search);
          else p.delete('q');
          p.delete('cursor');
          return p;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(t);
  }, [search, searchParams, setSearchParams]);

  // Toast reflects the server response for bulk plan changes.
  useEffect(() => {
    if (bulkFetcher.state === 'idle' && bulkFetcher.data) {
      ctx.toast(bulkFetcher.data.message, !bulkFetcher.data.ok);
      if (bulkFetcher.data.ok) {
        setSel(new Set());
        setBulkPlan(null);
      }
    }
  }, [bulkFetcher.state, bulkFetcher.data, ctx]);

  const setPlanFilter = (v: string) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v === 'All') p.delete('plan');
        else p.set('plan', v);
        p.delete('cursor');
        return p;
      },
      { replace: true },
    );
  };
  const goPrevPage = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('cursor');
        return p;
      },
      { replace: true },
    );
  };

  let rows = STORE_ROWS.filter((s) => status === 'All' || s.status === status);
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
        id: s.id, name: s.name, domain: s.domain, plan: s.plan, status: s.status,
        modules: s.modules, published: s.published, aiCalls30d: s.aiCalls30d, installedAt: s.installedAt, provider: s.provider, health: healthOf(s),
      })),
    );
  const applyBulkPlan = () => {
    if (!bulkPlan || sel.size === 0) return;
    bulkFetcher.submit(
      { intent: 'bulk_set_plan', plan: bulkPlan, ids: Array.from(sel).join(',') },
      { method: 'post' },
    );
  };
  const hasFilters = Boolean(search || data.filters.plan !== 'All' || status !== 'All');

  return (
    <div className="page">
      <PageHead
        title="Stores"
        sub="Every merchant store that has installed SuperApp AI. Click a store to manage its plan, provider override, and retention."
        actions={
          <Btn
            icon="download"
            disabled={!rows.length}
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
        <StatTile label="Total stores" value={data.totalCount} icon="store" tone="info" />
        <StatTile label="Active" value={data.activeCount} icon="check" tone="success" />
        <StatTile label="On trial" value={data.trialCount} icon="clock" tone="warning" />
        <StatTile
          label="Avg health"
          value={rows.length ? Math.round(rows.reduce((a, s) => a + healthOf(s), 0) / rows.length) : 0}
          icon="shield"
          tone="success"
        />
      </div>
      <Card>
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search by store or domain…"
          results={rows.length}
          filters={[
            { options: ['All'].concat(data.planTiers.map((p) => p.name)), value: data.filters.plan, onChange: setPlanFilter },
            { options: ['All', 'ACTIVE', 'TRIAL', 'CANCELLED', 'EXPIRED'].map((s) => ({ value: s, label: s === 'All' ? 'All statuses' : titleCase(s) })), value: status, onChange: setStatus },
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
        {rows.length ? (
          <>
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
                { key: 'provider', label: 'Provider', render: (r: any) => <span className="cell-sub">{r.provider}</span> },
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
                Showing {rows.length} of {data.filteredCount} stores
              </span>
              <div className="row-2">
                <Btn size="sm" icon="chevronLeft" disabled={!searchParams.get('cursor')} onClick={goPrevPage} />
                <Btn size="sm" iconRight="chevronRight" disabled={!data.nextCursor} onClick={() => data.nextCursor && ctx.go(data.nextCursor)}>
                  Next
                </Btn>
              </div>
            </div>
          </>
        ) : (
          <EmptyState icon="store" title={hasFilters ? 'No stores match' : 'No stores yet'}>
            {hasFilters ? 'Try adjusting your search or filters.' : 'Stores appear here once a merchant installs the app.'}
          </EmptyState>
        )}
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
              <Btn variant="primary" loading={bulkFetcher.state !== 'idle'} onClick={applyBulkPlan}>
                Apply to {sel.size} stores
              </Btn>
            </>
          }
        >
          <div className="stack-2">
            {data.planTiers.map((p) => (
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
    </div>
  );
}
