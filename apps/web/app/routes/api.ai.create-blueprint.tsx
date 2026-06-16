import { json } from '@remix-run/node';
import { RecipeBlueprintSchema } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { BlueprintService } from '~/services/blueprints/blueprint.service';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { QuotaService } from '~/services/billing/quota.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { isBlueprintsEnabled } from '~/env.server';

/**
 * Persist a generated multi-module blueprint: one Recipe group + N draft modules
 * (see docs/blueprints.md). The client posts the `blueprint` JSON produced by
 * /api/ai/create-module. Flag-gated behind BLUEPRINTS_ENABLED.
 */
export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/ai/create-blueprint', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      if (!isBlueprintsEnabled()) {
        return json({ error: 'Blueprints are not enabled.' }, { status: 403 });
      }
      await enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      const blueprintJson = String(form.get('blueprint') ?? '').trim();
      if (!blueprintJson) return json({ error: 'Missing blueprint' }, { status: 400 });

      const parsed = RecipeBlueprintSchema.safeParse(JSON.parse(blueprintJson));
      if (!parsed.success) {
        return json({ error: `Invalid blueprint: ${parsed.error.issues[0]?.message ?? 'parse failed'}` }, { status: 400 });
      }

      const prisma = getPrisma();
      const shopRow = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
        update: {},
      });

      // One quota unit per member module.
      const quotaService = new QuotaService();
      for (let i = 0; i < parsed.data.modules.length; i++) {
        await quotaService.enforce(shopRow.id, 'moduleCount');
      }

      const result = await new BlueprintService().createDraft(session.shop, parsed.data);

      await new ActivityLogService().log({
        actor: 'MERCHANT',
        action: 'MODULE_CREATED',
        resource: `recipe:${result.recipeId}`,
        shopId: shopRow.id,
        details: {
          source: 'ai_blueprint',
          name: parsed.data.name,
          moduleCount: parsed.data.modules.length,
          moduleIds: result.moduleIds,
        },
      });

      return json({
        recipeId: result.recipeId,
        moduleIds: result.moduleIds,
        firstModuleId: result.firstModuleId,
        moduleCount: result.moduleIds.length,
      });
    },
  );
}
