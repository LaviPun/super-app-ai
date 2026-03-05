import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { RecipeSpecSchema } from '@superapp/core';
import { getPrisma } from '~/db.server';
import { ActivityLogService } from '~/services/activity/activity.service';

/**
 * Agent API: Module list + create.
 *
 * GET  /api/agent/modules          → list all modules for this shop
 * POST /api/agent/modules          → create a new module from a full RecipeSpec
 *
 * All responses are JSON. Designed for agent/MCP callers.
 */

export async function loader({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  const prisma = getPrisma();
  const modules = await prisma.module.findMany({
    where: { shop: { shopDomain: session.shop } },
    include: { activeVersion: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });

  return json({
    ok: true,
    modules: modules.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      category: m.category,
      status: m.status,
      latestVersion: m.versions[0]?.version ?? null,
      activeVersion: m.activeVersion?.version ?? null,
      updatedAt: m.updatedAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

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
  const module = await moduleService.createDraft(session.shop, parsed.data);

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  await new ActivityLogService().log({
    actor: 'SYSTEM',
    action: 'MODULE_CREATED',
    resource: `module:${module.id}`,
    shopId: shopRow?.id,
    details: { name: parsed.data.name, type: parsed.data.type, source: 'agent_api' },
  }).catch(() => {/* non-fatal */});

  return json({
    ok: true,
    moduleId: module.id,
    name: module.name,
    type: module.type,
    status: module.status,
    version: module.versions[0]?.version ?? 1,
  }, { status: 201 });
}
