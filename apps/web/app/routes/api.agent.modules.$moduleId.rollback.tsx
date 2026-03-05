import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';
import { JobService } from '~/services/jobs/job.service';

/**
 * Agent API: Roll back a module to a specific version.
 *
 * POST /api/agent/modules/:moduleId/rollback
 * Body: { version: number }
 */
export async function action({
  request,
  params,
}: {
  request: Request;
  params: { moduleId?: string };
}) {
  const { session } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  const contentType = request.headers.get('Content-Type') ?? '';
  let body: { version?: number } = {};
  if (contentType.includes('application/json')) {
    body = await request.json().catch(() => ({}));
  }

  if (body.version == null || isNaN(Number(body.version))) {
    return json({ error: 'Missing or invalid version number' }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

  const jobs = new JobService();
  const job = await jobs.create({
    shopId: shopRow?.id,
    type: 'PUBLISH',
    payload: { intent: 'rollback', moduleId, version: body.version },
  });
  await jobs.start(job.id);

  try {
    const ms = new ModuleService();
    const mv = await ms.rollbackToVersion(session.shop, moduleId, Number(body.version));
    await jobs.succeed(job.id, { rolledBackTo: body.version, versionId: mv.id });
    await new ActivityLogService().log({
      actor: 'SYSTEM',
      action: 'MODULE_ROLLED_BACK',
      resource: `module:${moduleId}`,
      shopId: shopRow?.id,
      details: { version: body.version, versionId: mv.id, source: 'agent_api' },
    }).catch(() => {/* non-fatal */});

    return json({ ok: true, moduleId, rolledBackToVersion: body.version, versionId: mv.id });
  } catch (e) {
    await jobs.fail(job.id, e);
    const message = e instanceof Error ? e.message : 'Rollback failed';
    return json({ error: message }, { status: 500 });
  }
}
