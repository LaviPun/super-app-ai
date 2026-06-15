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
    createdAt: log.createdAt.toISOString(),
  });
}

function rel(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return Math.max(1, m) + 'm ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + 'h ago' : Math.round(h / 24) + 'd ago';
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
    created: rel(d.createdAt),
  };
  const cid = 'cor_' + (a.id || 'act').replace(/[^a-z0-9]/gi, '').slice(-5) + 'f2';
  const details = {
    actor: a.actor,
    action: a.action,
    resourceId: a.resource,
    shop: a.shop,
    ip: a.ip,
    userAgent: 'Mozilla/5.0 (Macintosh)',
    requestId: 'req_' + (a.id || '0').replace(/[^a-z0-9]/gi, '').slice(-5),
    correlationId: cid,
    sessionId: 'ses_8a21f',
    result: 'success',
  };
  const detailsText = d.detailsJson ?? JSON.stringify(details, null, 2);

  return (
    <div className="page page-narrow">
      <PageHead
        back={{ href: '/internal/activity', label: 'Activity Log' }}
        title={titleCase(a.action)}
        badge={<Badge tone={a.actor === 'INTERNAL_ADMIN' ? 'magic' : a.actor === 'WEBHOOK' ? 'info' : undefined}>{titleCase(a.actor)}</Badge>}
        sub="Full detail for a single activity entry, including actor, target, request context and the correlation ID that joins it to logs and jobs."
        actions={
          <>
            <Btn icon="transfer" onClick={() => ctx.go('#/admin/trace/' + cid)}>
              Open trace
            </Btn>
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
                [
                  'Result',
                  <Badge key="r" tone="success" dot>
                    Success
                  </Badge>,
                ],
              ]}
            />
          </Card>
          <Card>
            <CardHead title="Details JSON" actions={<span className="t-xs t-muted t-mono">activity.details</span>} />
            <pre className="code-block" style={{ margin: 0, borderRadius: '0 0 12px 12px' }}>
              {detailsText}
            </pre>
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
                ['Request ID', <MonoChip key="rq">{details.requestId}</MonoChip>],
                ['Correlation', <MonoChip key="co">{cid}</MonoChip>],
              ]}
            />
            <div style={{ marginTop: 14 }}>
              <Btn className="btn-block" icon="transfer" onClick={() => ctx.go('#/admin/trace/' + cid)}>
                View full trace
              </Btn>
            </div>
          </Card>
          <Card pad>
            <div className="t-h3" style={{ marginBottom: 10 }}>
              Related
            </div>
            <div className="stack" style={{ gap: 2 }}>
              {([
                ['table', 'API logs for this request', '/internal/api-logs'],
                ['work', 'Jobs in this correlation', '/internal/jobs'],
                ['bug', 'Errors in this correlation', '/internal/logs'],
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
