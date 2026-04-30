import { json, redirect } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { findTemplate, RecipeSpecSchema, getTemplateInstallability } from '@superapp/core';
import { SettingsService } from '~/services/settings/settings.service';

function getTemplateSpec(templateId: string, overridesJson: string | null) {
  const template = findTemplate(templateId);
  if (!template) return null;
  if (!overridesJson?.trim()) return template.spec;
  try {
    const overrides = JSON.parse(overridesJson) as Record<string, unknown>;
    const override = overrides[templateId];
    if (override && typeof override === 'object') {
      const parsed = RecipeSpecSchema.safeParse(override);
      if (parsed.success) return parsed.data;
    }
  } catch {
    /* ignore */
  }
  return template.spec;
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/modules/from-template', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      const form = await request.formData();
      const templateId = String(form.get('templateId') ?? '').trim();
      if (!templateId) return json({ error: 'Missing templateId' }, { status: 400 });

      const template = findTemplate(templateId);
      if (!template) return json({ error: 'Template not found' }, { status: 404 });
      const installability = getTemplateInstallability(template);
      if (!installability.ok) {
        return json(
          {
            error: 'Template is not installable yet',
            reasons: installability.reasons,
            templateId,
          },
          { status: 422 },
        );
      }

      const settings = await new SettingsService().get();
      const spec = getTemplateSpec(templateId, settings.templateSpecOverrides);
      if (!spec) return json({ error: 'Template spec not found' }, { status: 404 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
        update: {},
      });

      const quota = new QuotaService();
      await quota.enforce(shopRow.id, 'moduleCount');

      const moduleService = new ModuleService();
      const mod = await moduleService.createDraft(session.shop, spec);

      await new ActivityLogService().log({
        actor: 'MERCHANT',
        action: 'MODULE_CREATED_FROM_TEMPLATE',
        resource: `module:${mod.id}`,
        shopId: shopRow.id,
        details: { templateId, type: template.type, name: template.name },
      });

      return redirect(`/modules/${mod.id}`);
    },
  );
}
