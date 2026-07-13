import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { createLogTailResponse } from '~/services/internal/log-tail.server';

/**
 * Server-Sent Events endpoint for live-tailing the activity log.
 *
 * Clients open `/internal/activity/stream` with `EventSource` and receive
 * `event: log` messages as new ActivityLog rows are inserted. Payload shape
 * matches the rows the activity table renders.
 */
export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  return createLogTailResponse(request, async (since) => {
    const rows = await prisma.activityLog.findMany({
      where: { createdAt: { gt: since } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      include: { shop: true },
    });
    return rows.map((r) => ({
      createdAt: r.createdAt,
      payload: {
        id: r.id,
        actor: r.actor,
        action: r.action,
        resource: r.resource ?? null,
        shopDomain: r.shop?.shopDomain ?? null,
        ip: r.ip ?? null,
        createdAt: r.createdAt.toISOString(),
        correlationId: r.correlationId ?? null,
        requestId: r.requestId ?? null,
      },
    }));
  });
}
