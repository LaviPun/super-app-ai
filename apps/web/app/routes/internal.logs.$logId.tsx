import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import type { Prisma } from '@prisma/client';
import {
  useAdminCtx,
  Btn,
  StatusBadge,
  Card,
  KV,
  PageHead,
  StatTile,
  MonoChip,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

export async function loader({ request, params }: { request: Request; params: { logId?: string } }) {
  await requireInternalAdmin(request);
  const logId = params.logId;
  if (!logId) throw NOT_FOUND;

  const prisma = getPrisma();
  const log = await prisma.errorLog.findUnique({
    where: { id: logId },
    include: { shop: true },
  });
  if (!log) throw NOT_FOUND;

  let metaJson: string | null = null;
  if (log.meta) {
    try {
      const parsed = JSON.parse(log.meta);
      metaJson = JSON.stringify(parsed, null, 2);
    } catch {
      metaJson = log.meta;
    }
  }

  // Occurrences + related errors share the same route (fall back to same message
  // for routeless errors) — real counts, never fabricated.
  const relatedWhere: Prisma.ErrorLogWhereInput = log.route ? { route: log.route } : { message: log.message };
  const [occurrences, related] = await Promise.all([
    prisma.errorLog.count({ where: relatedWhere }),
    prisma.errorLog.findMany({
      where: { ...relatedWhere, id: { not: log.id } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 4,
      select: { id: true, level: true, message: true, createdAt: true },
    }),
  ]);

  return json({
    id: log.id,
    level: log.level,
    message: log.message,
    stack: log.stack,
    route: log.route,
    source: log.source,
    shopDomain: log.shop?.shopDomain ?? null,
    metaJson,
    createdAt: log.createdAt.toISOString(),
    requestId: log.requestId ?? null,
    correlationId: log.correlationId ?? null,
    occurrences,
    related: related.map(r => ({ id: r.id, level: r.level, message: r.message, createdAt: r.createdAt.toISOString() })),
  });
}

export default function AdminErrorDetail() {
  const d = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const e = {
    id: d.id,
    level: d.level,
    message: d.message,
    route: d.route ?? '/',
    source: d.source,
    shop: d.shopDomain ?? '—',
    created: formatRelativeTime(d.createdAt),
    correlationId: d.correlationId ?? '',
  };
  const related = d.related;

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/logs', label: 'Error logs' }}
        title={e.message}
        badge={<StatusBadge value={e.level} />}
        sub={
          <span className="row-2">
            <MonoChip>{e.route}</MonoChip>
            <span className="t-muted">·</span>
            <span className="t-sm">{e.created}</span>
          </span>
        }
        actions={
          e.correlationId ? (
            <Btn icon="transfer" onClick={() => ctx.go('#/admin/trace/' + e.correlationId)}>
              View trace
            </Btn>
          ) : undefined
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Level" value={titleCase(e.level)} icon="bug" tone={e.level === 'ERROR' ? 'critical' : 'warning'} />
        <StatTile label="Route" value={e.route.split('/').pop() || e.route} sub={e.route} icon="code" tone="info" />
        <StatTile label="Store" value={e.shop} icon="store" tone="info" />
        <StatTile label="Occurrences" value={d.occurrences} sub={d.route ? 'same route' : 'same message'} icon="alert" tone="warning" />
      </div>
      <div className="col-main">
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Error details
          </div>
          <KV
            rows={[
              ['Error ID', <MonoChip key="id">{e.id}</MonoChip>],
              ['Level', <StatusBadge key="lv" value={e.level} />],
              ['Route', <MonoChip key="rt">{e.route}</MonoChip>],
              ['Store', e.shop],
              [
                'Correlation ID',
                e.correlationId ? (
                  <a key="cor" href={'/internal/trace/' + e.correlationId} className="cell-link t-mono">
                    {e.correlationId}
                  </a>
                ) : (
                  '—'
                ),
              ],
              ['When', e.created],
            ]}
          />
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="t-h3" style={{ marginBottom: 10 }}>
            Stack trace
          </div>
          {d.stack ? <pre className="code-block">{d.stack}</pre> : <span className="t-muted t-sm">No stack trace was recorded for this error.</span>}
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Related errors
          </div>
          {related.length ? (
            <div className="rlist">
              {related.map((r) => (
                <div key={r.id} className="ritem" onClick={() => ctx.go('#/admin/logs/' + r.id)}>
                  <StatusBadge value={r.level} />
                  <div className="grow stack" style={{ gap: 1, minWidth: 0 }}>
                    <span className="t-sm t-trunc">{r.message}</span>
                    <span className="t-xs t-muted">{formatRelativeTime(r.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="t-muted t-sm">{d.route ? 'No other errors on this route.' : 'No other errors with this message.'}</span>
          )}
        </Card>
      </div>
    </div>
  );
}
