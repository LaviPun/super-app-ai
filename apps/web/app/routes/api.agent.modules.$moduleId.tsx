import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';

/**
 * Agent API: Get a single module with full spec for all versions.
 *
 * GET /api/agent/modules/:moduleId
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

  const recipeService = new RecipeService();

  return json({
    ok: true,
    module: {
      id: mod.id,
      name: mod.name,
      type: mod.type,
      category: mod.category,
      status: mod.status,
      activeVersionId: mod.activeVersionId,
      updatedAt: mod.updatedAt.toISOString(),
      createdAt: mod.createdAt.toISOString(),
      versions: mod.versions.map(v => {
        let spec: unknown = null;
        try { spec = recipeService.parse(v.specJson); } catch { /* keep null */ }
        return {
          id: v.id,
          version: v.version,
          status: v.status,
          publishedAt: v.publishedAt?.toISOString() ?? null,
          targetThemeId: v.targetThemeId ?? null,
          spec,
        };
      }),
    },
  });
}
