import { json, redirect } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { UnpublishService } from '~/services/publish/unpublish.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { getPrisma } from '~/db.server';
import type { DeployTarget } from '@superapp/core';

/** GET not allowed. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/**
 * POST: Unpublish a module — remove its storefront/admin/function footprint from
 * Shopify (refs, metaobjects, activation objects, web pixel), then flip DB status.
 * Shopify cleanup runs FIRST: if it throws, the module stays PUBLISHED (honest) and
 * the merchant can retry (UnpublishService is idempotent).
 */
export async function action({ request, params }: { request: Request; params: { moduleId?: string } }) {
  const { session, admin } = await shopify.authenticate.admin(request);
  const moduleId = params.moduleId;
  if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: `/api/modules/${moduleId}/unpublish`, request },
    async () => {
      await enforceRateLimit(`unpublish:${session.shop}`);
      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
      const moduleService = new ModuleService();
      const mod = await moduleService.getModule(session.shop, moduleId);
      if (!mod) return json({ error: 'Module not found' }, { status: 404 });
      if (mod.status !== 'PUBLISHED') return json({ error: 'Module is not published' }, { status: 400 });

      const versionRow =
        mod.activeVersion ?? mod.versions.find((v) => v.status === 'PUBLISHED') ?? null;
      if (!versionRow) return json({ error: 'No published version found' }, { status: 400 });

      const spec = new RecipeService().parse(versionRow.specJson);
      const target: DeployTarget = spec.type.startsWith('theme.')
        ? { kind: 'THEME', themeId: versionRow.targetThemeId ?? '', moduleId: mod.id }
        : { kind: 'PLATFORM', moduleId: mod.id };

      const report = await new UnpublishService(admin, { shopId: shopRow?.id }).unpublish(spec, target);
      await moduleService.markUnpublished(session.shop, moduleId);
      await new ActivityLogService().log({
        actor: 'MERCHANT', action: 'MODULE_UNPUBLISHED', resource: `module:${moduleId}`,
        shopId: shopRow?.id, details: { report },
      }).catch(() => {});

      const acceptsJson = request.headers.get('Accept')?.includes('application/json');
      if (acceptsJson) return json({ ok: true, report });
      return redirect(`/modules/${moduleId}?unpublished=1`);
    },
  );
}
