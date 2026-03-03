import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import {
  Page, Card, BlockStack, Text, InlineStack, Button, Divider,
} from '@shopify/polaris';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

const NOT_FOUND = new Response(null, { status: 404 });

function parseMeta(meta: string | null): Record<string, unknown> | null {
  if (!meta) return null;
  try {
    return JSON.parse(meta) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function loader({ request, params }: { request: Request; params: { logId?: string } }) {
  await requireInternalAdmin(request);
  const logId = params.logId;
  if (!logId) throw NOT_FOUND;

  const prisma = getPrisma();
  const log = await prisma.apiLog.findUnique({
    where: { id: logId },
    include: { shop: true },
  });
  if (!log) throw NOT_FOUND;

  const meta = parseMeta(log.meta);
  const requestBody = meta && typeof meta.requestBody === 'string' ? meta.requestBody : meta && meta.requestBody != null ? JSON.stringify(meta.requestBody, null, 2) : null;
  const requestHeaders = meta && meta.requestHeaders != null ? (typeof meta.requestHeaders === 'object' ? meta.requestHeaders : meta.requestHeaders) : null;
  const responseBody = meta && typeof meta.responseBody === 'string' ? meta.responseBody : meta && meta.responseBody != null ? JSON.stringify(meta.responseBody, null, 2) : null;
  const metaRest = meta ? Object.fromEntries(Object.entries(meta).filter(([k]) => !['requestBody', 'requestHeaders', 'responseBody'].includes(k))) : null;

  return json({
    id: log.id,
    actor: log.actor,
    method: log.method,
    path: log.path,
    status: log.status,
    durationMs: log.durationMs,
    requestId: log.requestId,
    success: log.success,
    shopDomain: log.shop?.shopDomain ?? null,
    createdAt: log.createdAt.toISOString(),
    requestBody,
    requestHeaders,
    responseBody,
    metaRest: metaRest && Object.keys(metaRest).length > 0 ? metaRest : null,
  });
}

function CodeBlock({ title, value }: { title: string; value: string | Record<string, unknown> | null }) {
  if (value == null || value === '') return null;
  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
  return (
    <>
      <Text as="h3" variant="headingSm">{title}</Text>
      <pre
        style={{
          margin: 0,
          padding: 12,
          background: 'var(--p-color-bg-surface-secondary)',
          borderRadius: 8,
          fontSize: 12,
          overflow: 'auto',
          maxHeight: 300,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {str}
      </pre>
    </>
  );
}

export default function InternalApiLogDetail() {
  const d = useLoaderData<typeof loader>();

  return (
    <Page
      title="API log detail"
      backAction={{ content: 'API logs', url: '/internal/api-logs' }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text as="h2" variant="headingMd">Request</Text>
              <Text as="p" variant="bodySm" tone="subdued">ID: {d.id}</Text>
            </InlineStack>
            <Divider />
            <BlockStack gap="200">
              <Text as="p" variant="bodySm"><strong>Time</strong>: {new Date(d.createdAt).toLocaleString()}</Text>
              <Text as="p" variant="bodySm"><strong>Method</strong>: {d.method}</Text>
              <Text as="p" variant="bodySm"><strong>Path</strong>: {d.path}</Text>
              <Text as="p" variant="bodySm"><strong>Status</strong>: {d.status}</Text>
              <Text as="p" variant="bodySm"><strong>Duration</strong>: {d.durationMs} ms</Text>
              <Text as="p" variant="bodySm"><strong>Success</strong>: {d.success ? 'Yes' : 'No'}</Text>
              {d.requestId && <Text as="p" variant="bodySm"><strong>Request ID</strong>: {d.requestId}</Text>}
              <Text as="p" variant="bodySm"><strong>Actor</strong>: {d.actor}</Text>
              <Text as="p" variant="bodySm"><strong>Store</strong>: {d.shopDomain ?? '—'}</Text>
            </BlockStack>

            <CodeBlock title="Request headers" value={d.requestHeaders} />
            {d.requestBody != null && <CodeBlock title="Request body" value={d.requestBody} />}
            {d.responseBody != null && <CodeBlock title="Response body" value={d.responseBody} />}
            {!d.requestBody && !d.responseBody && (d.requestHeaders == null || (typeof d.requestHeaders === 'object' && Object.keys(d.requestHeaders).length === 0)) && (
              <Text as="p" variant="bodySm" tone="subdued">Request/response body and headers are not stored for this log. Routes can pass them in meta to see them here.</Text>
            )}
            {d.metaRest && (
              <>
                <Divider />
                <Text as="h3" variant="headingSm">Additional meta</Text>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    background: 'var(--p-color-bg-surface-secondary)',
                    borderRadius: 8,
                    fontSize: 12,
                    overflow: 'auto',
                    maxHeight: 200,
                  }}
                >
                  {JSON.stringify(d.metaRest, null, 2)}
                </pre>
              </>
            )}
            <InlineStack gap="200" blockAlign="start">
              <Button url="/internal/api-logs">Back to API logs</Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
