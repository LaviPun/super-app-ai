import { json, redirect } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { QuotaService } from '~/services/billing/quota.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { ActivityLogService } from '~/services/activity/activity.service';
import { findTemplate, RecipeSpecSchema, getTemplateInstallability, type RecipeSpec } from '@superapp/core';
import { SettingsService } from '~/services/settings/settings.service';
import { resolveStorefrontPack, DEFAULT_PACK_ID } from '~/services/ai/style-packs.server';

/**
 * Types whose renderer stamps `data-sa-pack` from `style.pack`: storefront modules
 * plus the buyer-facing extension surfaces (checkout / cart / post-purchase /
 * customer account). Mirrors BUYER_FACING_DS_TYPES in preview.service.ts.
 */
const STOREFRONT_LAYOUT_TYPES = new Set([
  'theme.section',
  'proxy.widget',
  'checkout.upsell',
  'checkout.block',
  'postPurchase.offer',
  'customerAccount.blocks',
]);

/**
 * Persist a concrete render pack on storefront specs before install so the
 * storefront can stamp `data-sa-pack` correctly. Templates now author their pack
 * directly, so this is a pass-through in the common case; it only fills in the
 * legacy/override case where `pack` is missing or 'auto', biasing to Luxe (the
 * can't-look-wrong pack) via `resolveStorefrontPack`'s low-confidence default.
 * Returns a shallow clone so the shared in-memory template object is never mutated.
 */
function withResolvedPack(spec: RecipeSpec): RecipeSpec {
  if (!STOREFRONT_LAYOUT_TYPES.has(spec.type)) return spec;
  const style = (spec as { style?: { pack?: string } }).style;
  const authored = style?.pack;
  if (authored && authored !== 'auto') return spec;
  const pack = resolveStorefrontPack({
    packId: DEFAULT_PACK_ID,
    confidence: 0,
    alternatives: [],
    reason: 'template install: no authored pack, biased to Luxe',
  });
  return { ...spec, style: { ...(style ?? {}), pack } } as RecipeSpec;
}

function getTemplateSpec(templateId: string, overridesJson: string | null): RecipeSpec | null {
  const template = findTemplate(templateId);
  if (!template) return null;
  if (!overridesJson?.trim()) return withResolvedPack(template.spec);
  try {
    const overrides = JSON.parse(overridesJson) as Record<string, unknown>;
    const override = overrides[templateId];
    if (override && typeof override === 'object') {
      const parsed = RecipeSpecSchema.safeParse(override);
      if (parsed.success) return withResolvedPack(parsed.data);
    }
  } catch {
    /* ignore */
  }
  return withResolvedPack(template.spec);
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
