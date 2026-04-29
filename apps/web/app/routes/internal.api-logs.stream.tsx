import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

const HEARTBEAT_MS = 15000;
const POLL_MS = 1500;

/**
 * Server-Sent Events endpoint for live-tailing API logs.
 *
 * Clients open `/internal/api-logs/stream` with `EventSource` and receive
 * `event: log` messages as new ApiLog rows are inserted. We poll the database
 * every POLL_MS to remain compatible with sqlite (no LISTEN/NOTIFY) and emit a
 * heartbeat every HEARTBEAT_MS so proxies don't drop the connection.
 */
export async function loader({ request }: { request: Request }) {
  await requireInternalAdmin(request);

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  let since = sinceParam ? new Date(sinceParam) : new Date();
  if (Number.isNaN(since.getTime())) since = new Date();

  const prisma = getPrisma();
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try { controller.close(); } catch { /* already closed */ }
      };
      request.signal.addEventListener('abort', close);

      controller.enqueue(enc.encode(`event: ready\ndata: ${JSON.stringify({ since: since.toISOString() })}\n\n`));

      const pollTimer = setInterval(async () => {
        if (closed) return;
        try {
          const rows = await prisma.apiLog.findMany({
            where: { createdAt: { gt: since } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 50,
            include: { shop: true },
          });
          for (const r of rows) {
            const evt = {
              id: r.id,
              actor: r.actor,
              method: r.method,
              path: r.path,
              status: r.status,
              durationMs: r.durationMs,
              success: r.success,
              shopDomain: r.shop?.shopDomain ?? null,
              createdAt: r.createdAt.toISOString(),
              correlationId: r.correlationId ?? null,
              requestId: r.requestId ?? null,
            };
            controller.enqueue(enc.encode(`event: log\ndata: ${JSON.stringify(evt)}\n\n`));
            since = r.createdAt;
          }
        } catch (err) {
          controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`));
        }
      }, POLL_MS);

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        controller.enqueue(enc.encode(`: ping\n\n`));
      }, HEARTBEAT_MS);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
