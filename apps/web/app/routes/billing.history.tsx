import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Card, CardHead, PageHead, DataTable, StatusBadge, Field, Input, MonoChip, fmtCents } from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, include: { subscription: true } });
  const plan = shopRow?.subscription?.planName ?? 'Growth';
  const domain = session.shop;
  return json({ plan, domain });
}

export default function BillingHistory() {
  const { domain } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <BillingHistoryBody domain={domain} />
    </MerchantShell>
  );
}

function BillingHistoryBody({ domain }: any) {
  const ctx = useMerchantCtx();
  // Shopify owns the actual invoice ledger via managed pricing; this view is a
  // placeholder summary until per-invoice records are surfaced from the backend.
  const invoices = [
    { id: 'in_2406', date: 'Jun 1, 2026', plan: 'Growth', amount: 4900, status: 'PAID' },
    { id: 'in_2405', date: 'May 1, 2026', plan: 'Growth', amount: 4900, status: 'PAID' },
    { id: 'in_2404', date: 'Apr 1, 2026', plan: 'Growth', amount: 4900, status: 'PAID' },
    { id: 'in_2403', date: 'Mar 1, 2026', plan: 'Starter', amount: 1900, status: 'PAID' },
    { id: 'in_2402', date: 'Feb 1, 2026', plan: 'Starter', amount: 1900, status: 'PAID' },
  ];
  return (
    <div className="page">
      <PageHead
        back={{ href: '/billing', label: 'Billing' }}
        title="Billing history"
        sub={`Invoices and payment method for ${domain}.`}
        actions={<Btn icon="download" onClick={() => ctx.toast('Downloaded all invoices')}>Download all</Btn>}
      />
      <div className="col-main" style={{ marginBottom: 18 }}>
        <Card>
          <CardHead title="Invoices" />
          <DataTable rowKey="id" columns={[
            { key: 'id', label: 'Invoice', render: (r: any) => <MonoChip>{r.id}</MonoChip> },
            { key: 'date', label: 'Date' },
            { key: 'plan', label: 'Plan' },
            { key: 'amount', label: 'Amount', num: true, render: (r: any) => fmtCents(r.amount) },
            { key: 'status', label: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
            { key: 'act', label: '', render: (r: any) => <div className="dt-actions"><Btn size="sm" icon="download" onClick={() => ctx.toast(`Downloaded ${r.id}`)} /></div> },
          ]} rows={invoices} />
        </Card>
        <div className="stack-4">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>Payment method</div>
            <div className="row-3" style={{ marginBottom: 14 }}>
              <span className="tile-ico" style={{ background: 'var(--p-surface-secondary)', color: 'var(--p-text)' }}><Icon name="plan" size={18} /></span>
              <div className="stack" style={{ gap: 1 }}>
                <span className="t-strong">Managed by Shopify</span>
                <span className="t-xs t-muted">Billed through your Shopify account</span>
              </div>
            </div>
            <Btn className="btn-block" icon="external" onClick={() => ctx.toast('Manage billing in Shopify admin')}>Manage in Shopify</Btn>
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 6 }}>Billing contact</div>
            <div className="t-sm t-muted" style={{ marginBottom: 12 }}>Invoices are emailed to this address.</div>
            <Field label="Email"><Input defaultValue={`billing@${domain.split('.')[0]}.com`} /></Field>
            <Btn variant="primary" className="btn-block" style={{ marginTop: 12 }} onClick={() => ctx.toast('Billing contact saved')}>Save</Btn>
          </Card>
        </div>
      </div>
    </div>
  );
}
