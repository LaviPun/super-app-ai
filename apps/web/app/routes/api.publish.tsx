import { json, redirect } from '@remix-run/node';

/** GET is not allowed — loader prevents Remix Single Fetch 404 after form submit. */
export async function loader() {
  return redirect('/modules');
}
import { shopify } from '~/shopify.server';
import { ModuleService } from '~/services/modules/module.service';
import { RecipeService } from '~/services/recipes/recipe.service';
import { PublishService, ModuleNotPublishableError, PublishPartialFailureError } from '~/services/publish/publish.service';
import { validateBeforePublish } from '~/services/publish/pre-publish-validator.server';
import { ThemeService } from '~/services/shopify/theme.service';
import { CapabilityService } from '~/services/shopify/capability.service';
import { enforceRateLimit } from '~/services/security/rate-limit.server';
import type { DeployTarget, ModuleType } from '@superapp/core';
import { getCapabilityNode } from '@superapp/core';
import { withApiLogging } from '~/services/observability/api-log.service';
import { getPrisma } from '~/db.server';
import { JobService } from '~/services/jobs/job.service';
import { QuotaService } from '~/services/billing/quota.service';
import { AppError } from '~/services/errors/app-error.server';
import { ActivityLogService, logRequestOutcome } from '~/services/activity/activity.service';
import { PublishPolicyService } from '~/services/publish/publish-policy.service';
import { runPublishPreflight } from '~/services/publish/publish-preflight.server';
import { evaluateFeatureFlag, type FeatureFlagTopology } from '~/services/releases/feature-flags.server';
import { provisionModuleDataStore } from '~/services/publish/provision-data-store.server';
import { getThemeEmbedStatus, type EmbedStatus } from '~/services/publish/embed-status.server';
import { publishPartialFailureResponse } from '~/services/publish/publish-error-response.server';

/** Turn thrown value into a string suitable for UI (avoids "[object Object]"). */
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    const body = o.body ?? o.response ?? o.data;
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.errors) && b.errors.length) {
        const first = b.errors[0];
        const msg = first && typeof first === 'object' && first !== null && 'message' in first
          ? String((first as { message: unknown }).message) : String(first);
        if (msg) return msg;
      }
      if (typeof b.error === 'string') return b.error;
    }
  }
  return 'Publish failed. Please try again or check the theme ID.';
}

export async function action({ request }: { request: Request }) {
  const { session, admin } = await shopify.authenticate.admin(request);

  return withApiLogging(
    { actor: 'MERCHANT', method: request.method, path: '/api/publish', request, captureRequestBody: true, captureResponseBody: true },
    async () => {
      await enforceRateLimit(`publish:${session.shop}`);

      let body:
        | {
            moduleId?: string;
            version?: number;
            themeId?: string;
          }
        | null = null;
      const contentType = request.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        body = await request.json().catch(() => null);
      } else {
        const formData = await request.formData().catch(() => null);
        if (formData) {
          body = {
            moduleId: (formData.get('moduleId') as string) ?? undefined,
            themeId: (formData.get('themeId') as string) || undefined,
            version: formData.has('version') ? Number(formData.get('version')) : undefined,
          };
        }
      }
      if (!body?.moduleId) {
        await logRequestOutcome({ shopId: undefined, pathOrIntent: '/api/publish', success: false, details: { error: 'Missing moduleId' } });
        return json({ error: 'Missing moduleId' }, { status: 400 });
      }

      const prisma = getPrisma();
      const shopRow = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });

      const moduleService = new ModuleService();
      const module = await moduleService.getModule(session.shop, body.moduleId);
      if (!module) return json({ error: 'Module not found' }, { status: 404 });

      const draft = module.versions.find(v => v.status === 'DRAFT') ?? module.versions[0];
      if (!draft) return json({ error: 'No version found' }, { status: 400 });

      const spec = new RecipeService().parse(draft.specJson);

      const caps = new CapabilityService();
      let tier = await caps.getPlanTier(session.shop);
      if (tier === 'UNKNOWN') tier = await caps.refreshPlanTier(session.shop, admin);

      const isThemeModule = spec.type.startsWith('theme.');
      const target: DeployTarget = isThemeModule
        ? { kind: 'THEME', themeId: body.themeId ?? '', moduleId: module.id }
        : { kind: 'PLATFORM', moduleId: module.id };

      const preflight = await runPublishPreflight(admin, { isThemeModule, moduleType: spec.type });
      if (!preflight.ok) {
        const error = preflight.error
          ? `Publish preflight failed: ${preflight.error}`
          : `Missing required Shopify access scopes: ${preflight.missingScopes.join(', ')}`;
        await logRequestOutcome({
          shopId: shopRow?.id,
          pathOrIntent: '/api/publish',
          success: false,
          details: {
            error,
            missingScopes: preflight.missingScopes,
            requiredScopes: preflight.requiredScopes,
            grantedScopes: preflight.grantedScopes,
          },
        });
        return json(
          {
            error,
            missingScopes: preflight.missingScopes,
            requiredScopes: preflight.requiredScopes,
            grantedScopes: preflight.grantedScopes,
          },
          { status: 403 },
        );
      }

      const policy = new PublishPolicyService().evaluate({
        shopDomain: session.shop,
        versionId: draft.id,
        planTier: tier,
        requires: spec.requires ?? [],
        specType: spec.type,
        targetKind: target.kind,
      });
      if (!policy.allowed) {
        const capabilityReasons = policy.blocked.map((c: any) => caps.explainCapabilityGate(c) ?? String(c));
        return json(
          {
            error: 'Plan does not allow this module',
            blocked: policy.blocked,
            reasons: [...capabilityReasons, ...policy.reasons],
            planTier: tier,
            snapshotKey: policy.snapshotKey,
          },
          { status: 403 }
        );
      }

      const surface = getCapabilityNode(spec.type as ModuleType).surface;
      const featureTopology: FeatureFlagTopology = {
        globalKillSwitch: process.env.RELEASE_GLOBAL_KILL_SWITCH === '1',
        globalSurfaceToggles: {
          THEME: process.env.RELEASE_SURFACE_THEME_ENABLED !== '0',
          ADMIN: process.env.RELEASE_SURFACE_ADMIN_ENABLED !== '0',
          CHECKOUT: process.env.RELEASE_SURFACE_CHECKOUT_ENABLED !== '0',
          FUNCTIONS: process.env.RELEASE_SURFACE_FUNCTIONS_ENABLED !== '0',
          CUSTOMER_ACCOUNT: process.env.RELEASE_SURFACE_CUSTOMER_ACCOUNT_ENABLED !== '0',
          POS: process.env.RELEASE_SURFACE_POS_ENABLED !== '0',
          INTEGRATION: process.env.RELEASE_SURFACE_INTEGRATION_ENABLED !== '0',
          FLOW: process.env.RELEASE_SURFACE_FLOW_ENABLED !== '0',
        },
      };
      const featureFlagDecision = evaluateFeatureFlag({
        topology: featureTopology,
        shopDomain: session.shop,
        surface,
      });
      if (!featureFlagDecision.enabled) {
        return json(
          {
            error: `Release blocked by feature flag policy: ${featureFlagDecision.reason}`,
            source: featureFlagDecision.source,
          },
          { status: 423 }
        );
      }

      if (target.kind === 'THEME' && !target.themeId) {
        return json({ error: 'themeId is required for theme module publish' }, { status: 400 });
      }

      if (target.kind === 'THEME') {
        const themeService = new ThemeService(admin);
        const storeThemes = await themeService.listThemes();
        const themeIdNum = Number(target.themeId);
        const themeExists = storeThemes.some(t => t.id === themeIdNum);
        if (!themeExists) {
          return json(
            { error: 'Theme not found or not accessible for this store. Please choose a theme from the list.' },
            { status: 400 }
          );
        }
      }

      const validationErrors = validateBeforePublish(spec, { planTier: tier });
      if (validationErrors.length > 0) {
        return json(
          { error: 'Pre-publish validation failed', errors: validationErrors },
          { status: 400 }
        );
      }

      // WS-QF / Deploy-5: the published-module cap is crossed HERE (moduleCount
      // counts PUBLISHED modules), so enforce it before any publish work.
      // Excludes this module from the count, so a re-publish at cap never blocks.
      if (shopRow) {
        try {
          await new QuotaService().enforcePublishCap(shopRow.id, module.id);
        } catch (e) {
          if (e instanceof AppError && e.code === 'RATE_LIMITED') {
            await logRequestOutcome({
              shopId: shopRow.id,
              pathOrIntent: '/api/publish',
              success: false,
              details: { error: e.message, moduleId: module.id },
            });
            return json({ error: e.message, code: 'MODULE_LIMIT_REACHED' }, { status: 429 });
          }
          throw e;
        }
      }

      const jobs = new JobService();
      const job = await jobs.create({
        shopId: shopRow?.id,
        type: 'PUBLISH',
        payload: {
          moduleId: module.id,
          target,
          source: 'merchant_api',
        },
      });
      await jobs.start(job.id);

      try {
        const publisher = new PublishService(admin, { shop: session.shop, shopId: shopRow?.id });
        const publishResult = await publisher.publish(spec, target);

        // R3.3: provision the module's declared typed data store (schemaJson set →
        // typed forms + write-time validation activate). Additive/idempotent; no-op
        // when undeclared. Runs AFTER a successful deploy so a gated/blocked module
        // (ModuleNotPublishableError above) never leaves a stray store. Non-fatal:
        // the surface already deployed — a DB upsert failure must not roll back a
        // live extension; the merchant recovers by re-publishing (idempotent).
        if (shopRow?.id && spec.dataModel) {
          try {
            const provisioned = await provisionModuleDataStore(shopRow.id, module.id, spec.dataModel);
            if (provisioned) {
              await new ActivityLogService().log({
                actor: 'MERCHANT',
                action: 'DATA_STORE_PROVISIONED',
                resource: `datastore:${provisioned.storeKey}`,
                shopId: shopRow.id,
                details: { moduleId: module.id, storeKey: provisioned.storeKey },
              });
            }
          } catch (provisionErr) {
            await logRequestOutcome({
              shopId: shopRow.id,
              pathOrIntent: '/api/publish',
              success: false,
              details: {
                error: `data-store provisioning failed: ${provisionErr instanceof Error ? provisionErr.message : String(provisionErr)}`,
                moduleId: module.id,
              },
            });
          }
        }

        await moduleService.markPublishedWithTransition({
          shopId: shopRow?.id,
          moduleId: module.id,
          versionId: draft.id,
          targetThemeId: target.kind === 'THEME' ? target.themeId : undefined,
          source: 'merchant_api',
          idempotencyKey: `publish:${session.shop}:${module.id}:${draft.id}:${target.kind === 'THEME' ? target.themeId : 'platform'}`,
        });
        await jobs.succeed(job.id, { ok: true, ledger: publishResult.ledger });
        await new ActivityLogService().log({ actor: 'MERCHANT', action: 'MODULE_PUBLISHED', resource: `module:${module.id}`, shopId: shopRow?.id, details: { target: target.kind, versionId: draft.id } });

        await logRequestOutcome({ shopId: shopRow?.id, pathOrIntent: '/api/publish', success: true, details: { moduleId: module.id } });

        // WS-E finding 5: a successful publish does not by itself make a theme
        // module render — the merchant also needs the app embed on. Advisory-only
        // (getThemeEmbedStatus never throws), so this can never turn a real
        // publish success into a reported failure.
        let embedStatus: EmbedStatus | undefined;
        if (isThemeModule) {
          embedStatus = await getThemeEmbedStatus(admin, target.kind === 'THEME' ? target.themeId : undefined);
        }

        const embedParam = embedStatus && embedStatus !== 'enabled' ? `&embed=${embedStatus}` : '';
        return redirect(`/modules/${module.id}?published=1${embedParam}`);
      } catch (e) {
        await jobs.fail(job.id, e);
        // WS-E finding 4: a partial failure carries exactly which ops already
        // completed (all idempotent) so the merchant knows a republish converges
        // instead of guessing whether it's safe to retry.
        if (e instanceof PublishPartialFailureError) {
          await logRequestOutcome({
            shopId: shopRow?.id,
            pathOrIntent: '/api/publish',
            success: false,
            details: { failedOp: e.failedOp, completed: e.completed, moduleId: module.id },
          });
          return publishPartialFailureResponse(e);
        }
        // WS5/026: gated/blocked modules fail loudly — never reported as published.
        if (e instanceof ModuleNotPublishableError) {
          await logRequestOutcome({ shopId: shopRow?.id, pathOrIntent: '/api/publish', success: false, details: { error: e.message, status: e.preflight.status } });
          return json(
            {
              error: e.message,
              code: e.code,
              status: e.preflight.status,
              reasons: e.preflight.reasons,
              requiresExtension: e.preflight.requiresExtension,
            },
            { status: 422 },
          );
        }
        const message = toErrorMessage(e);
        await logRequestOutcome({ shopId: shopRow?.id, pathOrIntent: '/api/publish', success: false, details: { error: message } });
        return json({ error: message }, { status: 500 });
      }
    }
  );
}
