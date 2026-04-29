import { json } from '@remix-run/node';
import { requireInternalAdmin } from '~/internal-admin/session.server';
import { getPrisma } from '~/db.server';

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
  });
}
