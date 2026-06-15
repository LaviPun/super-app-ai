import { json } from '@remix-run/node';
import { useState } from 'react';
import { shopify } from '~/shopify.server';
import { MerchantShell, useMerchantCtx } from '~/components/merchant/MerchantShell';
import { Icon, Btn, Card, PageHead, FilterBar, EmptyState, useTableState, titleCase } from '~/components/superapp';

 

// `api.activity` is a POST-only logger (no list endpoint serves merchant
// activity), so the feed uses the design's placeholder activity stream.
const M_ACTIVITY = [
  { id: 'ma_1', action: 'MODULE_PUBLISHED', resource: 'Sticky Add-to-Cart Bar', actor: 'You', kind: 'module', created: '2m ago' },
  { id: 'ma_2', action: 'FLOW_RUN_SUCCEEDED', resource: 'Order → Slack alert', actor: 'System', kind: 'flow', created: '8m ago' },
  { id: 'ma_3', action: 'AI_GENERATED', resource: 'Welcome Popup', actor: 'You', kind: 'module', created: '12m ago' },
  { id: 'ma_4', action: 'CONNECTOR_ERROR', resource: 'Internal WMS — 502', actor: 'System', kind: 'alert', created: '5m ago' },
  { id: 'ma_5', action: 'RECORD_ADDED', resource: 'Product Reviews (+18)', actor: 'Webhook', kind: 'data', created: '1h ago' },
  { id: 'ma_6', action: 'MODULE_REPUBLISHED', resource: 'Bundle Builder v9', actor: 'You', kind: 'module', created: '3h ago' },
  { id: 'ma_7', action: 'USAGE_WARNING', resource: 'AI credits 76% used', actor: 'System', kind: 'alert', created: '5h ago' },
  { id: 'ma_8', action: 'CONNECTOR_CREATED', resource: 'Klaviyo', actor: 'You', kind: 'connector', created: 'Yesterday' },
  { id: 'ma_9', action: 'FLOW_RUN_FAILED', resource: 'Low stock → WMS sync', actor: 'System', kind: 'alert', created: 'Yesterday' },
  { id: 'ma_10', action: 'TEAM_INVITED', resource: 'cory@aurorathreads.com', actor: 'You', kind: 'team', created: '2d ago' },
];
const ACT_ICON: Record<string, string> = { module: 'layers', flow: 'flow', alert: 'alert', data: 'database', connector: 'connect', team: 'user' };
const ACT_TONE: Record<string, string> = { module: 'info', flow: 'success', alert: 'critical', data: 'info', connector: 'magic', team: 'warning' };

export async function loader({ request }: { request: Request }) {
  await shopify.authenticate.admin(request);
  return json({ activity: M_ACTIVITY });
}

export default function ActivityIndex() {
  return (
    <MerchantShell>
      <ActivityBody />
    </MerchantShell>
  );
}

function ActivityBody() {
  const ctx = useMerchantCtx();
  const ts = useTableState();
  const [kind, setKind] = useState('All');
  const kinds = ['All', 'module', 'flow', 'connector', 'data', 'team', 'alert'];
  const rows = M_ACTIVITY.filter((a) => (kind === 'All' || a.kind === kind) && (a.action + a.resource + a.actor).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Activity"
        sub="Every change, run and alert across your app — newest first."
        actions={<Btn icon="check" onClick={() => ctx.toast('All notifications marked read')}>Mark all read</Btn>}
      />
      <Card>
        <FilterBar
          search={ts.search} onSearch={ts.setSearch} placeholder="Search activity…" results={rows.length}
          filters={[{ options: kinds.map((k) => ({ value: k, label: k === 'All' ? 'All types' : titleCase(k) })), value: kind, onChange: setKind }]}
        />
        {rows.length === 0 ? (
          <EmptyState icon="live" title="Nothing here">No activity matches your filters.</EmptyState>
        ) : (
          <div className="rlist">
            {rows.map((a) => (
              <div key={a.id} className="ritem">
                <span className="tile-ico" style={{ width: 32, height: 32, background: `var(--p-${ACT_TONE[a.kind]}-bg)`, color: `var(--p-${ACT_TONE[a.kind]})` }}>
                  <Icon name={ACT_ICON[a.kind] || 'live'} size={16} />
                </span>
                <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                  <span className="t-sm t-strong">{titleCase(a.action)}</span>
                  <span className="t-xs t-muted t-trunc">{a.resource} · {a.actor}</span>
                </div>
                <span className="t-xs t-muted" style={{ whiteSpace: 'nowrap' }}>{a.created}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
