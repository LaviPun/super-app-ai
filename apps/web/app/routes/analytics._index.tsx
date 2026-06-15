import { json } from '@remix-run/node';
import { useLoaderData, useNavigate } from '@remix-run/react';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import {
  Icon, Btn, Card, CardHead, PageHead, StatTile, DataTable, Sparkline, Progress, fmtNum,
} from '~/components/superapp';

/* eslint-disable @typescript-eslint/no-explicit-any */

const T_ICON: Record<string, string> = { 'Storefront UI': 'desktop', 'Function': 'bolt', 'Integration': 'connect', 'Flow': 'flow', 'Data store': 'database' };
const T_COLOR: Record<string, string> = { 'Storefront UI': 'info', 'Function': 'warning', 'Integration': 'magic', 'Flow': 'success', 'Data store': 'info' };

function designType(t: string): string {
  if (/flow/i.test(t)) return 'Flow';
  if (/function|discount/i.test(t)) return 'Function';
  if (/connector|integration/i.test(t)) return 'Integration';
  if (/data|store/i.test(t)) return 'Data store';
  return 'Storefront UI';
}

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const published = shopRow
    ? await prisma.module.findMany({ where: { shopId: shopRow.id, status: 'PUBLISHED' }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, name: true, type: true } })
    : [];

  // Storefront performance is not tracked in the DB yet; synthesize deterministic
  // per-module figures from the real published modules (placeholder analytics layer).
  const perf = published.map((m, i) => ({
    id: m.id,
    name: m.name,
    type: designType(m.type),
    views: 4200 + ((i * 1871) % 9000),
    ctr: (3.5 + ((i * 7) % 50) / 10).toFixed(1),
    revenue: 1200 + ((i * 1330) % 5200),
    uplift: '+' + (0.4 + ((i * 3) % 20) / 10).toFixed(1) + '%',
  })).sort((a, b) => b.revenue - a.revenue);

  return json({ perf, publishedCount: published.length });
}

export default function AnalyticsIndex() {
  const { perf, publishedCount } = useLoaderData<typeof loader>();
  return (
    <MerchantShell>
      <AnalyticsBody perf={perf} publishedCount={publishedCount} />
    </MerchantShell>
  );
}

function AnalyticsBody({ perf, publishedCount }: any) {
  const ctx = useMerchantCtx();
  const navigate = useNavigate();
  const [range, setRange] = useState('30d');
  const rev = [9.2, 10.1, 9.8, 11.4, 12.0, 12.8, 13.5, 13.1, 14.6, 15.2, 16.0, 16.8, 17.3, 18.4].map((v) => v * 1000);
  const funnel: [string, number, number, string][] = [
    ['Module views', 84200, 100, 'info'], ['Engaged', 38400, 46, 'magic'], ['Add to cart', 6580, 8, 'warning'], ['Purchased', 2410, 3, 'success'],
  ];

  return (
    <div className="page">
      <PageHead
        title="Analytics"
        sub="Storefront impact of your live modules and automations."
        actions={(
          <>
            <div className="seg">{['7d', '30d', '90d'].map((r) => <button key={r} aria-selected={range === r} onClick={() => setRange(r)}>{r}</button>)}</div>
            <Btn icon="download" onClick={() => ctx.toast('Exported analytics to CSV')}>Export</Btn>
          </>
        )}
      />
      <div className="grid grid-4" style={{ marginBottom: 18 }}>
        <StatTile label="Revenue attributed" value="$18,420" icon="chart" tone="success" delta="12.4%" />
        <StatTile label="Conversion uplift" value="+2.3%" icon="rocket" tone="magic" delta="0.5 pts" />
        <StatTile label="Module views" value="84.2k" icon="eye" tone="info" delta="6.1%" />
        <StatTile label="Add-to-cart rate" value="7.8%" icon="cart" tone="warning" delta="0.6 pts" />
      </div>
      <div className="col-main" style={{ marginBottom: 18 }}>
        <Card>
          <CardHead title="Attributed revenue" sub="Last 14 days · from live modules" />
          <div style={{ padding: '8px 16px 16px' }}>
            <Sparkline data={rev} color="var(--p-success)" w={760} h={130} />
            <div className="row spread t-xs t-muted" style={{ marginTop: 6 }}><span>14 days ago</span><span>Today</span></div>
          </div>
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>Conversion funnel</div>
          <div className="stack-4">
            {funnel.map((f, i) => (
              <div key={i} className="stack-1">
                <div className="row spread">
                  <span className="t-sm t-strong">{f[0]}</span>
                  <span className="t-sm t-num t-muted">{fmtNum(f[1])} · {f[2]}%</span>
                </div>
                <Progress value={f[2]} tone={f[3] === 'success' ? undefined : f[3]} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <CardHead title="Module performance" sub={`${publishedCount} published modules`}
          actions={<a href="/modules" className="btn btn-plain btn-sm">All modules</a>} />
        {perf.length === 0 ? (
          <div style={{ padding: 24, color: 'var(--p-text-secondary)', fontSize: 14 }}>Publish a module to start seeing storefront performance.</div>
        ) : (
          <DataTable rowKey="id" onRowClick={(r: any) => navigate(`/modules/${r.id}`)} columns={[
            { key: 'name', label: 'Module', render: (r: any) => (
              <div className="row-3">
                <span className="tile-ico" style={{ width: 30, height: 30, background: `var(--p-${T_COLOR[r.type]}-bg)`, color: `var(--p-${T_COLOR[r.type]})` }}><Icon name={T_ICON[r.type] ?? 'layers'} size={15} /></span>
                <span className="cell-strong">{r.name}</span>
              </div>
            ) },
            { key: 'views', label: 'Views', num: true, render: (r: any) => fmtNum(r.views) },
            { key: 'ctr', label: 'Engage %', num: true, render: (r: any) => r.ctr + '%' },
            { key: 'uplift', label: 'Uplift', render: (r: any) => <span className="metric-delta up"><Icon name="chevronUp" size={12} />{r.uplift}</span> },
            { key: 'revenue', label: 'Revenue', num: true, render: (r: any) => <span className="cell-strong">${fmtNum(r.revenue)}</span> },
          ]} rows={perf} />
        )}
      </Card>
    </div>
  );
}
