import { json } from '@remix-run/node';
import { useState } from 'react';
import { useLoaderData } from '@remix-run/react';
import { shopify } from '~/shopify.server';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { MerchantShell } from '~/components/merchant/MerchantShell';
import { EmptyState, MonoChip, humanizeResource, titleCase, type WcTone } from '~/components/merchant/polaris';

// Map a raw ActivityLog action to the design's visual "kind". Falls back to a
// neutral "activity" kind — never mislabel billing/support/etc. as "module".
function activityKind(action: string): string {
  const a = (action || '').toUpperCase();
  if (a.startsWith('MODULE') || a.includes('AI_GENERAT') || a.includes('TEMPLATE')) return 'module';
  if (a.startsWith('FLOW') || a.startsWith('SCHEDULE') || a.startsWith('WORKFLOW')) return 'flow';
  if (a.startsWith('CONNECTOR') || a.startsWith('ENDPOINT')) return 'connector';
  if (a.startsWith('BILLING') || a.includes('SUBSCRIPTION') || a.includes('PLAN')) return 'billing';
  if (a.startsWith('SUPPORT')) return 'support';
  if (a.includes('DATA_STORE') || a.includes('RECORD') || a.includes('WEBHOOK')) return 'data';
  if (a.includes('LOGIN') || a.includes('INVIT') || a.includes('TEAM')) return 'team';
  if (a.includes('ERROR') || a.includes('FAIL') || a.includes('WARNING') || a.includes('GATE')) return 'alert';
  return 'activity';
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

const KIND_TONE: Record<string, WcTone> = { module: 'info', flow: 'success', alert: 'critical', data: 'info', connector: 'info', team: 'warning', billing: 'success', support: 'caution', activity: 'neutral' };

// Operational/telemetry events that read as noise (or nonsense) to a merchant —
// same exclusion the dashboard feed applies.
const NON_MERCHANT_ACTIONS = [
  'PAGE_OPENED', 'PAGE_REFRESHED', 'REQUEST_ERROR', 'SERVER_STARTED',
  'ROUTER_RELEASE_GATE_TRIPPED', 'AI_ASSISTANT_QUERY', 'AI_ASSISTANT_TOOL_CALLED',
];

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);
  const prisma = getPrisma();
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop }, select: { id: true } });
  const rows = shop ? await new ActivityLogService().list({ shopId: shop.id, take: 60, excludeActions: NON_MERCHANT_ACTIONS }) : [];
  const activity = rows.map((r) => ({
    id: r.id,
    action: r.action,
    resource: humanizeResource(r.resource),
    actor: r.actor === 'MERCHANT' ? 'You' : titleCase(r.actor),
    kind: activityKind(r.action),
    created: relativeTime(r.createdAt),
  }));
  return json({ activity });
}

export default function ActivityIndex() {
  return (
    <MerchantShell polaris>
      <ActivityBody />
    </MerchantShell>
  );
}

function ActivityBody() {
  const { activity } = useLoaderData<typeof loader>();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('All');
  const kinds = ['All', 'module', 'flow', 'connector', 'data', 'team', 'alert'];
  const rows = activity.filter((a) => (kind === 'All' || a.kind === kind) && (a.action + (a.resource ?? '') + a.actor).toLowerCase().includes(search.toLowerCase()));

  return (
    <s-page heading="Activity" inlineSize="base">
      <s-paragraph color="subdued">Every change, run and alert across your app — newest first.</s-paragraph>
      {activity.length === 0 ? (
        <s-section>
          <EmptyState icon="live" heading="No activity yet">
            Actions on your store — publishes, flow runs, connector changes — will appear here.
          </EmptyState>
        </s-section>
      ) : (
        <s-section padding="none">
          <s-table>
            <s-grid slot="filters" gridTemplateColumns="1fr auto" gap="small-100">
              <s-search-field
                label="Search activity"
                labelAccessibilityVisibility="exclusive"
                placeholder="Search activity…"
                onInput={(e) => setSearch(e.currentTarget.value ?? '')}
              />
              <s-select
                label="Type"
                labelAccessibilityVisibility="exclusive"
                value={kind}
                onChange={(e) => setKind(e.currentTarget.value)}
              >
                {kinds.map((k) => (
                  <s-option key={k} value={k}>{k === 'All' ? 'All types' : titleCase(k)}</s-option>
                ))}
              </s-select>
            </s-grid>
            <s-table-header-row>
              <s-table-header listSlot="primary">Event</s-table-header>
              <s-table-header>Resource</s-table-header>
              <s-table-header>Actor</s-table-header>
              <s-table-header listSlot="inline">Type</s-table-header>
              <s-table-header listSlot="kicker">When</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rows.map((a) => (
                <s-table-row key={a.id}>
                  <s-table-cell>
                    <s-text type="strong">{titleCase(a.action)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    {a.resource == null ? <s-text color="subdued">—</s-text> : <MonoChip>{a.resource}</MonoChip>}
                  </s-table-cell>
                  <s-table-cell>{a.actor}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={KIND_TONE[a.kind] ?? 'neutral'}>{titleCase(a.kind)}</s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text color="subdued">{a.created}</s-text>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
          {rows.length === 0 && (
            <EmptyState heading="Nothing here">No activity matches your filters.</EmptyState>
          )}
        </s-section>
      )}
    </s-page>
  );
}

export { MerchantErrorBoundary as ErrorBoundary } from '~/components/merchant/MerchantErrorBoundary';
