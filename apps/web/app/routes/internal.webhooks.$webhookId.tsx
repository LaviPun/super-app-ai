import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import {
  Badge,
  Card,
  KV,
  PageHead,
  StatTile,
  MonoChip,
  formatRelativeTime,
} from '~/components/admin/page-kit';

const NOT_FOUND = new Response(null, { status: 404 });

export async function loader({ request, params }: { request: Request; params: { webhookId?: string } }) {
  await requireInternalAdmin(request);
  const id = params.webhookId;
  if (!id) throw NOT_FOUND;

  const prisma = getPrisma();
  const w = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!w) throw NOT_FOUND;

  return json({
    webhook: {
      id: w.id,
      topic: w.topic,
      eventId: w.eventId,
      shop: w.shopDomain,
      success: w.success,
      processedAt: w.processedAt.toISOString(),
      received: formatRelativeTime(w.processedAt.toISOString()),
      when: w.processedAt.toLocaleString(),
    },
  });
}

export default function AdminWebhookDetail() {
  const { webhook: w } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHead
        back={{ href: '/internal/webhooks', label: 'Webhooks' }}
        title={w.topic}
        badge={
          w.success ? (
            <Badge tone="success" dot>
              Processed
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
      />
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <StatTile label="Result" value={w.success ? 'Processed' : 'Failed'} icon={w.success ? 'check' : 'alert'} tone={w.success ? 'success' : 'critical'} />
        <StatTile label="Topic" value={w.topic} icon="transfer" tone="info" />
        <StatTile label="Store" value={w.shop.split('.')[0]} sub={w.shop} icon="store" tone="info" />
        <StatTile label="Received" value={w.received} sub={w.when} icon="clock" tone="info" />
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
              ['Result', w.success ? 'Processed' : 'Failed'],
              ['Received', w.when],
            ]}
          />
        </Card>
        <Card pad>
          <div className="t-h3" style={{ marginBottom: 8 }}>
            Payload
          </div>
          <p className="t-sm t-muted">
            Webhook payloads are not persisted — only delivery metadata (topic, event ID, store, result, and time) is retained. Redelivery is therefore not available from the admin.
          </p>
        </Card>
      </div>
    </div>
  );
}
