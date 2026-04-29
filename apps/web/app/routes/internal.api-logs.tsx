import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useFetcher, useRevalidator } from '@remix-run/react';
import { useEffect, useState } from 'react';
import {
  Page, Card, BlockStack, Text, Badge, InlineStack, Modal, Box,
  TextField, Select, Button, SkeletonBodyText, Spinner,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { InternalTruncateCell } from '~/components/InternalTruncateCell';
import { getPrisma } from '~/db.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';
import type { Prisma } from '@prisma/client';

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const statusFilter = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: Prisma.ApiLogWhereInput = {};
  if (actor) where.actor = actor;
  if (statusFilter === 'running') {
    where.finishedAt = null;
    where.status = 0;
  } else if (statusFilter === 'success') where.success = true;
  else if (statusFilter === 'error') where.success = false;
  if (search) {
    where.OR = [
      { path: { contains: search } },
      { method: { contains: search } },
    ];
  }
  if (correlationId) where.correlationId = correlationId;
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }
  const page = parseCursorParams(url, 150);

  const logs = await prisma.apiLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: page.take,
    skip: page.skip,
    cursor: page.cursor,
    include: { shop: true },
  });
  const nextCursorHref = buildNextCursorUrl(url, logs, page.take);

  return json({
    logs: logs.map(l => ({
      id: l.id,
      actor: l.actor,
      method: l.method,
      path: l.path,
      status: l.status,
      durationMs: l.durationMs,
      shopDomain: l.shop?.shopDomain ?? null,
      createdAt: l.createdAt.toISOString(),
      finishedAt: l.finishedAt?.toISOString() ?? null,
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    filters: { actor, status: statusFilter, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

const ACTOR_OPTIONS = [
  { label: 'All actors', value: '' },
  { label: 'Internal', value: 'INTERNAL' },
  { label: 'Merchant', value: 'MERCHANT' },
  { label: 'Webhook', value: 'WEBHOOK' },
  { label: 'App Proxy', value: 'APP_PROXY' },
];

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Error', value: 'error' },
];

type ApiLogDetailData = {
  id: string;
  actor: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string | null;
  correlationId: string | null;
  success: boolean;
  shopDomain: string | null;
  createdAt: string;
  requestBody: string | null;
  requestHeaders: Record<string, string> | null;
  responseBody: string | null;
  metaRest: Record<string, unknown> | null;
};

const TRUNCATE_LENGTH = 200;

const quadrantStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'hidden',
  padding: 12,
  background: 'var(--p-color-bg-surface-secondary)',
  borderRadius: 8,
};
const quadrantScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
};

function CodeBlockWithExpand({ value }: { value: string | Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  if (value == null || value === '') return <Text as="p" variant="bodySm" tone="subdued">—</Text>;
  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
  const isLong = str.length > TRUNCATE_LENGTH;
  const preview = isLong && !expanded ? str.slice(0, TRUNCATE_LENGTH) + '\n…' : str;
  return (
    <BlockStack gap="200">
      <pre className={expanded ? 'internal-code-block internal-code-block-expanded' : 'internal-code-block'}>{preview}</pre>
      {isLong && (
        <Button size="slim" variant="plain" onClick={() => setExpanded(e => !e)}>{expanded ? 'Collapse' : 'Expand'}</Button>
      )}
    </BlockStack>
  );
}

function ApiLogDetailContent({ d }: { d: ApiLogDetailData }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 16, height: 420, maxHeight: '55vh' }}>
      {/* Top left: Request body */}
      <div style={quadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Request body</Text>
        <div style={quadrantScrollStyle}>
          <CodeBlockWithExpand value={d.requestBody} />
        </div>
      </div>
      {/* Right top: Details */}
      <div style={quadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Details</Text>
        <div style={quadrantScrollStyle}>
          <BlockStack gap="100">
            <Text as="p" variant="bodySm"><strong>Time</strong>: {new Date(d.createdAt).toLocaleString()}</Text>
            <Text as="p" variant="bodySm"><strong>Method</strong>: {d.method}</Text>
            <Text as="p" variant="bodySm"><strong>Path</strong>: {d.path}</Text>
            <Text as="p" variant="bodySm"><strong>Status</strong>: {d.status}</Text>
            <Text as="p" variant="bodySm"><strong>Duration</strong>: {d.durationMs} ms</Text>
            <Text as="p" variant="bodySm"><strong>Success</strong>: {d.success ? 'Yes' : 'No'}</Text>
            {d.requestId && <Text as="p" variant="bodySm"><strong>Request ID</strong>: <code>{d.requestId}</code></Text>}
            {d.correlationId && (
              <InlineStack gap="200" blockAlign="center">
                <Text as="p" variant="bodySm"><strong>Correlation</strong>: <code>{d.correlationId}</code></Text>
                <Button size="slim" variant="plain" url={`/internal/trace/${encodeURIComponent(d.correlationId)}`}>Open trace</Button>
              </InlineStack>
            )}
            <Text as="p" variant="bodySm"><strong>Actor</strong>: {d.actor}</Text>
            <Text as="p" variant="bodySm"><strong>Store</strong>: {d.shopDomain ?? '—'}</Text>
            {d.requestHeaders != null && Object.keys(d.requestHeaders).length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>Request headers</summary>
                <pre className="internal-code-block" style={{ marginTop: 4 }}>{JSON.stringify(d.requestHeaders, null, 2)}</pre>
              </details>
            )}
          </BlockStack>
        </div>
      </div>
      {/* Left bottom: Response body */}
      <div style={quadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Response body</Text>
        <div style={quadrantScrollStyle}>
          <CodeBlockWithExpand value={d.responseBody} />
        </div>
      </div>
      {/* Right bottom: Additional meta */}
      <div style={quadrantStyle}>
        <Text as="h3" variant="headingSm" fontWeight="semibold">Additional meta</Text>
        <div style={quadrantScrollStyle}>
          {d.metaRest && Object.keys(d.metaRest).length > 0 ? (
            <CodeBlockWithExpand value={d.metaRest} />
          ) : (
            <Text as="p" variant="bodySm" tone="subdued">—</Text>
          )}
        </div>
      </div>
    </div>
  );
}

type LiveLog = {
  id: string;
  actor: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  success: boolean;
  shopDomain: string | null;
  createdAt: string;
  correlationId: string | null;
  requestId: string | null;
};

const LIVE_TAIL_MAX = 50;

export default function InternalApiLogs() {
  const { logs, filters, nextCursorHref, pageSize } = useLoaderData<typeof loader>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetcher = useFetcher<ApiLogDetailData>();
  const revalidator = useRevalidator();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();
  const [liveTail, setLiveTail] = useState(false);
  const [liveLogs, setLiveLogs] = useState<LiveLog[]>([]);

  useEffect(() => {
    if (selectedId) fetcher.load(`/internal/api-logs/${selectedId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load when selectedId changes
  }, [selectedId]);

  useEffect(() => {
    if (liveTail) return; // Live tail replaces polling.
    const id = setInterval(() => revalidator.revalidate(), 5000);
    return () => clearInterval(id);
  }, [revalidator, liveTail]);

  useEffect(() => {
    if (!liveTail) {
      setLiveLogs([]);
      return;
    }
    const since = new Date().toISOString();
    const es = new EventSource(`/internal/api-logs/stream?since=${encodeURIComponent(since)}`);
    es.addEventListener('log', (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as LiveLog;
        setLiveLogs(prev => [parsed, ...prev].slice(0, LIVE_TAIL_MAX));
      } catch {
        // ignore malformed
      }
    });
    return () => es.close();
  }, [liveTail]);

  const detailData = fetcher.data;

  return (
    <Page
      title="API logs"
      subtitle={`${logs.length} entries · ${liveTail ? 'live tail (SSE)' : 'refreshes every 5s'}`}
      primaryAction={{ content: 'Refresh', onAction: () => revalidator.revalidate(), loading: revalidator.state === 'loading' }}
      secondaryActions={[
        {
          content: liveTail ? 'Stop live tail' : 'Start live tail',
          onAction: () => setLiveTail(v => !v),
        },
      ]}
      fullWidth
    >
      <div style={{ width: '100%', maxWidth: '100%' }}>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Filters</Text>
            <Text as="p" variant="bodySm" tone="subdued">Filter by actor, status, path search, and date range.</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 140 }}>
                  <Select label="Actor" name="actor" options={ACTOR_OPTIONS} value={filters.actor ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('actor', v); else p.delete('actor'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 140 }}>
                  <Select label="Status" name="status" options={STATUS_OPTIONS} value={filters.status ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('status', v); else p.delete('status'); setParams(p); }} />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search path" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="/api/..." />
                </div>
                <div style={{ minWidth: 220 }}>
                  <TextField label="Correlation ID" name="correlationId" value={filters.correlationId ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('correlationId', v); else p.delete('correlationId'); setParams(p); }} autoComplete="off" placeholder="req_… / corr_…" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                </div>
                <Button submit variant="primary" loading={isLoading}>Apply</Button>
                <Button url="/internal/api-logs" variant="secondary">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        {liveTail && (
          <Card>
            <BlockStack gap="200">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">Live tail</Text>
                <Badge tone="success">streaming</Badge>
                <Text as="p" variant="bodySm" tone="subdued">
                  Newest first · keeps last {LIVE_TAIL_MAX} entries
                </Text>
              </InlineStack>
              {liveLogs.length === 0 ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  Waiting for new API requests…
                </Text>
              ) : (
                <div className="internal-table-scroll" style={{ overflowX: 'auto', maxHeight: 280 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Time</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Actor</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Method / Path</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Duration</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600 }}>Correlation</th>
                        <th style={{ padding: '4px 12px', fontWeight: 600, width: 100 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveLogs.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '4px 12px' }}>{new Date(l.createdAt).toLocaleTimeString()}</td>
                          <td style={{ padding: '4px 12px' }}>{l.actor}</td>
                          <td style={{ padding: '4px 12px' }}>
                            <InternalTruncateCell value={`${l.method} ${l.path}`} maxLength={80} maxWidthPx={280} />
                          </td>
                          <td style={{ padding: '4px 12px' }}>
                            <Badge tone={l.status >= 400 ? 'critical' : 'success'}>{String(l.status || '—')}</Badge>
                          </td>
                          <td style={{ padding: '4px 12px' }}>{l.durationMs} ms</td>
                          <td style={{ padding: '4px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                            <InternalTruncateCell value={l.correlationId ?? '—'} maxLength={20} maxWidthPx={140} />
                          </td>
                          <td style={{ padding: '4px 12px' }}>
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
              )}
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">API log entries</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : logs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No API logs match your filters.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Widen the date range or clear filters to see more entries.</Text>
              </BlockStack>
            ) : (
              <Box paddingBlockEnd="200">
                <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Time</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Actor</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Method / Path</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Response</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Duration (ms)</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Store</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Correlation</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600, width: 140 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => {
                      const methodPath = `${l.method} ${l.path}`;
                      const isRunning = l.finishedAt == null && l.status === 0;
                      return (
                      <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '6px 12px' }}>{new Date(l.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '6px 12px' }}>{l.actor}</td>
                        <td style={{ padding: '6px 12px' }}>
                          <InternalTruncateCell value={methodPath} maxLength={80} maxWidthPx={280} />
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          {isRunning ? <Badge tone="attention">Running</Badge> : <Badge tone="success">Completed</Badge>}
                        </td>
                        <td style={{ padding: '6px 12px' }}>
                          {isRunning ? '—' : <Badge tone={l.status >= 400 ? 'critical' : 'success'}>{String(l.status)}</Badge>}
                        </td>
                        <td style={{ padding: '6px 12px' }}>{isRunning ? '—' : l.durationMs}</td>
                        <td style={{ padding: '6px 12px' }}>
                          <InternalTruncateCell value={l.shopDomain} maxLength={40} maxWidthPx={160} />
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
                    );})}
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
        title="API log detail"
        size="large"
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
              <ApiLogDetailContent d={detailData} />
            </div>
          ) : fetcher.data === undefined && fetcher.state === 'idle' ? null : (
            <Text as="p" tone="critical">Failed to load log.</Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
