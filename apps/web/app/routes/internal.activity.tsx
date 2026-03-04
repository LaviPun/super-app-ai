import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useFetcher, useRevalidator } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  Page, Card, BlockStack, Text, Badge, InlineStack, Modal, Box,
  TextField, Select, Button, SkeletonBodyText, Spinner,
} from '@shopify/polaris';
import { ActivityLogService } from '~/services/activity/activity.service';
import { requireInternalAdmin } from '~/internal-admin/session.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const service = new ActivityLogService();
  const [logs, distinctActions] = await Promise.all([
    service.list({ actor, action, search, dateFrom, dateTo, take: 300 }),
    service.getDistinctActions(),
  ]);

  return json({
    logs: logs.map(l => ({
      id: l.id,
      actor: l.actor,
      action: l.action,
      resource: l.resource,
      shopDomain: l.shop?.shopDomain ?? null,
      details: l.details,
      ip: l.ip,
      createdAt: l.createdAt.toISOString(),
    })),
    distinctActions,
    filters: { actor, action, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
  });
}

const ACTOR_OPTIONS = [
  { label: 'All actors', value: '' },
  { label: 'System', value: 'SYSTEM' },
  { label: 'Merchant', value: 'MERCHANT' },
  { label: 'Internal Admin', value: 'INTERNAL_ADMIN' },
  { label: 'Webhook', value: 'WEBHOOK' },
  { label: 'Cron', value: 'CRON' },
];

function toneForActor(actor: string) {
  switch (actor) {
    case 'SYSTEM': return 'info' as const;
    case 'MERCHANT': return 'success' as const;
    case 'INTERNAL_ADMIN': return 'warning' as const;
    case 'WEBHOOK': return 'attention' as const;
    default: return 'info' as const;
  }
}

type ActivityDetailData = {
  id: string;
  actor: string;
  action: string;
  resource: string | null;
  shopDomain: string | null;
  detailsJson: string | null;
  detailsRaw: string | null;
  ip: string | null;
  createdAt: string;
};

const activityPreStyle = {
  margin: 0,
  padding: 12,
  background: 'var(--p-color-bg-surface-secondary)',
  borderRadius: 8,
  fontSize: 12,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
};

const activityQuadrantStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  padding: 12,
  background: 'var(--p-color-bg-surface-secondary)',
  borderRadius: 8,
};
const activityQuadrantScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
};

function ActivityDetailContent({ d }: { d: ActivityDetailData }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 16, height: 420, maxHeight: '55vh' }}>
      {/* Top left: Body / Details (JSON) */}
      <div style={activityQuadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Request / Body (JSON)</Text>
        <div style={activityQuadrantScrollStyle}>
          {d.detailsJson ? <pre style={activityPreStyle}>{d.detailsJson}</pre> : <Text as="p" variant="bodySm" tone="subdued">—</Text>}
        </div>
      </div>
      {/* Right top: Details */}
      <div style={activityQuadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Details</Text>
        <div style={activityQuadrantScrollStyle}>
          <BlockStack gap="100">
            <Text as="p" variant="bodySm"><strong>Time</strong>: {new Date(d.createdAt).toLocaleString()}</Text>
            <Text as="p" variant="bodySm"><strong>Actor</strong>: {d.actor}</Text>
            <Text as="p" variant="bodySm"><strong>Action</strong>: {d.action}</Text>
            <Text as="p" variant="bodySm"><strong>Resource</strong>: {d.resource ?? '—'}</Text>
            <Text as="p" variant="bodySm"><strong>Store</strong>: {d.shopDomain ?? '—'}</Text>
            {d.ip && <Text as="p" variant="bodySm"><strong>IP</strong>: {d.ip}</Text>}
          </BlockStack>
        </div>
      </div>
      {/* Left bottom: Response / Details (raw) */}
      <div style={activityQuadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Response / Details (raw)</Text>
        <div style={activityQuadrantScrollStyle}>
          {d.detailsRaw ? <pre style={activityPreStyle}>{d.detailsRaw}</pre> : <Text as="p" variant="bodySm" tone="subdued">—</Text>}
        </div>
      </div>
      {/* Right bottom: Additional meta */}
      <div style={activityQuadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Additional meta</Text>
        <div style={activityQuadrantScrollStyle}>
          <Text as="p" variant="bodySm" tone="subdued">—</Text>
        </div>
      </div>
    </div>
  );
}

export default function InternalActivity() {
  const { logs, distinctActions, filters } = useLoaderData<typeof loader>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetcher = useFetcher<ActivityDetailData>();
  const revalidator = useRevalidator();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (selectedId) fetcher.load(`/internal/activity/${selectedId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load when selectedId changes
  }, [selectedId]);

  useEffect(() => {
    const id = setInterval(() => revalidator.revalidate(), 5000);
    return () => clearInterval(id);
  }, [revalidator]);

  const detailData = fetcher.data;

  const actionOptions = [
    { label: 'All actions', value: '' },
    ...distinctActions.map(a => ({ label: a, value: a })),
  ];

  return (
    <Page
      title="Activity log"
      subtitle={`${logs.length} entries · refreshes every 5s`}
      primaryAction={{ content: 'Refresh', onAction: () => revalidator.revalidate(), loading: revalidator.state === 'loading' }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 160 }}>
                  <Select
                    label="Actor"
                    name="actor"
                    options={ACTOR_OPTIONS}
                    value={filters.actor ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('actor', v); else p.delete('actor');
                      setParams(p);
                    }}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <Select
                    label="Action"
                    name="action"
                    options={actionOptions}
                    value={filters.action ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('action', v); else p.delete('action');
                      setParams(p);
                    }}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField
                    label="Search"
                    name="q"
                    value={filters.search ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('q', v); else p.delete('q');
                      setParams(p);
                    }}
                    autoComplete="off"
                    placeholder="Search resource, details..."
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField
                    label="Date from"
                    name="dateFrom"
                    type="date"
                    value={filters.dateFrom ? filters.dateFrom.split('T')[0] : ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('dateFrom', v); else p.delete('dateFrom');
                      setParams(p);
                    }}
                    autoComplete="off"
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField
                    label="Date to"
                    name="dateTo"
                    type="date"
                    value={filters.dateTo ? filters.dateTo.split('T')[0] : ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('dateTo', v); else p.delete('dateTo');
                      setParams(p);
                    }}
                    autoComplete="off"
                  />
                </div>
                <Button submit loading={isLoading}>Apply filters</Button>
                <Button url="/internal/activity" variant="plain">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Activity entries ({logs.length})</Text>
            {isLoading ? (
              <SkeletonBodyText lines={8} />
            ) : logs.length === 0 ? (
              <Text as="p" tone="subdued">No activity recorded yet. Actions will appear here as users interact with the app.</Text>
            ) : (
              <Box paddingBlockEnd="400">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--p-color-border)', textAlign: 'left' }}>
                      <th style={{ padding: 12, fontWeight: 600 }}>Time</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Actor</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Action</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Resource</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Store</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Details</th>
                      <th style={{ padding: 12, fontWeight: 600, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                        <td style={{ padding: 12 }}>{new Date(l.createdAt).toLocaleString()}</td>
                        <td style={{ padding: 12 }}><Badge tone={toneForActor(l.actor)}>{l.actor}</Badge></td>
                        <td style={{ padding: 12 }}>{l.action}</td>
                        <td style={{ padding: 12, wordBreak: 'break-all' }}>{l.resource ?? '—'}</td>
                        <td style={{ padding: 12 }}>{l.shopDomain ?? '—'}</td>
                        <td style={{ padding: 12 }}>
                          {l.details ? (
                            <Text as="span" variant="bodySm" tone="subdued">
                              {l.details.length > 80 ? l.details.slice(0, 80) + '...' : l.details}
                            </Text>
                          ) : '—'}
                        </td>
                        <td style={{ padding: 12 }}>
                          <Button type="button" size="slim" variant="plain" onClick={() => setSelectedId(l.id)}>View</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Box>
            )}
          </BlockStack>
        </Card>
      </BlockStack>

      <Modal
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
        title="Activity detail"
        large
      >
        <Modal.Section>
          {fetcher.state === 'loading' && !detailData ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="span" tone="subdued">Loading…</Text>
            </InlineStack>
          ) : detailData ? (
            <Box maxHeight="70vh" overflowY="auto">
              <ActivityDetailContent d={detailData} />
            </Box>
          ) : fetcher.data === undefined && fetcher.state === 'idle' ? null : (
            <Text as="p" tone="critical">Failed to load activity.</Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
