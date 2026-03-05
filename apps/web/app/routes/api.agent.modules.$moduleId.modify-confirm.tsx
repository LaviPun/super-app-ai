import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { RecipeSpecSchema } from '@superapp/core';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Confirm an AI modification — save the selected recipe as a new DRAFT version.
 *
 * POST /api/agent/modules/:moduleId/modify-confirm
 * Body: { spec: RecipeSpec }  (select one from /modify options)
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

  enforceRateLimit(`ai:${session.shop}`);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as { spec?: unknown } | null;
  if (!body?.spec) return json({ error: 'Missing spec in body' }, { status: 400 });

  let parsed;
  try {
    parsed = RecipeSpecSchema.parse(body.spec);
  } catch (err) {
    return json({ error: `Invalid RecipeSpec: ${String(err)}` }, { status: 400 });
  }

  const prisma = getPrisma();
  const shopRow = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
    update: {},
  });

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  if (mod.type !== parsed.type) {
    return json({ error: 'Cannot change module type' }, { status: 400 });
  }

  const newVersion = await moduleService.createNewVersion(session.shop, moduleId, parsed);

  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'MODULE_SPEC_EDITED',
    resource: `module:${moduleId}`,
    shopId: shopRow.id,
    details: { type: parsed.type, name: parsed.name, version: newVersion.version, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});

  return json({ ok: true, moduleId, version: newVersion.version, name: parsed.name });
}
