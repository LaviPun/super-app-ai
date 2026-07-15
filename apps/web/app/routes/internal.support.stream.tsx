import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';
import { createLogTailResponse } from '~/services/internal/log-tail.server';

/**
 * Server-Sent Events endpoint for live-tailing the Support CRM queue.
 *
 * Clients open `/internal/support/stream` with `EventSource` and receive
 * `event: log` messages as SupportTicket rows are created or updated (we tail on
 * `updatedAt`, so a status change or new reply re-surfaces the ticket). Payload
 * shape matches the row summary the queue table renders — the client dedupes by
 * id and prepends.
 */
export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);
  const prisma = getPrisma();

  return createLogTailResponse(request, async (since) => {
    const rows = await prisma.supportTicket.findMany({
      where: { updatedAt: { gt: since } },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: 50,
      include: { shop: true },
    });
    return rows.map((r) => ({
      // Advance the cursor by updatedAt so an edited ticket re-emits.
      createdAt: r.updatedAt,
      payload: {
        id: r.id,
        shopDomain: r.shop?.shopDomain ?? '—',
        subject: r.subject,
        aiSummary: r.aiSummary ?? null,
        source: r.source,
        severity: r.aiSeverity ?? null,
        status: r.status,
        needsIntervention: r.needsIntervention,
        assignee: r.assignee ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      },
    }));
  });
}
