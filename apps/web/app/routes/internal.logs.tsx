import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useFetcher } from '@remix-run/react';
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

type ErrorLogDetailData = {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  route: string | null;
  source: string | null;
  shopDomain: string | null;
  metaJson: string | null;
  createdAt: string;
  requestId: string | null;
  correlationId: string | null;
};

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const level = url.searchParams.get('level') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : undefined;
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const prisma = getPrisma();
  const where: Prisma.ErrorLogWhereInput = {};
  if (level) where.level = level;
  const sourceFilter = url.searchParams.get('source') || undefined;
  if (sourceFilter) where.source = sourceFilter;
  if (search) {
    where.OR = [
      { message: { contains: search } },
      { route: { contains: search } },
      { source: { contains: search } },
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

  const logs = await prisma.errorLog.findMany({
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
      level: l.level,
      message: l.message,
      route: l.route,
      source: l.source,
      shopDomain: l.shop?.shopDomain ?? null,
      createdAt: l.createdAt.toISOString(),
      correlationId: l.correlationId ?? null,
      requestId: l.requestId ?? null,
    })),
    filters: { level, source: sourceFilter, search, correlationId, dateFrom: dateFrom?.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursorHref,
    pageSize: page.take,
  });
}

const LEVEL_OPTIONS = [
  { label: 'All levels', value: '' },
  { label: 'ERROR', value: 'ERROR' },
  { label: 'WARN', value: 'WARN' },
  { label: 'INFO', value: 'INFO' },
];

const SOURCE_OPTIONS = [
  { label: 'All sources', value: '' },
  { label: 'API', value: 'API' },
  { label: 'Error boundary', value: 'ERROR_BOUNDARY' },
  { label: 'Client', value: 'CLIENT' },
  { label: 'Server', value: 'SERVER' },
];

function ErrorLogDetailContent({ d }: { d: ErrorLogDetailData }) {
  return (
    <BlockStack gap="400">
      <BlockStack gap="200">
        <Text as="p" variant="bodySm"><strong>Time</strong>: {new Date(d.createdAt).toLocaleString()}</Text>
        <Text as="p" variant="bodySm"><strong>Level</strong>: <Badge tone={d.level === 'ERROR' ? 'critical' : d.level === 'WARN' ? 'warning' : 'info'}>{d.level}</Badge></Text>
        <Text as="p" variant="bodySm"><strong>Source</strong>: {d.source ?? '—'}</Text>
        <Text as="p" variant="bodySm"><strong>Route</strong>: {d.route ?? '—'}</Text>
        <Text as="p" variant="bodySm"><strong>Store</strong>: {d.shopDomain ?? '—'}</Text>
        {d.correlationId && (
          <InlineStack gap="200" blockAlign="center">
            <Text as="p" variant="bodySm"><strong>Correlation</strong>: <code>{d.correlationId}</code></Text>
            <Button size="slim" variant="plain" url={`/internal/trace/${encodeURIComponent(d.correlationId)}`}>Open trace</Button>
          </InlineStack>
        )}
        {d.requestId && <Text as="p" variant="bodySm"><strong>Request ID</strong>: <code>{d.requestId}</code></Text>}
      </BlockStack>
      <Text as="p" variant="bodySm"><strong>Message</strong></Text>
      <pre className="internal-code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{d.message}</pre>
      {d.stack && (
        <>
          <Text as="p" variant="bodySm"><strong>Stack</strong></Text>
          <pre className="internal-code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>{d.stack}</pre>
        </>
      )}
      {d.metaJson && (
        <>
          <Text as="p" variant="bodySm"><strong>Meta</strong></Text>
          <pre className="internal-code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflow: 'auto' }}>{d.metaJson}</pre>
        </>
      )}
    </BlockStack>
  );
}

export default function InternalLogs() {
  const { logs, filters, nextCursorHref, pageSize } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fetcher = useFetcher<ErrorLogDetailData>();

  useEffect(() => {
    if (selectedId) fetcher.load(`/internal/logs/${selectedId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only load when selectedId changes
  }, [selectedId]);

  const detailData = fetcher.data;

  return (
    <Page title="Error logs" subtitle={`${logs.length} entries · API, error boundaries, client, server`} fullWidth>
      <div style={{ width: '100%', maxWidth: '100%' }}>
        <BlockStack gap="300">
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">Filters</Text>
            <Text as="p" variant="bodySm" tone="subdued">Filter by level, source, message/route search, and date range.</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 140 }}>
                  <Select
                    label="Level"
                    name="level"
                    options={LEVEL_OPTIONS}
                    value={filters.level ?? ''}
                    onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('level', v); else p.delete('level'); setParams(p); }}
                  />
                </div>
                <div style={{ minWidth: 140 }}>
                  <Select
                    label="Source"
                    name="source"
                    options={SOURCE_OPTIONS}
                    value={filters.source ?? ''}
                    onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('source', v); else p.delete('source'); setParams(p); }}
                  />
                </div>
                <div style={{ minWidth: 200 }}>
                  <TextField
                    label="Search"
                    name="q"
                    value={filters.search ?? ''}
                    onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }}
                    autoComplete="off"
                    placeholder="Search message, route, source..."
                  />
                </div>
                <div style={{ minWidth: 220 }}>
                  <TextField
                    label="Correlation ID"
                    name="correlationId"
                    value={filters.correlationId ?? ''}
                    onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('correlationId', v); else p.delete('correlationId'); setParams(p); }}
                    autoComplete="off"
                    placeholder="req_… / corr_…"
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="From" name="dateFrom" type="date" value={filters.dateFrom?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateFrom', v); else p.delete('dateFrom'); setParams(p); }} autoComplete="off" />
                </div>
                <div style={{ minWidth: 160 }}>
                  <TextField label="To" name="dateTo" type="date" value={filters.dateTo?.split('T')[0] ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('dateTo', v); else p.delete('dateTo'); setParams(p); }} autoComplete="off" />
                </div>
                <Button submit variant="primary" loading={isLoading}>Apply</Button>
                <Button url="/internal/logs" variant="secondary">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Error log entries</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : logs.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No error log entries match your filters.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Errors from API, error boundaries, client (window.onerror, unhandledrejection), and server are recorded here.</Text>
              </BlockStack>
            ) : (
              <Box paddingBlockEnd="200">
                <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Time</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Level</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Source</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Message</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Store</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Route</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600 }}>Correlation</th>
                        <th style={{ padding: '6px 12px', fontWeight: 600, width: 140 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '6px 12px' }}>{new Date(l.createdAt).toLocaleString()}</td>
                          <td style={{ padding: '6px 12px' }}><Badge tone={l.level === 'ERROR' ? 'critical' : l.level === 'WARN' ? 'warning' : 'info'}>{l.level}</Badge></td>
                          <td style={{ padding: '6px 12px' }}>{l.source ?? '—'}</td>
                          <td style={{ padding: '6px 12px' }}><InternalTruncateCell value={l.message} maxLength={80} maxWidthPx={280} /></td>
                          <td style={{ padding: '6px 12px' }}><InternalTruncateCell value={l.shopDomain} maxLength={40} maxWidthPx={140} /></td>
                          <td style={{ padding: '6px 12px' }}><InternalTruncateCell value={l.route} maxLength={60} maxWidthPx={180} /></td>
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

      <Modal open={selectedId != null} onClose={() => setSelectedId(null)} title="Error detail" size="large" secondaryActions={[{ content: 'Close', onAction: () => setSelectedId(null) }]}>
        <Modal.Section>
          {fetcher.state === 'loading' && !detailData ? (
            <InlineStack gap="200" blockAlign="center">
              <Spinner size="small" />
              <Text as="span" tone="subdued">Loading…</Text>
            </InlineStack>
          ) : detailData ? (
            <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
              <ErrorLogDetailContent d={detailData} />
            </div>
          ) : fetcher.data === undefined && fetcher.state === 'idle' ? null : (
            <Text as="p" tone="critical">Failed to load error log.</Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
