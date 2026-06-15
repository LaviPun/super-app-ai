import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import { modifyRecipeSpec, AiProviderNotConfiguredError } from '~/services/ai/llm.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { withApiLogging } from '~/services/observability/api-log.service';
import { QuotaService } from '~/services/billing/quota.service';
import { fillMissingSettings, missingControls } from '~/services/ai/fill-missing-settings.server';
import type { RecipeSpec } from '@superapp/core';

/** GET is not supported. */
export async function loader() {
  return json({ error: 'Method not allowed' }, { status: 405 });
}

/** Keys whose stored value is present and non-empty — treated as merchant-set. */
function nonEmptyKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).filter((k) => {
    const v = config[k];
    return v !== undefined && v !== null && v !== '';
  });
}

/**
 * WS3/024: fill in missing module settings without ever overwriting merchant-set
 * values. Expected controls come from the hydrated admin config schema (the
 * fields the module actually exposes); the AI proposes values only for the
 * genuinely-missing keys via the validated modify path, and the never-overwrite
 * merge invariant lives in the `buildFillMissingDiff` contract helper.
 */
export async function action({ request }: { request: Request }) {
  const { session } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/ai/fill-settings', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      await enforceRateLimit(`ai:${session.shop}`);

      const form = await request.formData();
      const moduleId = String(form.get('moduleId') ?? '').trim();
      if (!moduleId) return json({ error: 'Missing moduleId' }, { status: 400 });

      const prisma = getPrisma();
      const shopRow = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: { shopDomain: session.shop, accessToken: '', planTier: 'UNKNOWN' },
        update: {},
      });

      const quotaService = new QuotaService();
      await quotaService.enforce(shopRow.id, 'aiRequest');

      const moduleService = new ModuleService();
      const mod = await moduleService.getModule(session.shop, moduleId);
      if (!mod) return json({ error: 'Module not found' }, { status: 404 });

      const draft = mod.versions.find((v) => v.status === 'DRAFT') ?? mod.activeVersion ?? mod.versions[0];
      if (!draft) return json({ error: 'No draft version found' }, { status: 400 });

      const currentSpec = new RecipeService().parse(draft.specJson) as RecipeSpec;
      const currentConfig = ((currentSpec as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;

      // Expected controls = the fields the hydrated admin schema exposes. Without
      // a hydrate schema there is nothing authoritative to fill against, so the
      // action is an honest no-op rather than inventing keys.
      const hydratedSource = draft.hydratedAt
        ? draft
        : (mod.versions as Array<{ hydratedAt: Date | null; adminConfigSchemaJson: string | null }>).find((v) => v.hydratedAt != null) ?? null;
      let expectedControls: string[] = [];
      if (hydratedSource?.adminConfigSchemaJson) {
        try {
          const parsed = JSON.parse(hydratedSource.adminConfigSchemaJson) as { jsonSchema?: { properties?: Record<string, unknown> } };
          expectedControls = Object.keys(parsed.jsonSchema?.properties ?? {});
        } catch {
          expectedControls = [];
        }
      }

      const missing = missingControls(currentConfig, expectedControls);
      if (missing.length === 0) {
        return json({
          ok: true,
          filled: false,
          message: expectedControls.length === 0 ? 'Generate full settings first, then fill-missing can run.' : 'All settings are already filled.',
          diff: { moduleType: currentSpec.type, changes: [], preservedKeys: [], addedKeys: [] },
        });
      }

      const merchantSetKeys = nonEmptyKeys(currentConfig);

      const jobs = new JobService();
      const job = await jobs.create({ shopId: shopRow.id, type: 'AI_MODIFY', payload: { moduleId, action: 'fill-settings', missing } });
      await jobs.start(job.id);

      try {
        const result = await fillMissingSettings(
          {
            moduleId,
            moduleType: currentSpec.type,
            currentConfig,
            expectedControls,
            merchantSetKeys,
          },
          async (missingKeys) => {
            const instruction =
              `Provide sensible, production-ready values for ONLY these missing settings: ${missingKeys.join(', ')}. ` +
              `Return the full module with those fields filled in; do not change any other field, and keep the module type "${currentSpec.type}".`;
            const modified = await modifyRecipeSpec(currentSpec, instruction, { shopId: shopRow.id, maxAttempts: 2 });
            const modifiedConfig = ((modified as { config?: Record<string, unknown> }).config ?? {}) as Record<string, unknown>;
            const picked: Record<string, unknown> = {};
            for (const key of missingKeys) {
              if (Object.prototype.hasOwnProperty.call(modifiedConfig, key)) picked[key] = modifiedConfig[key];
            }
            return picked;
          },
        );

        if (result.diff.addedKeys.length === 0) {
          await jobs.succeed(job.id, { moduleId, addedKeys: 0 });
          return json({ ok: true, filled: false, message: 'No new values could be filled.', diff: result.diff });
        }

        const newSpec = { ...currentSpec, config: result.config } as RecipeSpec;
        const newVersion = await moduleService.createNewVersion(session.shop, moduleId, newSpec);
        await jobs.succeed(job.id, { moduleId, addedKeys: result.diff.addedKeys.length, version: newVersion.version });

        return json({ ok: true, filled: true, diff: result.diff, version: newVersion.version });
      } catch (e) {
        await jobs.fail(job.id, e);
        if (e instanceof AiProviderNotConfiguredError) {
          return json({ error: e.code, message: e.message, setupUrl: '/internal/ai-providers' }, { status: 503 });
        }
        return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
      }
    },
  );
}
