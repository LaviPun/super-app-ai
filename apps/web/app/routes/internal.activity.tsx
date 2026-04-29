import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useFetcher, useRevalidator } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  Page, Card, BlockStack, Text, Badge, InlineStack, Modal, Box,
  TextField, Select, Button, SkeletonBodyText, Spinner,
} from '@shopify/polaris';
import { ActivityLogService } from '~/services/activity/activity.service';
import { InternalTruncateCell } from '~/components/InternalTruncateCell';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;
  const page = parseCursorParams(url, 150);

  const service = new ActivityLogService();
  const [logs, distinctActions] = await Promise.all([
    service.list({ actor, action, search, dateFrom, dateTo, take: page.take, cursorId: page.cursor?.id, correlationId }),
    service.getDistinctActions(),
  ]);
  const nextCursorHref = buildNextCursorUrl(url, logs, page.take);

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
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    distinctActions,
    filters: { actor, action, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
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
  details: string | null;
  detailsJson: string | null;
  detailsRaw: string | null;
  ip: string | null;
  createdAt: string;
};

const ACTIVITY_TRUNCATE = 200;

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

function ActivityCodeWithExpand({ value }: { value: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (value == null || value === '') return <Text as="p" variant="bodySm" tone="subdued">—</Text>;
  const isLong = value.length > ACTIVITY_TRUNCATE;
  const preview = isLong && !expanded ? value.slice(0, ACTIVITY_TRUNCATE) + '\n…' : value;
  return (
    <BlockStack gap="200">
      <pre className={expanded ? 'internal-code-block internal-code-block-expanded' : 'internal-code-block'}>{preview}</pre>
      {isLong && (
        <Button size="slim" variant="plain" onClick={() => setExpanded(e => !e)}>{expanded ? 'Collapse' : 'Expand'}</Button>
      )}
    </BlockStack>
  );
}

function ActivityDetailContent({ d }: { d: ActivityDetailData }) {
  const detailSections: { label: string; value: string }[] = [];
  if (d.detailsJson) {
    try {
      const parsed = JSON.parse(d.detailsJson) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, val] of Object.entries(parsed)) {
          detailSections.push({
            label: key,
            value: typeof val === 'string' ? val : JSON.stringify(val, null, 2),
          });
        }
      } else {
        detailSections.push({ label: 'Details (JSON)', value: d.detailsJson });
      }
    } catch {
      detailSections.push({ label: 'Details (JSON)', value: d.detailsJson });
    }
  } else if (d.detailsRaw) {
    detailSections.push({ label: 'Details (raw)', value: d.detailsRaw });
  }

  return (
    <BlockStack gap="400">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        <div><Text as="p" variant="bodySm" fontWeight="semibold">Time</Text><Text as="p" variant="bodySm" tone="subdued">{new Date(d.createdAt).toLocaleString()}</Text></div>
        <div><Text as="p" variant="bodySm" fontWeight="semibold">Actor</Text><Text as="p" variant="bodySm" tone="subdued">{d.actor}</Text></div>
        <div><Text as="p" variant="bodySm" fontWeight="semibold">Action</Text><Text as="p" variant="bodySm" tone="subdued">{d.action}</Text></div>
        <div><Text as="p" variant="bodySm" fontWeight="semibold">Resource</Text><Text as="p" variant="bodySm" tone="subdued">{d.resource ?? '—'}</Text></div>
        <div><Text as="p" variant="bodySm" fontWeight="semibold">Store</Text><Text as="p" variant="bodySm" tone="subdued">{d.shopDomain ?? '—'}</Text></div>
        {d.ip && <div><Text as="p" variant="bodySm" fontWeight="semibold">IP</Text><Text as="p" variant="bodySm" tone="subdued">{d.ip}</Text></div>}
      </div>
      {detailSections.length > 0 && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" fontWeight="semibold">Payload / details</Text>
          {detailSections.map(({ label, value }) => (
            <div key={label} style={activityQuadrantStyle}>
              <Text as="p" variant="bodySm" fontWeight="semibold">{label}</Text>
              <div style={activityQuadrantScrollStyle}>
                <ActivityCodeWithExpand value={value} />
              </div>
            </div>
          ))}
        </BlockStack>
      )}
      {d.details != null && d.details !== '' && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm" fontWeight="semibold">Raw JSON</Text>
          <div style={activityQuadrantStyle}>
            <div style={activityQuadrantScrollStyle}>
              <ActivityCodeWithExpand value={d.details} />
            </div>
          </div>
        </BlockStack>
      )}
    </BlockStack>
  );
}

export default function InternalActivity() {
  const { logs, distinctActions, filters, nextCursorHref, pageSize } = useLoaderData<typeof loader>();
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
      subtitle={`${logs.length} entries · every page open, click, request outcome, settings change · refreshes every 5s`}
      primaryAction={{ content: 'Refresh', onAction: () => revalidator.revalidate(), loading: revalidator.state === 'loading' }}
      fullWidth
    >
      <div style={{ width: '100%', maxWidth: '100%' }}>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Filters</Text>
            <Text as="p" variant="bodySm" tone="subdued">Activity log covers everything: page opened, button/link clicks, settings changes, request success/error. Filter by actor, action, search, and date range.</Text>
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
                <div style={{ minWidth: 220 }}>
                  <TextField
                    label="Correlation ID"
                    name="correlationId"
                    value={filters.correlationId ?? ''}
                    onChange={(v) => {
                      const p = new URLSearchParams(params);
                      if (v) p.set('correlationId', v); else p.delete('correlationId');
                      setParams(p);
                    }}
                    autoComplete="off"
                    placeholder="req_… / corr_…"
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
                <Button submit variant="primary" loading={isLoading}>Apply filters</Button>
                <Button url="/internal/activity" variant="secondary">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Activity entries</Text>
            {isLoading ? (
              <SkeletonBodyText lines={8} />
            ) : logs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No activity recorded yet.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Actions will appear here as users interact with the app. Widen the date range or clear filters to see more.</Text>
              </BlockStack>
            ) : (
              <Box paddingBlockEnd="200">
                <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Time</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Actor</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Action</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Resource</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Store</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Details</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Correlation</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600, width: 140 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px 12px' }}>{new Date(l.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '6px 12px' }}><Badge tone={toneForActor(l.actor)}>{l.actor}</Badge></td>
                        <td style={{ padding: '6px 12px' }}>{l.action}</td>
                        <td style={{ padding: '6px 12px' }}>
                          <InternalTruncateCell value={l.resource} maxLength={60} maxWidthPx={200} />
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          <InternalTruncateCell value={l.shopDomain} maxLength={40} maxWidthPx={160} />
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          <InternalTruncateCell value={l.details} maxLength={80} maxWidthPx={240} tone="subdued" />
                        </td>
                        <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                          <InternalTruncateCell value={l.correlationId ?? '—'} maxLength={20} maxWidthPx={140} />
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          <InlineStack gap="100">
                            <Button size="slim" variant="secondary" onClick={() => setSelectedId(l.id)}>View</Button>
                            {l.correlationId ? (
                              <Button size="slim" variant="plain" url={`/internal/trace/${encodeURIComponent(l.correlationId)}`}>Trace</Button>
                            ) : null}
                          </InlineStack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </Box>
            )}
            <InlineStack gap="200" align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm" tone="subdued">
                Showing {logs.length} of up to {pageSize} per page.
              </Text>
              {nextCursorHref ? (
                <Button url={nextCursorHref} variant="secondary">Load more</Button>
              ) : null}
            </InlineStack>
          </BlockStack>
        </Card>
        </BlockStack>
      </div>

      <Modal
        open={selectedId != null}
        onClose={() => setSelectedId(null)}
        title="Activity detail"
        secondaryActions={[{ content: 'Close', onAction: () => setSelectedId(null) }]}
      >
        <Modal.Section>
          {fetcher.state === 'loading' && !detailData ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="span" tone="subdued">Loading…</Text>
            </InlineStack>
          ) : detailData ? (
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <ActivityDetailContent d={detailData} />
            </div>
          ) : fetcher.data === undefined && fetcher.state === 'idle' ? null : (
            <Text as="p" tone="critical">Failed to load activity.</Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
