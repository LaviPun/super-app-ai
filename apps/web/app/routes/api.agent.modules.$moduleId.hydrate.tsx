import { json } from '@remix-run/node';
import { RecipeSpecSchema } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { hydrateRecipeSpec, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { QuotaService } from '~/services/billing/quota.service';

/**
 * Agent API: Hydrate a module — generate full config envelope (admin schema, defaults, validation report) for the draft version.
 *
 * POST /api/agent/modules/:moduleId/hydrate
 * Body: { versionId?: string }  (optional; omit to use latest draft)
 * Returns: { ok, validationReport, hydratedAt }
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

  const prisma = getPrisma();
  const shopRow = await prisma.shop.findFirst({ where: { shopDomain: session.shop } });
  if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

  const quotaService = new QuotaService();
  await quotaService.enforce(shopRow.id, 'aiRequest');

  const moduleService = new ModuleService();
  const mod = await moduleService.getModule(session.shop, moduleId);
  if (!mod) return json({ error: 'Module not found' }, { status: 404 });

  let versionId = '';
  if (request.method === 'POST') {
    const contentType = request.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => null)) as { versionId?: string } | null;
      versionId = String(body?.versionId ?? '').trim();
    }
  }

  const targetVersion = versionId
    ? mod.versions.find((v: { id: string }) => v.id === versionId)
    : mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
  if (!targetVersion) return json({ error: 'No version to hydrate' }, { status: 400 });

  let recipeSpec;
  try {
    recipeSpec = RecipeSpecSchema.parse(JSON.parse(targetVersion.specJson));
  } catch {
    return json({ error: 'Invalid RecipeSpec on version' }, { status: 400 });
  }

  try {
    const envelope = await hydrateRecipeSpec(recipeSpec, {
      shopId: shopRow.id,
      merchantContext: { planTier: shopRow.planTier ?? undefined },
    });

    const hydratedAt = new Date();
    await prisma.moduleVersion.update({
      where: { id: targetVersion.id },
      data: {
        hydratedAt,
        adminConfigSchemaJson: JSON.stringify(envelope.adminConfigSchema),
        adminDefaultsJson: JSON.stringify(envelope.adminConfigSchema.defaults),
        themeEditorSettingsJson: JSON.stringify(envelope.themeEditorSettings),
        uiTokensJson: envelope.uiTokens ? JSON.stringify(envelope.uiTokens) : null,
        validationReportJson: JSON.stringify(envelope.validationReport),
        compiledRuntimePlanJson: envelope.implementationPlan ? JSON.stringify(envelope.implementationPlan) : null,
      },
    });

    return json({
      ok: true,
      moduleId,
      versionId: targetVersion.id,
      validationReport: envelope.validationReport,
      hydratedAt: hydratedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof AiProviderNotConfiguredError) {
      return json(
        { error: e.code, message: e.message, setupUrl: '/internal/ai-providers' },
        { status: 503 },
      );
    }
    return json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    );
  }
}
