const HEARTBEAT_MS = 15000;
const POLL_MS = 1500;

export type TailRow = { createdAt: Date; payload: Record<string, unknown> };

/**
 * Shared Server-Sent Events tail for internal log pages.
 *
 * Polls the database every POLL_MS (sqlite-compatible — no LISTEN/NOTIFY) and
 * emits each new row as an `event: log` message, plus a `: ping` heartbeat
 * every HEARTBEAT_MS so proxies don't drop the idle connection. The caller
 * supplies `fetchSince`, which returns rows newer than the cursor in ascending
 * `createdAt` order; the cursor advances to the last row seen.
 */
export function createLogTailResponse(
  request: Request,
  fetchSince: (since: Date) => Promise<TailRow[]>,
): Response {
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  let since = sinceParam ? new Date(sinceParam) : new Date();
  if (Number.isNaN(since.getTime())) since = new Date();

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
          const rows = await fetchSince(since);
          for (const r of rows) {
            if (closed) return;
            controller.enqueue(enc.encode(`event: log\ndata: ${JSON.stringify(r.payload)}\n\n`));
            since = r.createdAt;
          }
        } catch (err) {
          if (closed) return;
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
