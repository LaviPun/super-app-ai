import { json, redirect } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { getPrisma } from '~/db.server';

/** GET not allowed. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST: Delete a module and all its versions.
 * Redirects to /modules on success (browser form), or returns JSON for fetch callers.
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

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  const moduleService = new ModuleService();

  // Verify exists and belongs to this shop before deleting (proper 404)
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  await moduleService.deleteModule(session.shop, moduleId);

  await new ActivityLogService().log({
    actor: 'MERCHANT',
    action: 'MODULE_DELETED',
    resource: `module:${moduleId}`,
    shopId: shopRow?.id,
    details: { name: mod.name, type: mod.type, deleted: true },
  }).catch(() => {/* non-fatal */});

  const acceptsJson = request.headers.get('Accept')?.includes('application/json');
  if (acceptsJson) return json({ ok: true });
  return redirect('/modules');
}
