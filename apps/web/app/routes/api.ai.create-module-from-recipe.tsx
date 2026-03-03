import { json } from '@remix-run/node';
import { RecipeSpecSchema } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { QuotaService } from '~/services/billing/quota.service';
import { ActivityLogService } from '~/services/activity/activity.service';

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/ai/create-module-from-recipe', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      const specJson = String(form.get('spec') ?? '').trim();
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

      const quotaService = new QuotaService();
      await quotaService.enforce(shopRow.id, 'moduleCount');

      const moduleService = new ModuleService();
      const mod = await moduleService.createDraft(session.shop, parsed);

      await new ActivityLogService().log({
        actor: 'MERCHANT',
        action: 'MODULE_CREATED',
        resource: `module:${mod.id}`,
        shopId: shopRow.id,
        details: { type: parsed.type, name: parsed.name, source: 'ai_selection' },
      });

      return json({ moduleId: mod.id, type: parsed.type, name: parsed.name });
    },
  );
}
