import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { RecipeSpecSchema } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API Primitive: Read or update a module's spec.
 *
 * GET  /api/agent/modules/:moduleId/spec  →  read current active (or latest draft) spec
 * POST /api/agent/modules/:moduleId/spec  →  update spec (creates a new DRAFT version)
 *   Body: { spec: RecipeSpec }
 */
export async function loader({
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

  const targetVersion =
    mod.activeVersion ??
    mod.versions.find(v => v.status === 'DRAFT') ??
    mod.versions[0];

  if (!targetVersion) return json({ error: 'No version found' }, { status: 404 });

  const recipeService = new RecipeService();
  let spec: unknown = null;
  try { spec = recipeService.parse(targetVersion.specJson); } catch { /* keep null */ }

  return json({
    ok: true,
    moduleId: mod.id,
    name: mod.name,
    type: mod.type,
    status: mod.status,
    version: {
      id: targetVersion.id,
      version: targetVersion.version,
      status: targetVersion.status,
      isActive: targetVersion.id === mod.activeVersionId,
    },
    spec,
  });
}

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
  if (!contentType.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, { status: 415 });
  }

  const body = await request.json().catch(() => null) as { spec?: unknown } | null;
  if (!body?.spec) return json({ error: 'Missing spec in body' }, { status: 400 });

  const recipeService = new RecipeService();
  let spec: unknown;
  try {
    spec = typeof body.spec === 'string' ? recipeService.parse(body.spec) : body.spec;
  } catch (e) {
    return json({ error: 'Invalid spec', details: String(e) }, { status: 400 });
  }

  const parsed = RecipeSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return json({ error: 'Spec validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  if (mod.type !== parsed.data.type) {
    return json({ error: 'Cannot change module type via spec update' }, { status: 400 });
  }

  const newVersion = await moduleService.createNewVersion(session.shop, moduleId, parsed.data);

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'MODULE_SPEC_EDITED',
    resource: `module:${moduleId}`,
    shopId: shopRow?.id,
    details: { version: newVersion.version, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});

  return json({ ok: true, moduleId, version: newVersion.version, versionId: newVersion.id });
}
