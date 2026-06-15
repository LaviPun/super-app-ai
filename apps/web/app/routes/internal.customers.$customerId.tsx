import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
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
  CUSTOMERS,
  STORES,
  storeHealth,
  healthTone,
  healthLabel,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { customerId?: string } }) {
  await requireInternalAdmin(request);
  const c = CUSTOMERS.find((x) => x.id === params.customerId) ?? CUSTOMERS[0];
  const s = STORES.find((x) => x.id === c.storeId) ?? null;
  return json({ customer: c, store: s });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const PLAN_TONE: Record<string, any> = { FREE: undefined, STARTER: 'info', GROWTH: 'success', PRO: 'magic', ENTERPRISE: 'warning' };
const LIFECYCLE_TONE: Record<string, any> = { Customer: 'success', Trialing: 'warning', Churned: 'critical' };

export default function AdminCustomerDetail() {
  const { customer: c, store: s } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();

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
        sub={
          <a href={'mailto:' + c.email} className="cell-link">
            {c.email}
          </a>
        }
        actions={
          <>
            <Btn icon="mail" onClick={() => ctx.toast('Drafting email to ' + c.email)}>
              Email
            </Btn>
            <Btn variant="primary" icon="store" onClick={() => ctx.go('#/admin/stores/' + c.storeId)}>
              Open store
            </Btn>
          </>
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
              ['Name', c.name],
              ['Email', <a key="e" href={'mailto:' + c.email} className="cell-link">{c.email}</a>],
              ['Store', <StoreLink key="s" name={c.store} id={c.storeId} />],
              ['Domain', <MonoChip key="d">{c.domain}</MonoChip>],
              ['Country', c.country],
              ['Plan', <Badge key="p" tone={PLAN_TONE[c.plan]}>{titleCase(c.plan)}</Badge>],
              ['Signed up', c.signed],
            ]}
          />
        </Card>
        <div className="stack-4">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Store snapshot
            </div>
            {s ? (
              <KV
                rows={[
                  ['Status', <StatusBadge key="st" value={s.status} />],
                  ['Modules', s.modules + ' (' + s.published + ' live)'],
                  ['AI calls (30d)', fmtNum(s.aiCalls30d)],
                  [
                    'Health',
                    <span key="h" style={{ color: 'var(--p-' + healthTone(storeHealth(s)) + '-text)' }}>
                      {storeHealth(s)} · {healthLabel(storeHealth(s))}
                    </span>,
                  ],
                ]}
              />
            ) : (
              <span className="t-muted t-sm">Store not found</span>
            )}
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
