import { json } from '@remix-run/node';
import { RecipeSpecSchema } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/ai/modify-module-confirm', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const specJson = String(form.get('spec') ?? '').trim();

      if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });
      if (!specJson) return json({ error: 'Missing spec' }, { status: 400 });

      let parsed;
      try {
        parsed = RecipeSpecSchema.parse(JSON.parse(specJson));
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
      const newVersion = await moduleService.createNewVersion(session.shop, moduleId, parsed);

      await new ActivityLogService().log({
        actor: 'MERCHANT',
        action: 'MODULE_MODIFIED_WITH_AI',
        resource: `module:${moduleId}`,
        shopId: shopRow.id,
        details: { type: parsed.type, name: parsed.name, version: newVersion.version, source: 'ai_selection' },
      });

      return json({ ok: true, moduleId, version: newVersion.version, name: parsed.name });
    },
  );
}
