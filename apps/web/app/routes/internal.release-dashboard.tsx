import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { Badge, BlockStack, Card, DataTable, InlineStack, Page, Text } from '@shopify/polaris';
import { getPrisma } from '~/db.server';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getRecentPublishMetrics } from '~/services/releases/release-metrics.server';

type TransitionDetail = {
  actor?: string;
  source?: string;
  idempotency_key?: string;
  from?: string;
  to?: string;
  result?: string;
  error_class?: string | null;
  moduleId?: string;
  moduleVersionId?: string;
};

function parseDetails(raw: string | null): TransitionDetail {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as TransitionDetail;
  } catch {
    return {};
  }
}

function toneForResult(result?: string) {
  if (result === 'FAILED') return 'critical' as const;
  if (result === 'SUCCEEDED') return 'success' as const;
  if (result === 'IDEMPOTENT') return 'attention' as const;
  return 'info' as const;
}

export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  const [auditRows, metrics30m] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'RELEASE_TRANSITION' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        shopId: true,
        createdAt: true,
        details: true,
      },
    }),
    getRecentPublishMetrics({ windowMinutes: 30 }),
  ]);

  const transitions = auditRows.map((row) => ({
    id: row.id,
    shopId: row.shopId,
    createdAt: row.createdAt.toISOString(),
    ...parseDetails(row.details),
  }));

  const resultCounts = transitions.reduce<Record<string, number>>((acc, row) => {
    const key = row.result ?? 'UNKNOWN';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const sourceCounts = transitions.reduce<Record<string, number>>((acc, row) => {
    const key = row.source ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const errorClassCounts = transitions.reduce<Record<string, number>>((acc, row) => {
    if (!row.error_class) return acc;
    acc[row.error_class] = (acc[row.error_class] ?? 0) + 1;
    return acc;
  }, {});

  return json({
    metrics30m,
    resultCounts,
    sourceCounts,
    errorClassCounts,
    transitions,
  });
}

export default function InternalReleaseDashboard() {
  const data = useLoaderData<typeof loader>();

  return (
    <Page title="Release Dashboard" subtitle="Rollback budget, transition audits, and publish health">
      <BlockStack gap="300">
        <InlineStack gap="300" wrap>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Sample size (30m)
              </Text>
              <Text as="p" variant="headingLg">
                {data.metrics30m.sampleSize}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                Error rate (30m)
              </Text>
              <Text as="p" variant="headingLg">
                {(data.metrics30m.errorRate * 100).toFixed(2)}%
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                P95 latency (30m)
              </Text>
              <Text as="p" variant="headingLg">
                {data.metrics30m.p95LatencyMs}ms
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Transition outcome summary
            </Text>
            <DataTable
              columnContentTypes={['text', 'numeric']}
              headings={['Result', 'Count']}
              rows={Object.entries(data.resultCounts).map(([result, count]) => [result, count])}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Source summary
            </Text>
            <DataTable
              columnContentTypes={['text', 'numeric']}
              headings={['Source', 'Count']}
              rows={Object.entries(data.sourceCounts).map(([source, count]) => [source, count])}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Error class summary
            </Text>
            <DataTable
              columnContentTypes={['text', 'numeric']}
              headings={['Error class', 'Count']}
              rows={Object.entries(data.errorClassCounts).map(([errorClass, count]) => [
                errorClass,
                count,
              ])}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Recent release transitions
            </Text>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e1e3e5', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Time</th>
                    <th style={{ padding: '8px 10px' }}>Module</th>
                    <th style={{ padding: '8px 10px' }}>Source</th>
                    <th style={{ padding: '8px 10px' }}>Actor</th>
                    <th style={{ padding: '8px 10px' }}>From</th>
                    <th style={{ padding: '8px 10px' }}>To</th>
                    <th style={{ padding: '8px 10px' }}>Result</th>
                    <th style={{ padding: '8px 10px' }}>Error Class</th>
                    <th style={{ padding: '8px 10px' }}>Idempotency Key</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transitions.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid #f1f2f4' }}>
                      <td style={{ padding: '8px 10px' }}>{new Date(row.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <Text as="span" variant="bodySm">
                          {row.moduleId ?? '—'}
                        </Text>
                      </td>
                      <td style={{ padding: '8px 10px' }}>{row.source ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{row.actor ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{row.from ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}>{row.to ?? '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <Badge tone={toneForResult(row.result)}>{row.result ?? 'UNKNOWN'}</Badge>
                      </td>
                      <td style={{ padding: '8px 10px' }}>{row.error_class ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12 }}>
                        {row.idempotency_key ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

