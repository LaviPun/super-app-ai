import { json } from '@remix-run/node';
import { RecipeSpecSchema } from '@superapp/core';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { ModuleService } from '~/services/modules/module.service';
import { getPrisma } from '~/db.server';
import { withApiLogging } from '~/services/observability/api-log.service';
import { QuotaService } from '~/services/billing/quota.service';
import { hydrateRecipeSpec, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { JobService } from '~/services/jobs/job.service';

/** POST only; GET returns 405. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    {
      actor: 'MERCHANT',
      method: request.method,
      path: '/api/ai/hydrate-module',
      request,
      captureRequestBody: true,
      captureResponseBody: true,
    },
    async () => {
      enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      const force = String(form.get('force') ?? '').trim() === '1';
      if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findFirst({ where: { shopDomain: session.shop } });
      if (!shopRow) return json({ error: 'Shop not found' }, { status: 404 });

      const quotaService = new QuotaService();
      await quotaService.enforce(shopRow.id, 'aiRequest');

      const moduleService = new ModuleService();
      const mod = await moduleService.getModule(session.shop, moduleId);
      if (!mod) return json({ error: 'Module not found' }, { status: 404 });

      const versionId = String(form.get('versionId') ?? '').trim();
      const targetVersion = versionId
        ? mod.versions.find((v: { id: string }) => v.id === versionId)
        : mod.versions.find((v: { status: string }) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
      if (!targetVersion) return json({ error: 'No version to hydrate' }, { status: 400 });

      if (targetVersion.hydratedAt && !force) {
        let validationReport: { overall: string; checks: { id: string; severity: string; status: string; description: string; howToFix?: string }[] } | null = null;
        if (targetVersion.validationReportJson) {
          try {
            validationReport = JSON.parse(targetVersion.validationReportJson) as typeof validationReport;
          } catch {
            // ignore
          }
        }
        return json({
          ok: true,
          validationReport: validationReport ?? { overall: 'PASS', checks: [] },
          hydratedAt: targetVersion.hydratedAt.toISOString(),
        });
      }

      let recipeSpec;
      try {
        recipeSpec = RecipeSpecSchema.parse(JSON.parse(targetVersion.specJson));
      } catch {
        return json({ error: 'Invalid RecipeSpec on version' }, { status: 400 });
      }

      const jobs = new JobService();
      const job = await jobs.create({
        shopId: shopRow.id,
        type: 'AI_HYDRATE',
        payload: { moduleId, versionId: targetVersion.id, moduleType: recipeSpec.type },
      });
      await jobs.start(job.id);

      try {
        const envelope = await hydrateRecipeSpec(recipeSpec, {
          shopId: shopRow.id,
          merchantContext: {
            planTier: shopRow.planTier ?? undefined,
            locale: (session as { locale?: string }).locale ?? undefined,
          },
        });

        const hydratedAt = new Date();
        await prisma.moduleVersion.update({
          where: { id: targetVersion.id },
          data: {
            hydratedAt,
            adminConfigSchemaJson: JSON.stringify(envelope.adminConfig),
            adminDefaultsJson: JSON.stringify(envelope.adminConfig.defaults),
            themeEditorSettingsJson: JSON.stringify(envelope.themeEditorSettings),
            uiTokensJson: envelope.uiTokens ? JSON.stringify(envelope.uiTokens) : null,
            validationReportJson: JSON.stringify(envelope.validationReport),
            implementationPlanJson: envelope.implementationPlan ? JSON.stringify(envelope.implementationPlan) : null,
            previewHtmlJson: envelope.previewHtml ?? null,
          },
        });

        await jobs.succeed(job.id, { validationOverall: envelope.validationReport.overall });

        return json({
          ok: true,
          validationReport: envelope.validationReport,
          hydratedAt: hydratedAt.toISOString(),
        });
      } catch (e) {
        await jobs.fail(job.id, e);
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
    },
  );
}
