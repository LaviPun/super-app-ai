import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import {
  useAdminCtx,
  Btn,
  Badge,
  Card,
  KV,
  PageHead,
  StatTile,
  MonoChip,
  fmtMs,
  WEBHOOKS,
  webhookPayload,
} from '~/components/admin/page-kit';

export async function loader({ request, params }: { request: Request; params: { webhookId?: string } }) {
  await requireInternalAdmin(request);
  const w0 = WEBHOOKS.find((w) => w.id === params.webhookId) ?? WEBHOOKS[0];
  // Synthesize attempt/duration fields the design expects.
  const w = { attempts: w0.success ? 1 : 3, durationMs: w0.success ? 240 : 30000, ...w0 };
  return json({ webhook: w, payload: webhookPayload(w) });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function DeliveryRow({ d }: { d: any }) {
  return (
    <div className="tl-item">
      <span className={'tl-dot ' + (d.ok ? 'success' : 'critical')} />
      <div className="row spread">
        <span className="t-sm t-strong">Attempt {d.n}</span>
        <span className="t-xs" style={{ color: d.ok ? 'var(--p-success-text)' : 'var(--p-critical-text)' }}>
          {d.ok ? '200 OK' : '500 / timeout'}
        </span>
      </div>
    </div>
  );
}

export default function AdminWebhookDetail() {
  const { webhook: w, payload } = useLoaderData<typeof loader>();
  const ctx = useAdminCtx();
  const deliveries = [{ n: w.attempts, ok: w.success }]
    .concat(Array.from({ length: Math.max(0, w.attempts - 1) }, (_, i) => ({ n: w.attempts - 1 - i, ok: false })))
    .sort((a, b) => a.n - b.n);
  const redeliver = () => ctx.toast('Webhook redelivered');

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/webhooks', label: 'Webhooks' }}
        title={w.topic}
        badge={
          w.success ? (
            <Badge tone="success" dot>
              Delivered
            </Badge>
          ) : (
            <Badge tone="critical" dot>
              Failed
            </Badge>
          )
        }
        sub={
          <span className="row-2">
            <MonoChip>{w.eventId}</MonoChip>
            <span className="t-muted">·</span>
            <span className="t-sm">{w.shop}</span>
          </span>
        }
        actions={
          !w.success ? (
            <Btn variant="primary" icon="replay" onClick={redeliver}>
              Redeliver
            </Btn>
          ) : undefined
        }
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Result" value={w.success ? 'Delivered' : 'Failed'} icon={w.success ? 'check' : 'alert'} tone={w.success ? 'success' : 'critical'} />
        <StatTile label="Attempts" value={w.attempts} icon="replay" tone={w.attempts > 1 ? 'warning' : 'info'} />
        <StatTile label="Duration" value={fmtMs(w.durationMs)} icon="clock" tone={w.durationMs > 5000 ? 'critical' : 'info'} />
        <StatTile label="Received" value={w.created} icon="transfer" tone="info" />
      </div>
      <div className="col-main">
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Delivery details
          </div>
          <KV
            rows={[
              ['Event ID', <MonoChip key="e">{w.eventId}</MonoChip>],
              ['Topic', <MonoChip key="t">{w.topic}</MonoChip>],
              ['Shop', w.shop],
              ['HMAC', <Badge key="h" tone="success">Verified</Badge>],
              ['Attempts', w.attempts],
              ['Latency', fmtMs(w.durationMs)],
            ]}
          />
          <div className="divider" style={{ margin: '14px 0' }} />
          <div className="t-h3" style={{ marginBottom: 10 }}>
            Payload
          </div>
          <pre className="code-block">{payload}</pre>
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 12 }}>
            Delivery attempts
          </div>
          <div className="timeline">
            {deliveries.map((d, di) => (
              <DeliveryRow key={d.n != null ? d.n : di} d={d} />
            ))}
          </div>
          {!w.success ? (
            <div style={{ marginTop: 12 }}>
              <Btn size="sm" icon="replay" onClick={redeliver}>
                Redeliver now
              </Btn>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
