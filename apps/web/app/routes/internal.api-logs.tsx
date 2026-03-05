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

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actor = url.searchParams.get('actor') || undefined;
  const statusFilter = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma where shape varies by filters
  const where: any = {};
  if (actor) where.actor = actor;
  if (statusFilter === 'success') where.success = true;
  if (statusFilter === 'error') where.success = false;
  if (search) {
    where.OR = [
      { path: { contains: search } },
      { method: { contains: search } },
    ];
  }
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const logs = await prisma.apiLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 300,
    include: { shop: true },
  });

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
    })),
    filters: { actor, status: statusFilter, search, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
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
            {d.requestId && <Text as="p" variant="bodySm"><strong>Request ID</strong>: {d.requestId}</Text>}
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

export default function InternalApiLogs() {
  const { logs, filters } = useLoaderData<typeof loader>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetcher = useFetcher<ApiLogDetailData>();
  const revalidator = useRevalidator();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (selectedId) fetcher.load(`/internal/api-logs/${selectedId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load when selectedId changes
  }, [selectedId]);

  useEffect(() => {
    const id = setInterval(() => revalidator.revalidate(), 5000);
    return () => clearInterval(id);
  }, [revalidator]);

  const detailData = fetcher.data;

  return (
    <Page
      title="API logs"
      subtitle={`${logs.length} entries · refreshes every 5s`}
      primaryAction={{ content: 'Refresh', onAction: () => revalidator.revalidate(), loading: revalidator.state === 'loading' }}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
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

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">API log entries</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : logs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No API logs match your filters.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Widen the date range or clear filters to see more entries.</Text>
              </BlockStack>
            ) : (
              <Box paddingBlockEnd="400">
                <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--p-color-border)', textAlign: 'left' }}>
                      <th style={{ padding: 12, fontWeight: 600 }}>Time</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Actor</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Method / Path</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Status</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Duration (ms)</th>
                      <th style={{ padding: 12, fontWeight: 600 }}>Store</th>
                      <th style={{ padding: 12, fontWeight: 600, width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(l => {
                      const methodPath = `${l.method} ${l.path}`;
                      return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                        <td style={{ padding: 12 }}>{new Date(l.createdAt).toLocaleString()}</td>
                        <td style={{ padding: 12 }}>{l.actor}</td>
                        <td style={{ padding: 12 }}>
                          <InternalTruncateCell value={methodPath} maxLength={80} maxWidthPx={280} />
                        </td>
                        <td style={{ padding: 12 }}><Badge tone={l.status >= 400 ? 'critical' : 'success'}>{String(l.status)}</Badge></td>
                        <td style={{ padding: 12 }}>{l.durationMs}</td>
                        <td style={{ padding: 12 }}>
                          <InternalTruncateCell value={l.shopDomain} maxLength={40} maxWidthPx={160} />
                        </td>
                        <td style={{ padding: 12 }}>
                          <Button type="button" size="slim" variant="secondary" onClick={() => setSelectedId(l.id)}>View</Button>
                        </td>
                      </tr>
                    );})}
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
        title="API log detail"
        large
        secondaryActions={[{ content: 'Close', onAction: () => setSelectedId(null) }]}
      >
        <Modal.Section>
          {fetcher.state === 'loading' && !detailData ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="span" tone="subdued">Loading…</Text>
            </InlineStack>
          ) : detailData ? (
            <Box maxHeight="70vh" overflowY="auto">
              <ApiLogDetailContent d={detailData} />
            </Box>
          ) : fetcher.data === undefined && fetcher.state === 'idle' ? null : (
            <Text as="p" tone="critical">Failed to load log.</Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
