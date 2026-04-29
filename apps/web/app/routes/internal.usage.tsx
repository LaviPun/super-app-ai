import { json } from '@remix-run/node';
import { useLoaderData, useSearchParams, useNavigation, Form, useFetcher } from '@remix-run/react';
import { useState } from 'react';
import {
  Page, Card, BlockStack, Text, InlineGrid, InlineStack, Badge,
  TextField, Button, SkeletonBodyText, Banner,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { generateCorrelationId } from '~/services/observability/correlation.server';
import { parseCursorParams, buildNextCursorUrl } from '~/services/internal/pagination.server';

export async function action({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  if (intent !== 'replay') return json({ ok: false, error: 'Unknown intent' }, { status: 400 });

  const usageId = String(formData.get('usageId') ?? '');
  if (!usageId) return json({ ok: false, error: 'Missing usageId' }, { status: 400 });

  const prisma = getPrisma();
  const original = await prisma.aiUsage.findUnique({ where: { id: usageId } });
  if (!original) return json({ ok: false, error: 'AI usage row not found' }, { status: 404 });

  let meta: Record<string, unknown> | null = null;
  if (original.meta) {
    try { meta = JSON.parse(original.meta) as Record<string, unknown>; }
    catch { meta = null; }
  }

  const correlationId = original.correlationId ?? generateCorrelationId();
  const job = await new JobService().create({
    shopId: original.shopId ?? undefined,
    type: 'AI_GENERATE',
    payload: { replayOf: original.id, action: original.action, meta: meta ?? {} },
    correlationId,
  });
  return json({ ok: true, newJobId: job.id, correlationId });
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const url = new URL(request.url);
  const actionFilter = url.searchParams.get('action') || undefined;
  const search = url.searchParams.get('q') || undefined;
  const correlationId = url.searchParams.get('correlationId') || undefined;
  const dateFrom = url.searchParams.get('dateFrom') ? new Date(url.searchParams.get('dateFrom')!) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const dateTo = url.searchParams.get('dateTo') ? new Date(url.searchParams.get('dateTo')!) : undefined;

  const { cursor, take, skip } = parseCursorParams(url);
  const prisma = getPrisma();
  const where: Record<string, unknown> = { createdAt: { gte: dateFrom } };
  if (dateTo) (where.createdAt as Record<string, unknown>).lte = dateTo;
  if (actionFilter) where.action = actionFilter;
  if (correlationId) where.correlationId = correlationId;
  if (search) {
    where.OR = [{ action: { contains: search } }];
  }

  const rows = await prisma.aiUsage.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    skip,
    cursor,
    include: { provider: true, shop: true },
  });

  const totalCostCents = rows.reduce((s, r) => s + r.costCents, 0);
  const totalRequests = rows.reduce((s, r) => s + (r.requestCount ?? 1), 0);
  const totalTokensIn = rows.reduce((s, r) => s + r.tokensIn, 0);
  const totalTokensOut = rows.reduce((s, r) => s + r.tokensOut, 0);

  return json({
    rows: rows.map(r => ({
      ...extractUsageAudit(r.meta),
      id: r.id,
      action: r.action,
      providerName: r.provider.name,
      requestCount: r.requestCount ?? 1,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costCents: r.costCents,
      shopDomain: r.shop?.shopDomain ?? null,
      createdAt: r.createdAt.toISOString(),
      correlationId: r.correlationId ?? null,
      meta: r.meta,
    })),
    totalCostCents,
    totalRequests,
    totalTokensIn,
    totalTokensOut,
    filters: { action: actionFilter, search, correlationId, dateFrom: dateFrom.toISOString(), dateTo: dateTo?.toISOString() },
    nextCursor: buildNextCursorUrl(url, rows, take),
  });
}

type ReplayResult = { ok: boolean; newJobId?: string; correlationId?: string; error?: string };

function formatMeta(meta: string | null): string {
  if (!meta) return '';
  try { return JSON.stringify(JSON.parse(meta), null, 2); } catch { return meta; }
}

function extractUsageAudit(meta: string | null): {
  accountId: string | null;
  accountEmail: string | null;
  dailyLimitUsd: number | null;
  alertLimitUsd: number | null;
  promptPreview: string | null;
} {
  if (!meta) return { accountId: null, accountEmail: null, dailyLimitUsd: null, alertLimitUsd: null, promptPreview: null };
  try {
    const parsed = JSON.parse(meta) as {
      accountAudit?: { accountId?: string; accountEmail?: string; dailyLimitUsd?: number; alertLimitUsd?: number };
      promptAudit?: { preview?: string };
    };
    return {
      accountId: parsed.accountAudit?.accountId ?? null,
      accountEmail: parsed.accountAudit?.accountEmail ?? null,
      dailyLimitUsd: parsed.accountAudit?.dailyLimitUsd ?? null,
      alertLimitUsd: parsed.accountAudit?.alertLimitUsd ?? null,
      promptPreview: parsed.promptAudit?.preview ?? null,
    };
  } catch {
    return { accountId: null, accountEmail: null, dailyLimitUsd: null, alertLimitUsd: null, promptPreview: null };
  }
}

export default function InternalUsage() {
  const { rows, totalCostCents, totalRequests, totalTokensIn, totalTokensOut, filters, nextCursor } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const isLoading = nav.state === 'loading';
  const [params, setParams] = useSearchParams();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const replayFetcher = useFetcher<ReplayResult>();
  const replayResult = replayFetcher.data ?? null;
  const handleReplay = (usageId: string) => {
    const fd = new FormData();
    fd.set('intent', 'replay');
    fd.set('usageId', usageId);
    replayFetcher.submit(fd, { method: 'post' });
  };

  return (
    <Page title="AI Usage & Costs" subtitle="Filterable by date range and action">
      <BlockStack gap="500">
        {replayResult?.ok && (
          <Banner tone="success" title="Replay queued">
            <Text as="p" variant="bodySm">
              New job <code>{replayResult.newJobId}</code> created
              {replayResult.correlationId ? <> with correlation <code>{replayResult.correlationId}</code></> : null}.
            </Text>
          </Banner>
        )}
        {replayResult && replayResult.ok === false && (
          <Banner tone="critical" title="Replay failed">
            <Text as="p" variant="bodySm">{replayResult.error}</Text>
          </Banner>
        )}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Summary</Text>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Total requests</Text>
              <Text as="p" variant="headingLg">{totalRequests.toLocaleString()}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Total cost</Text>
              <Text as="p" variant="headingLg">${(totalCostCents / 100).toFixed(2)}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Tokens in</Text>
              <Text as="p" variant="headingLg">{totalTokensIn.toLocaleString()}</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued" variant="bodySm">Tokens out</Text>
              <Text as="p" variant="headingLg">{totalTokensOut.toLocaleString()}</Text>
            </BlockStack>
          </Card>
        </InlineGrid>
        </BlockStack>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Filters</Text>
            <Text as="p" variant="bodySm" tone="subdued">Filter by action search and date range.</Text>
            <Form method="get">
              <InlineStack gap="300" wrap blockAlign="end">
                <div style={{ minWidth: 200 }}>
                  <TextField label="Search action" name="q" value={filters.search ?? ''} onChange={(v) => { const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); setParams(p); }} autoComplete="off" placeholder="RECIPE_GENERATION..." />
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
                <Button url="/internal/usage" variant="secondary">Clear</Button>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">Usage log</Text>
            {isLoading ? (
              <SkeletonBodyText lines={6} />
            ) : rows.length === 0 ? (
              <BlockStack gap="200">
                <Text as="p" tone="subdued">No AI usage in the selected range.</Text>
                <Text as="p" variant="bodySm" tone="subdued">Usage is recorded when AI actions run. Default range is last 30 days. Widen the date range or ensure an AI provider is active and that AI calls have been triggered.</Text>
              </BlockStack>
            ) : (
              <div className="internal-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e0e0e0', textAlign: 'left' }}>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Time</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Action</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Provider</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Account</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Tokens in</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Tokens out</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Cost</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Store</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600 }}>Correlation</th>
                      <th style={{ padding: '6px 12px', fontWeight: 600, width: 160 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const isExpanded = expandedId === r.id;
                      const isFailed = r.action.includes('FAILED');
                      return (
                        <tr key={r.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid #eee', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                          <td style={{ padding: '6px 12px' }}>{new Date(r.createdAt).toLocaleString()}</td>
                          <td style={{ padding: '6px 12px' }}>
                            <Badge tone={isFailed ? 'critical' : 'success'}>{r.action}</Badge>
                          </td>
                          <td style={{ padding: '6px 12px' }}>{r.providerName}</td>
                          <td style={{ padding: '6px 12px', fontSize: 12 }}>{r.accountId ?? r.accountEmail ?? '—'}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r.tokensIn.toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>{r.tokensOut.toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>{`$${(r.costCents / 100).toFixed(3)}`}</td>
                          <td style={{ padding: '6px 12px', fontSize: 12 }}>{r.shopDomain ?? '—'}</td>
                          <td style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 11 }}>
                            {r.correlationId ? (
                              <a href={`/internal/trace/${encodeURIComponent(r.correlationId)}`} onClick={(e) => e.stopPropagation()}>{r.correlationId.slice(0, 14)}…</a>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '6px 12px' }} onClick={(e) => e.stopPropagation()}>
                            <InlineStack gap="100">
                              <Button size="slim" variant="secondary" onClick={() => setExpandedId(isExpanded ? null : r.id)}>
                                {isExpanded ? 'Close' : 'Detail'}
                              </Button>
                              {r.correlationId && (
                                <Button size="slim" variant="plain" url={`/internal/trace/${encodeURIComponent(r.correlationId)}`}>Trace</Button>
                              )}
                              <Button size="slim" variant="plain" onClick={() => handleReplay(r.id)} loading={replayFetcher.state !== 'idle' && replayFetcher.formData?.get('usageId') === r.id}>Replay</Button>
                            </InlineStack>
                          </td>
                        </tr>
                      );
                    })}
                    {rows.filter(r => expandedId === r.id).map(r => (
                      <tr key={`detail-${r.id}`} style={{ borderBottom: '1px solid #eee', background: 'var(--p-color-bg-surface-secondary, #f6f6f7)' }}>
                        <td colSpan={10} style={{ padding: '12px 16px' }}>
                          <BlockStack gap="200">
                            <InlineStack gap="400" wrap>
                              <Text as="span" variant="bodySm"><strong>ID:</strong> {r.id}</Text>
                              <Text as="span" variant="bodySm"><strong>Requests:</strong> {r.requestCount}</Text>
                              {r.correlationId && <Text as="span" variant="bodySm"><strong>Correlation:</strong> {r.correlationId}</Text>}
                              {r.dailyLimitUsd != null && <Text as="span" variant="bodySm"><strong>Daily limit:</strong> ${r.dailyLimitUsd}</Text>}
                              {r.alertLimitUsd != null && <Text as="span" variant="bodySm"><strong>Alert limit:</strong> ${r.alertLimitUsd}</Text>}
                            </InlineStack>
                            {r.promptPreview && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                <strong>Prompt preview:</strong> {r.promptPreview.slice(0, 240)}
                              </Text>
                            )}
                            {r.meta && (
                              <pre style={{ margin: 0, padding: 12, background: 'var(--p-color-bg-surface, #fff)', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 240, overflow: 'auto' }}>
                                {formatMeta(r.meta)}
                              </pre>
                            )}
                          </BlockStack>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BlockStack>
        </Card>
        {nextCursor && (
          <div style={{ textAlign: 'center' }}>
            <Button url={nextCursor}>Load more</Button>
          </div>
        )}
      </BlockStack>
    </Page>
  );
}
