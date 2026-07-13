import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { useState } from 'react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  Btn,
  Badge,
  Card,
  KV,
  PageHead,
  MonoChip,
} from '~/components/admin/page-kit';

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
    correlationId: log.correlationId ?? null,
    success: log.success,
    shopDomain: log.shop?.shopDomain ?? null,
    createdAt: log.createdAt.toISOString(),
    requestBody,
    requestHeaders,
    responseBody,
    metaRest: metaRest && Object.keys(metaRest).length > 0 ? metaRest : null,
  });
}

const CODE_TRUNCATE = 200;

function CodeBlock({ title, value }: { title: string; value: string | Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  if (value == null || value === '') return null;
  const str = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
  const isLong = str.length > CODE_TRUNCATE;
  const preview = isLong && !expanded ? str.slice(0, CODE_TRUNCATE) + '\n…' : str;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="t-h3">{title}</div>
      <pre className="code-block">{preview}</pre>
      {isLong && (
        <div>
          <Btn size="sm" className="btn-plain" onClick={() => setExpanded((e) => !e)}>{expanded ? 'Collapse' : 'Expand'}</Btn>
        </div>
      )}
    </div>
  );
}

export default function InternalApiLogDetail() {
  const d = useLoaderData<typeof loader>();
  const noBodies =
    !d.requestBody &&
    !d.responseBody &&
    (d.requestHeaders == null || (typeof d.requestHeaders === 'object' && Object.keys(d.requestHeaders).length === 0));

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/api-logs', label: 'API logs' }}
        title="API log detail"
        badge={<Badge tone={d.success ? 'success' : 'critical'}>{d.status || '—'}</Badge>}
        sub={
          <span className="row-2">
            <MonoChip>{d.method} {d.path}</MonoChip>
            <span className="t-muted">·</span>
            <span className="t-sm">{new Date(d.createdAt).toLocaleString()}</span>
          </span>
        }
      />
      <div className="col-main">
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>Request</div>
          <KV
            rows={[
              ['Log ID', <MonoChip key="id">{d.id}</MonoChip>],
              ['Time', new Date(d.createdAt).toLocaleString()],
              ['Method', d.method],
              ['Path', <MonoChip key="p">{d.path}</MonoChip>],
              ['Status', d.status],
              ['Duration', d.durationMs != null ? d.durationMs + ' ms' : '—'],
              ['Success', d.success ? 'Yes' : 'No'],
              d.requestId ? ['Request ID', <MonoChip key="rid">{d.requestId}</MonoChip>] : null,
              ['Actor', d.actor],
              ['Store', d.shopDomain ?? '—'],
            ]}
          />
        </Card>
        <Card pad>
          <div className="stack" style={{ gap: 16 }}>
            <CodeBlock title="Request headers" value={d.requestHeaders} />
            {d.requestBody != null && <CodeBlock title="Request body" value={d.requestBody} />}
            {d.responseBody != null && <CodeBlock title="Response body" value={d.responseBody} />}
            {noBodies && (
              <span className="t-muted t-sm">Request/response body and headers are not stored for this log. Routes can pass them in meta to see them here.</span>
            )}
            {d.metaRest && (
              <>
                <div className="divider" style={{ margin: '4px 0' }} />
                <CodeBlock title="Additional meta" value={d.metaRest} />
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
