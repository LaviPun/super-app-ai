import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  CardHead,
  Icon,
  KV,
  PageHead,
  MonoChip,
  titleCase,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

export async function loader({ request, params }: { request: Request; params: { activityId?: string } }) {
  await requireInternalAdmin(request);
  const activityId = params.activityId;
  if (!activityId) throw NOT_FOUND;

  const service = new ActivityLogService();
  const log = await service.getById(activityId);
  if (!log) throw NOT_FOUND;

  let detailsJson: string | null = null;
  let detailsRaw: string | null = null;
  if (log.details) {
    try {
      const parsed = JSON.parse(log.details);
      detailsJson = JSON.stringify(parsed, null, 2);
    } catch {
      detailsRaw = log.details;
    }
  }

  return json({
    id: log.id,
    actor: log.actor,
    action: log.action,
    resource: log.resource,
    shopId: log.shopId,
    shopDomain: log.shop?.shopDomain ?? null,
    details: log.details,
    detailsJson,
    detailsRaw,
    ip: log.ip,
    requestId: log.requestId ?? null,
    correlationId: log.correlationId ?? null,
    createdAt: log.createdAt.toISOString(),
  });
}

export default function AdminActivityDetail() {
  const d = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const a = {
    id: d.id,
    actor: d.actor,
    action: d.action,
    resource: d.resource ?? '—',
    shop: d.shopDomain ?? '—',
    ip: d.ip ?? '—',
    created: formatRelativeTime(d.createdAt),
  };
  const cid = d.correlationId;
  const detailsText = d.detailsJson ?? d.detailsRaw;

  return (
    <div className="page page-narrow">
      <PageHead
        back={{ href: '/internal/activity', label: 'Activity Log' }}
        title={titleCase(a.action)}
        badge={<Badge tone={a.actor === 'INTERNAL_ADMIN' ? 'magic' : a.actor === 'WEBHOOK' ? 'info' : undefined}>{titleCase(a.actor)}</Badge>}
        sub="Full detail for a single activity entry, including actor, target, request context and the correlation ID that joins it to logs and jobs."
        actions={
          <>
            {cid && (
              <Btn icon="transfer" onClick={() => ctx.go('#/admin/trace/' + cid)}>
                Open trace
              </Btn>
            )}
            <Btn variant="primary" icon="chat" onClick={() => ctx.go('#/admin/ai-assistant')}>
              Ask assistant
            </Btn>
          </>
        }
      />
      <div className="col-main">
        <div className="stack-4">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 12 }}>
              Event
            </div>
            <KV
              rows={[
                ['Event ID', <MonoChip key="id">{a.id}</MonoChip>],
                ['Action', <span key="ac" className="t-strong">{titleCase(a.action)}</span>],
                ['Actor', titleCase(a.actor)],
                ['Resource', a.resource],
                ['Store', a.shop],
                ['When', a.created],
              ]}
            />
          </Card>
          <Card>
            <CardHead title="Details JSON" actions={<span className="t-xs t-muted t-mono">activity.details</span>} />
            {detailsText ? (
              <pre className="code-block" style={{ margin: 0, borderRadius: '0 0 12px 12px' }}>
                {detailsText}
              </pre>
            ) : (
              <div className="t-muted t-sm" style={{ padding: '12px 16px' }}>
                No details were recorded for this entry.
              </div>
            )}
          </Card>
        </div>
        <div className="stack-4">
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 10 }}>
              Request context
            </div>
            <KV
              rows={[
                ['IP', <span key="ip" className="t-mono t-xs">{a.ip}</span>],
                ['Request ID', d.requestId ? <MonoChip key="rq">{d.requestId}</MonoChip> : '—'],
                ['Correlation', cid ? <MonoChip key="co">{cid}</MonoChip> : '—'],
              ]}
            />
            {cid && (
              <div style={{ marginTop: 14 }}>
                <Btn className="btn-block" icon="transfer" onClick={() => ctx.go('#/admin/trace/' + cid)}>
                  View full trace
                </Btn>
              </div>
            )}
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 10 }}>
              Related
            </div>
            <div className="stack" style={{ gap: 2 }}>
              {([
                ['table', cid ? 'API logs in this correlation' : 'API logs', '/internal/api-logs' + (cid ? '?correlationId=' + encodeURIComponent(cid) : '')],
                ['work', cid ? 'Jobs in this correlation' : 'Jobs', '/internal/jobs' + (cid ? '?correlationId=' + encodeURIComponent(cid) : '')],
                ['bug', cid ? 'Errors in this correlation' : 'Error logs', '/internal/logs' + (cid ? '?correlationId=' + encodeURIComponent(cid) : '')],
              ] as Array<[string, string, string]>).map((l) => (
                <a key={l[1]} href={l[2]} className="nav-item" style={{ color: 'var(--p-text)' }}>
                  <Icon name={l[0]} size={16} className="t-muted" />
                  <span className="grow">{l[1]}</span>
                  <Icon name="chevronRight" size={14} className="t-muted" />
                </a>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
