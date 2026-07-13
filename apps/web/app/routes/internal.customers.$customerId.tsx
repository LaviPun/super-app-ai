import { json } from '@remix-run/node';
import { prettyName } from '~/utils/pretty-name';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { getPlanConfig } from '~/services/billing/plan-config.service';
import {
  useAdminCtx,
  StoreLink,
  Btn,
  Badge,
  StatusBadge,
  Card,
  KV,
  PageHead,
  StatTile,
  MonoChip,
  fmtNum,
  titleCase,
  storeHealth,
  healthTone,
  healthLabel,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });


const LIFECYCLE: Record<string, string> = { ACTIVE: 'Customer', TRIAL: 'Trialing', CANCELLED: 'Churned', EXPIRED: 'Churned' };

export async function loader({ request, params }: { request: Request; params: { customerId?: string } }) {
  await requireInternalAdmin(request);
  const id = params.customerId;
  if (!id) throw NOT_FOUND;

  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({
    where: { id },
    include: { subscription: true, modules: { select: { status: true } } },
  });
  if (!shop) throw NOT_FOUND;

  const since30d = new Date(Date.now() - 30 * 86400000);
  const [aiUsage, errCount, lastApi, planConfig] = await Promise.all([
    prisma.aiUsage.aggregate({ where: { shopId: shop.id, createdAt: { gte: since30d } }, _sum: { requestCount: true } }),
    prisma.errorLog.count({ where: { shopId: shop.id, level: 'ERROR', createdAt: { gte: since30d } } }),
    prisma.apiLog.findFirst({ where: { shopId: shop.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    getPlanConfig(shop.planTier).catch(() => null),
  ]);

  const status = shop.subscription?.status ?? 'ACTIVE';
  const lifecycle = LIFECYCLE[status] ?? 'Customer';
  const price = planConfig?.price ?? 0;
  const mrr = lifecycle === 'Customer' && price > 0 ? price : 0;
  const published = shop.modules.filter((m) => m.status === 'PUBLISHED').length;

  return json({
    customer: {
      id: shop.id,
      storeId: shop.id,
      name: prettyName(shop.shopDomain),
      store: prettyName(shop.shopDomain),
      domain: shop.shopDomain,
      plan: shop.planTier,
      lifecycle,
      mrr,
      country: '—',
      seats: '—',
      tickets: 0,
      signed: shop.createdAt ? new Date(shop.createdAt).toISOString().slice(0, 10) : '—',
      lastActive: lastApi ? formatRelativeTime(new Date(lastApi.createdAt).toISOString()) : 'No activity',
    },
    store: {
      status,
      domain: shop.shopDomain,
      plan: shop.planTier,
      modules: shop.modules.length,
      published,
      aiCalls30d: aiUsage._sum.requestCount ?? 0,
      errors30d: errCount,
    },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };
const LIFECYCLE_TONE: Record<string, any> = { Customer: 'success', Trialing: 'warning', Churned: 'critical' };

export default function AdminCustomerDetail() {
  const { customer: c, store: s } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();

  // Health from real fields + the store's real 30d ERROR count.
  const errLogs = Array.from({ length: s.errors30d }, () => ({ level: 'ERROR', shop: s.domain }));
  const health = storeHealth(s, errLogs);

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/customers', label: 'Customers' }}
        title={c.name}
        badge={
          <span className="row-2">
            <Badge tone={LIFECYCLE_TONE[c.lifecycle]}>{c.lifecycle}</Badge>
            <Badge tone={PLAN_TONE[c.plan]}>{titleCase(c.plan)}</Badge>
          </span>
        }
        sub={<MonoChip>{c.domain}</MonoChip>}
        actions={
          <Btn variant="primary" icon="store" onClick={() => ctx.go('#/admin/stores/' + c.storeId)}>
            Open store
          </Btn>
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="MRR" value={c.mrr ? '$' + fmtNum(c.mrr) : '$0'} sub={titleCase(c.plan) + ' plan'} icon="chart" tone="success" />
        <StatTile label="Seats" value={c.seats} icon="users" tone="info" />
        <StatTile label="Open tickets" value={c.tickets} icon="chat" tone={c.tickets ? 'warning' : 'success'} />
        <StatTile label="Last active" value={c.lastActive} icon="clock" tone="info" />
      </div>
      <div className="col-main">
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Customer details
          </div>
          <KV
            rows={[
              ['Customer ID', <MonoChip key="id">{c.id}</MonoChip>],
              ['Store', <StoreLink key="s" name={c.store} id={c.storeId} />],
              ['Domain', <MonoChip key="d">{c.domain}</MonoChip>],
              ['Country', c.country],
              ['Plan', <Badge key="p" tone={PLAN_TONE[c.plan]}>{titleCase(c.plan)}</Badge>],
              ['Lifecycle', <Badge key="l" tone={LIFECYCLE_TONE[c.lifecycle]}>{c.lifecycle}</Badge>],
              ['Signed up', c.signed],
            ]}
          />
        </Card>
        <div className="stack-4">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Store snapshot
            </div>
            <KV
              rows={[
                ['Status', <StatusBadge key="st" value={s.status} />],
                ['Modules', s.modules + ' (' + s.published + ' live)'],
                ['AI calls (30d)', fmtNum(s.aiCalls30d)],
                [
                  'Health',
                  <span key="h" style={{ color: 'var(--p-' + healthTone(health) + '-text)' }}>
                    {health} · {healthLabel(health)}
                  </span>,
                ],
              ]}
            />
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Billing
            </div>
            <KV
              rows={[
                ['Plan', <Badge key="p" tone={PLAN_TONE[c.plan]}>{titleCase(c.plan)}</Badge>],
                ['MRR', c.mrr ? '$' + fmtNum(c.mrr) : '$0'],
                ['Billing', c.mrr ? 'Internal override' : 'Free / none'],
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Btn size="sm" icon="plan" onClick={() => ctx.go('#/admin/stores/' + c.storeId)}>
                Manage plan
              </Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
