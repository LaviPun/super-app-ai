import { json } from '@remix-run/node';
import { useState } from 'react';
import { useLoaderData } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { Icon, Card, PageHead, FilterBar, EmptyState, useTableState, titleCase } from '~/components/superapp';

// Map a raw ActivityLog action to the design's visual "kind".
function activityKind(action: string): string {
  const a = (action || '').toUpperCase();
  if (a.startsWith('MODULE') || a.includes('AI_GENERAT') || a.includes('TEMPLATE')) return 'module';
  if (a.startsWith('FLOW') || a.startsWith('SCHEDULE') || a.startsWith('WORKFLOW')) return 'flow';
  if (a.startsWith('CONNECTOR') || a.startsWith('ENDPOINT')) return 'connector';
  if (a.includes('DATA_STORE') || a.includes('RECORD') || a.includes('WEBHOOK')) return 'data';
  if (a.includes('LOGIN') || a.includes('INVIT') || a.includes('TEAM')) return 'team';
  if (a.includes('ERROR') || a.includes('FAIL') || a.includes('WARNING') || a.includes('GATE')) return 'alert';
  return 'module';
}
function relativeTime(d: Date): string {
  const secs = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000));
  if (secs < 60) return secs + 's ago';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.round(hrs / 24);
  return days === 1 ? 'Yesterday' : days + 'd ago';
}

const ACT_ICON: Record<string, string> = { module: 'layers', flow: 'flow', alert: 'alert', data: 'database', connector: 'connect', team: 'user' };
const ACT_TONE: Record<string, string> = { module: 'info', flow: 'success', alert: 'critical', data: 'info', connector: 'magic', team: 'warning' };

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, select: { id: true } });
  const rows = shop ? await new ActivityLogService().list({ shopId: shop.id, take: 60 }) : [];
  const activity = rows.map((r) => ({
    id: r.id,
    action: r.action,
    resource: r.resource ?? '—',
    actor: r.actor === 'MERCHANT' ? 'You' : titleCase(r.actor),
    kind: activityKind(r.action),
    created: relativeTime(r.createdAt),
  }));
  return json({ activity });
}

export default function ActivityIndex() {
  return (
    <MerchantShell>
      <ActivityBody />
    </MerchantShell>
  );
}

function ActivityBody() {
  const { activity } = useLoaderData<typeof loader>();
  const ts = useTableState();
  const [kind, setKind] = useState('All');
  const kinds = ['All', 'module', 'flow', 'connector', 'data', 'team', 'alert'];
  const rows = activity.filter((a) => (kind === 'All' || a.kind === kind) && (a.action + a.resource + a.actor).toLowerCase().includes(ts.search.toLowerCase()));

  return (
    <div className="page">
      <PageHead
        title="Activity"
        sub="Every change, run and alert across your app — newest first."
      />
      <Card>
        <FilterBar
          search={ts.search} onSearch={ts.setSearch} placeholder="Search activity…" results={rows.length}
          filters={[{ options: kinds.map((k) => ({ value: k, label: k === 'All' ? 'All types' : titleCase(k) })), value: kind, onChange: setKind }]}
        />
        {rows.length === 0 ? (
          <EmptyState icon="live" title={activity.length === 0 ? 'No activity yet' : 'Nothing here'}>
            {activity.length === 0
              ? 'Actions on your store — publishes, flow runs, connector changes — will appear here.'
              : 'No activity matches your filters.'}
          </EmptyState>
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
