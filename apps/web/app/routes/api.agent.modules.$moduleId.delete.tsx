import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Permanently delete a module and all its versions.
 *
 * POST /api/agent/modules/:moduleId/delete
 * (or DELETE /api/agent/modules/:moduleId — same handler)
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

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  await moduleService.deleteModule(session.shop, moduleId);

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'MODULE_DELETED',
    resource: `module:${moduleId}`,
    shopId: shopRow?.id,
    details: { name: mod.name, type: mod.type, deleted: true, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});

  return json({ ok: true, moduleId, deleted: true });
}
